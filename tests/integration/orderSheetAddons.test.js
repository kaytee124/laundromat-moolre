const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService } = require('../helpers/fixtures');

describe('Order sheet add-ons (SHIRTS + specialty items)', () => {
  let tokens;
  let ctx;
  let service;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    service = await createService(ctx.admin, { name: 'Wash Addons QA' });
  });

  it('creates, lists, details, and updates SHIRTS + KENTE CLOTH with correct balance', async () => {
    const createRes = await request(app)
      .post('/api/orders/create/')
      .set(tokens.employee.headers)
      .send({
        customer_id: ctx.customer.id,
        service_ids: [service.id],
        discount_amount: 5,
        order_items_data: [
          {
            item_name: 'SHIRTS',
            dirty_quantity: 3,
            clean_quantity: 0,
            unit_price: 10,
            notes: '',
          },
          {
            item_name: 'KENTE CLOTH',
            dirty_quantity: 1,
            clean_quantity: 0,
            unit_price: 40,
            notes: 'handle with care',
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const created = createRes.body.data;
    expect(created.total_amount).toBe('65.00');
    expect(created.balance).toBe('65.00');
    const names = created.order_items.map((i) => i.item_name).sort();
    expect(names).toEqual(['KENTE CLOTH', 'SHIRTS']);

    const listRes = await request(app)
      .get('/api/orders/list/')
      .set(tokens.employee.headers);
    expect(listRes.status).toBe(200);
    const listed = listRes.body.data.results.find((o) => o.id === created.id);
    expect(listed).toBeTruthy();
    expect(listed.order_items.map((i) => i.item_name).sort()).toEqual(['KENTE CLOTH', 'SHIRTS']);

    const detailRes = await request(app)
      .get(`/api/orders/${created.id}/`)
      .set(tokens.employee.headers);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.order_items.map((i) => i.item_name).sort()).toEqual([
      'KENTE CLOTH',
      'SHIRTS',
    ]);
    expect(detailRes.body.data.balance).toBe('65.00');

    const updateRes = await request(app)
      .put(`/api/orders/${created.id}/update/`)
      .set(tokens.employee.headers)
      .send({
        order_items_data: [
          {
            item_name: 'SHIRTS',
            dirty_quantity: 4,
            clean_quantity: 1,
            unit_price: 10,
            notes: '',
          },
          {
            item_name: 'KENTE CLOTH',
            dirty_quantity: 1,
            clean_quantity: 0,
            unit_price: 40,
            notes: 'handle with care',
          },
          {
            item_name: 'SMOCK',
            dirty_quantity: 1,
            clean_quantity: 0,
            unit_price: 25,
            notes: '',
          },
        ],
        discount_amount: 5,
      });

    expect(updateRes.status).toBe(200);
    // (4+1)*10 + 40 + 25 - 5 = 110
    expect(updateRes.body.data.total_amount).toBe('110.00');
    expect(updateRes.body.data.balance).toBe('110.00');
    expect(updateRes.body.data.order_items.map((i) => i.item_name).sort()).toEqual([
      'KENTE CLOTH',
      'SHIRTS',
      'SMOCK',
    ]);
  });
});
