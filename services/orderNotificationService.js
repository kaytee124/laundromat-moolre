const { Order, Customer } = require('../models');
const moolreService = require('./moolreService');
const { formatSmsRecipient } = require('../utils/phone');

function buildInProgressMessage(orderNumber) {
  return `Your order ${orderNumber} is now in progress. Thank you for choosing us.`;
}

function buildCompletedMessage(orderNumber) {
  return `Your order ${orderNumber} is ready for pickup/delivery. Thank you.`;
}

async function notifyOrderStatusChange(orderId, previousStatus, newStatus) {
  if (!newStatus || previousStatus === newStatus) {
    return;
  }

  const isInProgress = newStatus === 'in_progress' && previousStatus !== 'in_progress';
  const isCompleted = newStatus === 'completed' && previousStatus !== 'completed';
  if (!isInProgress && !isCompleted) {
    return;
  }

  const order = await Order.findByPk(orderId, {
    attributes: ['id', 'order_number', 'customer_id'],
  });
  if (!order) {
    return;
  }

  const message = isInProgress
    ? buildInProgressMessage(order.order_number)
    : buildCompletedMessage(order.order_number);

  const customer = await Customer.findByPk(order.customer_id, {
    attributes: ['id', 'phone_number'],
  });
  if (!customer?.phone_number) {
    console.error(
      JSON.stringify({
        event: 'order_sms_skipped',
        orderId,
        reason: 'customer_phone_missing',
      })
    );
    return;
  }

  try {
    await moolreService.sendSms({
      recipient: formatSmsRecipient(customer.phone_number),
      message,
      ref: order.order_number,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'order_sms_failed',
        orderId,
        previousStatus,
        newStatus,
        error: err.message,
        code: err.code,
      })
    );
  }
}

module.exports = {
  notifyOrderStatusChange,
  buildInProgressMessage,
  buildCompletedMessage,
};
