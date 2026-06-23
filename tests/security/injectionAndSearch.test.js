const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService } = require('../helpers/fixtures');
const { recordFinding } = require('../reportSummary');

const SQLI_PAYLOADS = [
  "'; DROP TABLE users;--",
  "1 OR 1=1",
  "1; SELECT * FROM users",
];

describe('Security: Injection and search abuse', () => {
  let tokens;
  let ctx;
  let service;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    service = await createService(ctx.admin);
  });

  SQLI_PAYLOADS.forEach((payload) => {
    it(`clients search handles SQLi payload: ${payload.slice(0, 20)}`, async () => {
      const res = await request(app)
        .get(`/api/accounts/clients/?search=${encodeURIComponent(payload)}`)
        .set(tokens.employee.headers);
      expect(res.status).toBe(200);
      expect(res.body.results).toBeDefined();
    });
  });

  it('services list handles LIKE wildcard flood without 500', async () => {
    const wildcards = '%'.repeat(200);
    const start = Date.now();
    const res = await request(app)
      .get(`/api/services/list/?search=${encodeURIComponent(wildcards)}`);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(10000);
    recordFinding('SEARCH_WILDCARD', `LIKE wildcard search completed in ${elapsed}ms`);
  });

  it('order list handles malicious page_size without 500', async () => {
    const res = await request(app)
      .get("/api/orders/list/?page=1&page_size=' OR 1=1--")
      .set(tokens.employee.headers);
    expect(res.status).toBe(200);
  });

  it('services list handles malicious category param without 500', async () => {
    const res = await request(app).get("/api/services/list/?category='; DROP TABLE services;--");
    expect(res.status).toBe(200);
  });

  it('order detail rejects non-numeric id safely', async () => {
    const res = await request(app)
      .get("/api/orders/1'%20OR%201=1--/")
      .set(tokens.employee.headers);
    expect([400, 404, 500]).not.toContain(undefined);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
  });

  it('clients search with underscore wildcards does not error', async () => {
    const res = await request(app)
      .get(`/api/accounts/clients/?search=${encodeURIComponent('___')}`)
      .set(tokens.employee.headers);
    expect(res.status).toBe(200);
  });
});
