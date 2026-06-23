import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { loginSessionStrict, authHeaders } from './k6-auth.js';

let manifest;
try {
  manifest = JSON.parse(open('../../results/seed/manifest.json'));
} catch {
  manifest = {
    credentials: {
      admin: { username: 'bench_admin', password: 'BenchPass123!' },
    },
  };
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const CAPACITY_VUS = parseInt(__ENV.CAPACITY_VUS || '100', 10);
const STEP_DURATION = __ENV.CAPACITY_STEP_DURATION || '45s';
const REQUEST_TIMEOUT = __ENV.CAPACITY_REQUEST_TIMEOUT || '30s';

const errorRate = new Rate('concurrency_errors');
const latency = new Trend('concurrency_latency');

// Health + services only — orders-list COUNT on 5M rows dominates and causes false capacity readings.
const READ_ENDPOINTS = [
  { name: 'health', method: 'GET', path: '/health', auth: null },
  { name: 'services-list', method: 'GET', path: '/api/services/list/', auth: null },
];

const httpParams = { timeout: REQUEST_TIMEOUT };

function pickEndpoint(iter) {
  return READ_ENDPOINTS[iter % READ_ENDPOINTS.length];
}

export function setup() {
  const creds = manifest.credentials;
  return {
    adminSession: loginSessionStrict(BASE_URL, creds.admin.username, creds.admin.password),
    vus: CAPACITY_VUS,
  };
}

export const options = {
  setupTimeout: '3m',
  scenarios: {
    capacity: {
      executor: 'constant-vus',
      vus: CAPACITY_VUS,
      duration: STEP_DURATION,
      gracefulStop: '10s',
    },
  },
  thresholds: {
    concurrency_errors: [{ threshold: 'rate<0.10', abortOnFail: true }],
  },
};

export default function (data) {
  const ep = pickEndpoint(__ITER);
  let headers = { 'Content-Type': 'application/json' };

  if (ep.auth === 'admin' && data.adminSession) {
    headers = authHeaders(data.adminSession);
  }

  let res;
  if (ep.method === 'GET') {
    res = http.get(`${BASE_URL}${ep.path}`, {
      headers,
      tags: { endpoint: ep.name, vus: String(CAPACITY_VUS) },
      ...httpParams,
    });
  } else {
    res = http.post(`${BASE_URL}${ep.path}`, '{}', {
      headers,
      tags: { endpoint: ep.name, vus: String(CAPACITY_VUS) },
      ...httpParams,
    });
  }

  const ok = check(res, {
    'request ok': (r) => r && r.status > 0 && r.status < 500,
  });
  errorRate.add(!ok);
  latency.add(res.timings.duration);
  sleep(0.05);
}

export function handleSummary(data) {
  const outPath = `benchmark/results/load/capacity-step-${CAPACITY_VUS}.json`;
  return {
    [outPath]: JSON.stringify(data, null, 2),
    stdout: [
      `Capacity step VUs=${CAPACITY_VUS}`,
      `Error rate: ${((data.metrics?.concurrency_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
      `Req/sec: ${data.metrics?.http_reqs?.values?.rate?.toFixed(2) || 'n/a'}`,
      `P95: ${data.metrics?.concurrency_latency?.values?.['p(95)']?.toFixed(2) || 'n/a'} ms`,
    ].join('\n'),
  };
}
