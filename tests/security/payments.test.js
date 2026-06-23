const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { Payment } = require('../../models');
const { createService, createOrder } = require('../helpers/fixtures');

jest.mock('axios');

describe('Security: Payments', () => {
  let ctx;
  let order;

  beforeAll(async () => {
    ctx = global.testContext;
    const service = await createService(ctx.admin);
    order = await createOrder(ctx.employee, ctx.customer, service);
  });

  it('callback with unknown reference fails safely', async () => {
    const res = await request(app).get('/api/payments/callback/?reference=FAKE-REF-NOT-FOUND');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });

  it('rejects payment when Paystack amount mismatches', async () => {
    const payment = await Payment.create({
      order_id: order.id,
      reference: 'PAY-MISMATCH-TEST',
      amount: 50,
      status: 'pending',
      payment_method: 'paystack',
      currency: 'GHS',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    axios.get.mockResolvedValue({
      data: {
        status: true,
        data: {
          status: 'success',
          amount: 1000,
          gateway_response: 'Successful',
        },
      },
    });

    const res = await request(app).get(`/api/payments/callback/?reference=${payment.reference}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/mismatch/i);

    const updated = await Payment.findByPk(payment.id);
    expect(updated.status).toBe('failed');
  });

  it('payment initialize requires authentication', async () => {
    const res = await request(app)
      .post('/api/payments/initialize/')
      .send({ order_id: 1, amount: 10 });
    expect(res.status).toBe(401);
  });
});
