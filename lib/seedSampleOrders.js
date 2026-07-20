const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const {
  User,
  Customer,
  Service,
  Order,
  OrderItem,
  OrderService,
  sequelize,
} = require('../models');
const { recalculateOrderTotal } = require('../services/orderService');

const SEED_MARKER = 'SEED_ORDER_SHEET';

function generateOrderNumber() {
  return `ORD-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function dateOnlyOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function customerHasSeedOrder(customerId) {
  const existing = await Order.findOne({
    where: {
      customer_id: customerId,
      special_instructions: SEED_MARKER,
    },
    include: [
      {
        model: OrderService,
        as: 'order_services',
        required: true,
        attributes: ['id'],
      },
      {
        model: OrderItem,
        as: 'order_items',
        required: true,
        attributes: ['id', 'dirty_quantity', 'clean_quantity'],
        where: {
          [Op.or]: [
            { dirty_quantity: { [Op.gt]: 0 } },
            { clean_quantity: { [Op.gt]: 0 } },
          ],
        },
      },
    ],
  });
  return Boolean(existing);
}

async function seedSampleOrders() {
  const services = await Service.findAll({
    where: { is_active: true },
    order: [['id', 'ASC']],
    limit: 2,
  });

  if (!services.length) {
    console.log('sample_orders_seed: skipped (no active services)');
    return { created: 0, customers: 0 };
  }

  const serviceIds = services.map((s) => s.id);

  const staff =
    (await User.findOne({ where: { role: 'employee', is_active: true }, order: [['id', 'ASC']] })) ||
    (await User.findOne({
      where: { role: { [Op.in]: ['admin', 'superadmin'] }, is_active: true },
      order: [['id', 'ASC']],
    }));

  const customers = await Customer.findAll({
    include: [
      {
        model: User,
        as: 'user',
        required: true,
        where: { role: 'client', is_active: true },
        attributes: ['id', 'username'],
      },
    ],
  });

  let created = 0;
  const now = new Date();

  for (const customer of customers) {
    if (await customerHasSeedOrder(customer.id)) {
      continue;
    }

    await sequelize.transaction(async (t) => {
      const order = await Order.create(
        {
          order_number: generateOrderNumber(),
          customer_id: customer.id,
          assigned_to: staff?.id || null,
          order_status: 'pending',
          payment_status: 'pending',
          total_amount: 0,
          amount_paid: 0,
          discount_amount: 0,
          special_instructions: SEED_MARKER,
          delivery_date: dateOnlyOffset(2),
          delivery_time: '14:30:00',
          estimated_completion_date: dateOnlyOffset(1),
          picked_up: false,
          picked_up_at: null,
          created_by: staff?.id || null,
          created_at: now,
          updated_at: now,
        },
        { transaction: t }
      );

      for (const serviceId of serviceIds) {
        await OrderService.create(
          { order_id: order.id, service_id: serviceId },
          { transaction: t }
        );
      }

      const itemRows = [
        {
          item_name: 'TOPS',
          dirty_quantity: 3,
          clean_quantity: 0,
          unit_price: 10,
          subtotal: 30,
        },
        {
          item_name: 'BOTTOMS',
          dirty_quantity: 0,
          clean_quantity: 2,
          unit_price: 8,
          subtotal: 16,
        },
      ];

      for (const row of itemRows) {
        await OrderItem.create(
          {
            order_id: order.id,
            service_id: null,
            item_name: row.item_name,
            description: null,
            dirty_quantity: row.dirty_quantity,
            clean_quantity: row.clean_quantity,
            unit_price: row.unit_price,
            subtotal: row.subtotal,
            notes: '',
            created_at: now,
            updated_at: now,
          },
          { transaction: t }
        );
      }

      await recalculateOrderTotal(order.id, t);
    });

    created += 1;
  }

  console.log(`sample_orders_seed: created ${created} orders for ${customers.length} customers`);
  return { created, customers: customers.length };
}

module.exports = {
  seedSampleOrders,
  SEED_MARKER,
};
