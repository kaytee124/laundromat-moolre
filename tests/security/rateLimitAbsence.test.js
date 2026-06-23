const request = require('supertest');
const app = require('../../app');
const { uniqueUsername, uniqueEmail, uniquePhone } = require('../helpers/fixtures');
const { createAgent, fetchCsrf } = require('../helpers/auth');
const { recordFinding } = require('../reportSummary');

describe('Security: Rate limit absence', () => {
  it('does not throttle repeated failed login attempts', async () => {
    const statuses = [];
    for (let i = 0; i < 15; i += 1) {
      const agent = createAgent();
      const csrf = await fetchCsrf(agent);
      const res = await agent
        .post('/api/accounts/login/')
        .set('X-CSRF-Token', csrf)
        .send({ username: 'nonexistent_user', password: 'wrongpassword' });
      statuses.push(res.status);
    }

    expect(statuses.every((s) => s === 401 || s === 400)).toBe(true);
    expect(statuses.some((s) => s === 429)).toBe(false);
    recordFinding('NO_RATE_LIMIT_LOGIN', '15 rapid failed logins returned no 429');
  });

  it('does not throttle rapid register attempts', async () => {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post('/api/customers/register/')
        .send({
          username: uniqueUsername('spam'),
          email: uniqueEmail('spam'),
          password: 'short',
          first_name: 'Spam',
          last_name: 'User',
          phone_number: uniquePhone(),
          whatsapp_number: uniquePhone(),
          address: 'Addr',
          preferred_contact_method: 'phone',
        });
      statuses.push(res.status);
    }

    expect(statuses.some((s) => s === 429)).toBe(false);
    recordFinding('NO_RATE_LIMIT_REGISTER', 'Rapid register attempts returned no 429');
  });
});
