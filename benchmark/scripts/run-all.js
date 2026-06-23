'use strict';

// Recommended local re-run (seed already present): node benchmark/scripts/run-all.js --skip-seed --quick
// Capacity probe (find max sustainable VUs): add --full-load
// Stress test (10K VU ramp to failure): add --stress

const { execSync, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { ensureResultsDirs, resultPath, ROOT, writeText, readManifest } = require('./lib/paths');
const { loginWithSession } = require('./lib/http-auth');
const { runCapacityProbe } = require('./load/run-capacity-probe');

const SKIP_SEED = process.argv.includes('--skip-seed');
const SKIP_LOAD = process.argv.includes('--skip-load');
const QUICK = process.argv.includes('--quick');
const FULL_LOAD = process.argv.includes('--full-load');
const STRESS = process.argv.includes('--stress');
const SERVER_PORT = parseInt(process.env.PORT || '3000', 10);
// Default quick k6 load when re-running with existing seed; --full-load runs capacity probe.
const USE_QUICK_LOAD = !SKIP_LOAD && !FULL_LOAD && !STRESS && (QUICK || SKIP_SEED);
const USE_CAPACITY_PROBE = !SKIP_LOAD && FULL_LOAD && !STRESS;
const USE_STRESS_LOAD = !SKIP_LOAD && STRESS;

function runNode(script, args = [], env = {}, options = {}) {
  const { allowFailure = false } = options;
  console.log(`\n>>> node ${script} ${args.join(' ')}`);
  const result = spawnSync('node', [script, ...args], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'benchmark', ...env },
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    if (allowFailure) {
      console.warn(`Warning: ${script} exited with code ${result.status} (continuing)`);
      return result.status;
    }
    throw new Error(`Failed: ${script}`);
  }
  return result.status;
}

function commandExists(cmd) {
  const r = spawnSync(cmd, ['version'], { shell: true, stdio: 'pipe' });
  return r.status === 0;
}

function runK6(script, env, label) {
  const result = spawnSync('k6', ['run', script], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env,
  });
  if (result.status !== 0) {
    console.warn(`Warning: k6 ${label} exited with code ${result.status} (continuing)`);
  }
  return result.status;
}

function waitForHealth(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      http.get(`http://localhost:${port}/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error('Health check timeout'));
        setTimeout(tick, 1000);
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('Health check timeout'));
        setTimeout(tick, 1000);
      });
    };
    tick();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPortHolderPid(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr ":${port}.*LISTENING"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      for (const line of out.trim().split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (Number.isFinite(pid) && pid > 0) return pid;
      }
    } else {
      const out = execSync(`lsof -ti :${port} -sTCP:LISTEN`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const pid = parseInt(out.trim().split('\n')[0], 10);
      if (Number.isFinite(pid) && pid > 0) return pid;
    }
  } catch {
    return null;
  }
  return null;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, '127.0.0.1');
  });
}

async function waitForPortFree(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortFree(port)) return;
    await sleep(500);
  }

  const orphanPid = getPortHolderPid(port);
  if (orphanPid) {
    console.log(`Port ${port} still held by PID ${orphanPid}; force-stopping...`);
    try {
      process.kill(orphanPid);
    } catch {
      /* already exited */
    }
    await sleep(1000);
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /PID ${orphanPid} /F`, { stdio: 'ignore' });
      } catch {
        /* already dead */
      }
    }
  }

  const retryDeadline = Date.now() + 5000;
  while (Date.now() < retryDeadline) {
    if (await isPortFree(port)) return;
    await sleep(500);
  }

  throw new Error(`Port ${port} still in use after stop`);
}

async function stopServer(server) {
  if (server && !server.killed) {
    server.kill();
    console.log('Server stopped.');
  }
  await waitForPortFree(SERVER_PORT);
}

function startServer() {
  const logPath = resultPath('observability', 'server.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fs.openSync(logPath, 'a');
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'benchmark',
      DB_NAME: process.env.DB_NAME_BENCHMARK || 'laundry_management_system_benchmark',
      DB_POOL_MAX: process.env.DB_POOL_MAX || '50',
      PORT: String(SERVER_PORT),
    },
    stdio: ['ignore', logFd, logFd],
    detached: false,
  });
  return child;
}

async function restartServer(server) {
  await stopServer(server);
  await sleep(2000);
  const next = startServer();
  await waitForHealth(SERVER_PORT);
  console.log(`Server restarted and healthy on :${SERVER_PORT}`);
  return next;
}

async function probeServerLogin(timeoutMs = 120000) {
  const manifest = readManifest();
  const creds = manifest?.credentials?.admin;
  if (!creds) {
    throw new Error('Login probe failed: no admin credentials in benchmark/results/seed/manifest.json');
  }

  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      await loginWithSession(creds.username, creds.password);
      console.log('Login probe OK — server ready for race tests');
      return;
    } catch (err) {
      lastError = err;
      await sleep(2000);
    }
  }
  throw new Error(
    `Login probe failed after ${Math.round(timeoutMs / 1000)}s — pool may still be exhausted. ${lastError?.message || ''}`
  );
}

async function main() {
  ensureResultsDirs();
  const startTime = Date.now();
  let server = null;

  console.log('=== Bubblebytes Benchmark Suite ===\n');
  if (SKIP_SEED && USE_QUICK_LOAD && !QUICK) {
    console.log('Note: --skip-seed defaults to quick k6 load (10 → 200 VUs). Use --full-load for capacity probe.\n');
  }
  if (STRESS && FULL_LOAD) {
    console.warn('Warning: both --stress and --full-load set; --stress takes precedence for load phase.\n');
  }

  try {
    console.log('Step 1: Setup benchmark database');
    runNode('benchmark/scripts/setup-db.js');

    if (!SKIP_SEED) {
      console.log('\nStep 2: Seed production-scale data');
      if (QUICK) {
        console.log('QUICK mode: using reduced seed volumes');
        process.env.BENCHMARK_QUICK = '1';
      }
      runNode('benchmark/scripts/seed/seed.js', []);
    } else {
      console.log('\nStep 2: Skipped seed (--skip-seed)');
      if (!fs.existsSync(resultPath('seed', 'manifest.json'))) {
        console.warn('Warning: no manifest.json — load tests may fail');
      }
    }

    console.log('\nStep 3: Query inventory');
    runNode('benchmark/scripts/queries/inventory.js');

    console.log('\nStep 4: EXPLAIN ANALYZE');
    runNode('benchmark/scripts/queries/explain-analyze.js');

    if (!SKIP_LOAD) {
      console.log('\nStep 5: Start server for load tests');
      await waitForPortFree(SERVER_PORT).catch(() => {});
      server = startServer();
      await waitForHealth(SERVER_PORT);
      console.log(`Server ready on :${SERVER_PORT}`);

      if (commandExists('k6')) {
        const k6Env = {
          ...process.env,
          ...(USE_QUICK_LOAD ? { BENCHMARK_LOAD_QUICK: '1' } : {}),
        };

        console.log('\nStep 6: k6 endpoint benchmarks');
        runK6('benchmark/scripts/load/endpoints.js', k6Env, 'endpoints');

        console.log('\nStep 6b: Restart server before load phase (pool recovery)');
        server = await restartServer(server);

        if (USE_CAPACITY_PROBE) {
          console.log('\nStep 7: Capacity probe (stepped VU discovery)');
          await runCapacityProbe();
        } else {
          console.log('\nStep 7: k6 concurrency test');
          if (USE_QUICK_LOAD) {
            console.log('QUICK load: reduced VU ramp (10 → 200)');
          } else if (USE_STRESS_LOAD) {
            console.log('STRESS load: VU ramp 10 → 10,000 (--stress)');
          } else {
            console.log('FULL load: VU ramp 10 → 10,000 (default fresh seed)');
          }
          runK6('benchmark/scripts/load/concurrency.js', k6Env, 'concurrency');
        }

        console.log('\nStep 7b: Restart server after load tests (pool recovery)');
        server = await restartServer(server);
        const cooldownMs = 60000;
        console.log(`Cooling down ${cooldownMs / 1000}s before race tests...`);
        await sleep(cooldownMs);
        console.log('Probing login before race tests...');
        await probeServerLogin();

        console.log('\nStep 8: Race / contention tests');
        runNode('benchmark/scripts/race/run-race.js', [], {}, { allowFailure: true });
      } else {
        console.warn('k6 not installed — skipping load tests. Install: choco install k6');
        writeText('load/summary.md', '# Load Tests\n\nSkipped: k6 not installed.\n');
        console.log('\nStep 8: Race / contention tests');
        runNode('benchmark/scripts/race/run-race.js', [], {}, { allowFailure: true });
      }

      console.log('\nStep 8b: DB metrics collection');
      runNode('benchmark/scripts/db-metrics/collect.js', [], { BENCHMARK_METRICS_DURATION: '30000' });
    } else {
      console.log('\nSteps 5-8: Skipped load tests (--skip-load)');
    }

    console.log('\nStep 9: Profiling');
    runNode('benchmark/scripts/profiling/run-profiling.js');

    console.log('\nStep 10: Failure scenarios');
    if (server || !SKIP_LOAD) {
      runNode('benchmark/scripts/failure/scenarios.js');
    } else {
      runNode('benchmark/scripts/failure/scenarios.js');
    }

    console.log('\nStep 11: Generate reports');
    runNode('benchmark/scripts/reports/generate-all.js');

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    writeText('reports/run-summary.md', [
      '# Benchmark Run Summary',
      '',
      `Completed: ${new Date().toISOString()}`,
      `Duration: ${elapsed} minutes`,
      '',
      '## Outputs',
      '',
      '- benchmark/results/reports/bottlenecks.md',
      '- benchmark/results/reports/capacity-estimates.md',
      '- benchmark/results/queries/summary.md',
      '- benchmark/results/load/summary.md',
      '- benchmark/results/load/capacity-probe.json',
      '- benchmark/results/profiling/request-breakdown.md',
      '- benchmark/results/race/summary.md',
      '- benchmark/results/reports/coverage-matrix.md',
    ].join('\n'));

    console.log(`\n=== Benchmark complete in ${elapsed} min ===`);
    console.log('Primary report: benchmark/results/reports/bottlenecks.md');
  } finally {
    if (server) {
      await stopServer(server).catch((err) => {
        console.warn(`Warning: could not stop server cleanly: ${err.message}`);
      });
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  module.exports = {
    stopServer,
    restartServer,
    startServer,
    waitForHealth,
    waitForPortFree,
    probeServerLogin,
    runCapacityProbe,
    SERVER_PORT,
  };
}
