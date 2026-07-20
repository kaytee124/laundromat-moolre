const { v4: uuidv4 } = require('uuid');
const { Order, OrderItem, OrderService } = require('../../models');
const { createService } = require('../helpers/fixtures');
const { backfillOrderSheet } = require('../../lib/backfillOrderSheet');
const { seedSampleOrders, SEED_MARKER } = require('../../lib/seedSampleOrders');

describe('order sheet startup seed', () => {
  let ctx;
  let service;

  beforeAll(async () => {
    ctx = global.testContext;
    service = await createService(ctx.admin);
  });

  it('backfillOrderSheet attaches order_services to legacy orders', async () => {
    const order = await Order.create({
      order_number: `ORD-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      customer_id: ctx.customer.id,
      assigned_to: ctx.employee.id,
      order_status: 'pending',
      payment_status: 'pending',
      total_amount: 20,
      amount_paid: 0,
      discount_amount: 0,
      special_instructions: null,
      created_by: ctx.employee.id,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await OrderItem.create({
      order_id: order.id,
      service_id: service.id,
      item_name: '   ',
      description: null,
      dirty_quantity: 2,
      clean_quantity: 0,
      unit_price: 10,
      subtotal: 20,
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const before = await OrderService.count({ where: { order_id: order.id } });
    expect(before).toBe(0);

    const result = await backfillOrderSheet();
    expect(result.updated).toBeGreaterThanOrEqual(1);

    const services = await OrderService.findAll({ where: { order_id: order.id } });
    expect(services.length).toBe(1);
    expect(services[0].service_id).toBe(service.id);

    const item = await OrderItem.findOne({ where: { order_id: order.id } });
    expect(item.item_name).toBe('OTHERS');
  });

  it('seedSampleOrders is idempotent', async () => {
    const first = await seedSampleOrders();
    expect(first.created).toBeGreaterThanOrEqual(1);

    const seedCountAfterFirst = await Order.count({
      where: { special_instructions: SEED_MARKER },
    });
    expect(seedCountAfterFirst).toBeGreaterThanOrEqual(1);

    const second = await seedSampleOrders();
    expect(second.created).toBe(0);

    const seedCountAfterSecond = await Order.count({
      where: { special_instructions: SEED_MARKER },
    });
    expect(seedCountAfterSecond).toBe(seedCountAfterFirst);
  });
});
