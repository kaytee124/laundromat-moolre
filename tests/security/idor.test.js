const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');

describe('Security: IDOR', () => {
  let tokens;
  let ctx;
  let client2Order;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    const service = await createService(ctx.admin);
    client2Order = await createOrder(ctx.employee, ctx.customer2, service);
  });

  it('client cannot view another client order', async () => {
    const res = await request(app)
      .get(`/api/orders/${client2Order.id}/`)
      .set(tokens.client.headers);
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('PERMISSION_DENIED');
  });

  it('client cannot pay for another client order', async () => {
    const res = await request(app)
      .post('/api/payments/initialize/')
      .set(tokens.client.headers)
      .send({ order_id: client2Order.id, amount: 5 });
    expect(res.status).toBe(404);
    expect(res.body.error_code).toBe('ORDER_NOT_FOUND');
  });

  it('client cannot use staff user lookup', async () => {
    const res = await request(app)
      .get(`/api/accounts/staff/user/${ctx.client2.id}/`)
      .set(tokens.client.headers);
    expect(res.status).toBe(403);
  });
});
