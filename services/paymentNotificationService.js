const { Order, Customer, User, Payment } = require('../models');
const { formatSmsRecipient } = require('../utils/phone');
const { enqueueSms } = require('./smsOutboxService');

function formatMoney(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '0.00';
  return n.toFixed(2);
}

function methodLabel(paymentMethod) {
  if (paymentMethod === 'cash') return 'cash';
  if (paymentMethod === 'moolre') return 'MoMo';
  return paymentMethod || 'payment';
}

function buildCustomerPaymentMessage({ orderNumber, amount, method, amountPaid, balance, paymentStatus }) {
  const statusLabel = paymentStatus === 'paid' ? 'fully paid' : paymentStatus === 'partially_paid' ? 'partial' : paymentStatus;
  return (
    `Bubblebytes: Payment of GHS ${formatMoney(amount)} received for order ${orderNumber} (${methodLabel(method)}). ` +
    `Paid to date: GHS ${formatMoney(amountPaid)}. Balance: GHS ${formatMoney(balance)}. Status: ${statusLabel}.`
  );
}

function formatUserDisplayName(user) {
  if (!user) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || user.username || null;
}

function buildStaffPaymentMessage({
  orderNumber,
  customerName,
  amount,
  method,
  amountPaid,
  balance,
  paymentStatus,
  receivedByName,
}) {
  const payer = customerName || 'Customer';
  let msg =
    `Bubblebytes: GHS ${formatMoney(amount)} ${methodLabel(method)} from ${payer} for ${orderNumber}.`;
  if (method === 'cash' && receivedByName) {
    msg += ` Received by ${receivedByName}.`;
  }
  msg += ` Paid: GHS ${formatMoney(amountPaid)}. Balance: GHS ${formatMoney(balance)}. Status: ${paymentStatus}.`;
  return msg;
}

async function listActiveSuperadminPhones() {
  const users = await User.findAll({
    where: {
      role: 'superadmin',
      is_active: true,
    },
    attributes: ['id', 'phone_number'],
  });
  return users.filter((u) => String(u.phone_number || '').trim().length > 0);
}

/**
 * SMS after a payment is confirmed paid and the order is fully paid.
 * Cash: superadmins only. MoMo/USSD: customer + superadmins.
 * Partial payments send no receipt SMS.
 */
async function notifyPaymentReceived(orderId, paymentId) {
  const order = await Order.findByPk(orderId, {
    attributes: [
      'id',
      'order_number',
      'customer_id',
      'total_amount',
      'amount_paid',
      'payment_status',
    ],
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'phone_number', 'user_id'],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'first_name', 'last_name', 'username'],
            required: false,
          },
        ],
      },
    ],
  });
  if (!order) return { customer: false, staff: 0 };

  const payment = await Payment.findByPk(paymentId, {
    attributes: ['id', 'amount', 'payment_method', 'status', 'created_by'],
    include: [
      {
        model: User,
        as: 'creator',
        attributes: ['id', 'first_name', 'last_name', 'username'],
        required: false,
      },
    ],
  });
  if (!payment || payment.status !== 'paid') {
    return { customer: false, staff: 0 };
  }
  if (order.payment_status !== 'paid') {
    return { customer: false, staff: 0 };
  }

  const total = parseFloat(order.total_amount);
  const amountPaid = parseFloat(order.amount_paid);
  const balance = Math.max(0, total - amountPaid);
  const customerName = formatUserDisplayName(order.customer?.user);
  const receivedByName =
    payment.payment_method === 'cash' ? formatUserDisplayName(payment.creator) : null;

  const customerMsg = buildCustomerPaymentMessage({
    orderNumber: order.order_number,
    amount: payment.amount,
    method: payment.payment_method,
    amountPaid,
    balance,
    paymentStatus: order.payment_status,
  });

  const staffMsg = buildStaffPaymentMessage({
    orderNumber: order.order_number,
    customerName,
    amount: payment.amount,
    method: payment.payment_method,
    amountPaid,
    balance,
    paymentStatus: order.payment_status,
    receivedByName,
  });

  let customerOk = false;
  const notifyCustomer = payment.payment_method !== 'cash' && order.customer?.phone_number;
  if (notifyCustomer) {
    try {
      const result = await enqueueSms({
        recipient: formatSmsRecipient(order.customer.phone_number),
        message: customerMsg,
        ref: `${order.order_number}-PAY-${payment.id}`,
        purpose: 'payment_received',
        relatedType: 'customer',
        relatedId: order.customer.id,
      });
      customerOk = Boolean(result?.ok);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'payment_sms_customer_failed',
          orderId,
          paymentId,
          error: err.message,
        })
      );
    }
  }

  const superadmins = await listActiveSuperadminPhones();
  let staffSent = 0;
  for (const sa of superadmins) {
    try {
      const result = await enqueueSms({
        recipient: formatSmsRecipient(sa.phone_number),
        message: staffMsg,
        ref: `${order.order_number}-PAY-${payment.id}-SA${sa.id}`,
        purpose: 'payment_received_staff',
        relatedType: 'user',
        relatedId: sa.id,
      });
      if (result?.ok) staffSent += 1;
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'payment_sms_staff_failed',
          orderId,
          paymentId,
          userId: sa.id,
          error: err.message,
        })
      );
    }
  }

  return { customer: customerOk, staff: staffSent };
}

module.exports = {
  notifyPaymentReceived,
  buildCustomerPaymentMessage,
  buildStaffPaymentMessage,
  formatMoney,
  formatUserDisplayName,
};
