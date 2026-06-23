const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { Payment, Order } = require('../../models');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');

jest.mock('axios');

describe('Concurrency: payment races', () => {
  let tokens;
  let ctx;
  let order;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    const service = await createService(ctx.admin);
    order = await createOrder(ctx.employee, ctx.customer, service);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({
      data: {
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/x', access_code: 'acc' },
      },
    });
    axios.get.mockResolvedValue({
      data: {
        status: true,
        data: {
          status: 'success',
          amount: 1000,
          id: 'txn-1',
          fees: 0,
          paid_at: new Date().toISOString(),
          gateway_response: 'ok',
        },
      },
    });
  });

  it('R03: parallel payment initialize does not 500', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/payments/initialize/')
          .set(tokens.client.headers)
          .send({ order_id: order.id, amount: 5 })
      )
    );
    expect(results.every((r) => r.status !== 'fulfilled' || r.value.status < 500)).toBe(true);
    const payments = await Payment.findAll({ where: { order_id: order.id } });
    expect(payments.length).toBeGreaterThan(0);
  });

  it('R04: parallel callback does not double-count amount_paid', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/y', access_code: 'acc2' },
      },
    });
    const init = await request(app)
      .post('/api/payments/initialize/')
      .set(tokens.client.headers)
      .send({ order_id: order.id, amount: 10 });
    expect(init.status).toBe(200);
    const ref = init.body.data.reference;
    const before = parseFloat((await Order.findByPk(order.id)).amount_paid);

    await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).get(`/api/payments/callback/`).query({ reference: ref })
      )
    );

    const after = parseFloat((await Order.findByPk(order.id)).amount_paid);
    expect(after).toBeLessThanOrEqual(before + 10.01);
  });
});
