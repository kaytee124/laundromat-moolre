const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { Order } = require('../../models');

describe('Orders API', () => {
  let tokens;
  let ctx;
  let service;
  let order;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    service = await createService(ctx.admin);
    order = await createOrder(ctx.employee, ctx.customer, service);
  });

  describe('GET /api/orders/list/', () => {
    it('staff sees orders with sheet fields', async () => {
      const res = await request(app)
        .get('/api/orders/list/')
        .set(tokens.employee.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThan(0);
      expect(res.body.data.count).toBeGreaterThan(0);
      expect(res.body.data.page).toBe(1);
      const row = res.body.data.results.find((o) => o.id === order.id) || res.body.data.results[0];
      expect(Array.isArray(row.service_ids)).toBe(true);
      expect(Array.isArray(row.services)).toBe(true);
      if (row.services.length) {
        expect(row.services[0]).toHaveProperty('status');
        expect(row.services[0]).toHaveProperty('category');
        expect(row.services[0].price).toBeUndefined();
      }
      expect(row.order_items[0].quantity).toBeUndefined();
      expect(row.order_items[0].service_id).toBeUndefined();
      expect(row.order_items[0]).toHaveProperty('dirty_quantity');
      expect(row).toHaveProperty('picked_up');
      expect(row).toHaveProperty('delivery_time');
    });

    it('client sees only own orders', async () => {
      const res = await request(app)
        .get('/api/orders/list/')
        .set(tokens.client.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.results.every((o) => o.customer_id === ctx.customer.id)).toBe(true);
    });

    it('supports order_status filter and pagination', async () => {
      const res = await request(app)
        .get('/api/orders/list/?order_status=pending&page=1&page_size=10')
        .set(tokens.employee.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.page_size).toBe(10);
      expect(res.body.data.results.every((o) => o.order_status === 'pending')).toBe(true);
    });
  });

  describe('POST /api/orders/create/', () => {
    it('employee creates order with services and dirty/clean items', async () => {
      const service2 = await createService(ctx.admin, { name: 'Ironing Only', price: 10 });
      const res = await request(app)
        .post('/api/orders/create/')
        .set(tokens.employee.headers)
        .send({
          customer_id: ctx.customer.id,
          service_ids: [service.id, service2.id],
          discount_amount: 5,
          delivery_date: '2026-07-22',
          delivery_time: '14:30',
          order_items_data: [
            {
              item_name: 'TOPS',
              dirty_quantity: 5,
              clean_quantity: 0,
              unit_price: 12.5,
              notes: '',
            },
            {
              item_name: 'BOTTOMS',
              dirty_quantity: 0,
              clean_quantity: 4,
              unit_price: 8,
              notes: 'press only',
            },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.order_items.length).toBe(2);
      expect(res.body.data.service_ids).toEqual(expect.arrayContaining([service.id, service2.id]));
      expect(res.body.data.services.length).toBe(2);
      // (5*12.5) + (4*8) - 5 = 62.5 + 32 - 5 = 89.5
      expect(parseFloat(res.body.data.total_amount)).toBe(89.5);
      expect(parseFloat(res.body.data.amount_paid)).toBe(0);
      expect(parseFloat(res.body.data.balance)).toBe(89.5);
      expect(res.body.data.order_items[0].dirty_quantity).toBeDefined();
      expect(res.body.data.delivery_time).toBeTruthy();
      expect(res.body.data.picked_up).toBe(false);
    });

    it('denies client', async () => {
      const res = await request(app)
        .post('/api/orders/create/')
        .set(tokens.client.headers)
        .send({
          customer_id: ctx.customer.id,
          service_ids: [service.id],
          order_items_data: [{ item_name: 'TOPS', dirty_quantity: 1, clean_quantity: 0, unit_price: 10 }],
        });
      expect(res.status).toBe(403);
    });

    it('rejects order without items', async () => {
      const res = await request(app)
        .post('/api/orders/create/')
        .set(tokens.employee.headers)
        .send({ customer_id: ctx.customer.id, service_ids: [service.id], order_items_data: [] });
      expect(res.status).toBe(400);
    });

    it('rejects order without services', async () => {
      const res = await request(app)
        .post('/api/orders/create/')
        .set(tokens.employee.headers)
        .send({
          customer_id: ctx.customer.id,
          service_ids: [],
          order_items_data: [{ item_name: 'TOPS', dirty_quantity: 1, clean_quantity: 0, unit_price: 10 }],
        });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/orders/:id/', () => {
    it('client can view own order with slim services and item sheet fields', async () => {
      const res = await request(app)
        .get(`/api/orders/${order.id}/`)
        .set(tokens.client.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.service_ids).toBeDefined();
      expect(res.body.data.services[0]).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        status: expect.stringMatching(/active|inactive/),
      });
      expect(res.body.data.services[0].price).toBeUndefined();
      expect(res.body.data.order_items[0].quantity).toBeUndefined();
      expect(res.body.data.order_items[0].service_id).toBeUndefined();
      expect(res.body.data.order_items[0].description).toBeUndefined();
      expect(res.body.data.order_items[0]).toHaveProperty('dirty_quantity');
      expect(res.body.data.order_items[0]).toHaveProperty('clean_quantity');
      expect(res.body.data.order_items[0]).toHaveProperty('notes');
    });
  });

  describe('PUT /api/orders/:id/update/', () => {
    it('staff updates order status', async () => {
      const res = await request(app)
        .put(`/api/orders/${order.id}/update/`)
        .set(tokens.employee.headers)
        .send({ order_status: 'in_progress' });
      expect(res.status).toBe(200);
    });

    it('replaces services and items and recalculates total', async () => {
      const target = await createOrder(ctx.employee, ctx.customer, service);
      const res = await request(app)
        .put(`/api/orders/${target.id}/update/`)
        .set(tokens.employee.headers)
        .send({
          service_ids: [service.id],
          discount_amount: 2,
          order_items_data: [
            { item_name: 'SOCKS', dirty_quantity: 2, clean_quantity: 1, unit_price: 5, notes: 'mix' },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.data.order_items).toHaveLength(1);
      expect(res.body.data.order_items[0].item_name).toBe('SOCKS');
      // (2+1)*5 - 2 = 13
      expect(parseFloat(res.body.data.total_amount)).toBe(13);
    });

    it('sets picked_up_at when marked picked up', async () => {
      const target = await createOrder(ctx.employee, ctx.customer, service);
      const res = await request(app)
        .put(`/api/orders/${target.id}/update/`)
        .set(tokens.employee.headers)
        .send({ picked_up: true });
      expect(res.status).toBe(200);
      expect(res.body.data.picked_up).toBe(true);
      expect(res.body.data.picked_up_at).toBeTruthy();
    });

    it('ignores amount_paid in update body', async () => {
      const before = await Order.findByPk(order.id);
      const res = await request(app)
        .put(`/api/orders/${order.id}/update/`)
        .set(tokens.employee.headers)
        .send({ amount_paid: 9999, order_status: 'ready' });
      expect(res.status).toBe(200);
      const after = await Order.findByPk(order.id);
      expect(parseFloat(after.amount_paid)).toBe(parseFloat(before.amount_paid));
    });

    it('denies client update', async () => {
      const res = await request(app)
        .put(`/api/orders/${order.id}/update/`)
        .set(tokens.client.headers)
        .send({ order_status: 'completed' });
      expect(res.status).toBe(403);
    });
  });
});
