const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { uniqueUsername, uniquePhone } = require('../helpers/fixtures');
const moolreService = require('../../services/moolreService');
const { formatSmsRecipient } = require('../../utils/phone');
const { DEFAULT_CUSTOMER_PASSWORD, CUSTOMER_APP_URL } = require('../../utils/constants');

describe('Customers API', () => {
  let tokens;
  let ctx;
  let sendSmsSpy;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  beforeEach(() => {
    sendSmsSpy = jest.spyOn(moolreService, 'sendSms').mockResolvedValue({
      status: 1,
      message: 'ok',
    });
  });

  afterEach(() => {
    sendSmsSpy.mockRestore();
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
    it('staff creates customer with default password and sends welcome SMS', async () => {
      const username = uniqueUsername('staffcreate');
      const phone = uniquePhone();
      const res = await request(app)
        .post('/api/customers/create/')
        .set(tokens.employee.headers)
        .send({
          username,
          first_name: 'Staff',
          last_name: 'Created',
          phone_number: phone,
          whatsapp_number: uniquePhone(),
          address: 'Staff Created Addr',
          preferred_contact_method: 'whatsapp',
        });
      expect(res.status).toBe(201);
      expect(res.body.default_password).toBeDefined();

      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(sendSmsSpy).toHaveBeenCalled();
      const smsArg = sendSmsSpy.mock.calls[0][0];
      expect(smsArg.recipient).toBe(formatSmsRecipient(phone));
      expect(smsArg.message).toContain(CUSTOMER_APP_URL);
      expect(smsArg.message).toContain(username);
      expect(smsArg.message).toContain(DEFAULT_CUSTOMER_PASSWORD);
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
