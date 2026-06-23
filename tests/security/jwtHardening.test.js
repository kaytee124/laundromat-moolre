const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const jwtConfig = require('../../config/jwt');
const { getTokensForRoles, createAgent, fetchCsrf } = require('../helpers/auth');
const { recordFinding } = require('../reportSummary');

function buildAlgNoneToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
}

describe('Security: JWT hardening', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  it('rejects alg:none forged access token', async () => {
    const forged = buildAlgNoneToken({
      userId: ctx.superadmin.id,
      username: ctx.superadmin.username,
      role: 'superadmin',
      type: 'access',
    });

    const res = await request(app)
      .get('/api/accounts/admins/')
      .set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
    recordFinding('JWT_ALG_NONE', 'alg:none token rejected');
  });

  it('uses database role not elevated JWT claim', async () => {
    const elevated = jwt.sign(
      {
        userId: ctx.client.id,
        username: ctx.client.username,
        role: 'superadmin',
        type: 'access',
      },
      jwtConfig.secret,
      { expiresIn: '1h', algorithm: jwtConfig.algorithm }
    );

    const res = await request(app)
      .get('/api/accounts/admins/')
      .set('Authorization', `Bearer ${elevated}`);

    expect(res.status).toBe(403);
  });

  it('rejects refresh token as Bearer on protected route', async () => {
    const refreshAsAccess = jwt.sign(
      { userId: ctx.client.id, jti: 'test-jti-2', type: 'refresh' },
      jwtConfig.secret,
      { expiresIn: '1h', algorithm: jwtConfig.algorithm }
    );
    const res = await request(app)
      .get('/api/accounts/user/profile/')
      .set('Authorization', `Bearer ${refreshAsAccess}`);

    expect(res.status).toBe(401);
  });

  it('rejects expired refresh token on token refresh endpoint', async () => {
    const agent = createAgent();
    const csrf = await fetchCsrf(agent);
    const expiredRefresh = jwt.sign(
      { userId: ctx.client.id, jti: 'expired-jti-test', type: 'refresh' },
      jwtConfig.secret,
      { expiresIn: '-1s', algorithm: jwtConfig.algorithm }
    );

    const res = await agent
      .post('/api/accounts/token/refresh/')
      .set('X-CSRF-Token', csrf)
      .set('Cookie', [`refresh_token=${expiredRefresh}`, `csrf_token=${csrf}`].join('; '));

    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe('INVALID_TOKEN');
  });

  it('rejects access token signed with wrong secret', async () => {
    const wrongSecret = jwt.sign(
      {
        userId: ctx.client.id,
        username: ctx.client.username,
        role: 'client',
        type: 'access',
      },
      'wrong-secret-key',
      { expiresIn: '1h', algorithm: jwtConfig.algorithm }
    );

    const res = await request(app)
      .get('/api/accounts/user/profile/')
      .set('Authorization', `Bearer ${wrongSecret}`);

    expect(res.status).toBe(401);
  });
});
