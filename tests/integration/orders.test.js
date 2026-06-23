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
    it('staff sees orders', async () => {
      const res = await request(app)
        .get('/api/orders/list/')
        .set(tokens.employee.headers);
      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThan(0);
      expect(res.body.data.count).toBeGreaterThan(0);
      expect(res.body.data.page).toBe(1);
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
    it('employee creates order with items', async () => {
      const res = await request(app)
        .post('/api/orders/create/')
        .set(tokens.employee.headers)
        .send({
          customer_id: ctx.customer.id,
          order_items_data: [
            { service_id: service.id, quantity: 1, unit_price: service.price },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.order_items.length).toBe(1);
    });

    it('denies client', async () => {
      const res = await request(app)
        .post('/api/orders/create/')
        .set(tokens.client.headers)
        .send({
          customer_id: ctx.customer.id,
          order_items_data: [{ service_id: service.id, quantity: 1 }],
        });
      expect(res.status).toBe(403);
    });

    it('rejects order without items', async () => {
      const res = await request(app)
        .post('/api/orders/create/')
        .set(tokens.employee.headers)
        .send({ customer_id: ctx.customer.id, order_items_data: [] });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/orders/:id/', () => {
    it('client can view own order', async () => {
      const res = await request(app)
        .get(`/api/orders/${order.id}/`)
        .set(tokens.client.headers);
      expect(res.status).toBe(200);
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
