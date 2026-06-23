const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { uniqueUsername, uniqueEmail, uniquePhone } = require('../helpers/fixtures');

describe('Security: Input validation', () => {
  let tokens;

  beforeAll(async () => {
    tokens = await getTokensForRoles(global.testContext);
  });

  it('handles SQL injection in clients search without server error', async () => {
    const payload = "'; DROP TABLE users;--";
    const res = await request(app)
      .get(`/api/accounts/clients/?search=${encodeURIComponent(payload)}`)
      .set(tokens.admin.headers);
    expect(res.status).toBe(200);
    expect(res.body.results).toBeDefined();
  });

  it('handles SQL injection in services search', async () => {
    const res = await request(app).get("/api/services/list/?search=' OR 1=1--");
    expect(res.status).toBe(200);
  });

  it('rejects registration with missing required fields', async () => {
    const res = await request(app).post('/api/customers/register/').send({ username: 'onlyuser' });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('MISSING_FIELDS');
  });

  it('blocks default password on change-password', async () => {
    const res = await request(app)
      .post('/api/accounts/change-password/')
      .set(tokens.client.headers)
      .send({
        old_password: global.testContext.passwords.client,
        new_password: 'ChangeMe123!',
        confirm_password: 'ChangeMe123!',
      });
    expect(res.status).toBe(422);
  });

  it('rejects duplicate phone on register', async () => {
    const ctx = global.testContext;
    const res = await request(app)
      .post('/api/customers/register/')
      .send({
        username: uniqueUsername('phone'),
        email: uniqueEmail('phone'),
        password: 'SecurePass1!',
        first_name: 'Phone',
        last_name: 'Dup',
        phone_number: ctx.customer.phone_number,
        whatsapp_number: uniquePhone(),
        address: 'Addr',
        preferred_contact_method: 'phone',
      });
    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('PHONE_EXISTS');
  });
});
