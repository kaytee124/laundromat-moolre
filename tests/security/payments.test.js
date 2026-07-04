const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { Payment } = require('../../models');

jest.mock('axios');

const WEBHOOK_SECRET = process.env.MOOLRE_WEBHOOK_SECRET;

function mockMoolreStatus(amountGhs, txstatus = 1) {
  axios.post.mockResolvedValue({
    data: {
      data: {
        txstatus,
        amount: String(amountGhs),
        value: String(amountGhs),
        transactionid: 'TXN-SEC',
        thirdpartyref: 'TP-SEC',
        payer: '233240000000',
        ts: new Date().toISOString(),
      },
    },
  });
}

describe('Security: Payments', () => {
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

  it('requires authentication for initialize', async () => {
    const res = await request(app)
      .post('/api/payments/initialize/')
      .send({ order_id: order.id, amount: 10 });
    expect(res.status).toBe(401);
  });

  it('rejects webhook when Moolre status API amount mismatches', async () => {
    const payment = await Payment.create({
      order_id: order.id,
      externalref: 'PAY-AMOUNT-MISMATCH',
      amount: 30,
      status: 'pending',
      payment_method: 'moolre',
      provider: 'moolre',
      currency: 'GHS',
      metadata: {},
      created_by: ctx.client.id,
      created_at: new Date(),
      updated_at: new Date(),
    });

    mockMoolreStatus(5, 1);

    const res = await request(app)
      .post('/api/payments/moolre/webhook/')
      .send({
        status: 1,
        code: 'P01',
        message: 'Transaction Successful',
        data: {
          txstatus: 1,
          amount: '30.00',
          externalref: payment.externalref,
          secret: WEBHOOK_SECRET,
        },
      });

    expect(res.status).toBe(400);
    await payment.reload();
    expect(payment.status).toBe('failed');
  });
});
