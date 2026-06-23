'use strict';

const fs = require('fs');
const path = require('path');
const { ensureResultsDirs, writeText, ROOT } = require('../lib/paths');

const COVERAGE = {
  jest: {
    auth: ['tests/security/auth.test.js', 'tests/security/jwtHardening.test.js', 'tests/security/tokenTransport.test.js'],
    rbac: ['tests/security/rbac.test.js', 'tests/security/idor.test.js', 'tests/security/idorMatrix.test.js', 'tests/security/routeAuthMatrix.test.js'],
    csrf_cors: ['tests/security/csrf.test.js', 'tests/security/corsAndHeaders.test.js'],
    input: ['tests/security/injectionAndSearch.test.js', 'tests/security/inputValidation.test.js', 'tests/security/payloadAbuse.test.js', 'tests/security/massAssignment.test.js'],
    payments: ['tests/security/paymentAbuse.test.js', 'tests/security/payments.test.js'],
    data: ['tests/security/dataExposure.test.js', 'tests/security/enumeration.test.js'],
    integration: [
      'tests/integration/accounts.test.js',
      'tests/integration/customers.test.js',
      'tests/integration/orders.test.js',
      'tests/integration/payments.test.js',
      'tests/integration/services.test.js',
      'tests/integration/dashboard.test.js',
    ],
    concurrency: [
      'tests/concurrency/orderUpdateRace.test.js',
      'tests/concurrency/paymentRace.test.js',
      'tests/concurrency/authRace.test.js',
      'tests/concurrency/registrationRace.test.js',
    ],
  },
  benchmark: {
    query_performance: 'benchmark/scripts/queries/explain-analyze.js',
    read_load: 'benchmark/scripts/load/endpoints.js',
    concurrency_load: 'benchmark/scripts/load/concurrency.js',
    race_contention: 'benchmark/scripts/race/run-race.js',
    profiling: 'benchmark/scripts/profiling/run-profiling.js',
    failure: 'benchmark/scripts/failure/scenarios.js',
    db_metrics: 'benchmark/scripts/db-metrics/collect.js',
  },
  gaps: [
    { item: 'Rate limiting', status: 'not_implemented', covered_by: 'tests/security/rateLimitAbsence.test.js' },
    { item: 'WebSocket / real-time', status: 'n/a', covered_by: null },
    { item: 'Multi-instance deployment', status: 'manual', covered_by: null },
    { item: 'MySQL replication lag', status: 'manual', covered_by: null },
    { item: 'Paystack webhook signature timing', status: 'partial', covered_by: 'tests/security/paymentAbuse.test.js' },
  ],
};

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function generate() {
  ensureResultsDirs();
  const lines = [
    '# Test Coverage Matrix',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Jest suites',
    '',
    '| Area | Files | Present |',
    '|------|-------|---------|',
  ];

  for (const [area, files] of Object.entries(COVERAGE.jest)) {
    const present = files.every(fileExists);
    lines.push(`| ${area} | ${files.length} | ${present ? 'yes' : 'missing'} |`);
  }

  lines.push('');
  lines.push('## Benchmark modules');
  lines.push('');
  lines.push('| Module | Script | Present |');
  lines.push('|--------|--------|---------|');
  for (const [name, script] of Object.entries(COVERAGE.benchmark)) {
    lines.push(`| ${name} | ${script} | ${fileExists(script) ? 'yes' : 'no'} |`);
  }

  lines.push('');
  lines.push('## Known gaps (manual / future)');
  lines.push('');
  lines.push('| Item | Status | Covered by |');
  lines.push('|------|--------|------------|');
  for (const g of COVERAGE.gaps) {
    lines.push(`| ${g.item} | ${g.status} | ${g.covered_by || '—'} |`);
  }

  lines.push('');
  lines.push('## Race scenarios (benchmark)');
  lines.push('');
  const raceConfig = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'benchmark/config/race-scenarios.json'), 'utf8')
  );
  for (const s of raceConfig.scenarios) {
    lines.push(`- ${s.id}: ${s.name}`);
  }

  writeText('reports/coverage-matrix.md', lines.join('\n'));
  console.log('Wrote benchmark/results/reports/coverage-matrix.md');
}

module.exports = { generate, COVERAGE };

if (require.main === module) {
  generate();
}
