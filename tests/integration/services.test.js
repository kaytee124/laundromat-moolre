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
    it('is public and returns slim service shape', async () => {
      const res = await request(app).get('/api/services/list/');
      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThan(0);
      expect(res.body.data.count).toBeGreaterThan(0);
      const row = res.body.data.results[0];
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('description');
      expect(row).toHaveProperty('category');
      expect(['active', 'inactive']).toContain(row.status);
      expect(row.price).toBeUndefined();
      expect(row.unit).toBeUndefined();
      expect(row.estimated_days).toBeUndefined();
      expect(row.is_active).toBeUndefined();
    });

    it('filters by category', async () => {
      const res = await request(app).get('/api/services/list/?category=wash');
      expect(res.status).toBe(200);
      expect(res.body.data.results).toBeDefined();
    });
  });

  describe('POST /api/services/create/', () => {
    it('admin creates service without price', async () => {
      const res = await request(app)
        .post('/api/services/create/')
        .set(tokens.admin.headers)
        .send({
          name: `Unique Service ${Date.now()}`,
          description: 'Desc',
          category: 'dry',
          status: 'active',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.price).toBeUndefined();
    });

    it('rejects duplicate name', async () => {
      const res = await request(app)
        .post('/api/services/create/')
        .set(tokens.admin.headers)
        .send({
          name: service.name,
          description: 'Dup',
          category: 'wash',
        });
      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('SERVICE_EXISTS');
    });

    it('rejects missing name', async () => {
      const res = await request(app)
        .post('/api/services/create/')
        .set(tokens.admin.headers)
        .send({
          description: 'Bad',
          category: 'wash',
        });
      expect(res.status).toBe(400);
    });

    it('denies client', async () => {
      const res = await request(app)
        .post('/api/services/create/')
        .set(tokens.client.headers)
        .send({ name: 'X', category: 'wash' });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/services/:id/', () => {
    it('admin gets service detail', async () => {
      const res = await request(app)
        .get(`/api/services/${service.id}/`)
        .set(tokens.admin.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBeDefined();
      expect(res.body.data.price).toBeUndefined();
    });
  });

  describe('PATCH /api/services/:id/update/', () => {
    it('admin updates service', async () => {
      const res = await request(app)
        .patch(`/api/services/${service.id}/update/`)
        .set(tokens.admin.headers)
        .send({ description: 'Updated desc', status: 'inactive' });
      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Updated desc');
      expect(res.body.data.status).toBe('inactive');
    });
  });
});
