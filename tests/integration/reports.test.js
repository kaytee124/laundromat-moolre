const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { Payment } = require('../../models');

describe('Superadmin reports API', () => {
  let tokens;
  let ctx;
  let order;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    const service = await createService(ctx.admin, { name: `Report Svc ${Date.now()}` });
    order = await createOrder(ctx.employee, ctx.customer, service, {
      quantity: 1,
      unit_price: 100,
    });

    const now = new Date();
    await Payment.create({
      order_id: order.id,
      externalref: `PAY-RPT-${Date.now()}`,
      amount: 40,
      status: 'paid',
      payment_method: 'cash',
      provider: null,
      currency: 'GHS',
      value: 40,
      paid_at: now,
      created_by: ctx.employee.id,
      created_at: now,
      updated_at: now,
    });
  });

  describe('auth', () => {
    it('denies employee and admin on transactions and summary', async () => {
      const txEmp = await request(app)
        .get('/api/reports/transactions/')
        .set(tokens.employee.headers);
      expect(txEmp.status).toBe(403);

      const txAdmin = await request(app)
        .get('/api/reports/transactions/')
        .set(tokens.admin.headers);
      expect(txAdmin.status).toBe(403);

      const sumEmp = await request(app)
        .get('/api/reports/summary/?period=yearly&year=2026')
        .set(tokens.employee.headers);
      expect(sumEmp.status).toBe(403);

      const sumAdmin = await request(app)
        .get('/api/reports/summary/?period=yearly&year=2026')
        .set(tokens.admin.headers);
      expect(sumAdmin.status).toBe(403);
    });
  });

  describe('GET /api/reports/transactions/', () => {
    it('superadmin lists transactions including cash', async () => {
      const res = await request(app)
        .get('/api/reports/transactions/?payment_method=cash&status=paid')
        .set(tokens.superadmin.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThan(0);
      const row = res.body.data.results.find((r) => r.order_id === order.id);
      expect(row).toBeTruthy();
      expect(row.payment_method).toBe('cash');
      expect(row.order_number).toBe(order.order_number);
      expect(row.customer_id).toBe(ctx.customer.id);
    });

    it('superadmin can download CSV', async () => {
      const res = await request(app)
        .get('/api/reports/transactions/?format=csv&payment_method=cash')
        .set(tokens.superadmin.headers);
      expect(res.status).toBe(200);
      expect(String(res.headers['content-type'])).toMatch(/text\/csv/);
      expect(String(res.headers['content-disposition'])).toMatch(/attachment/);
      expect(res.text).toMatch(/externalref/);
      expect(res.text).toMatch(/cash/);
    });
  });

  describe('GET /api/reports/summary/', () => {
    it('superadmin gets monthly summary with metrics', async () => {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;
      const res = await request(app)
        .get(`/api/reports/summary/?period=monthly&year=${year}&month=${month}`)
        .set(tokens.superadmin.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.period.mode).toBe('monthly');
      expect(res.body.data).toHaveProperty('new_customers');
      expect(res.body.data).toHaveProperty('revenue');
      expect(res.body.data).toHaveProperty('revenue_by_method');
      expect(res.body.data.revenue_by_method).toHaveProperty('cash');
      expect(res.body.data).toHaveProperty('owed');
      expect(res.body.data).toHaveProperty('transaction_count');
      expect(parseFloat(res.body.data.revenue)).toBeGreaterThanOrEqual(40);
    });

    it('superadmin can download summary CSV', async () => {
      const res = await request(app)
        .get('/api/reports/summary/?period=yearly&year=2026&format=csv')
        .set(tokens.superadmin.headers);
      expect(res.status).toBe(200);
      expect(String(res.headers['content-type'])).toMatch(/text\/csv/);
      expect(String(res.headers['content-disposition'])).toMatch(/report-2026\.csv/);
      expect(res.text).toMatch(/new_customers/);
      expect(res.text).toMatch(/revenue/);
      expect(res.text).toMatch(/owed/);
    });
  });
});
