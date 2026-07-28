/**
 * One-shot: send order-received SMS for all orders created today (Africa/Accra).
 * Usage: node scripts/sendSmsForTodaysOrders.js
 */
require('dotenv').config();

const { Op } = require('sequelize');
const { Order, Customer, sequelize } = require('../models');
const { notifyOrderCreated } = require('../services/orderNotificationService');

/** Accra is UTC+0 year-round; day bounds use local calendar date. */
function getAccraDayBounds(now = new Date()) {
  const datePart = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Accra',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return {
    datePart,
    start: new Date(`${datePart}T00:00:00.000Z`),
    end: new Date(`${datePart}T23:59:59.999Z`),
  };
}

async function main() {
  const { datePart, start, end } = getAccraDayBounds();
  console.log(`Sending order-received SMS for orders created on ${datePart} (Africa/Accra)`);
  console.log(`Window: ${start.toISOString()} .. ${end.toISOString()}`);

  const orders = await Order.findAll({
    where: {
      created_at: { [Op.between]: [start, end] },
    },
    attributes: ['id', 'order_number', 'customer_id', 'created_at'],
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'phone_number'],
        required: false,
      },
    ],
    order: [['id', 'ASC']],
  });

  console.log(`Found ${orders.length} order(s)`);

  const summary = {
    sent: [],
    skipped: [],
    failed: [],
  };

  for (const order of orders) {
    const phone = order.customer?.phone_number;
    if (!phone) {
      summary.skipped.push({ id: order.id, order_number: order.order_number, reason: 'phone_missing' });
      console.warn(`SKIP order ${order.id} (${order.order_number}): no customer phone`);
      continue;
    }

    try {
      const ok = await notifyOrderCreated(order.id, {
        ref: `received-${order.order_number}-${Date.now()}`,
      });
      if (!ok) {
        summary.failed.push({
          id: order.id,
          order_number: order.order_number,
          error: 'sms_send_failed_or_skipped',
        });
        console.error(`FAIL order ${order.id} (${order.order_number}): sms_send_failed_or_skipped`);
        continue;
      }
      summary.sent.push({ id: order.id, order_number: order.order_number });
      console.log(`SENT order ${order.id} (${order.order_number})`);
    } catch (err) {
      summary.failed.push({
        id: order.id,
        order_number: order.order_number,
        error: err.message,
      });
      console.error(`FAIL order ${order.id} (${order.order_number}): ${err.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        date: datePart,
        totals: {
          found: orders.length,
          sent: summary.sent.length,
          skipped: summary.skipped.length,
          failed: summary.failed.length,
        },
        ...summary,
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
