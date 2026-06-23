'use strict';

const { createConnection } = require('../lib/db');
const { writeJson, writeText, ensureResultsDirs } = require('../lib/paths');

const POLL_INTERVAL_MS = parseInt(process.env.BENCHMARK_METRICS_INTERVAL, 10) || 5000;
const DURATION_MS = parseInt(process.env.BENCHMARK_METRICS_DURATION, 10) || 60000;

async function getStatusSnapshot(conn) {
  const [statusRows] = await conn.query("SHOW GLOBAL STATUS WHERE Variable_name IN ('Com_select','Com_insert','Com_update','Com_delete','Threads_connected','Threads_running','Innodb_row_lock_waits','Innodb_deadlocks')");
  const status = {};
  for (const row of statusRows) {
    status[row.Variable_name] = parseInt(row.Value, 10);
  }
  return status;
}

async function getTopDigests(conn) {
  try {
    const [rows] = await conn.query(`
      SELECT
        LEFT(DIGEST_TEXT, 120) AS query_pattern,
        COUNT_STAR AS exec_count,
        ROUND(SUM_TIMER_WAIT / 1e12, 3) AS total_latency_sec,
        ROUND(AVG_TIMER_WAIT / 1e12, 6) AS avg_latency_sec,
        SUM_ROWS_EXAMINED AS rows_examined
      FROM performance_schema.events_statements_summary_by_digest
      WHERE SCHEMA_NAME = DATABASE()
      ORDER BY SUM_TIMER_WAIT DESC
      LIMIT 10
    `);
    return rows;
  } catch {
    return [];
  }
}

function computeRates(prev, curr, deltaSec) {
  const rates = {};
  for (const key of ['Com_select', 'Com_insert', 'Com_update', 'Com_delete']) {
    if (prev && curr[key] != null && prev[key] != null) {
      rates[key.replace('Com_', '').toUpperCase() + '_per_sec'] = (curr[key] - prev[key]) / deltaSec;
    }
  }
  return rates;
}

async function main() {
  ensureResultsDirs();
  const conn = await createConnection();
  const timeseries = [];
  const start = Date.now();
  let prevStatus = null;
  let prevTime = start;

  console.log(`Collecting DB metrics for ${DURATION_MS / 1000}s (poll every ${POLL_INTERVAL_MS}ms)...`);

  try {
    while (Date.now() - start < DURATION_MS) {
      const now = Date.now();
      const status = await getStatusSnapshot(conn);
      const deltaSec = (now - prevTime) / 1000;
      const rates = computeRates(prevStatus, status, deltaSec);
      const digests = await getTopDigests(conn);

      timeseries.push({
        timestamp: new Date().toISOString(),
        status,
        rates,
        topDigests: digests,
      });

      prevStatus = status;
      prevTime = now;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  } finally {
    await conn.end();
  }

  const last = timeseries[timeseries.length - 1]?.status || {};
  const summary = [
    '# Database Metrics Summary',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Samples: ${timeseries.length}`,
    '',
    '## Final Status',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Threads connected | ${last.Threads_connected ?? 'n/a'} |`,
    `| Threads running | ${last.Threads_running ?? 'n/a'} |`,
    `| InnoDB row lock waits | ${last.Innodb_row_lock_waits ?? 'n/a'} |`,
    `| InnoDB deadlocks | ${last.Innodb_deadlocks ?? 'n/a'} |`,
    '',
    '## Average Rates (per second)',
    '',
  ];

  const avgRates = { SELECT: [], INSERT: [], UPDATE: [], DELETE: [] };
  for (const t of timeseries) {
    if (t.rates.SELECT_per_sec != null) avgRates.SELECT.push(t.rates.SELECT_per_sec);
    if (t.rates.INSERT_per_sec != null) avgRates.INSERT.push(t.rates.INSERT_per_sec);
    if (t.rates.UPDATE_per_sec != null) avgRates.UPDATE.push(t.rates.UPDATE_per_sec);
    if (t.rates.DELETE_per_sec != null) avgRates.DELETE.push(t.rates.DELETE_per_sec);
  }

  for (const [k, vals] of Object.entries(avgRates)) {
    const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 'n/a';
    summary.push(`- ${k}/sec: ${avg}`);
  }

  writeJson('db-metrics/timeseries.json', timeseries);
  writeText('db-metrics/summary.md', summary.join('\n'));
  console.log('Wrote benchmark/results/db-metrics/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
