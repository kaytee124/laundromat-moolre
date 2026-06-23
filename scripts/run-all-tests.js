'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const QUICK = process.argv.includes('--quick');

function run(cmd, args, env = {}) {
  console.log(`\n>>> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: true,
  });
  return result.status === 0;
}

function writeSummary(phases) {
  const outDir = path.join(ROOT, 'benchmark', 'results', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const lines = [
    '# Full Test Run Summary',
    '',
    `Completed: ${new Date().toISOString()}`,
    `Mode: ${QUICK ? 'quick' : 'full'}`,
    '',
    '| Phase | Status |',
    '|-------|--------|',
  ];
  for (const p of phases) {
    lines.push(`| ${p.name} | ${p.ok ? 'PASS' : 'FAIL'} |`);
  }
  const allOk = phases.every((p) => p.ok);
  lines.push('');
  lines.push(allOk ? '**Overall: PASS**' : '**Overall: FAIL**');
  fs.writeFileSync(path.join(outDir, 'full-test-run.md'), lines.join('\n'));
  console.log('\nWrote benchmark/results/reports/full-test-run.md');
  return allOk;
}

async function main() {
  console.log('=== Full Test Suite (Jest + Benchmark) ===\n');
  const phases = [];

  phases.push({ name: 'db:migrate:test', ok: run('npm', ['run', 'db:migrate:test']) });
  if (!phases[phases.length - 1].ok) {
    writeSummary(phases);
    process.exit(1);
  }

  phases.push({ name: 'jest (all)', ok: run('npm', ['test']) });
  if (!phases[phases.length - 1].ok) {
    writeSummary(phases);
    process.exit(1);
  }

  phases.push({ name: 'benchmark:setup', ok: run('npm', ['run', 'benchmark:setup']) });
  if (!phases[phases.length - 1].ok) {
    writeSummary(phases);
    process.exit(1);
  }

  const benchArgs = QUICK ? ['run', 'benchmark:all', '--', '--quick'] : ['run', 'benchmark:all'];
  phases.push({
    name: QUICK ? 'benchmark:all (quick)' : 'benchmark:all (full)',
    ok: run('npm', benchArgs, { NODE_ENV: 'benchmark' }),
  });

  const allOk = writeSummary(phases);
  if (!allOk) process.exit(1);
  console.log('\n=== All tests complete ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
