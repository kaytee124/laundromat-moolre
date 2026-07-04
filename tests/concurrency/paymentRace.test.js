const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { Payment, Order } = require('../../models');

jest.mock('axios');

const WEBHOOK_SECRET = process.env.MOOLRE_WEBHOOK_SECRET;

describe('Concurrency: Payment races', () => {
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
  });

  it('R03: parallel payment initialize creates distinct pending records', async () => {
    axios.post.mockImplementation((url) => {
      if (String(url).includes('/embed/link')) {
        return Promise.resolve({
          data: {
            data: {
              authorization_url: 'https://pay.moolre.com/x',
              reference: 'MOOLRE-PAR-1',
            },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const body = { order_id: order.id, amount: 5 };
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        request(app).post('/api/payments/initialize/').set(tokens.client.headers).send(body)
      )
    );

    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);

    const refs = ok.map((r) => r.value.body.data.externalref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('R04: parallel webhook replay does not over-credit', async () => {
    const payment = await Payment.create({
      order_id: order.id,
      externalref: 'PAY-RACE-REPLAY',
      amount: 12,
      status: 'pending',
      payment_method: 'moolre',
      provider: 'moolre',
      currency: 'GHS',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    axios.post.mockResolvedValue({
      data: {
        data: {
          txstatus: 1,
          amount: '12.00',
          value: '12.00',
          transactionid: 'TXN-RACE',
          thirdpartyref: 'TP-RACE',
        },
      },
    });

    const payload = {
      status: 1,
      data: {
        txstatus: 1,
        externalref: payment.externalref,
        secret: WEBHOOK_SECRET,
      },
    };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post('/api/payments/moolre/webhook/').send(payload)
      )
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);

    const updatedOrder = await Order.findByPk(order.id);
    const successfulSum = await Payment.sum('amount', {
      where: { order_id: order.id, status: 'paid' },
    });
    expect(parseFloat(updatedOrder.amount_paid)).toBe(parseFloat(successfulSum));
  });
});
