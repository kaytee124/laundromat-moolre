const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { Payment, Order } = require('../../models');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { recordFinding } = require('../reportSummary');

jest.mock('axios');

const WEBHOOK_SECRET = process.env.MOOLRE_WEBHOOK_SECRET;

function mockMoolreStatus(amountGhs) {
  axios.post.mockResolvedValue({
    data: {
      data: {
        txstatus: 1,
        amount: String(amountGhs),
        value: String(amountGhs),
        transactionid: 'txn-replay-test',
        thirdpartyref: 'TP-REPLAY',
        payer: '233240000000',
        ts: new Date().toISOString(),
      },
    },
  });
}

function buildWebhookPayload(externalref) {
  return {
    status: 1,
    code: 'P01',
    message: 'Transaction Successful',
    data: {
      txstatus: 1,
      externalref,
      secret: WEBHOOK_SECRET,
    },
  };
}

describe('Security: Payment abuse', () => {
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

  it('webhook succeeds without authentication (public endpoint)', async () => {
    const payment = await Payment.create({
      order_id: order.id,
      externalref: 'PAY-PUBLIC-WEBHOOK',
      amount: 10,
      status: 'pending',
      payment_method: 'moolre',
      provider: 'moolre',
      currency: 'GHS',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    mockMoolreStatus(10);

    const res = await request(app)
      .post('/api/payments/moolre/webhook/')
      .send(buildWebhookPayload(payment.externalref));

    expect(res.status).toBe(200);
    recordFinding('PAYMENT_WEBHOOK_PUBLIC', 'Payment webhook processed without auth (secret validated)');
  });

  it('replay webhook does not double-credit order amount_paid', async () => {
    const payment = await Payment.create({
      order_id: order.id,
      externalref: 'PAY-REPLAY-TEST',
      amount: 15,
      status: 'pending',
      payment_method: 'moolre',
      provider: 'moolre',
      currency: 'GHS',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    mockMoolreStatus(15);

    const payload = buildWebhookPayload(payment.externalref);

    const first = await request(app).post('/api/payments/moolre/webhook/').send(payload);
    expect(first.status).toBe(200);

    const afterFirst = await Order.findByPk(order.id);
    const paidAfterFirst = parseFloat(afterFirst.amount_paid);

    const second = await request(app).post('/api/payments/moolre/webhook/').send(payload);
    expect(second.status).toBe(200);

    const afterSecond = await Order.findByPk(order.id);
    expect(parseFloat(afterSecond.amount_paid)).toBe(paidAfterFirst);
  });

  it('rejects or errors on initialize with zero amount', async () => {
    const res = await request(app)
      .post('/api/payments/initialize/')
      .set(tokens.client.headers)
      .send({ order_id: order.id, amount: 0 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    if (res.status === 500) {
      recordFinding('PAYMENT_ZERO_AMOUNT_500', 'Zero payment amount triggers server error');
    }
  });

  it('rejects or errors on initialize with negative amount', async () => {
    const res = await request(app)
      .post('/api/payments/initialize/')
      .set(tokens.client.headers)
      .send({ order_id: order.id, amount: -5 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    if (res.status === 500) {
      recordFinding('PAYMENT_NEGATIVE_AMOUNT_500', 'Negative payment amount triggers server error');
    }
  });

  it('rejects or errors on initialize with invalid amount string', async () => {
    const res = await request(app)
      .post('/api/payments/initialize/')
      .set(tokens.client.headers)
      .send({ order_id: order.id, amount: 'not-a-number' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    if (res.status === 500) {
      recordFinding('PAYMENT_INVALID_AMOUNT_500', 'Invalid payment amount triggers server error');
    }
  });

  it('webhook credits only the order tied to the payment externalref', async () => {
    const service = await createService(ctx.admin);
    const baselineOrder = await createOrder(ctx.employee, ctx.customer, service);
    const otherOrder = await createOrder(ctx.employee, ctx.customer2, service);

    const payment = await Payment.create({
      order_id: otherOrder.id,
      externalref: 'PAY-OTHER-ORDER-REF',
      amount: 20,
      status: 'pending',
      payment_method: 'moolre',
      provider: 'moolre',
      currency: 'GHS',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    mockMoolreStatus(20);

    const res = await request(app)
      .post('/api/payments/moolre/webhook/')
      .send(buildWebhookPayload(payment.externalref));

    expect(res.status).toBe(200);

    const credited = await Order.findByPk(otherOrder.id);
    expect(parseFloat(credited.amount_paid)).toBeGreaterThan(0);

    const untouched = await Order.findByPk(baselineOrder.id);
    expect(parseFloat(untouched.amount_paid)).toBe(0);
  });
});
