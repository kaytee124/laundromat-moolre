/**
 * Reverse mistaken cash payment for Klenam (ORD-32420EB8 / payment #10)
 * and SMS that it was an error / balance still owed.
 *
 * Usage: node scripts/reverseKlenamCashPayment.js
 */
require('dotenv').config();

const { Payment, Order, Customer, User, sequelize } = require('../models');
const orderService = require('../services/orderService');
const { formatSmsRecipient } = require('../utils/phone');
const { enqueueSms } = require('../services/smsOutboxService');

const ORDER_ID = 22;
const PAYMENT_ID = 10;
const CUSTOMER_ID = 17;

async function main() {
  const order = await Order.findByPk(ORDER_ID);
  const payment = await Payment.findByPk(PAYMENT_ID);
  const customer = await Customer.findByPk(CUSTOMER_ID, {
    include: [{ model: User, as: 'user', attributes: ['username', 'first_name'] }],
  });

  if (!order || !payment || !customer) {
    throw new Error('Order, payment, or customer not found');
  }
  if (payment.order_id !== order.id || order.customer_id !== customer.id) {
    throw new Error('Payment/order/customer mismatch — aborting');
  }
  if (payment.payment_method !== 'cash' || payment.status !== 'paid') {
    throw new Error(
      `Unexpected payment state: method=${payment.payment_method} status=${payment.status}`
    );
  }

  const amount = parseFloat(payment.amount);
  const total = parseFloat(order.total_amount);

  console.log(
    JSON.stringify(
      {
        event: 'reverse_klenam_start',
        order_number: order.order_number,
        payment_id: payment.id,
        amount,
        amount_paid_before: order.amount_paid,
        payment_status_before: order.payment_status,
        order_status_before: order.order_status,
      },
      null,
      2
    )
  );

  await sequelize.transaction(async (t) => {
    // Soft-void: mark failed so it no longer counts in syncOrderPaymentStatus
    payment.status = 'failed';
    payment.metadata = {
      ...(payment.metadata || {}),
      voided: true,
      void_reason: 'Mistaken cash recording — customer had not paid',
      voided_at: new Date().toISOString(),
    };
    payment.updated_at = new Date();
    await payment.save({ transaction: t });

    await orderService.syncOrderPaymentStatus(order.id, t);
  });

  await order.reload();
  const balance = Math.max(0, parseFloat(order.total_amount) - parseFloat(order.amount_paid));

  const message =
    `Bubblebytes: Correction for order ${order.order_number}. ` +
    `A cash payment of GHS ${amount.toFixed(2)} was recorded in error and has been reversed. ` +
    `You still owe GHS ${balance.toFixed(2)} (total GHS ${total.toFixed(2)}). ` +
    `Sorry for the inconvenience — please ignore any earlier paid confirmation for this order.`;

  const sms = await enqueueSms({
    recipient: formatSmsRecipient(customer.phone_number),
    message,
    ref: `${order.order_number}-void-pay-${PAYMENT_ID}-${Date.now()}`,
    purpose: 'payment_reversed',
    relatedType: 'customer',
    relatedId: customer.id,
  });

  console.log(
    JSON.stringify(
      {
        event: 'reverse_klenam_done',
        order_number: order.order_number,
        payment_id: payment.id,
        payment_status_now: 'failed',
        amount_paid_after: order.amount_paid,
        payment_status_after: order.payment_status,
        order_status_after: order.order_status,
        balance: balance.toFixed(2),
        sms_ok: Boolean(sms?.ok),
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
