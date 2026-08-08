/**
 * Remove accidental seedSampleOrders() burst at 2026-08-07 21:56:32
 * (SEED_ORDER_SHEET marker, identical ₵86 sample lines for every client).
 *
 * Usage: node scripts/removeSeedOrders956.js
 */
require('dotenv').config();

const { Op } = require('sequelize');
const {
  Order,
  OrderItem,
  OrderService,
  OrderStatusHistory,
  Payment,
  SmsOutbox,
  sequelize,
} = require('../models');
const { SEED_MARKER } = require('../lib/seedSampleOrders');

async function main() {
  const orders = await Order.findAll({
    where: {
      special_instructions: SEED_MARKER,
      created_at: {
        [Op.gte]: new Date('2026-08-07T21:56:00.000Z'),
        [Op.lt]: new Date('2026-08-07T21:57:00.000Z'),
      },
    },
    attributes: ['id', 'order_number', 'customer_id', 'total_amount', 'created_at'],
    order: [['id', 'ASC']],
  });

  if (!orders.length) {
    console.log(JSON.stringify({ event: 'remove_seed_956', status: 'nothing_to_delete' }));
    return;
  }

  const orderIds = orders.map((o) => o.id);

  await sequelize.transaction(async (t) => {
    await Payment.destroy({ where: { order_id: { [Op.in]: orderIds } }, transaction: t });
    await OrderStatusHistory.destroy({
      where: { order_id: { [Op.in]: orderIds } },
      transaction: t,
    });
    await OrderItem.destroy({ where: { order_id: { [Op.in]: orderIds } }, transaction: t });
    await OrderService.destroy({ where: { order_id: { [Op.in]: orderIds } }, transaction: t });
    await SmsOutbox.destroy({
      where: { related_type: 'order', related_id: { [Op.in]: orderIds } },
      transaction: t,
    });
    await Order.destroy({ where: { id: { [Op.in]: orderIds } }, transaction: t });
  });

  console.log(
    JSON.stringify(
      {
        event: 'remove_seed_956_done',
        deleted_count: orderIds.length,
        deleted_orders: orders.map((o) => ({
          id: o.id,
          order_number: o.order_number,
          customer_id: o.customer_id,
          total_amount: o.total_amount,
          created_at: o.created_at,
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
