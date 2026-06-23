const { Op, literal, QueryTypes } = require('sequelize');
const { User, Order, Customer, Payment, sequelize } = require('../models');
const { AppError } = require('../utils/errors');

function parseDateStart(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateEndExclusive(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function parseInclusiveDateRange(startDate, endDate) {
  const rangeStart = parseDateStart(startDate);
  const rangeEndExclusive = parseDateEndExclusive(endDate);
  if (!rangeStart || !rangeEndExclusive) {
    throw new AppError('INVALID_DATE_FORMAT', 'Dates must be in YYYY-MM-DD format', 422);
  }
  return { rangeStart, rangeEndExclusive };
}

function getTodayRange(today) {
  const startOfToday = new Date(`${today}T00:00:00.000Z`);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
  return { startOfToday, startOfTomorrow };
}

function todayCreatedAtWhere(today) {
  const { startOfToday, startOfTomorrow } = getTodayRange(today);
  return { created_at: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow } };
}

function formatRecentOrder(order) {
  const customerUser = order.customer?.user;
  const customerName = customerUser
    ? `${customerUser.first_name} ${customerUser.last_name}`.trim()
    : null;
  return {
    id: order.id,
    order_number: order.order_number,
    customer_name: customerName,
    total_amount: order.total_amount,
    status: order.order_status,
  };
}

function formatClientRecentOrder(order) {
  const balance = parseFloat(order.total_amount) - parseFloat(order.amount_paid);
  return {
    id: order.id,
    order_number: order.order_number,
    total_amount: order.total_amount,
    balance,
    status: order.order_status,
    created_at: order.created_at ? order.created_at.toISOString().split('T')[0] : null,
  };
}

function formatEmployeeAssignedOrder(order) {
  const customerUser = order.customer?.user;
  const customerName = customerUser
    ? `${customerUser.first_name} ${customerUser.last_name}`.trim()
    : null;
  return {
    id: order.id,
    order_number: order.order_number,
    customer_name: customerName,
    status: order.order_status,
    estimated_completion: order.estimated_completion_date,
  };
}

async function getTotalOutstanding() {
  const row = await Order.findOne({
    attributes: [[literal('COALESCE(SUM(total_amount - amount_paid), 0)'), 'total_outstanding']],
    where: { payment_status: { [Op.ne]: 'paid' } },
    raw: true,
  });
  return parseFloat(row?.total_outstanding || 0);
}

async function getSuperadminMetrics(today) {
  const todayWhere = todayCreatedAtWhere(today);
  const [
    totalCustomers,
    totalStaff,
    totalOrders,
    totalRevenue,
    todayOrders,
    todayRevenue,
    pendingOrders,
    inProgressOrders,
    readyForPickup,
    totalOutstanding,
  ] = await Promise.all([
    User.count({ where: { role: 'client' } }),
    User.count({ where: { role: { [Op.in]: ['admin', 'employee'] } } }),
    Order.count(),
    Order.sum('amount_paid'),
    Order.count({ where: todayWhere }),
    Order.sum('amount_paid', { where: todayWhere }),
    Order.count({ where: { order_status: 'pending' } }),
    Order.count({ where: { order_status: 'in_progress' } }),
    Order.count({ where: { order_status: 'ready' } }),
    getTotalOutstanding(),
  ]);

  const recentOrdersQs = await Order.findAll({
    include: [{ model: Customer, as: 'customer', include: [{ model: User, as: 'user' }] }],
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  return {
    total_customers: totalCustomers,
    total_staff: totalStaff,
    total_orders: totalOrders,
    total_revenue: parseFloat(totalRevenue || 0),
    today_orders: todayOrders,
    today_revenue: parseFloat(todayRevenue || 0),
    pending_orders: pendingOrders,
    in_progress_orders: inProgressOrders,
    ready_for_pickup: readyForPickup,
    total_outstanding: totalOutstanding,
    recent_orders: recentOrdersQs.map(formatRecentOrder),
  };
}

async function getAdminMetrics(today) {
  const todayWhere = todayCreatedAtWhere(today);
  const totalCustomers = await User.count({ where: { role: 'client' } });
  const totalOrders = await Order.count();
  const totalRevenue = parseFloat((await Order.sum('amount_paid')) || 0);
  const todayOrders = await Order.count({ where: todayWhere });
  const todayRevenue = parseFloat(
    (await Order.sum('amount_paid', { where: todayWhere })) || 0
  );
  const pendingOrders = await Order.count({ where: { order_status: 'pending' } });
  const readyForPickup = await Order.count({ where: { order_status: 'ready' } });

  const recentOrdersQs = await Order.findAll({
    include: [{ model: Customer, as: 'customer', include: [{ model: User, as: 'user' }] }],
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  return {
    total_customers: totalCustomers,
    total_orders: totalOrders,
    total_revenue: totalRevenue,
    today_orders: todayOrders,
    today_revenue: todayRevenue,
    pending_orders: pendingOrders,
    ready_for_pickup: readyForPickup,
    recent_orders: recentOrdersQs.map(formatRecentOrder),
  };
}

async function getEmployeeMetrics(user, today) {
  const todayWhere = todayCreatedAtWhere(today);
  const myOrders = await Order.count({ where: { assigned_to: user.id } });
  const myPending = await Order.count({ where: { assigned_to: user.id, order_status: 'pending' } });
  const myInProgress = await Order.count({ where: { assigned_to: user.id, order_status: 'in_progress' } });
  const myTodayOrders = await Order.count({
    where: { assigned_to: user.id, ...todayWhere },
  });
  const myRevenue = parseFloat(
    (await Order.sum('total_amount', { where: { assigned_to: user.id } })) || 0
  );

  const assignedOrders = await Order.findAll({
    where: { assigned_to: user.id },
    include: [{ model: Customer, as: 'customer', include: [{ model: User, as: 'user' }] }],
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  return {
    my_orders: myOrders,
    my_pending: myPending,
    my_in_progress: myInProgress,
    my_today_orders: myTodayOrders,
    my_revenue: myRevenue,
    my_assigned_orders: assignedOrders.map(formatEmployeeAssignedOrder),
  };
}

async function getClientMetrics(user) {
  const customer = await Customer.findOne({ where: { user_id: user.id } });
  if (!customer) {
    return {
      total_orders: 0,
      total_spent: 0,
      pending_orders: 0,
      ready_for_pickup: 0,
      recent_orders: [],
    };
  }

  const totalOrders = await Order.count({ where: { customer_id: customer.id } });
  const totalSpent = parseFloat(
    (await Order.sum('amount_paid', { where: { customer_id: customer.id } })) || 0
  );
  const pendingOrders = await Order.count({
    where: { customer_id: customer.id, order_status: 'pending' },
  });
  const readyForPickup = await Order.count({
    where: { customer_id: customer.id, order_status: 'ready' },
  });

  const recentOrders = await Order.findAll({
    where: { customer_id: customer.id },
    order: [['created_at', 'DESC']],
    limit: 10,
  });

  return {
    total_orders: totalOrders,
    total_spent: totalSpent,
    pending_orders: pendingOrders,
    ready_for_pickup: readyForPickup,
    recent_orders: recentOrders.map(formatClientRecentOrder),
  };
}

async function getMetrics(user) {
  const today = new Date().toISOString().split('T')[0];

  switch (user.role) {
    case 'superadmin':
      return getSuperadminMetrics(today);
    case 'admin':
      return getAdminMetrics(today);
    case 'employee':
      return getEmployeeMetrics(user, today);
    case 'client':
      return getClientMetrics(user);
    default:
      throw new AppError('INVALID_ROLE', 'Invalid user role', 400);
  }
}

const PAYMENT_DATE_FILTER = `
  status = 'success'
  AND created_at >= :rangeStart
  AND created_at < :rangeEndExclusive
`;

const BREAKDOWN_QUERIES = {
  day: `
    SELECT
      DATE(created_at) AS date,
      payment_method,
      COUNT(*) AS transaction_count,
      SUM(amount) AS total_amount
    FROM payments
    WHERE ${PAYMENT_DATE_FILTER}
    GROUP BY DATE(created_at), payment_method
    ORDER BY date DESC
  `,
  week: `
    SELECT
      DATE_SUB(DATE(created_at), INTERVAL DAYOFWEEK(created_at) - 1 DAY) AS date,
      'all' AS payment_method,
      COUNT(*) AS transaction_count,
      SUM(amount) AS total_amount
    FROM payments
    WHERE ${PAYMENT_DATE_FILTER}
    GROUP BY YEARWEEK(created_at, 0)
    ORDER BY date DESC
  `,
  month: `
    SELECT
      DATE_FORMAT(created_at, '%Y-%m-01') AS date,
      'all' AS payment_method,
      COUNT(*) AS transaction_count,
      SUM(amount) AS total_amount
    FROM payments
    WHERE ${PAYMENT_DATE_FILTER}
    GROUP BY DATE_FORMAT(created_at, '%Y-%m-01')
    ORDER BY date DESC
  `,
};

async function getRevenueReport(startDate, endDate, groupBy = 'day') {
  const normalizedGroupBy = ['day', 'week', 'month'].includes(groupBy) ? groupBy : 'day';
  const { rangeStart, rangeEndExclusive } = parseInclusiveDateRange(startDate, endDate);
  const replacements = { rangeStart, rangeEndExclusive };

  const [summaryRow] = await sequelize.query(
    `
    SELECT
      COUNT(DISTINCT order_id) AS unique_orders,
      COUNT(*) AS total_transactions,
      COALESCE(SUM(amount), 0) AS grand_total,
      COALESCE(MIN(amount), 0) AS min_transaction,
      COALESCE(MAX(amount), 0) AS max_transaction,
      COALESCE(AVG(amount), 0) AS average_transaction
    FROM payments
    WHERE ${PAYMENT_DATE_FILTER}
    `,
    { replacements, type: QueryTypes.SELECT }
  );

  const breakdownRows = await sequelize.query(BREAKDOWN_QUERIES[normalizedGroupBy], {
    replacements,
    type: QueryTypes.SELECT,
  });

  const summary = {
    unique_orders: parseInt(summaryRow?.unique_orders || 0, 10),
    total_transactions: parseInt(summaryRow?.total_transactions || 0, 10),
    grand_total: parseFloat(summaryRow?.grand_total || 0).toFixed(2),
    min_transaction: parseFloat(summaryRow?.min_transaction || 0).toFixed(2),
    max_transaction: parseFloat(summaryRow?.max_transaction || 0).toFixed(2),
    average_transaction: parseFloat(summaryRow?.average_transaction || 0).toFixed(2),
  };

  const dailyBreakdown = breakdownRows.map((row) => {
    const date =
      row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).slice(0, 10);
    return {
      date,
      payment_method: row.payment_method,
      transaction_count: parseInt(row.transaction_count, 10),
      total_amount: parseFloat(row.total_amount),
    };
  });

  return { summary, daily_breakdown: dailyBreakdown };
}

module.exports = {
  getMetrics,
  getRevenueReport,
};
