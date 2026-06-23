const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { User } = require('../../models');

describe('Security: IDOR matrix', () => {
  let tokens;
  let ctx;
  let client2Order;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    const service = await createService(ctx.admin);
    client2Order = await createOrder(ctx.employee, ctx.customer2, service);
  });

  it('client cannot PATCH another client order', async () => {
    const res = await request(app)
      .put(`/api/orders/${client2Order.id}/update/`)
      .set(tokens.client.headers)
      .send({ order_status: 'completed' });
    expect(res.status).toBe(403);
  });

  it('employee cannot fetch superadmin user detail', async () => {
    const res = await request(app)
      .get(`/api/accounts/superadmin/user/${ctx.client.id}/`)
      .set(tokens.employee.headers);
    expect(res.status).toBe(403);
  });

  it('admin cannot update another admin via employee route', async () => {
    const res = await request(app)
      .patch(`/api/accounts/admin/employee/${ctx.admin.id}/update/`)
      .set(tokens.admin.headers)
      .send({ first_name: 'Hacked' });
    expect(res.status).toBe(404);
  });

  it('client cannot list all clients', async () => {
    const res = await request(app)
      .get('/api/accounts/clients/')
      .set(tokens.client.headers);
    expect(res.status).toBe(403);
  });

  it('client2 cannot view client1 profile via staff lookup', async () => {
    const res = await request(app)
      .get(`/api/accounts/staff/user/${ctx.client.id}/`)
      .set(tokens.client2.headers);
    expect(res.status).toBe(403);
  });
});
