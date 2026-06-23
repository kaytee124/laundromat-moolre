'use strict';

const request = require('supertest');
const { performance } = require('perf_hooks');
const v8 = require('v8');
const fs = require('fs');
const { spawn } = require('child_process');
const { ensureResultsDirs, writeText, writeJson, readManifest, resultPath } = require('../lib/paths');

const ENDPOINTS = [
  { name: 'health', method: 'get', path: '/health', auth: null },
  { name: 'services-list', method: 'get', path: '/api/services/list/', auth: null },
  { name: 'orders-list', method: 'get', path: '/api/orders/list/', auth: 'admin' },
  { name: 'dashboard-metrics', method: 'get', path: '/api/dashboard/metrics/', auth: 'superadmin' },
];

async function login(app, creds) {
  const agent = request.agent(app);
  const csrfRes = await agent.get('/api/accounts/csrf/');
  const csrf = csrfRes.body.csrf_token;
  const res = await agent
    .post('/api/accounts/login/')
    .set('X-CSRF-Token', csrf)
    .send({ username: creds.username, password: creds.password });
  return { agent, access: res.body.access, csrf };
}

async function requestBreakdown() {
  process.env.NODE_ENV = 'benchmark';
  delete require.cache[require.resolve('../../../models/index')];
  delete require.cache[require.resolve('../../../app')];

  const { sequelize } = require('../../../models');
  const app = require('../../../app');
  const manifest = readManifest();

  const queryLog = [];
  sequelize.options.logging = (sql, timing) => {
    const timingMs = typeof timing === 'number' ? timing : null;
    queryLog.push({ sql: String(sql).slice(0, 500), timingMs });
  };

  const tokens = {};
  if (manifest?.credentials) {
    for (const role of ['admin', 'superadmin']) {
      tokens[role] = await login(app, manifest.credentials[role]);
    }
  }

  const results = [];

  for (const ep of ENDPOINTS) {
    const start = performance.now();
    queryLog.length = 0;

    let req = request(app)[ep.method](ep.path);
    if (ep.auth && tokens[ep.auth]) {
      req = req.set('Authorization', `Bearer ${tokens[ep.auth].access}`);
    }

    const res = await req;
    const totalMs = performance.now() - start;
    const dbMs = queryLog.reduce((s, q) => s + (q.timingMs || 0), 0);

    results.push({
      endpoint: ep.name,
      status: res.status,
      totalMs: Math.round(totalMs * 100) / 100,
      dbMs: Math.round(dbMs * 100) / 100,
      logicMs: Math.round((totalMs - dbMs) * 100) / 100,
      queryCount: queryLog.length,
      queries: queryLog.slice(0, 10).map((q) => ({ sql: q.sql, timingMs: q.timingMs })),
    });
  }

  const lines = [
    '# Request Breakdown',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Endpoint | Status | Total (ms) | DB (ms) | Logic (ms) | Queries |',
    '|----------|--------|------------|---------|------------|---------|',
  ];
  for (const r of results) {
    lines.push(
      `| ${r.endpoint} | ${r.status} | ${r.totalMs} | ${r.dbMs} | ${r.logicMs} | ${r.queryCount} |`
    );
  }

  writeText('profiling/request-breakdown.md', lines.join('\n'));
  writeJson('profiling/request-breakdown.json', results);
  return results;
}

async function memoryProfile() {
  const samples = [];
  const durationMs = parseInt(process.env.BENCHMARK_MEM_DURATION, 10) || 10000;
  const intervalMs = 1000;
  const startHeap = v8.getHeapStatistics();

  const beforePath = resultPath('profiling', 'heap-before.heapsnapshot');
  v8.writeHeapSnapshot(beforePath);

  const start = Date.now();
  while (Date.now() - start < durationMs) {
    samples.push({
      t: Date.now() - start,
      ...process.memoryUsage(),
    });
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const afterPath = resultPath('profiling', 'heap-after.heapsnapshot');
  v8.writeHeapSnapshot(afterPath);

  const endHeap = v8.getHeapStatistics();
  writeJson('profiling/memory-timeseries.json', {
    samples,
    heapBefore: startHeap,
    heapAfter: endHeap,
    heapGrowthBytes: endHeap.used_heap_size - startHeap.used_heap_size,
  });

  writeText(
    'profiling/memory-summary.md',
    [
      '# Memory Profile Summary',
      '',
      `Duration: ${durationMs}ms`,
      `Heap growth: ${((endHeap.used_heap_size - startHeap.used_heap_size) / 1024 / 1024).toFixed(2)} MB`,
      `Samples: ${samples.length}`,
    ].join('\n')
  );
}

function cpuProfile() {
  return new Promise((resolve, reject) => {
    const outFile = resultPath('profiling', 'cpu-profile.cpuprofile');
    const script = `
      const http = require('http');
      const manifest = require('${resultPath('seed', 'manifest.json').replace(/\\/g, '\\\\')}');
      const creds = manifest.credentials.admin;
      let token = null;
      async function login() {
        return new Promise((resolve) => {
          http.get('http://localhost:3000/api/accounts/csrf/', (csrfRes) => {
            let data = '';
            csrfRes.on('data', (c) => data += c);
            csrfRes.on('end', () => {
              const csrf = JSON.parse(data).csrf_token;
              const req = http.request('http://localhost:3000/api/health', { method: 'GET' }, () => {});
              req.end();
              const loginReq = http.request('http://localhost:3000/api/accounts/login/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
              }, (res) => {
                let body = '';
                res.on('data', (c) => body += c);
                res.on('end', () => { token = JSON.parse(body).access; resolve(); });
              });
              loginReq.write(JSON.stringify({ username: creds.username, password: creds.password }));
              loginReq.end();
            });
          });
        });
      }
      async function run() {
        try {
          await login();
          const end = Date.now() + 15000;
          while (Date.now() < end) {
            await new Promise((resolve) => {
              http.get('http://127.0.0.1:3000/api/services/list/', { headers: { Authorization: 'Bearer ' + token } }, () => resolve()).on('error', () => resolve());
            });
          }
        } catch (e) { /* ignore */ }
      }
      run();
    `;

    const child = spawn(process.execPath, ['--cpu-prof', '--cpu-prof-dir', resultPath('profiling'), '-e', script], {
      stdio: 'inherit',
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      writeText('profiling/cpu-summary.md', [
        '# CPU Profile Summary',
        '',
        `Profile directory: benchmark/results/profiling/`,
        `Exit code: ${code}`,
        'Look for bcrypt, Sequelize, and JSON.stringify in the .cpuprofile file.',
      ].join('\n'));
      if (code === 0) resolve();
      else reject(new Error(`CPU profile exited with ${code}`));
    });
  });
}

async function main() {
  ensureResultsDirs();
  console.log('Running request breakdown...');
  await requestBreakdown();

  console.log('Running memory profile...');
  await memoryProfile();

  console.log('Running CPU profile (requires server on :3000)...');
  try {
    await cpuProfile();
  } catch (err) {
    console.warn('CPU profile skipped or failed:', err.message);
    writeText('profiling/cpu-summary.md', `# CPU Profile\n\nSkipped: ${err.message}\n`);
  }

  console.log('Profiling complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
