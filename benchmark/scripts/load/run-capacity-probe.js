'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { ensureResultsDirs, resultPath, ROOT } = require('../lib/paths');

const DEFAULT_CAPACITY_STEPS = [50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000];
const SETTLE_MS = 5000;
const HEALTH_POLL_MS = 2000;
const HEALTH_FAIL_THRESHOLD = 3;
const SERVER_PORT = parseInt(process.env.PORT || '3000', 10);
const BASE_URL = process.env.BASE_URL || `http://localhost:${SERVER_PORT}`;

function parseCapacitySteps() {
  const raw = process.env.CAPACITY_STEPS;
  if (!raw) return DEFAULT_CAPACITY_STEPS;
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeHealth() {
  return new Promise((resolve) => {
    const u = new URL('/health', BASE_URL);
    const req = http.get(
      { hostname: u.hostname, port: u.port || 80, path: u.pathname, timeout: 5000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function readStepSummary(vus) {
  const file = resultPath('load', `capacity-step-${vus}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function extractStepMetrics(vus, summary, k6ExitCode, failureReason) {
  const m = summary?.metrics || {};
  const errorRate = m.concurrency_errors?.values?.rate ?? 1;
  const reqPerSec = m.http_reqs?.values?.rate ?? 0;
  const p95Ms = m.concurrency_latency?.values?.['p(95)'] ?? m.http_req_duration?.values?.['p(95)'];
  const httpFailed = m.http_req_failed?.values?.rate ?? 0;
  const passed = !failureReason && errorRate < 0.1;

  return {
    vus,
    errorRate,
    reqPerSec,
    p95Ms: p95Ms ?? null,
    httpFailedRate: httpFailed,
    k6ExitCode,
    passed,
    failureReason: failureReason || (passed ? null : 'threshold_or_errors'),
  };
}

function runK6Step(vus) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      CAPACITY_VUS: String(vus),
      BASE_URL,
    };

    let healthFails = 0;
    let sidecarStopped = false;
    let failureReason = null;

    const child = spawn('k6', ['run', 'benchmark/scripts/load/capacity-step.js'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env,
    });

    const sidecar = setInterval(async () => {
      if (sidecarStopped) return;
      const ok = await probeHealth();
      if (ok) {
        healthFails = 0;
        return;
      }
      healthFails += 1;
      if (healthFails >= HEALTH_FAIL_THRESHOLD) {
        failureReason = 'server_unreachable';
        sidecarStopped = true;
        clearInterval(sidecar);
        console.warn(`Health sidecar: ${HEALTH_FAIL_THRESHOLD} consecutive failures at VUs=${vus}, stopping k6`);
        child.kill();
      }
    }, HEALTH_POLL_MS);

    child.on('close', (code) => {
      clearInterval(sidecar);
      sidecarStopped = true;
      resolve({ exitCode: code ?? 1, failureReason });
    });
  });
}

async function runCapacityProbe(options = {}) {
  const steps = options.steps || parseCapacitySteps();
  ensureResultsDirs();

  const probeResult = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    steps: [],
    maxSustainableVus: 0,
    breakingPointVus: null,
    breakingReason: null,
  };

  console.log(`Capacity probe: ${steps.join(' → ')} VUs (${BASE_URL})`);

  for (let i = 0; i < steps.length; i += 1) {
    const vus = steps[i];
    if (i > 0) {
      console.log(`Settling ${SETTLE_MS / 1000}s before next step...`);
      await sleep(SETTLE_MS);
    }

    console.log(`\n--- Capacity step: ${vus} VUs ---`);
    const { exitCode, failureReason } = await runK6Step(vus);
    const summary = readStepSummary(vus);

    const stepRecord = summary
      ? extractStepMetrics(vus, summary, exitCode, failureReason)
      : {
          vus,
          errorRate: 1,
          reqPerSec: 0,
          p95Ms: null,
          httpFailedRate: 1,
          k6ExitCode: exitCode,
          passed: false,
          failureReason: failureReason || 'no_summary',
        };
    if (failureReason) stepRecord.failureReason = failureReason;
    if (exitCode !== 0 && stepRecord.passed) {
      stepRecord.passed = false;
      stepRecord.failureReason = stepRecord.failureReason || 'k6_exit_nonzero';
    }

    probeResult.steps.push(stepRecord);
    console.log(
      `Step ${vus} VUs: passed=${stepRecord.passed}, errorRate=${(stepRecord.errorRate * 100).toFixed(1)}%, rps=${stepRecord.reqPerSec?.toFixed(1) || 0}`
    );

    if (stepRecord.passed) {
      probeResult.maxSustainableVus = vus;
    } else {
      probeResult.breakingPointVus = vus;
      probeResult.breakingReason = stepRecord.failureReason;
      console.log(`Breaking point at ${vus} VUs (${stepRecord.failureReason})`);
      break;
    }
  }

  const outFile = resultPath('load', 'capacity-probe.json');
  fs.writeFileSync(outFile, JSON.stringify(probeResult, null, 2));
  console.log(`\nCapacity probe complete. Max sustainable VUs: ${probeResult.maxSustainableVus}`);
  console.log(`Wrote ${outFile}`);

  return probeResult;
}

async function main() {
  const k6Check = spawnSync('k6', ['version'], { shell: true, stdio: 'pipe' });
  if (k6Check.status !== 0) {
    console.error('k6 not installed. Install: choco install k6');
    process.exit(1);
  }

  const healthy = await probeHealth();
  if (!healthy) {
    console.error(`Server not reachable at ${BASE_URL}. Start with NODE_ENV=benchmark npm start`);
    process.exit(1);
  }

  await runCapacityProbe();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  runCapacityProbe,
  DEFAULT_CAPACITY_STEPS,
  parseCapacitySteps,
};
