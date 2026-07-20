const { Order, OrderItem, OrderService, Service, sequelize } = require('../models');
const { recalculateOrderTotal } = require('../services/orderService');

async function backfillOrderSheet() {
  const orders = await Order.findAll({
    attributes: ['id'],
    include: [
      {
        model: OrderItem,
        as: 'order_items',
        attributes: ['id', 'service_id', 'item_name', 'dirty_quantity', 'clean_quantity'],
      },
      {
        model: OrderService,
        as: 'order_services',
        attributes: ['id', 'service_id'],
      },
    ],
  });

  let fallbackService = null;
  async function getFallbackService() {
    if (fallbackService) return fallbackService;
    fallbackService = await Service.findOne({
      where: { is_active: true },
      order: [['id', 'ASC']],
    });
    if (!fallbackService) {
      fallbackService = await Service.findOne({ order: [['id', 'ASC']] });
    }
    return fallbackService;
  }

  let updated = 0;

  for (const order of orders) {
    let changed = false;

    await sequelize.transaction(async (t) => {
      const items = order.order_items || [];
      for (const item of items) {
        const patch = {};
        if (item.dirty_quantity == null) {
          patch.dirty_quantity = 0;
        }
        if (item.clean_quantity == null) {
          patch.clean_quantity = 0;
        }
        if (!item.item_name || !String(item.item_name).trim()) {
          patch.item_name = 'OTHERS';
        }
        if (Object.keys(patch).length) {
          patch.updated_at = new Date();
          await item.update(patch, { transaction: t });
          changed = true;
        }
      }

      const existingServices = order.order_services || [];
      if (existingServices.length === 0) {
        const fromItems = [
          ...new Set(
            items
              .map((i) => i.service_id)
              .filter((id) => id != null)
              .map((id) => parseInt(id, 10))
          ),
        ];

        let serviceIds = fromItems;
        if (!serviceIds.length) {
          const fallback = await getFallbackService();
          if (fallback) serviceIds = [fallback.id];
        }

        for (const serviceId of serviceIds) {
          await OrderService.findOrCreate({
            where: { order_id: order.id, service_id: serviceId },
            defaults: { order_id: order.id, service_id: serviceId },
            transaction: t,
          });
        }
        if (serviceIds.length) changed = true;
      }

      if (changed) {
        await recalculateOrderTotal(order.id, t);
      }
    });

    if (changed) updated += 1;
  }

  console.log(`order_sheet_backfill: updated ${updated} orders`);
  return { updated };
}

module.exports = {
  backfillOrderSheet,
};
