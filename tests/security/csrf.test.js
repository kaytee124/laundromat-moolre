const request = require('supertest');
const app = require('../../app');
const { login, createAgent, fetchCsrf, refreshWithAgent } = require('../helpers/auth');
const { recordFinding } = require('../reportSummary');

describe('Security: CSRF', () => {
  let ctx;

  beforeAll(() => {
    ctx = global.testContext;
  });

  it('issues csrf token from public endpoint', async () => {
    const res = await request(app).get('/api/accounts/csrf/');
    expect(res.status).toBe(200);
    expect(res.body.csrf_token).toBeDefined();
  });

  it('rejects login without X-CSRF-Token', async () => {
    const agent = createAgent();
    await fetchCsrf(agent);
    const res = await agent
      .post('/api/accounts/login/')
      .send({ username: ctx.client.username, password: ctx.passwords.client });
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('CSRF_VALIDATION_FAILED');
    recordFinding('CSRF_LOGIN', 'Login without CSRF header rejected');
  });

  it('rejects login with mismatched CSRF token', async () => {
    const agent = createAgent();
    await fetchCsrf(agent);
    const res = await agent
      .post('/api/accounts/login/')
      .set('X-CSRF-Token', 'wrong-csrf-token')
      .send({ username: ctx.client.username, password: ctx.passwords.client });
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('CSRF_VALIDATION_FAILED');
  });

  it('login response does not include refresh token in JSON', async () => {
    const res = await login(ctx.client.username, ctx.passwords.client);
    expect(res.status).toBe(200);
    expect(res.body.access).toBeDefined();
    expect(res.body.refresh).toBeUndefined();
  });

  it('rejects refresh without CSRF token', async () => {
    const loginRes = await login(ctx.client.username, ctx.passwords.client);
    const res = await loginRes.agent.post('/api/accounts/token/refresh/');
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('CSRF_VALIDATION_FAILED');
  });

  it('rejects refresh without refresh cookie', async () => {
    const agent = createAgent();
    const csrf = await fetchCsrf(agent);
    const res = await agent
      .post('/api/accounts/token/refresh/')
      .set('X-CSRF-Token', csrf);
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe('MISSING_TOKEN');
  });

  it('refreshes access token with cookie and CSRF', async () => {
    const loginRes = await login(ctx.client.username, ctx.passwords.client);
    const res = await refreshWithAgent(loginRes.agent, loginRes.csrf);
    expect(res.status).toBe(200);
    expect(res.body.access).toBeDefined();
    expect(res.body.refresh).toBeUndefined();
  });
});
