const request = require('supertest');
const app = require('../../app');
const { uniqueUsername, uniqueEmail, uniquePhone } = require('../helpers/fixtures');
const { createAgent, fetchCsrf } = require('../helpers/auth');
const { recordFinding } = require('../reportSummary');

describe('Security: Enumeration', () => {
  let ctx;

  beforeAll(() => {
    ctx = global.testContext;
  });

  it('login uses same error for unknown user and wrong password', async () => {
    const agent1 = createAgent();
    const csrf1 = await fetchCsrf(agent1);
    const unknownUser = await agent1
      .post('/api/accounts/login/')
      .set('X-CSRF-Token', csrf1)
      .send({ username: 'definitely_not_a_user_xyz', password: 'WrongPass123!' });

    const agent2 = createAgent();
    const csrf2 = await fetchCsrf(agent2);
    const wrongPassword = await agent2
      .post('/api/accounts/login/')
      .set('X-CSRF-Token', csrf2)
      .send({ username: ctx.client.username, password: 'WrongPass123!' });

    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.body.error_code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.error_code).toBe(unknownUser.body.error_code);
  });

  it('register reveals distinct codes for duplicate username vs email', async () => {
    const dupUsername = await request(app)
      .post('/api/customers/register/')
      .send({
        username: ctx.client.username,
        email: uniqueEmail('enum'),
        password: 'SecurePass1!',
        first_name: 'Enum',
        last_name: 'User',
        phone_number: uniquePhone(),
        whatsapp_number: uniquePhone(),
        address: 'Addr',
        preferred_contact_method: 'phone',
      });

    const dupEmail = await request(app)
      .post('/api/customers/register/')
      .send({
        username: uniqueUsername('enum'),
        email: ctx.client.email,
        password: 'SecurePass1!',
        first_name: 'Enum',
        last_name: 'User',
        phone_number: uniquePhone(),
        whatsapp_number: uniquePhone(),
        address: 'Addr',
        preferred_contact_method: 'phone',
      });

    expect(dupUsername.body.error_code).toBe('USERNAME_EXISTS');
    expect(dupEmail.body.error_code).toBe('EMAIL_EXISTS');
    expect(dupUsername.body.error_code).not.toBe(dupEmail.body.error_code);
    recordFinding('REGISTER_ENUMERATION', 'Register returns distinct USERNAME_EXISTS vs EMAIL_EXISTS');
  });
});
