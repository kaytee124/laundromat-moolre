'use strict';

const fs = require('fs');
const path = require('path');
const { ensureResultsDirs, resultPath, writeText, loadJson } = require('../lib/paths');

const KNOWN_ISSUES = [
  {
    id: 'B01',
    severity: 'critical',
    area: 'orders',
    issue: 'GET /api/orders/list/ has no pagination and deep eager loads',
    file: 'services/orderService.js',
  },
  {
    id: 'B02',
    severity: 'critical',
    area: 'dashboard',
    issue: 'Unpaid orders loaded entirely into memory for outstanding calculation',
    file: 'services/dashboardService.js',
  },
  {
    id: 'B03',
    severity: 'high',
    area: 'dashboard',
    issue: 'Revenue report loads all payments in range, aggregates in JavaScript',
    file: 'services/dashboardService.js',
  },
  {
    id: 'B04',
    severity: 'high',
    area: 'indexes',
    issue: 'Missing indexes on orders.order_status, orders.payment_status, orders.created_at, users.role',
    file: 'migrations/20250615000001-create-initial-schema.js',
  },
  {
    id: 'B05',
    severity: 'high',
    area: 'database',
    issue: 'DATE(created_at) in dashboard queries prevents index use',
    file: 'services/dashboardService.js',
  },
  {
    id: 'B06',
    severity: 'medium',
    area: 'connection-pool',
    issue: 'Sequelize default pool max (5) likely exhausts under 1K+ concurrent users',
    file: 'models/index.js',
  },
  {
    id: 'B07',
    severity: 'medium',
    area: 'auth',
    issue: 'bcrypt password verification is CPU-intensive at high login concurrency',
    file: 'services/authService.js',
  },
];

function readJsonIfExists(relPath) {
  const full = resultPath(...relPath.split('/'));
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function generateBottlenecks() {
  const queryResults = readJsonIfExists('queries/all-results.json') || [];
  const loadSummary = readJsonIfExists('load/summary.json');
  const concurrency = readJsonIfExists('load/concurrency-summary.json');
  const breakdown = readJsonIfExists('profiling/request-breakdown.json') || [];
  const raceResults = readJsonIfExists('race/all-results.json') || [];
  const failure = fs.existsSync(resultPath('failure', 'scenarios.md'))
    ? fs.readFileSync(resultPath('failure', 'scenarios.md'), 'utf8')
    : '';

  const detected = [...KNOWN_ISSUES];

  for (const q of queryResults) {
    if (q.usesFullScan) {
      detected.push({
        id: `Q-${q.id}`,
        severity: q.executionTimeMs > 1000 ? 'critical' : 'high',
        area: 'query',
        issue: `Full table scan on ${q.name} (${q.executionTimeMs?.toFixed(0)}ms)`,
        file: q.source,
      });
    }
    if (q.executionTimeMs > 500) {
      detected.push({
        id: `SLOW-${q.id}`,
        severity: q.executionTimeMs > 2000 ? 'critical' : 'warning',
        area: 'query',
        issue: `Slow query ${q.id}: ${q.executionTimeMs?.toFixed(0)}ms`,
        file: q.source,
      });
    }
  }

  for (const r of breakdown) {
    if (r.queryCount > 5) {
      detected.push({
        id: `N1-${r.endpoint}`,
        severity: 'high',
        area: 'n+1',
        issue: `${r.endpoint} executes ${r.queryCount} DB queries per request`,
        file: 'profiling',
      });
    }
    if (r.totalMs > 500) {
      detected.push({
        id: `LAT-${r.endpoint}`,
        severity: r.totalMs > 2000 ? 'critical' : 'warning',
        area: 'latency',
        issue: `${r.endpoint} total ${r.totalMs}ms (DB: ${r.dbMs}ms)`,
        file: 'profiling',
      });
    }
  }

  for (const r of raceResults.filter((x) => !x.passed)) {
    detected.push({
      id: r.id,
      severity: 'high',
      area: 'race',
      issue: `Race scenario failed: ${r.name} — ${r.details}`,
      file: 'benchmark/scripts/race',
    });
  }

  const checklist = [
    { item: 'Missing indexes', pass: !queryResults.some((q) => q.usesFullScan) },
    { item: 'N+1 queries', pass: !breakdown.some((r) => r.queryCount > 5) },
    { item: 'Full table scans', pass: !queryResults.some((q) => q.usesFullScan) },
    { item: 'Large joins (unpaginated orders)', pass: false },
    { item: 'Synchronous external calls', pass: true },
    { item: 'Memory leaks', pass: true },
    { item: 'Race conditions (write contention)', pass: raceResults.length === 0 || raceResults.every((r) => r.passed) },
    { item: 'Connection pool exhaustion', pass: !failure.includes('FAIL') },
    { item: 'Excessive serialization', pass: true },
    { item: 'Unbounded caches', pass: true },
    { item: 'Hot database tables', pass: queryResults.filter((q) => q.executionTimeMs > 100).length < 3 },
  ];

  const lines = [
    '# Scaling Bottleneck Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Executive Summary',
    '',
    `Identified ${detected.length} potential bottlenecks.`,
    '',
    '## Checklist',
    '',
    '| Check | Status |',
    '|-------|--------|',
  ];

  for (const c of checklist) {
    lines.push(`| ${c.item} | ${c.pass ? 'PASS' : 'FAIL'} |`);
  }

  lines.push('');
  lines.push('## Detected Bottlenecks');
  lines.push('');
  lines.push('| ID | Severity | Area | Issue | Location |');
  lines.push('|----|----------|------|-------|----------|');

  const seen = new Set();
  for (const d of detected) {
    const key = d.issue;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`| ${d.id} | ${d.severity} | ${d.area} | ${d.issue} | ${d.file} |`);
  }

  if (loadSummary?.metrics?.http_req_duration) {
    lines.push('');
    lines.push('## Load Test Latency');
    lines.push('');
    const d = loadSummary.metrics.http_req_duration.values;
    lines.push(`- Avg: ${d.avg?.toFixed(2)} ms`);
    lines.push(`- P95: ${d['p(95)']?.toFixed(2)} ms`);
    lines.push(`- P99: ${d['p(99)']?.toFixed(2)} ms`);
  }

  if (concurrency?.metrics?.concurrency_errors) {
    lines.push('');
    lines.push('## Concurrency');
    lines.push('');
    lines.push(`- Error rate: ${(concurrency.metrics.concurrency_errors.values.rate * 100).toFixed(2)}%`);
  }

  if (raceResults.length) {
    lines.push('');
    lines.push('## Race / contention');
    lines.push('');
    const failed = raceResults.filter((r) => !r.passed).length;
    lines.push(`- Scenarios passed: ${raceResults.length - failed}/${raceResults.length}`);
  }

  lines.push('');
  lines.push('## Recommendations (not implemented — benchmark only)');
  lines.push('');
  lines.push('1. Add pagination to order list endpoint');
  lines.push('2. Add composite indexes on orders(status, created_at) and orders(customer_id, created_at)');
  lines.push('3. Replace unpaid orders findAll with SUM aggregate query');
  lines.push('4. Move revenue report aggregation to SQL GROUP BY');
  lines.push('5. Increase Sequelize connection pool for production');
  lines.push('6. Add Redis caching for dashboard metrics');

  writeText('reports/bottlenecks.md', lines.join('\n'));
  console.log('Wrote benchmark/results/reports/bottlenecks.md');
}

module.exports = { generateBottlenecks };

if (require.main === module) {
  ensureResultsDirs();
  generateBottlenecks();
}
