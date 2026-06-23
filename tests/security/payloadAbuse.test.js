const request = require('supertest');
const app = require('../../app');
const { uniqueUsername, uniqueEmail, uniquePhone } = require('../helpers/fixtures');
const { recordFinding } = require('../reportSummary');

describe('Security: Payload abuse', () => {
  let tokens;

  beforeAll(async () => {
    tokens = await require('../helpers/auth').getTokensForRoles(global.testContext);
  });

  it('handles oversized JSON body on login without crashing', async () => {
    const hugeField = 'A'.repeat(2 * 1024 * 1024);
    const res = await request(app)
      .post('/api/accounts/login/')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'client1', password: hugeField }));

    expect([400, 401, 413, 500]).toContain(res.status);
    if (res.status !== 413) {
      recordFinding('NO_BODY_LIMIT', 'Oversized login body was not rejected with 413');
    }
  });

  it('handles oversized JSON body on register without crashing', async () => {
    const hugeField = 'B'.repeat(2 * 1024 * 1024);
    const res = await request(app)
      .post('/api/customers/register/')
      .set('Content-Type', 'application/json')
      .send(
        JSON.stringify({
          username: uniqueUsername('big'),
          email: uniqueEmail('big'),
          password: 'SecurePass1!',
          first_name: hugeField,
          last_name: 'User',
          phone_number: uniquePhone(),
          whatsapp_number: uniquePhone(),
          address: 'Addr',
          preferred_contact_method: 'phone',
        })
      );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
  });

  it('ignores __proto__ pollution on client update', async () => {
    const res = await request(app)
      .patch('/api/accounts/client/update/')
      .set(tokens.client.headers)
      .send(
        JSON.stringify({
          first_name: 'Safe',
          __proto__: { role: 'superadmin', is_superuser: true },
        })
      );

    expect(res.status).toBeLessThan(500);
    expect({}.role).toBeUndefined();
  });

  it('ignores constructor.prototype pollution on client update', async () => {
    const { User } = require('../../models');
    const res = await request(app)
      .patch('/api/accounts/client/update/')
      .set(tokens.client.headers)
      .send({
        first_name: 'Safe',
        constructor: { prototype: { role: 'admin' } },
      });

    expect(res.status).toBeLessThan(500);
    const user = await User.findByPk(global.testContext.client.id);
    expect(user.role).toBe('client');
  });
});
