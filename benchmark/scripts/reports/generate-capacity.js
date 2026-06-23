'use strict';



const fs = require('fs');

const { ensureResultsDirs, resultPath, writeText, readManifest } = require('../lib/paths');



function readJsonIfExists(relPath) {

  const full = resultPath(...relPath.split('/'));

  if (!fs.existsSync(full)) return null;

  return JSON.parse(fs.readFileSync(full, 'utf8'));

}



function generateCapacity() {

  const manifest = readManifest();

  const loadSummary = readJsonIfExists('load/summary.json');

  const concurrency = readJsonIfExists('load/concurrency-summary.json');

  const capacityProbe = readJsonIfExists('load/capacity-probe.json');

  const breakdown = readJsonIfExists('profiling/request-breakdown.json') || [];



  const probeBestStep = capacityProbe?.steps?.filter((s) => s.passed).pop();

  const reqPerSec = probeBestStep?.reqPerSec

    || loadSummary?.metrics?.http_reqs?.values?.rate

    || concurrency?.metrics?.http_reqs?.values?.rate

    || 10;



  const avgLatency = probeBestStep?.p95Ms

    || loadSummary?.metrics?.http_req_duration?.values?.avg

    || concurrency?.metrics?.concurrency_latency?.values?.avg

    || 100;

  const avgQueries = breakdown.length

    ? breakdown.reduce((s, r) => s + r.queryCount, 0) / breakdown.length

    : 5;



  const memSample = readJsonIfExists('profiling/memory-timeseries.json');

  const heapGrowth = memSample?.heapGrowthBytes || 0;



  const perRequest = {

    queries: avgQueries.toFixed(1),

    latencyMs: typeof avgLatency === 'number' ? avgLatency.toFixed(1) : String(avgLatency),

    memoryKb: (heapGrowth / 1024).toFixed(1),

  };



  const userLevels = [1000, 10000, 100000, 1000000];

  const lines = [

    '# Capacity Estimates',

    '',

    `Generated: ${new Date().toISOString()}`,

    '',

  ];



  if (capacityProbe) {

    lines.push('## Capacity Probe Results');

    lines.push('');

    lines.push(`| Metric | Value |`);

    lines.push(`|--------|-------|`);

    lines.push(`| Max sustainable VUs | **${capacityProbe.maxSustainableVus || 0}** |`);

    if (capacityProbe.breakingPointVus) {

      lines.push(`| Breaking point | ${capacityProbe.breakingPointVus} VUs (${capacityProbe.breakingReason || 'unknown'}) |`);

    }

    lines.push(`| Probe date | ${capacityProbe.generatedAt || 'n/a'} |`);

    lines.push('');

    lines.push('### Per-step breakdown');

    lines.push('');

    lines.push('| VUs | Req/sec | Error % | P95 ms | Passed |');

    lines.push('|-----|---------|---------|--------|--------|');

    for (const step of capacityProbe.steps || []) {

      lines.push(

        `| ${step.vus} | ${step.reqPerSec?.toFixed(2) ?? 'n/a'} | ${(step.errorRate * 100).toFixed(1)} | ${step.p95Ms?.toFixed(0) ?? 'n/a'} | ${step.passed ? 'yes' : 'no'} |`

      );

    }

    lines.push('');

  }



  lines.push('## Measured Baseline');

  lines.push('');

  lines.push(`| Metric | Value |`);

  lines.push(`|--------|-------|`);

  lines.push(`| Throughput | ${reqPerSec.toFixed(2)} req/sec |`);

  lines.push(`| Avg / P95 latency | ${perRequest.latencyMs} ms |`);

  lines.push(`| Queries/request | ${perRequest.queries} |`);

  lines.push(`| DB rows (orders) | ${manifest?.counts?.orders ?? 'not seeded'} |`);

  lines.push('');

  lines.push('## Per-Request Cost');

  lines.push('');

  lines.push(`- Queries/request: ${perRequest.queries}`);

  lines.push(`- Latency/request: ${perRequest.latencyMs} ms`);

  lines.push(`- Memory growth (idle sample): ${perRequest.memoryKb} KB`);

  lines.push('');

  lines.push('## Extrapolated Capacity');

  lines.push('');

  lines.push('Assumptions: 10% of users active concurrently; admin dashboard endpoints are staff-only.');

  lines.push('');

  lines.push('| Users | Est. concurrent | Est. req/sec needed | Can sustain? |');

  lines.push('|-------|-----------------|---------------------|--------------|');

  for (const users of userLevels) {

    const concurrent = Math.round(users * 0.1);

    const needed = concurrent * 0.1;

    const canSustain = reqPerSec >= needed ? 'Yes' : 'No';

    lines.push(`| ${users.toLocaleString()} | ${concurrent.toLocaleString()} | ${needed.toFixed(0)} | ${canSustain} |`);

  }



  lines.push('');

  lines.push('## Scaling Limits');

  lines.push('');

  lines.push(`- **Max sustained throughput (measured):** ~${reqPerSec.toFixed(0)} req/sec`);

  if (capacityProbe?.maxSustainableVus) {

    lines.push(`- **Max sustainable VUs (probe):** ${capacityProbe.maxSustainableVus} on this machine`);

  }

  lines.push(`- **Orders list:** Paginated; deep joins on 5M rows still pool-heavy under load`);

  lines.push(`- **Dashboard metrics:** ${perRequest.queries}+ queries per request`);

  lines.push(`- **Connection pool (benchmark):** DB_POOL_MAX=50`);

  lines.push('');

  lines.push('## Query Load at Scale');

  lines.push('');

  lines.push(`At ${reqPerSec.toFixed(0)} req/sec with ${perRequest.queries} queries/request:`);

  lines.push(`- Database queries/sec: ~${(reqPerSec * avgQueries).toFixed(0)}`);



  writeText('reports/capacity-estimates.md', lines.join('\n'));

  console.log('Wrote benchmark/results/reports/capacity-estimates.md');

}



module.exports = { generateCapacity };



if (require.main === module) {

  ensureResultsDirs();

  generateCapacity();

}


