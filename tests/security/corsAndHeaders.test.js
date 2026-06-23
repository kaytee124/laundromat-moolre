const request = require('supertest');
const app = require('../../app');
const { recordFinding } = require('../reportSummary');

describe('Security: CORS and headers', () => {
  it('allows preflight from foreign origin (open CORS)', async () => {
    const res = await request(app)
      .options('/api/accounts/login/')
      .set('Origin', 'https://evil-attacker.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBeLessThan(500);
    const allowOrigin = res.headers['access-control-allow-origin'];
    expect(allowOrigin === '*' || allowOrigin === 'https://evil-attacker.example').toBe(true);
    recordFinding('CORS_OPEN', `Preflight allows foreign origin: ${allowOrigin}`);
  });

  it('protected route still requires auth regardless of CORS', async () => {
    const res = await request(app)
      .get('/api/accounts/user/profile/')
      .set('Origin', 'https://evil-attacker.example');
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe('NO_TOKEN');
  });
});
