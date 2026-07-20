const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { uniqueUsername, uniquePhone } = require('../helpers/fixtures');

describe('Customers API', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  describe('POST /api/customers/register/', () => {
    it('registers a new customer without email or last_name', async () => {
      const res = await request(app)
        .post('/api/customers/register/')
        .send({
          username: uniqueUsername('reg'),
          password: 'SecurePass1!',
          first_name: 'Reg',
          phone_number: uniquePhone(),
          whatsapp_number: uniquePhone(),
          address: '99 Register Lane',
          preferred_contact_method: 'phone',
        });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('client');
      expect(res.body.user.email).toBeUndefined();
      expect(res.body.user.last_name).toBe('');
    });

    it('rejects duplicate username', async () => {
      const res = await request(app)
        .post('/api/customers/register/')
        .send({
          username: ctx.client.username,
          password: 'SecurePass1!',
          first_name: 'Dup',
          phone_number: uniquePhone(),
          whatsapp_number: uniquePhone(),
          address: 'Addr',
          preferred_contact_method: 'phone',
        });
      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('USERNAME_EXISTS');
    });

    it('rejects weak password', async () => {
      const res = await request(app)
        .post('/api/customers/register/')
        .send({
          username: uniqueUsername('weak'),
          password: 'short',
          first_name: 'Weak',
          phone_number: uniquePhone(),
          whatsapp_number: uniquePhone(),
          address: 'Addr',
          preferred_contact_method: 'phone',
        });
      expect(res.status).toBe(422);
      expect(res.body.error_code).toBe('INVALID_PASSWORD');
    });
  });

  describe('POST /api/customers/create/', () => {
    it('staff creates customer with default password', async () => {
      const res = await request(app)
        .post('/api/customers/create/')
        .set(tokens.employee.headers)
        .send({
          username: uniqueUsername('staffcreate'),
          first_name: 'Staff',
          last_name: 'Created',
          phone_number: uniquePhone(),
          whatsapp_number: uniquePhone(),
          address: 'Staff Created Addr',
          preferred_contact_method: 'whatsapp',
        });
      expect(res.status).toBe(201);
      expect(res.body.default_password).toBeDefined();
    });

    it('denies client', async () => {
      const res = await request(app)
        .post('/api/customers/create/')
        .set(tokens.client.headers)
        .send({
          username: uniqueUsername('failcreate'),
          first_name: 'Fail',
          phone_number: uniquePhone(),
          whatsapp_number: uniquePhone(),
          address: 'Addr',
          preferred_contact_method: 'phone',
        });
      expect(res.status).toBe(403);
    });
  });
});
