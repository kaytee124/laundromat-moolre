'use strict';

const http = require('http');
const { spawn } = require('child_process');
const { ensureResultsDirs, writeText, readManifest } = require('../lib/paths');
const { loginWithSession } = require('../lib/http-auth');

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function checkHealth(port) {
  try {
    const res = await httpRequest({ hostname: 'localhost', port, path: '/health', method: 'GET' });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function scenarioDbUnavailable() {
  const wrongPort = 3307;
  const env = {
    ...process.env,
    NODE_ENV: 'benchmark',
    DB_PORT: String(wrongPort),
    PORT: '3001',
  };

  return new Promise((resolve) => {
    const child = spawn('node', ['server.js'], {
      env,
      cwd: require('../lib/paths').ROOT,
      stdio: 'pipe',
    });

    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));

    setTimeout(async () => {
      const healthy = await checkHealth(3001);
      child.kill();
      resolve({
        name: 'Database unavailable (wrong port)',
        passed: !healthy || output.includes('error') || output.includes('ECONNREFUSED'),
        details: 'Server should fail to connect or return errors when DB is unreachable.',
        output: output.slice(0, 500),
      });
    }, 5000);
  });
}

async function scenarioSlowResponse() {
  const manifest = readManifest();
  if (!manifest) {
    return { name: 'Slow response tolerance', passed: false, details: 'No manifest - run seed first' };
  }

  const start = Date.now();
  try {
    const res = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/services/list/',
      method: 'GET',
      timeout: 120000,
    });
    const elapsed = Date.now() - start;
    return {
      name: 'Baseline latency under load',
      passed: res.status === 200,
      details: `GET /api/services/list/ returned ${res.status} in ${elapsed}ms`,
    };
  } catch (err) {
    return {
      name: 'Baseline latency under load',
      passed: false,
      details: err.message,
    };
  }
}

async function scenarioConnectionPool() {
  const manifest = readManifest();
  if (!manifest) {
    return { name: 'Connection pool stress', passed: false, details: 'No manifest' };
  }

  const creds = manifest.credentials.admin;
  const concurrency = 50;
  const requests = [];

  for (let i = 0; i < concurrency; i++) {
    requests.push(
      (async () => {
        const session = await loginWithSession(creds.username, creds.password);
        return session.client.get('/api/accounts/user/profile/', { token: session.access });
      })()
    );
  }

  const results = await Promise.allSettled(requests);
  const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 200).length;
  const errors = concurrency - ok;

  return {
    name: 'Connection pool stress (50 concurrent logins)',
    passed: ok >= concurrency * 0.8,
    details: `${ok}/${concurrency} succeeded, ${errors} failed. Default Sequelize pool max is 5.`,
  };
}

async function scenarioRecovery() {
  const healthy = await checkHealth(3000);
  return {
    name: 'Server recovery check',
    passed: healthy,
    details: healthy ? 'Server responding on /health' : 'Server not running on port 3000',
  };
}

async function main() {
  ensureResultsDirs();
  console.log('Running failure injection scenarios...');

  const scenarios = [];
  scenarios.push(await scenarioRecovery());
  scenarios.push(await scenarioSlowResponse());
  scenarios.push(await scenarioConnectionPool());
  scenarios.push(await scenarioDbUnavailable());

  const lines = [
    '# Failure Injection Scenarios',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Scenario | Pass | Details |',
    '|----------|------|---------|',
  ];

  for (const s of scenarios) {
    lines.push(`| ${s.name} | ${s.passed ? 'PASS' : 'FAIL'} | ${s.details} |`);
    lines.push('');
    if (s.output) lines.push(`\`\`\`\n${s.output}\n\`\`\`\n`);
  }

  lines.push('## Recovery Questions');
  lines.push('');
  lines.push('- **DB unavailable:** App should not crash silently; connection errors expected at startup.');
  lines.push('- **Pool exhaustion:** Under high concurrency, expect 500/timeout until load stops.');
  lines.push('- **Retries:** Login and read endpoints should be safe to retry (idempotent GETs).');

  writeText('failure/scenarios.md', lines.join('\n'));
  console.log('Wrote benchmark/results/failure/scenarios.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
