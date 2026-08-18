const request = require('supertest');
const app = require('../../app');
const moolreService = require('../../services/moolreService');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { processDueReminders, computeDueAt } = require('../../services/orderDueReminderService');
const { User, Order, SmsOutbox } = require('../../models');
const { Op } = require('sequelize');

jest.mock('axios');

async function waitForSms(minCount, maxWaitMs = 5000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const count = await SmsOutbox.count();
    if (count >= minCount) return count;
    await new Promise((r) => setTimeout(r, 50));
  }
  return SmsOutbox.count();
}

describe('Payment receipt SMS + due reminders', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    await ctx.superadmin.update({ phone_number: '0240000099' });
    await ctx.admin.update({ phone_number: '0240000077' });
    await ctx.employee.update({ phone_number: '0240000088' });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(moolreService, 'sendSms').mockResolvedValue({ status: 1, code: 'SMS01' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('partial cash then full cash sets partially_paid then paid and enqueues payment SMS', async () => {
    const beforeCount = await SmsOutbox.count({ where: { purpose: 'payment_received' } });
    const service = await createService(ctx.admin, { name: `Pay SMS ${Date.now()}` });
    const order = await createOrder(ctx.employee, ctx.customer, service, {
      quantity: 1,
      unit_price: 100,
    });

    const partial = await request(app)
      .post('/api/payments/cash/')
      .set(tokens.employee.headers)
      .send({
        order_id: order.id,
        amount: 40,
        paid_at: '2026-08-08T10:00:00.000Z',
      });
    expect(partial.status).toBe(201);
    expect(partial.body.data.order.payment_status).toBe('partially_paid');

    await waitForSms(beforeCount + 1);

    const deadline = Date.now() + 5000;
    let staffSms = [];
    while (Date.now() < deadline) {
      staffSms = await SmsOutbox.findAll({
        where: {
          purpose: 'payment_received_staff',
          related_id: ctx.superadmin.id,
        },
        order: [['id', 'DESC']],
        limit: 1,
      });
      if (staffSms.length) break;
      // related_id may be string in MySQL
      staffSms = await SmsOutbox.findAll({
        where: { purpose: 'payment_received_staff' },
        order: [['id', 'DESC']],
        limit: 5,
      });
      if (staffSms.some((r) => String(r.related_id) === String(ctx.superadmin.id))) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(
      staffSms.some((r) => String(r.related_id) === String(ctx.superadmin.id)) || staffSms.length > 0
    ).toBe(true);

    const staffPaymentForSuperadmin = staffSms.find(
      (r) => String(r.related_id) === String(ctx.superadmin.id)
    );
    expect(staffPaymentForSuperadmin?.message).toMatch(/from client1/i);
    expect(staffPaymentForSuperadmin?.message).toMatch(/Received by employee1/i);

    const adminPaymentSms = await SmsOutbox.findAll({
      where: {
        purpose: 'payment_received_staff',
        related_id: ctx.admin.id,
      },
    });
    expect(adminPaymentSms).toHaveLength(0);

    const customerSms = await SmsOutbox.findAll({
      where: { purpose: 'payment_received' },
      order: [['id', 'DESC']],
      limit: 3,
    });
    expect(customerSms.some((r) => String(r.related_id) === String(ctx.customer.id))).toBe(true);
    expect(customerSms[0].message).toMatch(/Balance|partial|GHS/i);

    const full = await request(app)
      .post('/api/payments/cash/')
      .set(tokens.employee.headers)
      .send({
        order_id: order.id,
        amount: 60,
        paid_at: '2026-08-08T10:05:00.000Z',
      });
    expect(full.status).toBe(201);
    expect(full.body.data.order.payment_status).toBe('paid');
    expect(parseFloat(full.body.data.order.balance)).toBe(0);
  });

  it('due reminder job sends 1h SMS once and does not duplicate', async () => {
    const service = await createService(ctx.admin, { name: `Due Rem ${Date.now()}` });
    const dueAt = new Date(Date.now() + 50 * 60 * 1000);
    const deliveryDate = dueAt.toISOString().slice(0, 10);
    const deliveryTime = dueAt.toISOString().slice(11, 19);

    const order = await createOrder(ctx.employee, ctx.customer, service, {
      quantity: 1,
      unit_price: 25,
      delivery_date: deliveryDate,
      delivery_time: deliveryTime,
      assigned_to: ctx.employee.id,
    });

    expect(Math.abs(computeDueAt(deliveryDate, deliveryTime).getTime() - dueAt.getTime())).toBeLessThan(
      2000
    );

    const before = await SmsOutbox.count({
      where: { purpose: { [Op.in]: ['order_due_1h', 'order_due_1h_staff'] } },
    });

    const first = await processDueReminders(new Date());
    expect(first.reminded1h).toBeGreaterThanOrEqual(1);

    const reloaded = await Order.findByPk(order.id);
    expect(reloaded.reminder_1h_sent_at).toBeTruthy();
    expect(reloaded.reminder_24h_sent_at).toBeTruthy();

    const mid = await SmsOutbox.count({
      where: { purpose: { [Op.in]: ['order_due_1h', 'order_due_1h_staff'] } },
    });
    expect(mid).toBeGreaterThan(before);

    const staffRows = await SmsOutbox.findAll({
      where: {
        purpose: { [Op.in]: ['order_due_1h_staff', 'order_due_24h_staff'] },
        related_type: 'user',
      },
      order: [['id', 'DESC']],
      limit: 20,
    });
    const staffRelatedIds = staffRows.map((r) => String(r.related_id));
    expect(staffRelatedIds).toContain(String(ctx.superadmin.id));
    expect(staffRelatedIds).toContain(String(ctx.admin.id));
    expect(staffRelatedIds).not.toContain(String(ctx.employee.id));

    const second = await processDueReminders(new Date());
    expect(second.reminded1h).toBe(0);

    const after = await SmsOutbox.count({
      where: { purpose: { [Op.in]: ['order_due_1h', 'order_due_1h_staff'] } },
    });
    expect(after).toBe(mid);
  });
});
