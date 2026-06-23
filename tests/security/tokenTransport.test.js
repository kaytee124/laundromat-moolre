const jwt = require('jsonwebtoken');
const app = require('../../app');
const jwtConfig = require('../../config/jwt');
const { getTokensForRoles, fetchCsrf } = require('../helpers/auth');

describe('Security: Token transport', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  it('auto-refreshes expired access token via refresh cookie and CSRF', async () => {
    const expiredAccess = jwt.sign(
      {
        userId: ctx.client.id,
        username: ctx.client.username,
        role: 'client',
        type: 'access',
      },
      jwtConfig.secret,
      { expiresIn: '-1s', algorithm: jwtConfig.algorithm }
    );

    const csrf = await fetchCsrf(tokens.client.agent);
    const res = await tokens.client.agent
      .get('/api/accounts/user/profile/')
      .set('Authorization', `Bearer ${expiredAccess}`)
      .set('X-CSRF-Token', csrf);

    expect(res.status).toBe(200);
    expect(res.body.token_refreshed).toBe(true);
    expect(res.body.new_access_token).toBeDefined();
  });

  it('rejects refresh token in query string on protected route', async () => {
    const expiredAccess = jwt.sign(
      {
        userId: ctx.client.id,
        username: ctx.client.username,
        role: 'client',
        type: 'access',
      },
      jwtConfig.secret,
      { expiresIn: '-1s', algorithm: jwtConfig.algorithm }
    );

    const { createAgent, fetchCsrf } = require('../helpers/auth');
    const agent = createAgent();
    const csrf = await fetchCsrf(agent);
    const res = await agent
      .get('/api/accounts/user/profile/?refresh_token=invalid')
      .set('Authorization', `Bearer ${expiredAccess}`)
      .set('X-CSRF-Token', csrf);

    expect(res.status).toBe(401);
  });

  it('rejects X-Refresh-Token header without cookie', async () => {
    const expiredAccess = jwt.sign(
      {
        userId: ctx.client.id,
        username: ctx.client.username,
        role: 'client',
        type: 'access',
      },
      jwtConfig.secret,
      { expiresIn: '-1s', algorithm: jwtConfig.algorithm }
    );

    const request = require('supertest');
    const res = await request(app)
      .get('/api/accounts/user/profile/')
      .set('Authorization', `Bearer ${expiredAccess}`)
      .set('X-Refresh-Token', 'fake-refresh-token');

    expect(res.status).toBe(401);
  });
});
