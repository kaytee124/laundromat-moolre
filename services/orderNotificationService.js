const { Order, Customer, OrderItem, OrderService, Service } = require('../models');
const { formatSmsRecipient } = require('../utils/phone');
const { CUSTOMER_APP_URL } = require('../utils/constants');
const { createWelcomeLoginToken } = require('./welcomeLoginTokenService');
const { buildWelcomeMagicLink } = require('./customerNotificationService');
const { enqueueSms } = require('./smsOutboxService');

const MAX_ITEMS_IN_SMS = 4;

function formatMoney(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '0.00';
  return n.toFixed(2);
}

function formatItemLine(item) {
  const dirty = Number(item.dirty_quantity) || 0;
  const clean = Number(item.clean_quantity) || 0;
  const parts = [];
  if (dirty) parts.push(`${dirty} dirty`);
  if (clean) parts.push(`${clean} clean`);
  const counts = parts.length ? parts.join(', ') : '0';
  return `${item.item_name} (${counts})`;
}

/**
 * @param {{
 *   order_number: string,
 *   orderId?: number|string,
 *   total_amount: string|number,
 *   amount_paid?: string|number,
 *   serviceNames?: string[],
 *   items?: Array<{ item_name: string, dirty_quantity?: number, clean_quantity?: number }>,
 *   portalLink?: string,
 * }} summary
 */
function buildOrderReceivedMessage(summary) {
  const total = formatMoney(summary.total_amount);
  const paid = formatMoney(summary.amount_paid ?? 0);
  const balance = formatMoney(Math.max(0, parseFloat(total) - parseFloat(paid)));

  const lines = [
    `Bubblebytes: Order ${summary.order_number} received.`,
    `Total: GHS ${total}. Balance: GHS ${balance}.`,
  ];

  const serviceNames = (summary.serviceNames || []).filter(Boolean);
  if (serviceNames.length) {
    lines.push(`Services: ${serviceNames.join(', ')}.`);
  }

  const items = summary.items || [];
  if (items.length) {
    const shown = items.slice(0, MAX_ITEMS_IN_SMS).map(formatItemLine);
    const extra = items.length - shown.length;
    let itemsLine = `Items: ${shown.join('; ')}`;
    if (extra > 0) itemsLine += `; +${extra} more`;
    lines.push(`${itemsLine}.`);
  }

  if (summary.portalLink) {
    lines.push(`Tap to open this order and pay on the portal: ${summary.portalLink}`);
  } else {
    lines.push(`Log in at ${CUSTOMER_APP_URL} to pay for this order on the portal.`);
  }
  return lines.join('\n');
}

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

async function sendCustomerSms(orderId, message, options = {}) {
  const order = await Order.findByPk(orderId, {
    attributes: ['id', 'order_number', 'customer_id'],
  });
  if (!order) {
    return false;
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
    return false;
  }

  try {
    const result = await enqueueSms({
      recipient: formatSmsRecipient(customer.phone_number),
      message,
      ref: options.ref || order.order_number,
      purpose: options.purpose || 'order_notification',
      relatedType: 'customer',
      relatedId: customer.id,
    });
    return Boolean(result?.ok);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'order_sms_failed',
        orderId,
        error: err.message,
        code: err.code,
      })
    );
    return false;
  }
}

async function notifyOrderCreated(orderId, options = {}) {
  const order = await Order.findByPk(orderId, {
    attributes: ['id', 'order_number', 'total_amount', 'amount_paid', 'customer_id'],
    include: [
      {
        model: OrderItem,
        as: 'order_items',
        attributes: ['item_name', 'dirty_quantity', 'clean_quantity'],
      },
      {
        model: OrderService,
        as: 'order_services',
        include: [{ model: Service, as: 'service', attributes: ['id', 'name'] }],
      },
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'user_id', 'phone_number'],
      },
    ],
  });
  if (!order) {
    return false;
  }

  const serviceNames = (order.order_services || [])
    .map((row) => row.service?.name)
    .filter(Boolean);

  let portalLink = null;
  if (order.customer?.user_id) {
    try {
      const welcomeToken = await createWelcomeLoginToken(order.customer.user_id);
      portalLink = buildWelcomeMagicLink(welcomeToken, `/orders/${order.id}`);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'order_portal_token_failed',
          orderId,
          error: err.message,
        })
      );
    }
  }

  const message = buildOrderReceivedMessage({
    order_number: order.order_number,
    orderId: order.id,
    total_amount: order.total_amount,
    amount_paid: order.amount_paid,
    serviceNames,
    items: order.order_items || [],
    portalLink,
  });

  return sendCustomerSms(orderId, message, { ...options, purpose: 'order_created' });
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

  await sendCustomerSms(orderId, message, {
    purpose: isInProgress ? 'order_in_progress' : 'order_completed',
    ref: `${order.order_number}-${isInProgress ? 'inprog' : 'done'}-${Date.now()}`,
  });
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

  await sendCustomerSms(orderId, message, {
    purpose: 'order_schedule_change',
    ref: `${order.order_number}-sched-${Date.now()}`,
  });
}

async function notifyOrderPickedUp(orderId, pickedUpAt) {
  const order = await Order.findByPk(orderId, {
    attributes: ['id', 'order_number'],
  });
  if (!order) {
    return;
  }

  await sendCustomerSms(orderId, buildPickedUpMessage(order.order_number, pickedUpAt || new Date()), {
    purpose: 'order_picked_up',
    ref: `${order.order_number}-pickup-${Date.now()}`,
  });
}

module.exports = {
  notifyOrderCreated,
  notifyOrderStatusChange,
  notifyEstimatedCompletionChange,
  notifyOrderPickedUp,
  buildOrderReceivedMessage,
  buildInProgressMessage,
  buildCompletedMessage,
  buildScheduleEarlierMessage,
  buildScheduleLaterMessage,
  buildPickedUpMessage,
};
