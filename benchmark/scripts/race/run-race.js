'use strict';

const http = require('http');
const { loadJson, writeJson, writeText, ensureResultsDirs } = require('../lib/paths');
const { RUNNERS } = require('./scenarios/index');
const { BASE_URL } = require('./helpers');

const SCENARIO_TIMEOUT_MS = parseInt(process.env.BENCHMARK_RACE_TIMEOUT_MS || '120000', 10);

function checkServer() {
  return new Promise((resolve) => {
    const u = new URL('/health', BASE_URL);
    http
      .get({ hostname: u.hostname, port: u.port || 80, path: u.pathname }, (res) => {
        resolve(res.statusCode === 200);
      })
      .on('error', () => resolve(false));
  });
}

function runWithTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`scenario timeout after ${ms}ms: ${label}`));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function main() {
  ensureResultsDirs();
  const config = loadJson('race-scenarios.json');
  const healthy = await checkServer();
  if (!healthy) {
    console.error(`Server not reachable at ${BASE_URL}. Start with NODE_ENV=benchmark npm start`);
    process.exit(1);
  }

  console.log('Running race / contention scenarios...\n');
  const results = [];

  for (const scenario of config.scenarios) {
    const runner = RUNNERS[scenario.id];
    if (!runner) {
      console.warn(`No runner for ${scenario.id}`);
      continue;
    }
    process.stdout.write(`${scenario.id}: ${scenario.name}... `);
    try {
      const r = await runWithTimeout(
        runner(),
        SCENARIO_TIMEOUT_MS,
        `${scenario.id} ${scenario.name}`
      );
      results.push(r);
      writeJson(`race/${scenario.id}.json`, r);
      console.log(r.passed ? 'PASS' : 'FAIL', `— ${r.details}`);
    } catch (err) {
      const fail = {
        id: scenario.id,
        name: scenario.name,
        passed: false,
        details: err.message,
        timestamp: new Date().toISOString(),
      };
      results.push(fail);
      writeJson(`race/${scenario.id}.json`, fail);
      console.log('ERROR —', err.message);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const lines = [
    '# Race / Contention Test Summary',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Passed: ${passed}/${results.length}`,
    '',
    '| ID | Pass | Details |',
    '|----|------|---------|',
  ];
  for (const r of results) {
    lines.push(`| ${r.id} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.details} |`);
  }

  writeText('race/summary.md', lines.join('\n'));
  writeJson('race/all-results.json', results);
  console.log(`\nWrote benchmark/results/race/summary.md (${passed}/${results.length} passed)`);

  if (passed < results.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
