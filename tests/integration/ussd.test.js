const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { Payment } = require('../../models');
const { getTokensForRoles } = require('../helpers/auth');
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

  it('initializes payment without auth', async () => {
    axios.post.mockResolvedValue({
      data: {
        data: {
          authorization_url: 'https://pay.moolre.com/ussd-test',
          reference: 'MOOLRE-USSD-1',
        },
      },
    });

    const res = await request(app)
      .post('/api/ussd/payments/initialize/')
      .send({
        phone_number: ctx.customer.phone_number,
        order_id: order.id,
        amount: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.authorization_url).toBe('https://pay.moolre.com/ussd-test');

    const payment = await Payment.findOne({ where: { externalref: res.body.data.externalref } });
    expect(payment).toBeTruthy();
    expect(payment.payment_method).toBe('ussd');
  });
});
