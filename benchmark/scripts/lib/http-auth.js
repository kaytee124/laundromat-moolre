'use strict';

const http = require('http');
const cookieConfig = require('../../../config/cookies');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = parseInt(process.env.BENCHMARK_REQUEST_TIMEOUT_MS || '60000', 10);

function parseUrl(path) {
  const u = new URL(path, BASE_URL);
  return {
    hostname: u.hostname,
    port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
  };
}

function parseSetCookie(headers) {
  const cookies = {};
  const raw = headers['set-cookie'];
  if (!raw) return cookies;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const c of list) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }
  return cookies;
}

function cookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

class HttpClient {
  constructor() {
    this.cookies = {};
  }

  storeCookies(headers) {
    Object.assign(this.cookies, parseSetCookie(headers));
  }

  request(method, path, { body, headers = {}, token } = {}) {
    return new Promise((resolve, reject) => {
      const { hostname, port, path: reqPath } = parseUrl(path);
      const h = { ...headers };
      const cookies = cookieHeader(this.cookies);
      if (cookies) h.Cookie = cookies;
      if (token) h.Authorization = `Bearer ${token}`;
      if (body && !h['Content-Type']) h['Content-Type'] = 'application/json';

      const req = http.request({ hostname, port, path: reqPath, method, headers: h }, (res) => {
        this.storeCookies(res.headers);
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, body: data, json, headers: res.headers });
        });
      });
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        reject(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms: ${method} ${path}`));
      });
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  get(path, opts) {
    return this.request('GET', path, opts);
  }

  post(path, body, opts = {}) {
    return this.request('POST', path, { ...opts, body });
  }

  put(path, body, opts = {}) {
    return this.request('PUT', path, { ...opts, body });
  }

  patch(path, body, opts = {}) {
    return this.request('PATCH', path, { ...opts, body });
  }
}

async function fetchCsrf(client) {
  const res = await client.get('/api/accounts/csrf/');
  const csrf =
    res.json?.csrf_token || client.cookies[cookieConfig.csrfCookieName];
  if (!csrf) {
    throw new Error(
      `CSRF fetch failed (status ${res.status}): ${(res.body || '').slice(0, 200)}`
    );
  }
  return csrf;
}

async function loginWithSession(username, password) {
  const client = new HttpClient();
  const csrf = await fetchCsrf(client);
  const res = await client.post(
    '/api/accounts/login/',
    { username, password },
    { headers: { 'X-CSRF-Token': csrf } }
  );
  if (res.status !== 200) {
    throw new Error(
      `Login failed for ${username} (status ${res.status}): ${(res.body || '').slice(0, 200)}`
    );
  }
  const access = res.json?.access;
  if (!access) {
    throw new Error(`Login response missing access token for ${username}`);
  }
  return {
    client,
    access,
    csrf: client.cookies[cookieConfig.csrfCookieName] || csrf,
    status: res.status,
    refreshCookie: client.cookies[cookieConfig.refreshCookieName],
  };
}

module.exports = {
  BASE_URL,
  HttpClient,
  parseSetCookie,
  cookieHeader,
  fetchCsrf,
  loginWithSession,
};
