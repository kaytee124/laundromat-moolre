const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService } = require('../helpers/fixtures');
const { User, Order } = require('../../models');

describe('Security: Mass assignment', () => {
  let tokens;
  let ctx;
  let service;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    service = await createService(ctx.admin);
  });

  it('client cannot escalate via self PATCH role fields', async () => {
    await request(app)
      .patch('/api/accounts/client/update/')
      .set(tokens.client.headers)
      .send({
        role: 'admin',
        is_staff: true,
        is_superuser: true,
        password_hash: 'fakehash',
      });

    const user = await User.findByPk(ctx.client.id);
    expect(user.role).toBe('client');
    expect(user.is_staff).toBe(false);
    expect(user.is_superuser).toBe(false);
  });

  it('documents payment_status injection on order create', async () => {
    const res = await request(app)
      .post('/api/orders/create/')
      .set(tokens.employee.headers)
      .send({
        customer_id: ctx.customer.id,
        payment_status: 'paid',
        order_items_data: [{ service_id: service.id, quantity: 1, unit_price: service.price }],
      });

    expect(res.status).toBe(201);
    const order = await Order.findByPk(res.body.data.id);
    expect(order.payment_status).toBe('paid');
  });

  it('admin cannot create service with negative price', async () => {
    const res = await request(app)
      .post('/api/services/create/')
      .set(tokens.admin.headers)
      .send({
        name: `Negative Price ${Date.now()}`,
        description: 'Test',
        price: -100,
        unit: 'per item',
        category: 'wash',
        estimated_days: 1,
      });

    expect(res.status).toBe(422);
  });

  it('superadmin cannot demote client to employee', async () => {
    const res = await request(app)
      .patch(`/api/accounts/superadmin/client/${ctx.client.id}/update/`)
      .set(tokens.superadmin.headers)
      .send({ role: 'employee' });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });

  it('client cannot set payment_status via order update', async () => {
    const createRes = await request(app)
      .post('/api/orders/create/')
      .set(tokens.employee.headers)
      .send({
        customer_id: ctx.customer.id,
        order_items_data: [{ service_id: service.id, quantity: 1, unit_price: service.price }],
      });
    const orderId = createRes.body.data.id;

    const res = await request(app)
      .put(`/api/orders/${orderId}/update/`)
      .set(tokens.employee.headers)
      .send({ payment_status: 'paid', amount_paid: 9999 });

    expect(res.status).toBe(200);
    const order = await Order.findByPk(orderId);
    expect(parseFloat(order.amount_paid)).not.toBe(9999);
  });
});
