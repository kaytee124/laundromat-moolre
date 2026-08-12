const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');

describe('Dashboard API', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  describe('GET /api/dashboard/metrics/', () => {
    it('returns superadmin metrics', async () => {
      const res = await request(app)
        .get('/api/dashboard/metrics/')
        .set(tokens.superadmin.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.total_customers).toBeDefined();
    });

    it('returns admin metrics', async () => {
      const res = await request(app)
        .get('/api/dashboard/metrics/')
        .set(tokens.admin.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.total_orders).toBeDefined();
    });

    it('returns employee metrics', async () => {
      const res = await request(app)
        .get('/api/dashboard/metrics/')
        .set(tokens.employee.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.my_orders).toBeDefined();
    });

    it('employee my_revenue uses amount_paid not total_amount', async () => {
      const before = await request(app)
        .get('/api/dashboard/metrics/')
        .set(tokens.employee.headers);
      expect(before.status).toBe(200);
      const revenueBefore = parseFloat(before.body.data.my_revenue);

      const service = await createService(ctx.employee);
      await createOrder(ctx.employee, ctx.customer, service, {
        assigned_to: ctx.employee.id,
        quantity: 4,
        unit_price: 25,
        amount_paid: 30,
        payment_status: 'partially_paid',
      });

      const after = await request(app)
        .get('/api/dashboard/metrics/')
        .set(tokens.employee.headers);
      expect(after.status).toBe(200);
      const revenueAfter = parseFloat(after.body.data.my_revenue);
      // paid portion only (+30), not full order total (100)
      expect(revenueAfter).toBeCloseTo(revenueBefore + 30, 2);
      expect(revenueAfter).not.toBeCloseTo(revenueBefore + 100, 2);
    });

    it('returns client metrics', async () => {
      const res = await request(app)
        .get('/api/dashboard/metrics/')
        .set(tokens.client.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.total_orders).toBeDefined();
    });
  });

  describe('GET /api/dashboard/revenue-report/', () => {
    it('admin gets revenue report', async () => {
      const res = await request(app)
        .get('/api/dashboard/revenue-report/?start_date=2025-01-01&end_date=2025-12-31&group_by=day')
        .set(tokens.admin.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.summary).toBeDefined();
    });

    it('rejects missing dates', async () => {
      const res = await request(app)
        .get('/api/dashboard/revenue-report/')
        .set(tokens.admin.headers);
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('MISSING_DATES');
    });

    it('rejects invalid date range', async () => {
      const res = await request(app)
        .get('/api/dashboard/revenue-report/?start_date=2025-12-31&end_date=2025-01-01')
        .set(tokens.admin.headers);
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('INVALID_DATE_RANGE');
    });

    it('denies client', async () => {
      const res = await request(app)
        .get('/api/dashboard/revenue-report/?start_date=2025-01-01&end_date=2025-12-31')
        .set(tokens.client.headers);
      expect(res.status).toBe(403);
    });
  });
});
