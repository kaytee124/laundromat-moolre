const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const { createService, createOrder } = require('../helpers/fixtures');
const { Payment } = require('../../models');

jest.mock('axios');

const TEST_MSISDN = '233200000001';
const SESSION_ID = 'test-ussd-session-001';

async function ussdRequest(sessionId, { isNew, msisdn = TEST_MSISDN, message = '' }) {
  return request(app)
    .post('/api/ussd/callback/')
    .send({ sessionId, new: isNew, msisdn, message });
}

describe('POST /api/ussd/callback/', () => {
  let ctx;
  let service;

  beforeAll(async () => {
    ctx = global.testContext;
    service = await createService(ctx.admin);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no customer found for unknown msisdn', async () => {
    const res = await ussdRequest('unknown-session', {
      isNew: true,
      msisdn: '233999999999',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'No customer found', reply: false });
  });

  it('shows welcome menu for known customer', async () => {
    const res = await ussdRequest(SESSION_ID, { isNew: true });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe(true);
    expect(res.body.message).toContain('Welcome client1 Test');
    expect(res.body.message).toContain('1. View orders');
    expect(res.body.message).toContain('2. View recent payment history');
  });

  it('shows no pending order when customer has none unpaid', async () => {
    const paidOrder = await createOrder(ctx.employee, ctx.customer, service, {
      payment_status: 'paid',
      amount_paid: 50,
    });
    expect(paidOrder.payment_status).toBe('paid');

    await ussdRequest(`${SESSION_ID}-nopending`, { isNew: true });
    const res = await ussdRequest(`${SESSION_ID}-nopending`, {
      isNew: false,
      message: '1',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'No pending order', reply: false });
  });

  it('paginates pending orders with option 6 for next page', async () => {
    const session = `${SESSION_ID}-pages`;
    const orders = [];
    for (let i = 0; i < 6; i += 1) {
      orders.push(await createOrder(ctx.employee, ctx.customer, service));
    }

    await ussdRequest(session, { isNew: true });
    const page1 = await ussdRequest(session, { isNew: false, message: '1' });

    expect(page1.body.reply).toBe(true);
    expect(page1.body.message).toContain('6. Next');
    expect(page1.body.message).toContain(orders[5].order_number);

    const page2 = await ussdRequest(session, { isNew: false, message: '6' });

    expect(page2.body.reply).toBe(true);
    expect(page2.body.message).not.toContain('6. Next');
    expect(page2.body.message).toContain(orders[0].order_number);
  });

  it('completes payment flow on confirm', async () => {
    axios.post.mockResolvedValue({
      data: {
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/ussd-flow',
          access_code: 'ussd_flow_access',
        },
      },
    });

    const order = await createOrder(ctx.employee, ctx.customer, service);
    const session = `${SESSION_ID}-pay`;

    await ussdRequest(session, { isNew: true });
    await ussdRequest(session, { isNew: false, message: '1' });
    await ussdRequest(session, { isNew: false, message: '1' });
    await ussdRequest(session, { isNew: false, message: '10' });
    const res = await ussdRequest(session, { isNew: false, message: '1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Payment is initialized. You will get a prompt.',
      reply: false,
    });

    const payment = await Payment.findOne({
      where: { order_id: order.id, payment_method: 'ussd' },
      order: [['created_at', 'DESC']],
    });
    expect(payment).not.toBeNull();
    expect(parseFloat(payment.amount)).toBe(10);
  });

  it('ends session when payment is cancelled', async () => {
    await createOrder(ctx.employee, ctx.customer, service);
    const session = `${SESSION_ID}-cancel`;

    await ussdRequest(session, { isNew: true });
    await ussdRequest(session, { isNew: false, message: '1' });
    await ussdRequest(session, { isNew: false, message: '1' });
    await ussdRequest(session, { isNew: false, message: '10' });
    const res = await ussdRequest(session, { isNew: false, message: '2' });

    expect(res.body).toEqual({ message: 'Payment cancelled', reply: false });
  });

  it('shows recent payment history from main menu', async () => {
    const order = await createOrder(ctx.employee, ctx.customer, service);
    await Payment.create({
      order_id: order.id,
      reference: 'PAY-USSD-HIST-001',
      amount: 25,
      status: 'success',
      payment_method: 'ussd',
      currency: 'GHS',
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    const session = `${SESSION_ID}-history`;
    await ussdRequest(session, { isNew: true });
    const res = await ussdRequest(session, { isNew: false, message: '2' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe(false);
    expect(res.body.message).toContain(order.order_number);
    expect(res.body.message).toContain('25.00');
    expect(res.body.message).toContain('success');
  });

  it('maintains session continuity across requests', async () => {
    const session = `${SESSION_ID}-continuity`;
    const first = await ussdRequest(session, { isNew: true });
    expect(first.body.reply).toBe(true);

    const second = await ussdRequest(session, { isNew: false, message: '2' });
    expect(second.body.reply).toBe(false);
  });
});
