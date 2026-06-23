const request = require('supertest');
const app = require('../../app');
const { uniqueUsername, uniqueEmail, uniquePhone } = require('../helpers/fixtures');

describe('Concurrency: registration race', () => {
  it('R05: only one parallel registration succeeds for same phone', async () => {
    const username = uniqueUsername('race');
    const email = uniqueEmail('race');
    const phone = uniquePhone();
    const payload = {
      username,
      email,
      password: 'RacePass123!',
      first_name: 'Race',
      last_name: 'User',
      phone_number: phone,
      whatsapp_number: uniquePhone(),
      address: '1 Test St',
      preferred_contact_method: 'phone',
    };

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => request(app).post('/api/customers/register/').send(payload))
    );

    const successes = results.filter((r) => r.status === 'fulfilled' && r.value.status === 201);
    expect(successes.length).toBe(1);
  });
});
