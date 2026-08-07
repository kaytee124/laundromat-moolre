/**
 * Remove Fatoumata Waggeh test accounts (staff + client) and their orders/payments.
 * Usage: node scripts/removeFatoumataWaggeh.js
 */
require('dotenv').config();

const { Op } = require('sequelize');
const {
  User,
  Customer,
  Order,
  OrderItem,
  OrderService,
  OrderStatusHistory,
  Payment,
  WelcomeLoginToken,
  RefreshToken,
  sequelize,
} = require('../models');

async function main() {
  const users = await User.findAll({
    where: {
      [Op.or]: [
        { first_name: { [Op.like]: '%Fatoumata%' }, last_name: { [Op.like]: '%Waggeh%' } },
        { username: { [Op.in]: ['waggeh', 'alfa'] } },
      ],
    },
    include: [{ model: Customer, as: 'customer_profile' }],
  });

  if (!users.length) {
    console.log(JSON.stringify({ event: 'fatoumata_cleanup', status: 'nothing_to_delete' }));
    return;
  }

  const userIds = users.map((u) => u.id);
  const customerIds = users
    .map((u) => u.customer_profile?.id)
    .filter(Boolean);

  const orders = customerIds.length
    ? await Order.findAll({ where: { customer_id: { [Op.in]: customerIds } }, attributes: ['id'] })
    : [];
  const orderIds = orders.map((o) => o.id);

  await sequelize.transaction(async (t) => {
    if (orderIds.length) {
      await Payment.destroy({ where: { order_id: { [Op.in]: orderIds } }, transaction: t });
      await OrderStatusHistory.destroy({ where: { order_id: { [Op.in]: orderIds } }, transaction: t });
      await OrderItem.destroy({ where: { order_id: { [Op.in]: orderIds } }, transaction: t });
      await OrderService.destroy({ where: { order_id: { [Op.in]: orderIds } }, transaction: t });
      await Order.destroy({ where: { id: { [Op.in]: orderIds } }, transaction: t });
    }

    await WelcomeLoginToken.destroy({ where: { user_id: { [Op.in]: userIds } }, transaction: t });
    await RefreshToken.destroy({ where: { user_id: { [Op.in]: userIds } }, transaction: t });

    if (customerIds.length) {
      await Customer.destroy({ where: { id: { [Op.in]: customerIds } }, transaction: t });
    }

    await User.destroy({ where: { id: { [Op.in]: userIds } }, transaction: t });
  });

  console.log(
    JSON.stringify(
      {
        event: 'fatoumata_cleanup_done',
        deleted_users: users.map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role,
        })),
        deleted_customer_ids: customerIds,
        deleted_order_ids: orderIds,
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
