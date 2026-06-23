const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { recordFinding } = require('../reportSummary');

function collectSensitiveKeys(obj, found = []) {
  if (!obj || typeof obj !== 'object') return found;
  for (const key of Object.keys(obj)) {
    if (['password_hash', 'password'].includes(key)) found.push(key);
    if (typeof obj[key] === 'object') collectSensitiveKeys(obj[key], found);
  }
  return found;
}

describe('Security: Data exposure', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  it('profile response does not include password_hash', async () => {
    const res = await request(app)
      .get('/api/accounts/user/profile/')
      .set(tokens.client.headers);
    expect(res.status).toBe(200);
    expect(collectSensitiveKeys(res.body)).toHaveLength(0);
  });

  it('clients list does not include password_hash', async () => {
    const res = await request(app)
      .get('/api/accounts/clients/')
      .set(tokens.employee.headers);
    expect(res.status).toBe(200);
    res.body.results.forEach((user) => {
      expect(collectSensitiveKeys(user)).toHaveLength(0);
    });
  });

  it('superadmin user detail does not include password_hash', async () => {
    const res = await request(app)
      .get(`/api/accounts/superadmin/user/${ctx.client.id}/`)
      .set(tokens.superadmin.headers);
    expect(res.status).toBe(200);
    expect(collectSensitiveKeys(res.body)).toHaveLength(0);
  });

  it('staff-create customer response exposes default_password', async () => {
    const res = await request(app)
      .post('/api/customers/create/')
      .set(tokens.employee.headers)
      .send({
        username: `staffcreate_${Date.now()}`,
        email: `staffcreate_${Date.now()}@test.com`,
        first_name: 'Staff',
        last_name: 'Created',
        phone_number: `02${String(Date.now()).slice(-8)}`,
        whatsapp_number: `02${String(Date.now() + 1).slice(-8)}`,
        address: 'Addr',
        preferred_contact_method: 'phone',
      });

    expect(res.status).toBe(201);
    expect(res.body.default_password).toBeDefined();
    recordFinding('DEFAULT_PASSWORD_EXPOSED', 'Staff-create returns default_password in response');
  });

  it('500 responses do not leak stack traces', async () => {
    const res = await request(app)
      .get('/api/orders/not-a-number/')
      .set(tokens.employee.headers);

    if (res.status === 500) {
      expect(res.body.stack).toBeUndefined();
      expect(res.body.error_code).toBe('SERVER_ERROR');
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });
});
