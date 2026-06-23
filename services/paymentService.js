const { v4: uuidv4 } = require('uuid');
const { User, Customer, Order, Payment, sequelize } = require('../models');
const { AppError } = require('../utils/errors');
const paystackService = require('./paystackService');
const paystackConfig = require('../config/paystack');
const orderService = require('./orderService');

async function initializePayment(user, orderId, amount) {
  if (user.role !== 'client') {
    throw new AppError('PERMISSION_DENIED', 'Only clients can make payments', 403);
  }

  const customer = await Customer.findOne({ where: { user_id: user.id } });
  if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer profile not found', 404);

  const order = await Order.findOne({
    where: { id: orderId, customer_id: customer.id },
  });

  if (!order) {
    throw new AppError(
      'ORDER_NOT_FOUND',
      'Order not found or you do not have permission to pay for this order',
      404
    );
  }

  const paymentAmount = parseFloat(amount);
  if (order.payment_status === 'paid') {
    throw new AppError('ORDER_ALREADY_PAID', 'This order has already been fully paid', 400);
  }

  const remaining = parseFloat(order.total_amount) - parseFloat(order.amount_paid);
  if (remaining <= 0) {
    throw new AppError('NO_AMOUNT_DUE', 'No amount due for this order', 400);
  }

  if (paymentAmount > remaining) {
    throw new AppError(
      'AMOUNT_EXCEEDS_BALANCE',
      `Payment amount (GHS ${paymentAmount.toFixed(2)}) cannot exceed remaining balance (GHS ${remaining.toFixed(2)})`,
      400
    );
  }

  const customerUser = await User.findByPk(customer.user_id);
  if (!customerUser?.email) {
    throw new AppError('EMAIL_NOT_FOUND', 'Customer email not found. Please update your profile.', 400);
  }

  const uniqueRef = `PAY-${order.id}-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const amountInPesewas = Math.round(paymentAmount * 100);

  const payment = await sequelize.transaction(async (t) => {
    return Payment.create(
      {
        order_id: order.id,
        reference: uniqueRef,
        amount: paymentAmount,
        status: 'pending',
        payment_method: 'paystack',
        transaction_id: uniqueRef,
        currency: 'GHS',
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          customer_id: customer.id,
        },
        created_by: user.id,
      },
      { transaction: t }
    );
  });

  try {
    const response = await paystackService.initializeTransaction({
      email: customerUser.email,
      amount: String(amountInPesewas),
      reference: uniqueRef,
      callback_url: paystackConfig.callbackUrl,
      channels: ['bank', 'card', 'apple_pay', 'mobile_money'],
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        customer_id: customer.id,
        payment_id: payment.id,
      },
    });

    if (!response.status) {
      payment.status = 'failed';
      payment.metadata = {
        ...payment.metadata,
        paystack_error: response,
        error_message: response.message || 'Failed to initialize payment',
      };
      await payment.save();
      throw new AppError('PAYSTACK_ERROR', response.message || 'Failed to initialize payment', 500);
    }

    const paymentData = response.data || {};
    payment.transaction_id = paymentData.access_code || uniqueRef;
    payment.metadata = {
      ...payment.metadata,
      paystack_response: response,
      access_code: paymentData.access_code,
      authorization_url: paymentData.authorization_url,
    };
    await payment.save();

    return {
      authorization_url: paymentData.authorization_url,
      access_code: paymentData.access_code,
      reference: uniqueRef,
      payment_id: payment.id,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    payment.status = 'failed';
    await payment.save();
    throw new AppError('PAYSTACK_ERROR', 'Failed to initialize payment', 500);
  }
}

async function handleCallback(reference) {
  if (!reference) {
    return { success: false, message: 'Payment reference not provided' };
  }

  let response;
  try {
    response = await paystackService.verifyTransaction(reference);
  } catch {
    return { success: false, message: 'Failed to verify payment' };
  }

  if (!response.status) {
    return { success: false, message: response.message || 'Failed to verify payment' };
  }

  const transactionData = response.data || {};
  const transactionStatus = transactionData.status;
  const transactionAmount = parseFloat(transactionData.amount || 0) / 100;

  const payment = await Payment.findOne({ where: { reference }, include: [{ model: Order, as: 'order' }] });
  if (!payment) {
    return { success: false, message: 'Payment record not found' };
  }

  const expectedAmount = parseFloat(payment.amount);
  if (Math.abs(transactionAmount - expectedAmount) > 0.01) {
    payment.status = 'failed';
    payment.metadata = {
      ...payment.metadata,
      verification_error: 'Amount mismatch',
      expected_amount: String(expectedAmount),
      received_amount: String(transactionAmount),
    };
    await payment.save();
    return { success: false, message: 'Payment amount mismatch. Please contact support.' };
  }

  if (transactionStatus === 'success') {
    await sequelize.transaction(async (t) => {
      payment.status = 'success';
      payment.transaction_id = String(transactionData.id || '');
      payment.fees = parseFloat(transactionData.fees || 0) / 100;
      payment.verified_at = transactionData.paid_at ? new Date(transactionData.paid_at) : new Date();
      payment.metadata = {
        ...payment.metadata,
        verification_response: response,
        channel: transactionData.channel,
        gateway_response: transactionData.gateway_response,
      };
      await payment.save({ transaction: t });
      await orderService.syncOrderPaymentStatus(payment.order_id, t);
    });

    return {
      success: true,
      message: 'Payment processed successfully',
      order_id: payment.order_id,
    };
  }

  payment.status = 'failed';
  payment.metadata = {
    ...payment.metadata,
    verification_response: response,
    gateway_response: transactionData.gateway_response || 'Payment failed',
  };
  await payment.save();

  return {
    success: false,
    message: transactionData.gateway_response || 'Payment failed',
  };
}

module.exports = {
  initializePayment,
  handleCallback,
};
