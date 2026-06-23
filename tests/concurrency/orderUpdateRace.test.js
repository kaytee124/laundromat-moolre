const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, createOrder } = require('../helpers/fixtures');
const { Order } = require('../../models');

describe('Concurrency: order update races', () => {
  let tokens;
  let ctx;
  let order;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    const service = await createService(ctx.admin);
    order = await createOrder(ctx.employee, ctx.customer, service);
  });

  it('R01: parallel status updates do not 500', async () => {
    const statuses = ['pending', 'in_progress', 'ready', 'completed', 'cancelled'];
    const results = await Promise.allSettled(
      statuses.map((order_status) =>
        request(app)
          .put(`/api/orders/${order.id}/update/`)
          .set(tokens.admin.headers)
          .send({ order_status })
      )
    );
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 200);
    expect(ok.length).toBeGreaterThan(0);
    expect(results.every((r) => r.status !== 'fulfilled' || r.value.status < 500)).toBe(true);
    const refreshed = await Order.findByPk(order.id);
    expect(statuses).toContain(refreshed.order_status);
  });

  it('R02: parallel discount updates keep total_amount consistent', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((discount_amount) =>
        request(app)
          .put(`/api/orders/${order.id}/update/`)
          .set(tokens.admin.headers)
          .send({ discount_amount })
      )
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const refreshed = await Order.findByPk(order.id);
    expect(parseFloat(refreshed.total_amount)).toBeGreaterThanOrEqual(0);
  });
});
