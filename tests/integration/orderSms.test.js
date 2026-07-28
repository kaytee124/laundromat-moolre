const request = require('supertest');
const axios = require('axios');
const app = require('../../app');
const moolreService = require('../../services/moolreService');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { Payment, Order } = require('../../models');
const { formatSmsRecipient } = require('../../utils/phone');
const { CUSTOMER_APP_URL } = require('../../utils/constants');

jest.mock('axios');

const WEBHOOK_SECRET = process.env.MOOLRE_WEBHOOK_SECRET;

async function waitForSpyCalls(spy, count = 1, maxWaitMs = 5000) {
  if (count === 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(maxWaitMs, 500)));
    return;
  }
  const deadline = Date.now() + maxWaitMs;
  while (spy.mock.calls.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function mockMoolreStatusSuccess(amountGhs) {
  axios.post.mockImplementation((url) => {
    if (String(url).includes('/open/transact/status')) {
      return Promise.resolve({
        data: {
          data: {
            txstatus: 1,
            amount: String(amountGhs),
            value: String(amountGhs),
            transactionid: 'TXN-SMS',
            ts: new Date().toISOString(),
          },
        },
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

function buildWebhookPayload(externalref, overrides = {}) {
  return {
    status: 1,
    code: 'P01',
    message: 'Transaction Successful',
    data: {
      txstatus: 1,
      payer: '233240000000',
      accountnumber: '0000000000',
      amount: '3.00',
      value: '3.00',
      transactionid: 'TXN-SMS',
      externalref,
      thirdpartyref: 'TP-SMS',
      secret: WEBHOOK_SECRET,
      ts: new Date().toISOString(),
      ...overrides,
    },
  };
}

describe('Order SMS notifications', () => {
  let tokens;
  let ctx;
  let sendSmsSpy;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    sendSmsSpy = jest.spyOn(moolreService, 'sendSms').mockResolvedValue({
      status: 1,
      code: 'SMS01',
      message: 'Success',
    });
  });

  afterEach(() => {
    sendSmsSpy.mockRestore();
  });

  describe('formatSmsRecipient', () => {
    it('converts local Ghana numbers to international 233 format', () => {
      expect(formatSmsRecipient('0200000001')).toBe('233200000001');
      expect(formatSmsRecipient('0502412618')).toBe('233502412618');
    });

    it('keeps numbers already in 233 format', () => {
      expect(formatSmsRecipient('233502412618')).toBe('233502412618');
    });
  });

  describe('order create', () => {
    it('sends order-received SMS when staff creates an order', async () => {
      const service = await createService(ctx.admin);
      const res = await request(app)
        .post('/api/orders/create/')
        .set(tokens.employee.headers)
        .send({
          customer_id: ctx.customer.id,
          service_ids: [service.id],
          order_items_data: [
            {
              item_name: 'TOPS',
              dirty_quantity: 1,
              clean_quantity: 0,
              unit_price: 10,
            },
          ],
        });

      expect(res.status).toBe(201);
      await waitForSpyCalls(sendSmsSpy, 1);
      expect(sendSmsSpy).toHaveBeenCalledTimes(1);
      expect(sendSmsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: formatSmsRecipient(ctx.customer.phone_number),
          ref: res.body.data.order_number,
        })
      );
      expect(sendSmsSpy.mock.calls[0][0].message).toMatch(/received/i);
      expect(sendSmsSpy.mock.calls[0][0].message).toContain(res.body.data.order_number);
      expect(sendSmsSpy.mock.calls[0][0].message).toContain(CUSTOMER_APP_URL);
      expect(sendSmsSpy.mock.calls[0][0].message).toMatch(/pay/i);
      expect(sendSmsSpy.mock.calls[0][0].message).toMatch(/portal/i);
      expect(sendSmsSpy.mock.calls[0][0].message).toMatch(/Total: GHS/i);
      expect(sendSmsSpy.mock.calls[0][0].message).toMatch(/TOPS/i);
    });
  });

  describe('30% payment auto in_progress', () => {
    it('sends in-progress SMS when paid total reaches 30%', async () => {
      const service = await createService(ctx.admin, { price: 10 });
      const smsOrder = await createOrder(ctx.employee, ctx.customer, service, {
        quantity: 1,
        order_status: 'pending',
      });

      const payment = await Payment.create({
        order_id: smsOrder.id,
        externalref: 'PAY-SMS-30PCT',
        amount: 3,
        status: 'pending',
        payment_method: 'moolre',
        provider: 'moolre',
        currency: 'GHS',
        metadata: {},
        created_by: ctx.client.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockMoolreStatusSuccess(3);

      const res = await request(app)
        .post('/api/payments/moolre/webhook/')
        .send(buildWebhookPayload(payment.externalref, { amount: '3.00', value: '3.00' }));

      expect(res.status).toBe(200);

      await waitForSpyCalls(sendSmsSpy, 1);

      const updatedOrder = await Order.findByPk(smsOrder.id);
      expect(updatedOrder.order_status).toBe('in_progress');
      expect(parseFloat(updatedOrder.amount_paid)).toBe(3);

      expect(sendSmsSpy).toHaveBeenCalledTimes(1);
      expect(sendSmsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: formatSmsRecipient(ctx.customer.phone_number),
          ref: updatedOrder.order_number,
        })
      );
      expect(sendSmsSpy.mock.calls[0][0].message).toMatch(/in progress/i);
    });

    it('does not send duplicate in-progress SMS on further payments', async () => {
      const service = await createService(ctx.admin, { price: 10 });
      const smsOrder = await createOrder(ctx.employee, ctx.customer, service, {
        quantity: 1,
        order_status: 'in_progress',
        amount_paid: 3,
        payment_status: 'partially_paid',
      });

      const payment = await Payment.create({
        order_id: smsOrder.id,
        externalref: 'PAY-SMS-NODUP',
        amount: 2,
        status: 'pending',
        payment_method: 'moolre',
        provider: 'moolre',
        currency: 'GHS',
        metadata: {},
        created_by: ctx.client.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockMoolreStatusSuccess(2);

      const res = await request(app)
        .post('/api/payments/moolre/webhook/')
        .send(buildWebhookPayload(payment.externalref, { amount: '2.00', value: '2.00' }));

      expect(res.status).toBe(200);
      await waitForSpyCalls(sendSmsSpy, 0);
      expect(sendSmsSpy).not.toHaveBeenCalled();
    });
  });

  describe('staff order status updates', () => {
    it('sends in-progress SMS when staff sets in_progress', async () => {
      const service = await createService(ctx.admin);
      const smsOrder = await createOrder(ctx.employee, ctx.customer, service, {
        order_status: 'pending',
      });

      const res = await request(app)
        .put(`/api/orders/${smsOrder.id}/update/`)
        .set(tokens.employee.headers)
        .send({ order_status: 'in_progress' });

      expect(res.status).toBe(200);
      await waitForSpyCalls(sendSmsSpy, 1);
      expect(sendSmsSpy.mock.calls[0][0].message).toMatch(/in progress/i);
    });

    it('sends completed SMS when staff sets completed', async () => {
      sendSmsSpy.mockClear();
      const service = await createService(ctx.admin);
      const smsOrder = await createOrder(ctx.employee, ctx.customer, service, {
        order_status: 'ready',
      });

      const res = await request(app)
        .put(`/api/orders/${smsOrder.id}/update/`)
        .set(tokens.employee.headers)
        .send({ order_status: 'completed' });

      expect(res.status).toBe(200);
      await waitForSpyCalls(sendSmsSpy, 1);
      expect(sendSmsSpy.mock.calls[0][0].message).toMatch(/ready for pickup/i);
    });

    it('still succeeds when SMS send fails', async () => {
      sendSmsSpy.mockClear();
      sendSmsSpy.mockRejectedValue(new Error('Moolre SMS down'));

      const service = await createService(ctx.admin);
      const smsOrder = await createOrder(ctx.employee, ctx.customer, service, {
        order_status: 'pending',
      });

      const res = await request(app)
        .put(`/api/orders/${smsOrder.id}/update/`)
        .set(tokens.employee.headers)
        .send({ order_status: 'in_progress' });

      expect(res.status).toBe(200);
      const updated = await Order.findByPk(smsOrder.id);
      expect(updated.order_status).toBe('in_progress');
    });
  });

  describe('schedule and pickup SMS', () => {
    async function clearSmsSpy() {
      await new Promise((resolve) => setTimeout(resolve, 150));
      sendSmsSpy.mockClear();
    }

    it('sends earlier schedule SMS when estimated_completion_date moves forward', async () => {
      await clearSmsSpy();
      const service = await createService(ctx.admin);
      const smsOrder = await createOrder(ctx.employee, ctx.customer, service, {
        estimated_completion_date: '2026-07-25',
      });

      const res = await request(app)
        .put(`/api/orders/${smsOrder.id}/update/`)
        .set(tokens.employee.headers)
        .send({ estimated_completion_date: '2026-07-20' });

      expect(res.status).toBe(200);
      await waitForSpyCalls(sendSmsSpy, 1);
      const messages = sendSmsSpy.mock.calls.map((c) => c[0].message);
      expect(messages.some((m) => /moved earlier/i.test(m))).toBe(true);
    });

    it('sends later schedule SMS when estimated_completion_date is pushed back', async () => {
      await clearSmsSpy();
      const service = await createService(ctx.admin);
      const smsOrder = await createOrder(ctx.employee, ctx.customer, service, {
        estimated_completion_date: '2026-07-20',
      });

      const res = await request(app)
        .put(`/api/orders/${smsOrder.id}/update/`)
        .set(tokens.employee.headers)
        .send({ estimated_completion_date: '2026-07-28' });

      expect(res.status).toBe(200);
      await waitForSpyCalls(sendSmsSpy, 1);
      const messages = sendSmsSpy.mock.calls.map((c) => c[0].message);
      expect(messages.some((m) => /Sorry for the inconvenience/i.test(m))).toBe(true);
    });

    it('sends pickup SMS when picked_up is set true', async () => {
      await clearSmsSpy();
      const service = await createService(ctx.admin);
      const smsOrder = await createOrder(ctx.employee, ctx.customer, service);

      const res = await request(app)
        .put(`/api/orders/${smsOrder.id}/update/`)
        .set(tokens.employee.headers)
        .send({ picked_up: true });

      expect(res.status).toBe(200);
      expect(res.body.data.picked_up).toBe(true);
      await waitForSpyCalls(sendSmsSpy, 1);
      const messages = sendSmsSpy.mock.calls.map((c) => c[0].message);
      expect(messages.some((m) => /picked up/i.test(m))).toBe(true);
    });
  });
});
