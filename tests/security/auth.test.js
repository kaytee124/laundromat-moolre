const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const jwtConfig = require('../../config/jwt');
const {
  getTokensForRoles,
  login,
  logoutWithAgent,
  fetchCsrf,
  createAgent,
} = require('../helpers/auth');

describe('Security: Authentication', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  it('rejects protected route without token', async () => {
    const res = await request(app).get('/api/accounts/user/profile/');
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe('NO_TOKEN');
  });

  it('rejects tampered JWT signature', async () => {
    const parts = tokens.client.access.split('.');
    const tampered = `${parts[0]}.${parts[1]}.invalidsignature`;
    const res = await request(app)
      .get('/api/accounts/user/profile/')
      .set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it('rejects refresh token used as access token', async () => {
    const refreshAsAccess = jwt.sign(
      { userId: ctx.client.id, jti: 'test-jti', type: 'refresh' },
      jwtConfig.secret,
      { expiresIn: '1h', algorithm: jwtConfig.algorithm }
    );
    const res = await request(app)
      .get('/api/accounts/user/profile/')
      .set('Authorization', `Bearer ${refreshAsAccess}`);
    expect(res.status).toBe(401);
  });

  it('rejects expired access token without refresh cookie', async () => {
    const expired = jwt.sign(
      { userId: ctx.client.id, username: ctx.client.username, role: 'client', type: 'access' },
      jwtConfig.secret,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/api/accounts/user/profile/')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('blacklists refresh token after logout', async () => {
    const loginRes = await login(ctx.client.username, ctx.passwords.client);
    const setCookie = loginRes.headers['set-cookie'] || [];
    const refreshHeader = setCookie.find((c) => c.startsWith('refresh_token='));
    const refreshValue = refreshHeader.split(';')[0].split('=').slice(1).join('=');

    await logoutWithAgent(loginRes.agent, loginRes.body.access, loginRes.csrf);

    const agent = createAgent();
    const csrf = await fetchCsrf(agent);
    const res = await agent
      .post('/api/accounts/token/refresh/')
      .set('X-CSRF-Token', csrf)
      .set('Cookie', [`refresh_token=${refreshValue}`, `csrf_token=${csrf}`].join('; '));
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe('INVALID_TOKEN');
  });

  it('rejects token with wrong type claim', async () => {
    const badType = jwt.sign(
      { userId: ctx.client.id, type: 'refresh' },
      jwtConfig.secret,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .get('/api/accounts/user/profile/')
      .set('Authorization', `Bearer ${badType}`);
    expect(res.status).toBe(401);
  });
});
