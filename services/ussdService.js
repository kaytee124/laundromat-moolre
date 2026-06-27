const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { User, Customer, Order, Payment, UssdSession, sequelize } = require('../models');
const { AppError } = require('../utils/errors');
const { formatOrder, getUserName } = require('../utils/serializers');
const { getMsisdnLookupVariants } = require('../utils/phone');
const paystackService = require('./paystackService');
const paystackConfig = require('../config/paystack');

const SESSION_TTL_MS = 5 * 60 * 1000;
const ORDERS_PAGE_SIZE = 5;
const PENDING_PAYMENT_STATUSES = ['pending', 'partially_paid'];

const STEPS = {
  MAIN: 'main',
  ORDERS_LIST: 'orders_list',
  ENTER_AMOUNT: 'enter_amount',
  CONFIRM_PAYMENT: 'confirm_payment',
};

function formatAmount(value) {
  return parseFloat(value).toFixed(2);
}

function getAmountDue(order) {
  return parseFloat(order.total_amount) - parseFloat(order.amount_paid);
}

async function findCustomerByMsisdn(msisdn) {
  const variants = getMsisdnLookupVariants(msisdn);
  const customer = await Customer.findOne({
    where: { phone_number: { [Op.in]: variants } },
    include: [{ model: User, as: 'user' }],
  });
  if (!customer) return null;
  return {
    customer,
    name: getUserName(customer.user),
    phoneNumber: customer.phone_number,
  };
}

async function getPendingOrdersPage(customerId, page, pageSize = ORDERS_PAGE_SIZE) {
  const offset = page * pageSize;
  const rows = await Order.findAll({
    where: {
      customer_id: customerId,
      payment_status: { [Op.in]: PENDING_PAYMENT_STATUSES },
    },
    order: [['created_at', 'DESC']],
    offset,
    limit: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  return { orders: rows.slice(0, pageSize), hasMore };
}

async function getRecentPayments(customerId, limit = 5) {
  return Payment.findAll({
    include: [
      {
        model: Order,
        as: 'order',
        where: { customer_id: customerId },
        attributes: ['order_number'],
      },
    ],
    order: [['created_at', 'DESC']],
    limit,
  });
}

function buildMainMenuMessage(customerName) {
  return `Welcome ${customerName}\n1. View orders\n2. View recent payment history`;
}

function buildOrdersListMessage(orders, hasMore) {
  const lines = orders.map((order, index) => {
    const due = formatAmount(getAmountDue(order));
    return `${index + 1}. ${order.order_number} - ${due}`;
  });
  if (hasMore) {
    lines.push('6. Next');
  }
  return lines.join('\n');
}

function buildConfirmMessage(orderNumber, amount) {
  return `Pay GHS ${formatAmount(amount)} for ${orderNumber}?\n1. Confirm\n2. Cancel\n3. Back`;
}

function buildPaymentHistoryMessage(payments) {
  if (!payments.length) {
    return 'No recent payments';
  }
  return payments
    .map((payment, index) => {
      const orderNumber = payment.order?.order_number || 'Unknown';
      return `${index + 1}. ${orderNumber} - GHS ${formatAmount(payment.amount)} (${payment.status})`;
    })
    .join('\n');
}

function defaultSessionData({ customerId, customerName, phoneNumber }) {
  return {
    customerId,
    customerName,
    phoneNumber,
    ordersPage: 0,
    selectedOrderId: null,
    selectedOrderNumber: null,
    paymentAmount: null,
  };
}

async function deleteExpiredSessions() {
  await UssdSession.destroy({ where: { expires_at: { [Op.lt]: new Date() } } });
}

async function loadSession(sessionId) {
  await deleteExpiredSessions();
  const session = await UssdSession.findByPk(sessionId);
  if (!session || session.expires_at < new Date()) {
    if (session) await session.destroy();
    return null;
  }
  return session;
}

async function saveSession(sessionId, step, data) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const now = new Date();
  const [session] = await UssdSession.upsert({
    session_id: sessionId,
    step,
    data,
    expires_at: expiresAt,
    updated_at: now,
  });
  return session;
}

async function deleteSession(sessionId) {
  await UssdSession.destroy({ where: { session_id: sessionId } });
}

async function showMainMenu(sessionId, data) {
  await saveSession(sessionId, STEPS.MAIN, data);
  return { message: buildMainMenuMessage(data.customerName), reply: true };
}

async function showOrdersList(sessionId, data, page = 0) {
  const { orders, hasMore } = await getPendingOrdersPage(data.customerId, page);
  if (!orders.length) {
    await deleteSession(sessionId);
    return { message: 'No pending order', reply: false };
  }
  const nextData = { ...data, ordersPage: page };
  await saveSession(sessionId, STEPS.ORDERS_LIST, nextData);
  return { message: buildOrdersListMessage(orders, hasMore), reply: true };
}

async function handleMainStep(sessionId, data, input) {
  if (input === '1') {
    return showOrdersList(sessionId, data, 0);
  }
  if (input === '2') {
    const payments = await getRecentPayments(data.customerId);
    await deleteSession(sessionId);
    return { message: buildPaymentHistoryMessage(payments), reply: false };
  }
  return showMainMenu(sessionId, data);
}

async function handleOrdersListStep(sessionId, data, input) {
  const page = data.ordersPage || 0;
  const { orders, hasMore } = await getPendingOrdersPage(data.customerId, page);

  if (input === '6') {
    if (!hasMore) {
      return { message: buildOrdersListMessage(orders, hasMore), reply: true };
    }
    return showOrdersList(sessionId, data, page + 1);
  }

  const selection = parseInt(input, 10);
  if (!Number.isInteger(selection) || selection < 1 || selection > orders.length) {
    return { message: buildOrdersListMessage(orders, hasMore), reply: true };
  }

  const selected = orders[selection - 1];
  const nextData = {
    ...data,
    selectedOrderId: selected.id,
    selectedOrderNumber: selected.order_number,
    paymentAmount: null,
  };
  await saveSession(sessionId, STEPS.ENTER_AMOUNT, nextData);
  return { message: 'Enter amount', reply: true };
}

async function handleEnterAmountStep(sessionId, data, input) {
  const paymentAmount = parseFloat(input);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return { message: 'Invalid amount\nEnter amount', reply: true };
  }

  const order = await Order.findOne({
    where: { id: data.selectedOrderId, customer_id: data.customerId },
  });
  if (!order) {
    await deleteSession(sessionId);
    return { message: 'Order not found', reply: false };
  }

  const amountDue = getAmountDue(order);
  if (amountDue <= 0) {
    await deleteSession(sessionId);
    return { message: 'No amount due for this order', reply: false };
  }
  if (paymentAmount > amountDue) {
    return {
      message: `Amount exceeds balance (GHS ${formatAmount(amountDue)})\nEnter amount`,
      reply: true,
    };
  }

  const nextData = { ...data, paymentAmount };
  await saveSession(sessionId, STEPS.CONFIRM_PAYMENT, nextData);
  return {
    message: buildConfirmMessage(data.selectedOrderNumber, paymentAmount),
    reply: true,
  };
}

async function handleConfirmPaymentStep(sessionId, data, input) {
  if (input === '2') {
    await deleteSession(sessionId);
    return { message: 'Payment cancelled', reply: false };
  }
  if (input === '3') {
    await saveSession(sessionId, STEPS.ENTER_AMOUNT, data);
    return { message: 'Enter amount', reply: true };
  }
  if (input !== '1') {
    return {
      message: buildConfirmMessage(data.selectedOrderNumber, data.paymentAmount),
      reply: true,
    };
  }

  try {
    await initializePayment(data.phoneNumber, data.selectedOrderId, data.paymentAmount);
    await deleteSession(sessionId);
    return { message: 'Payment is initialized. You will get a prompt.', reply: false };
  } catch (err) {
    if (err instanceof AppError) {
      await saveSession(sessionId, STEPS.ENTER_AMOUNT, data);
      return { message: `${err.message}\nEnter amount`, reply: true };
    }
    await deleteSession(sessionId);
    return { message: 'Payment failed. Please try again later.', reply: false };
  }
}

async function handleUssdRequest({ sessionId, new: isNew, msisdn, message }) {
  const input = String(message ?? '').trim();

  if (isNew) {
    const found = await findCustomerByMsisdn(msisdn);
    if (!found) {
      return { message: 'No customer found', reply: false };
    }
    await deleteSession(sessionId);
    const data = defaultSessionData({
      customerId: found.customer.id,
      customerName: found.name,
      phoneNumber: found.phoneNumber,
    });
    return showMainMenu(sessionId, data);
  }

  const session = await loadSession(sessionId);
  if (!session) {
    return { message: 'Session expired', reply: false };
  }

  const data = session.data;
  switch (session.step) {
    case STEPS.MAIN:
      return handleMainStep(sessionId, data, input);
    case STEPS.ORDERS_LIST:
      return handleOrdersListStep(sessionId, data, input);
    case STEPS.ENTER_AMOUNT:
      return handleEnterAmountStep(sessionId, data, input);
    case STEPS.CONFIRM_PAYMENT:
      return handleConfirmPaymentStep(sessionId, data, input);
    default:
      await deleteSession(sessionId);
      return { message: 'Session expired', reply: false };
  }
}

async function getOrderbyPhoneNumber(phoneNumber) {
  const found = await findCustomerByMsisdn(phoneNumber);
  if (!found) {
    return {
      status: 'error',
      message: 'Customer not found',
    };
  }
  const orders = await Order.findAll({
    where: {
      customer_id: found.customer.id,
      payment_status: { [Op.in]: PENDING_PAYMENT_STATUSES },
    },
  });
  if (!orders.length) {
    return {
      status: 'success',
      data: [],
    };
  }
  return {
    status: 'success',
    data: orders.map((order) => formatOrder(order)),
  };
}

async function initializePayment(phoneNumber, orderId, amount) {
  const found = await findCustomerByMsisdn(phoneNumber);
  if (!found) throw new AppError('CUSTOMER_NOT_FOUND', 'Customer profile not found', 404);
  const { customer } = found;

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

  const remaining = getAmountDue(order);
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
        payment_method: 'ussd',
        transaction_id: uniqueRef,
        payer_phone: found.phoneNumber,
        currency: 'GHS',
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          customer_id: customer.id,
        },
        created_by: null,
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
      channels: ['mobile_money'],
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

module.exports = {
  getOrderbyPhoneNumber,
  initializePayment,
  handleUssdRequest,
  findCustomerByMsisdn,
  getPendingOrdersPage,
  getRecentPayments,
};
