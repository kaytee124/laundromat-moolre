const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { createService, createOrder } = require('../helpers/fixtures');
const { Payment } = require('../../models');

jest.mock('axios');

describe('USSD API', () => {
  let ctx;
  let order;

  beforeAll(async () => {
    ctx = global.testContext;
    const service = await createService(ctx.admin);
    order = await createOrder(ctx.employee, ctx.customer, service);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/ussd/payments/initialize/', () => {
    it('initializes payment without authentication', async () => {
      axios.post.mockResolvedValue({
        data: {
          status: true,
          data: {
            authorization_url: 'https://checkout.paystack.com/ussd-test',
            access_code: 'ussd_access123',
          },
        },
      });

      const res = await request(app)
        .post('/api/ussd/payments/initialize/')
        .send({ phone_number: ctx.customer.phone_number, order_id: order.id, amount: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.authorization_url).toBe('https://checkout.paystack.com/ussd-test');

      const payment = await Payment.findOne({ where: { reference: res.body.data.reference } });
      expect(payment).not.toBeNull();
      expect(payment.payment_method).toBe('ussd');
      expect(payment.payer_phone).toBe(ctx.customer.phone_number);
    });

    it('returns 404 for unknown phone number', async () => {
      const res = await request(app)
        .post('/api/ussd/payments/initialize/')
        .send({ phone_number: '0299999999', order_id: order.id, amount: 10 });

      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('returns 404 when order does not belong to customer', async () => {
      const service = await createService(ctx.admin);
      const otherOrder = await createOrder(ctx.employee, ctx.customer2, service);

      const res = await request(app)
        .post('/api/ussd/payments/initialize/')
        .send({ phone_number: ctx.customer.phone_number, order_id: otherOrder.id, amount: 10 });

      expect(res.status).toBe(404);
      expect(res.body.error_code).toBe('ORDER_NOT_FOUND');
    });

    it('rejects amount exceeding balance', async () => {
      const res = await request(app)
        .post('/api/ussd/payments/initialize/')
        .send({ phone_number: ctx.customer.phone_number, order_id: order.id, amount: 999999 });

      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('AMOUNT_EXCEEDS_BALANCE');
    });
  });
});
