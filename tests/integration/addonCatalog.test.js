const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService } = require('../helpers/fixtures');
const { AddonCatalogItem } = require('../../models');

describe('Addon catalog API', () => {
  let tokens;
  let ctx;
  let service;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    service = await createService(ctx.admin, { name: 'Wash Addon Catalog QA' });
  });

  describe('GET /api/addon-catalog/list/', () => {
    it('employee can list active seeded add-ons', async () => {
      const res = await request(app)
        .get('/api/addon-catalog/list/')
        .set(tokens.employee.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBeGreaterThan(0);
      expect(res.body.data.results.every((r) => r.is_active === true)).toBe(true);
      const names = res.body.data.results.map((r) => r.name);
      expect(names).toContain('SINGLETS');
      expect(names).toContain('KENTE CLOTH');
    });

    it('denies client', async () => {
      const res = await request(app)
        .get('/api/addon-catalog/list/')
        .set(tokens.client.headers);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/addon-catalog/create/', () => {
    it('admin creates add-on', async () => {
      const name = `HEADSCARF ${Date.now()}`;
      const res = await request(app)
        .post('/api/addon-catalog/create/')
        .set(tokens.admin.headers)
        .send({ name, category: 'Garments', sort_order: 200 });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe(name);
      expect(res.body.data.is_active).toBe(true);
      expect(res.body.data.category).toBe('Garments');
    });

    it('rejects duplicate name with 409', async () => {
      const res = await request(app)
        .post('/api/addon-catalog/create/')
        .set(tokens.admin.headers)
        .send({ name: 'SINGLETS', category: 'Undergarments' });
      expect(res.status).toBe(409);
      expect(res.body.error_code).toBe('ADDON_EXISTS');
    });

    it('employee cannot create', async () => {
      const res = await request(app)
        .post('/api/addon-catalog/create/')
        .set(tokens.employee.headers)
        .send({ name: `EMP ADDON ${Date.now()}` });
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH + DELETE soft-delete', () => {
    it('soft-delete hides from default list; include_inactive shows it; order create still accepts name', async () => {
      const name = `TEMP ADDON ${Date.now()}`;
      const createRes = await request(app)
        .post('/api/addon-catalog/create/')
        .set(tokens.admin.headers)
        .send({ name, category: 'Specialty', sort_order: 999 });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.id;

      const delRes = await request(app)
        .delete(`/api/addon-catalog/${id}/`)
        .set(tokens.admin.headers);
      expect(delRes.status).toBe(200);
      expect(delRes.body.data.is_active).toBe(false);

      const listActive = await request(app)
        .get('/api/addon-catalog/list/')
        .set(tokens.employee.headers);
      expect(listActive.status).toBe(200);
      expect(listActive.body.data.results.map((r) => r.name)).not.toContain(name);

      const listAll = await request(app)
        .get('/api/addon-catalog/list/?include_inactive=1')
        .set(tokens.admin.headers);
      expect(listAll.status).toBe(200);
      expect(listAll.body.data.results.map((r) => r.name)).toContain(name);

      const orderRes = await request(app)
        .post('/api/orders/create/')
        .set(tokens.employee.headers)
        .send({
          customer_id: ctx.customer.id,
          service_ids: [service.id],
          order_items_data: [
            {
              item_name: 'SHIRTS',
              dirty_quantity: 1,
              clean_quantity: 0,
              unit_price: 10,
              notes: '',
            },
            {
              item_name: name,
              dirty_quantity: 1,
              clean_quantity: 0,
              unit_price: 15,
              notes: '',
            },
          ],
        });
      expect(orderRes.status).toBe(201);
      expect(orderRes.body.data.order_items.map((i) => i.item_name).sort()).toEqual(
        [name, 'SHIRTS'].sort()
      );
    });

    it('admin can rename and reorder', async () => {
      const item = await AddonCatalogItem.findOne({ where: { name: 'BOXERS' } });
      expect(item).toBeTruthy();
      const res = await request(app)
        .patch(`/api/addon-catalog/${item.id}/`)
        .set(tokens.admin.headers)
        .send({ sort_order: 25, category: 'Undergarments' });
      expect(res.status).toBe(200);
      expect(res.body.data.sort_order).toBe(25);
      expect(res.body.data.name).toBe('BOXERS');
    });
  });
});
