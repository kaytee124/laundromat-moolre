const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { Payment, Order } = require('../../models');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { recordFinding } = require('../reportSummary');

jest.mock('axios');

function mockPaystackSuccess(amountGhs) {
  axios.get.mockResolvedValue({
    data: {
      status: true,
      data: {
        status: 'success',
        amount: Math.round(amountGhs * 100),
        id: 'txn-replay-test',
        fees: 0,
        paid_at: new Date().toISOString(),
        gateway_response: 'Successful',
      },
    },
  });
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

  it('callback succeeds without authentication (public endpoint)', async () => {
    const payment = await Payment.create({
      order_id: order.id,
      reference: 'PAY-PUBLIC-CALLBACK',
      amount: 10,
      status: 'pending',
      payment_method: 'paystack',
      currency: 'GHS',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    mockPaystackSuccess(10);

    const res = await request(app).get(`/api/payments/callback/?reference=${payment.reference}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    recordFinding('PAYMENT_CALLBACK_PUBLIC', 'Payment callback processed without auth');
  });

  it('replay callback does not double-credit order amount_paid', async () => {
    const payment = await Payment.create({
      order_id: order.id,
      reference: 'PAY-REPLAY-TEST',
      amount: 15,
      status: 'pending',
      payment_method: 'paystack',
      currency: 'GHS',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    mockPaystackSuccess(15);

    const first = await request(app).get(`/api/payments/callback/?reference=${payment.reference}`);
    expect(first.body.success).toBe(true);

    const afterFirst = await Order.findByPk(order.id);
    const paidAfterFirst = parseFloat(afterFirst.amount_paid);

    mockPaystackSuccess(15);
    const second = await request(app).get(`/api/payments/callback/?reference=${payment.reference}`);
    expect(second.body.success).toBe(true);

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

  it('callback credits only the order tied to the payment reference', async () => {
    const service = await createService(ctx.admin);
    const baselineOrder = await createOrder(ctx.employee, ctx.customer, service);
    const otherOrder = await createOrder(ctx.employee, ctx.customer2, service);

    const payment = await Payment.create({
      order_id: otherOrder.id,
      reference: 'PAY-OTHER-ORDER-REF',
      amount: 20,
      status: 'pending',
      payment_method: 'paystack',
      currency: 'GHS',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    mockPaystackSuccess(20);

    const res = await request(app).get(`/api/payments/callback/?reference=${payment.reference}`);
    expect(res.body.success).toBe(true);
    expect(res.body.order_id).toBe(otherOrder.id);

    const untouched = await Order.findByPk(baselineOrder.id);
    expect(parseFloat(untouched.amount_paid)).toBe(0);
  });
});
