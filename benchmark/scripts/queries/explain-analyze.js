'use strict';

const { createConnection } = require('../lib/db');
const { loadJson, writeJson, writeText, readManifest, ensureResultsDirs } = require('../lib/paths');

const SLOW_MS = 100;

function resolveParams(params, manifest) {
  if (!params) return [];
  const bench = manifest?.benchmarkUsers || {};
  const map = {
    '{{customerId}}': manifest?.benchmarkCustomerId || 1,
    '{{orderId}}': manifest?.sampleOrderIds?.[0] || 1,
    '{{employeeUserId}}': bench.employee || 3,
  };
  return params.map((p) => map[p] ?? p);
}

function parseExplainRows(rows) {
  const plan = rows.map((r) => ({ ...r }));
  let executionTimeMs = null;
  let usesFullScan = false;
  let rowsExamined = 0;

  for (const row of plan) {
    const type = row.type || row.access_type;
    if (type === 'ALL') usesFullScan = true;
    if (row.rows) rowsExamined += Number(row.rows);
    const extra = row.Extra || row.extra || '';
    if (typeof extra === 'string' && extra.includes('execution time')) {
      const m = extra.match(/(\d+\.?\d*)\s*ms/);
      if (m) executionTimeMs = parseFloat(m[1]);
    }
  }

  const analyzeRow = plan[plan.length - 1];
  if (analyzeRow?.EXPLAIN) {
    const m = String(analyzeRow.EXPLAIN).match(/actual time=\d+\.?\d*\.\.(\d+\.?\d*)/);
    if (m) executionTimeMs = parseFloat(m[1]);
  }

  return { plan, executionTimeMs, usesFullScan, rowsExamined };
}

async function runExplainAnalyze(conn, sql, params) {
  const start = Date.now();
  const [rows] = await conn.query(`EXPLAIN ANALYZE ${sql}`, params);
  const elapsed = Date.now() - start;
  const parsed = parseExplainRows(rows);
  if (parsed.executionTimeMs == null) parsed.executionTimeMs = elapsed;
  parsed.raw = rows;
  return parsed;
}

async function main() {
  ensureResultsDirs();
  const config = loadJson('critical-queries.json');
  const manifest = readManifest();
  const conn = await createConnection();

  const results = [];
  const slowLog = [];

  try {
    for (const q of config.queries) {
      const params = resolveParams(q.params, manifest);
      console.log(`Analyzing ${q.id}: ${q.name}...`);
      let analysis;
      try {
        analysis = await runExplainAnalyze(conn, q.sql, params);
      } catch (err) {
        analysis = { error: err.message, plan: [], executionTimeMs: null };
      }

      const entry = {
        id: q.id,
        name: q.name,
        source: q.source,
        sql: q.sql,
        params,
        executionTimeMs: analysis.executionTimeMs,
        usesFullScan: analysis.usesFullScan,
        rowsExamined: analysis.rowsExamined,
        plan: analysis.plan,
        error: analysis.error,
      };
      results.push(entry);
      writeJson(`queries/${q.id}.json`, entry);

      if (entry.executionTimeMs != null && entry.executionTimeMs > SLOW_MS) {
        slowLog.push(
          `[${q.id}] ${entry.executionTimeMs.toFixed(2)}ms - ${q.name}\n  SQL: ${q.sql}\n  Full scan: ${entry.usesFullScan}`
        );
      }
    }
  } finally {
    await conn.end();
  }

  const summaryLines = [
    '# Query Analysis Summary',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Slow threshold: ${SLOW_MS}ms`,
    '',
    '| ID | Time (ms) | Full Scan | Rows Examined | Name |',
    '|----|-----------|-----------|---------------|------|',
  ];

  for (const r of results) {
    const time = r.executionTimeMs != null ? r.executionTimeMs.toFixed(2) : 'ERR';
    summaryLines.push(
      `| ${r.id} | ${time} | ${r.usesFullScan ? 'YES' : 'no'} | ${r.rowsExamined} | ${r.name} |`
    );
  }

  summaryLines.push('');
  summaryLines.push(`Slow queries (>${SLOW_MS}ms): ${slowLog.length}`);

  writeText('queries/summary.md', summaryLines.join('\n'));
  writeText('queries/slow-query-log.txt', slowLog.length ? slowLog.join('\n\n') : 'No slow queries detected.');
  writeJson('queries/all-results.json', results);

  console.log(`\nWrote ${results.length} query plans to benchmark/results/queries/`);
  console.log(`Slow queries: ${slowLog.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
