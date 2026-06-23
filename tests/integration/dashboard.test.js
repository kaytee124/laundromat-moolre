const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');

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
