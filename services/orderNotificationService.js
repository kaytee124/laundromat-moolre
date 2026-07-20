const { Order, Customer } = require('../models');
const moolreService = require('./moolreService');
const { formatSmsRecipient } = require('../utils/phone');

function buildInProgressMessage(orderNumber) {
  return `Your order ${orderNumber} is now in progress. Thank you for choosing us.`;
}

function buildCompletedMessage(orderNumber) {
  return `Your order ${orderNumber} is ready for pickup/delivery. Thank you.`;
}

function buildScheduleEarlierMessage(orderNumber, newDate) {
  return (
    `Your order ${orderNumber} estimated completion was moved earlier to ${newDate}. ` +
    `Good news — we'll finish sooner.`
  );
}

function buildScheduleLaterMessage(orderNumber, newDate) {
  return (
    `Sorry for the inconvenience. Your order ${orderNumber} estimated completion is now ${newDate}. ` +
    `We'll still complete your items carefully and on the updated schedule.`
  );
}

function formatPickupDisplay(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const timePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return { datePart, timePart };
}

function buildPickedUpMessage(orderNumber, pickedUpAt = new Date()) {
  const { datePart, timePart } = formatPickupDisplay(pickedUpAt);
  return (
    `Thank you for using our services. Your order ${orderNumber} was picked up on ${datePart} at ${timePart}. ` +
    `We look forward to serving you again.`
  );
}

async function sendCustomerSms(orderId, message) {
  const order = await Order.findByPk(orderId, {
    attributes: ['id', 'order_number', 'customer_id'],
  });
  if (!order) {
    return;
  }

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
        error: err.message,
        code: err.code,
      })
    );
  }
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
    attributes: ['id', 'order_number'],
  });
  if (!order) {
    return;
  }

  const message = isInProgress
    ? buildInProgressMessage(order.order_number)
    : buildCompletedMessage(order.order_number);

  await sendCustomerSms(orderId, message);
}

function toDateOnlyString(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s;
}

async function notifyEstimatedCompletionChange(orderId, previousDate, newDate) {
  const prev = toDateOnlyString(previousDate);
  const next = toDateOnlyString(newDate);
  if (!prev || !next || prev === next) {
    return;
  }

  const order = await Order.findByPk(orderId, {
    attributes: ['id', 'order_number'],
  });
  if (!order) {
    return;
  }

  const message =
    next < prev
      ? buildScheduleEarlierMessage(order.order_number, next)
      : buildScheduleLaterMessage(order.order_number, next);

  await sendCustomerSms(orderId, message);
}

async function notifyOrderPickedUp(orderId, pickedUpAt) {
  const order = await Order.findByPk(orderId, {
    attributes: ['id', 'order_number'],
  });
  if (!order) {
    return;
  }

  await sendCustomerSms(orderId, buildPickedUpMessage(order.order_number, pickedUpAt || new Date()));
}

module.exports = {
  notifyOrderStatusChange,
  notifyEstimatedCompletionChange,
  notifyOrderPickedUp,
  buildInProgressMessage,
  buildCompletedMessage,
  buildScheduleEarlierMessage,
  buildScheduleLaterMessage,
  buildPickedUpMessage,
};
