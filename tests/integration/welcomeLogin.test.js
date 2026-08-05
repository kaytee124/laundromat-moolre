const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles, createAgent, fetchCsrf } = require('../helpers/auth');
const { uniqueUsername, uniquePhone } = require('../helpers/fixtures');
const moolreService = require('../../services/moolreService');
const { WelcomeLoginToken } = require('../../models');
const { hashWelcomeToken } = require('../../services/welcomeLoginTokenService');
const { CUSTOMER_APP_URL } = require('../../utils/constants');
const { waitForSms } = require('../helpers/wait');

describe('Welcome magic-link login', () => {
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

  async function createStaffCustomer() {
    const username = uniqueUsername('welcomelogin');
    const phone = uniquePhone();
    const res = await request(app)
      .post('/api/customers/create/')
      .set(tokens.employee.headers)
      .send({
        username,
        first_name: 'Welcome',
        last_name: 'Login',
        phone_number: phone,
        whatsapp_number: uniquePhone(),
        address: 'Welcome Login Addr',
        preferred_contact_method: 'phone',
      });
    expect(res.status).toBe(201);

    await waitForSms(sendSmsSpy);

    expect(sendSmsSpy).toHaveBeenCalled();
    const message = sendSmsSpy.mock.calls[0][0].message;
    const match = message.match(/[?&]token=([^&\s]+)/);
    expect(match).toBeTruthy();
    const rawToken = decodeURIComponent(match[1]);
    expect(message).toContain(`${CUSTOMER_APP_URL}/welcome?token=`);
    return { username, rawToken, userId: res.body.user.id };
  }

  it('logs in with welcome token and allows reuse until expiry', async () => {
    const { rawToken, userId } = await createStaffCustomer();

    const stored = await WelcomeLoginToken.findOne({
      where: { token_hash: hashWelcomeToken(rawToken) },
    });
    expect(stored).toBeTruthy();
    expect(Number(stored.user_id)).toBe(Number(userId));
    expect(stored.used_at).toBeNull();

    const agent = createAgent();
    const csrf = await fetchCsrf(agent);
    const loginRes = await agent
      .post('/api/accounts/welcome-login/')
      .set('X-CSRF-Token', csrf)
      .send({ token: rawToken });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.access).toBeDefined();
    expect(loginRes.body.user.role).toBe('client');
    expect(loginRes.body.requires_password_change).toBe(false);

    await stored.reload();
    expect(stored.used_at).toBeNull();

    const csrf2 = await fetchCsrf(agent);
    const reuse = await agent
      .post('/api/accounts/welcome-login/')
      .set('X-CSRF-Token', csrf2)
      .send({ token: rawToken });

    expect(reuse.status).toBe(200);
    expect(reuse.body.access).toBeDefined();
  });

  it('rejects missing and invalid tokens', async () => {
    const agent = createAgent();
    const csrf = await fetchCsrf(agent);

    const missing = await agent
      .post('/api/accounts/welcome-login/')
      .set('X-CSRF-Token', csrf)
      .send({});
    expect(missing.status).toBe(400);

    const csrf2 = await fetchCsrf(agent);
    const invalid = await agent
      .post('/api/accounts/welcome-login/')
      .set('X-CSRF-Token', csrf2)
      .send({ token: 'not-a-real-token' });
    expect(invalid.status).toBe(401);
    expect(invalid.body.error_code).toBe('INVALID_TOKEN');
  });
});
