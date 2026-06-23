const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService } = require('../helpers/fixtures');

describe('Services API', () => {
  let tokens;
  let ctx;
  let service;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    service = await createService(ctx.admin);
  });

  describe('GET /api/services/list/', () => {
    it('is public', async () => {
      const res = await request(app).get('/api/services/list/');
      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThan(0);
      expect(res.body.data.count).toBeGreaterThan(0);
    });

    it('filters by category', async () => {
      const res = await request(app).get('/api/services/list/?category=wash');
      expect(res.status).toBe(200);
      expect(res.body.data.results).toBeDefined();
    });
  });

  describe('POST /api/services/create/', () => {
    it('admin creates service', async () => {
      const res = await request(app)
        .post('/api/services/create/')
        .set(tokens.admin.headers)
        .send({
          name: `Unique Service ${Date.now()}`,
          description: 'Desc',
          price: 15.5,
          unit: 'per kg',
          category: 'dry',
          estimated_days: 1,
        });
      expect(res.status).toBe(201);
    });

    it('rejects duplicate name', async () => {
      const res = await request(app)
        .post('/api/services/create/')
        .set(tokens.admin.headers)
        .send({
          name: service.name,
          description: 'Dup',
          price: 10,
        });
      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('SERVICE_EXISTS');
    });

    it('rejects invalid price', async () => {
      const res = await request(app)
        .post('/api/services/create/')
        .set(tokens.admin.headers)
        .send({
          name: `Bad Price ${Date.now()}`,
          description: 'Bad',
          price: 0,
        });
      expect(res.status).toBe(422);
    });

    it('denies client', async () => {
      const res = await request(app)
        .post('/api/services/create/')
        .set(tokens.client.headers)
        .send({ name: 'X', price: 5 });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/services/:id/', () => {
    it('admin gets service detail', async () => {
      const res = await request(app)
        .get(`/api/services/${service.id}/`)
        .set(tokens.admin.headers);
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/services/:id/update/', () => {
    it('admin updates service', async () => {
      const res = await request(app)
        .patch(`/api/services/${service.id}/update/`)
        .set(tokens.admin.headers)
        .send({ description: 'Updated desc' });
      expect(res.status).toBe(200);
    });
  });
});
