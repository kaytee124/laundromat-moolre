const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { Payment } = require('../../models');
const { createService, createOrder } = require('../helpers/fixtures');

jest.mock('axios');

describe('USSD payments API', () => {
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

  it('initializes USSD push payment without auth', async () => {
    axios.post.mockImplementation((url) => {
      if (String(url).includes('/open/transact/payment')) {
        return Promise.resolve({
          data: {
            status: 1,
            code: 'TP00',
            message: 'Payment request sent',
          },
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const res = await request(app)
      .post('/api/ussd/payments/initialize/')
      .send({
        phone_number: ctx.customer.phone_number,
        order_id: order.id,
        amount: 10,
        network: 3,
        session_id: 'moolre-ussd-session-123',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.externalref).toMatch(/^PAY-/);
    expect(res.body.data.payment_id).toBeDefined();
    expect(res.body.data.moolre_message).toBe('Payment request sent');
    expect(res.body.data.authorization_url).toBeUndefined();

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/open/transact/payment'),
      expect.objectContaining({
        channel: '13',
        sessionid: 'moolre-ussd-session-123',
        payer: ctx.customer.phone_number,
      }),
      expect.any(Object)
    );

    const payment = await Payment.findOne({ where: { externalref: res.body.data.externalref } });
    expect(payment).toBeTruthy();
    expect(payment.payment_method).toBe('ussd');
  });

  it('requires network for USSD payment initialize', async () => {
    const res = await request(app)
      .post('/api/ussd/payments/initialize/')
      .send({
        phone_number: ctx.customer.phone_number,
        order_id: order.id,
        amount: 10,
      });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('VALIDATION_ERROR');
  });
});
