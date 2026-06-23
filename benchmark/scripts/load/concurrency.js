import http from 'k6/http';

import { check, sleep } from 'k6';

import { Trend, Rate } from 'k6/metrics';

import { loginSessionStrict, loginOnce, authHeaders } from './k6-auth.js';



let manifest;

try {

  manifest = JSON.parse(open('../../results/seed/manifest.json'));

} catch {

  manifest = {

    credentials: {

      superadmin: { username: 'bench_superadmin', password: 'BenchPass123!' },

      admin: { username: 'bench_admin', password: 'BenchPass123!' },

      employee: { username: 'bench_employee', password: 'BenchPass123!' },

      client: { username: 'bench_client', password: 'BenchClient123!' },

    },

  };

}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const LOAD_QUICK = __ENV.BENCHMARK_LOAD_QUICK === '1';



const errorRate = new Rate('concurrency_errors');

const latency = new Trend('concurrency_latency');



// Weighted mix (~10% login, no dashboard-metrics — too many sequential COUNTs on 5M rows).

const READ_ENDPOINTS = [

  { name: 'health', method: 'GET', path: '/health', auth: null },

  { name: 'services-list', method: 'GET', path: '/api/services/list/', auth: null },

  {

    name: 'orders-list',

    method: 'GET',

    path: '/api/orders/list/?page=1&page_size=5',

    auth: 'admin',

  },

];



const FULL_STAGES = [

  { duration: '30s', target: 10 },

  { duration: '30s', target: 100 },

  { duration: '1m', target: 1000 },

  { duration: '1m', target: 5000 },

  { duration: '1m', target: 10000 },

  { duration: '30s', target: 0 },

];



const QUICK_STAGES = [

  { duration: '20s', target: 10 },

  { duration: '20s', target: 50 },

  { duration: '30s', target: 100 },

  { duration: '30s', target: 200 },

  { duration: '20s', target: 0 },

];



function pickAction(iter) {

  const bucket = iter % 10;

  if (bucket === 0) return { type: 'login' };

  return { type: 'read', ep: READ_ENDPOINTS[(bucket - 1) % READ_ENDPOINTS.length] };

}



export function setup() {

  const creds = manifest.credentials;

  return {

    adminSession: loginSessionStrict(BASE_URL, creds.admin.username, creds.admin.password),

    creds,

    loadQuick: LOAD_QUICK,

  };

}



export const options = {

  setupTimeout: '3m',

  scenarios: {

    ramp: {

      executor: 'ramping-vus',

      startVUs: 0,

      stages: LOAD_QUICK ? QUICK_STAGES : FULL_STAGES,

      gracefulRampDown: '30s',

    },

  },

  thresholds: {

    concurrency_errors: [LOAD_QUICK ? 'rate<0.5' : 'rate<0.5'],

  },

};



export default function (data) {

  const action = pickAction(__ITER);



  if (action.type === 'login') {

    const result = loginOnce(BASE_URL, data.creds.admin.username, data.creds.admin.password);

    const ok = check(result.res, { 'login ok': (r) => r.status === 200 });

    errorRate.add(!ok);

    latency.add(result.res.timings.duration);

    sleep(0.05);

    return;

  }



  const ep = action.ep;

  let headers = { 'Content-Type': 'application/json' };

  if (ep.auth === 'admin' && data.adminSession) {

    headers = authHeaders(data.adminSession);

  }



  let res;

  if (ep.method === 'GET') {

    res = http.get(`${BASE_URL}${ep.path}`, { headers, tags: { endpoint: ep.name } });

  } else {

    res = http.post(`${BASE_URL}${ep.path}`, '{}', { headers, tags: { endpoint: ep.name } });

  }



  const ok = check(res, { 'not 5xx': (r) => r.status < 500 });

  errorRate.add(!ok);

  latency.add(res.timings.duration);

  sleep(0.05);

}



export function handleSummary(data) {

  const m = data.metrics || {};

  const stageLabel = LOAD_QUICK

    ? '10 → 50 → 100 → 200 VUs (quick)'

    : '10 → 100 → 1,000 → 5,000 → 10,000 VUs';

  const lines = [

    '# Concurrency Test Report',

    '',

    `Stages: ${stageLabel}`,

    'Traffic mix: ~10% login, ~30% health/services/orders-list each (no dashboard-metrics under load)',

    '',

    '| Metric | Value |',

    '|--------|-------|',

  ];

  if (m.concurrency_latency) {

    lines.push(`| Avg latency | ${m.concurrency_latency.values.avg?.toFixed(2)} ms |`);

    lines.push(`| P95 latency | ${m.concurrency_latency.values['p(95)']?.toFixed(2)} ms |`);

    lines.push(`| P99 latency | ${m.concurrency_latency.values['p(99)']?.toFixed(2)} ms |`);

  }

  if (m.concurrency_errors) {

    lines.push(`| Error rate | ${(m.concurrency_errors.values.rate * 100).toFixed(2)}% |`);

  }

  if (m.http_reqs) {

    lines.push(`| Total requests | ${m.http_reqs.values.count} |`);

    lines.push(`| Req/sec | ${m.http_reqs.values.rate?.toFixed(2)} |`);

  }



  return {

    'benchmark/results/load/concurrency-report.md': lines.join('\n'),

    'benchmark/results/load/concurrency-summary.json': JSON.stringify(data, null, 2),

    stdout: lines.join('\n'),

  };

}


