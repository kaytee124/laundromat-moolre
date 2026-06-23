const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { Payment } = require('../../models');

jest.mock('axios');

describe('Payments API', () => {
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

  describe('POST /api/payments/initialize/', () => {
    it('client initializes payment', async () => {
      axios.post.mockResolvedValue({
        data: {
          status: true,
          data: {
            authorization_url: 'https://checkout.paystack.com/test',
            access_code: 'access123',
          },
        },
      });

      const res = await request(app)
        .post('/api/payments/initialize/')
        .set(tokens.client.headers)
        .send({ order_id: order.id, amount: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.authorization_url).toBeDefined();
    });

    it('denies non-client', async () => {
      const res = await request(app)
        .post('/api/payments/initialize/')
        .set(tokens.admin.headers)
        .send({ order_id: order.id, amount: 10 });
      expect(res.status).toBe(403);
    });

    it('rejects amount exceeding balance', async () => {
      const res = await request(app)
        .post('/api/payments/initialize/')
        .set(tokens.client.headers)
        .send({ order_id: order.id, amount: 999999 });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('AMOUNT_EXCEEDS_BALANCE');
    });
  });

  describe('GET /api/payments/callback/', () => {
    it('handles missing reference', async () => {
      const res = await request(app).get('/api/payments/callback/');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
    });

    it('verifies successful payment', async () => {
      const payment = await Payment.create({
        order_id: order.id,
        reference: 'PAY-TEST-REF-001',
        amount: 25,
        status: 'pending',
        payment_method: 'paystack',
        currency: 'GHS',
        metadata: {},
        created_by: ctx.client.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      axios.get.mockResolvedValue({
        data: {
          status: true,
          data: {
            status: 'success',
            amount: 2500,
            id: 'txn123',
            fees: 0,
            paid_at: new Date().toISOString(),
            gateway_response: 'Successful',
          },
        },
      });

      const res = await request(app).get(`/api/payments/callback/?reference=${payment.reference}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
