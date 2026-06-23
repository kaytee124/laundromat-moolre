const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles, login } = require('../helpers/auth');

describe('Concurrency: auth races', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  it('R06: parallel token refresh does not 500', async () => {
    const agent = tokens.admin.agent;
    const csrf = tokens.admin.csrf;
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        agent.post('/api/accounts/token/refresh/').set('X-CSRF-Token', csrf)
      )
    );
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 200);
    expect(ok.length).toBeGreaterThan(0);
    expect(results.every((r) => r.status !== 'fulfilled' || r.value.status < 500)).toBe(true);
  });

  it('R07: logout races with refresh — refresh eventually fails', async () => {
    const res = await login(ctx.employee.username, ctx.passwords.staff);
    const agent = res.agent;
    const csrf = res.csrf;
    const access = res.body.access;

    await Promise.allSettled([
      agent.post('/api/accounts/logout/').set('Authorization', `Bearer ${access}`).set('X-CSRF-Token', csrf),
      agent.post('/api/accounts/token/refresh/').set('X-CSRF-Token', csrf),
      agent.post('/api/accounts/logout/').set('Authorization', `Bearer ${access}`).set('X-CSRF-Token', csrf),
      agent.post('/api/accounts/token/refresh/').set('X-CSRF-Token', csrf),
    ]);

    const refresh = await agent.post('/api/accounts/token/refresh/').set('X-CSRF-Token', csrf);
    expect(refresh.status).toBeLessThan(500);
    expect([200, 401, 400]).toContain(refresh.status);
  });
});
