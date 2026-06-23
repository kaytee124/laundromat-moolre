const { v4: uuidv4 } = require('uuid');
const { fn, col, Op } = require('sequelize');
const {
  Order,
  OrderItem,
  OrderStatusHistory,
  Customer,
  Service,
  Payment,
  User,
  sequelize,
} = require('../models');
const { AppError } = require('../utils/errors');
const { formatOrder } = require('../utils/serializers');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const ORDER_LIST_INCLUDES = [
  {
    model: Customer,
    as: 'customer',
    attributes: ['id'],
    include: [{ model: User, as: 'user', attributes: ['id', 'username', 'first_name', 'last_name'] }],
  },
  { model: User, as: 'assignee', attributes: ['id', 'username'], required: false },
  { model: User, as: 'creator', attributes: ['id', 'username'], required: false },
  {
    model: OrderItem,
    as: 'order_items',
    attributes: [
      'id', 'service_id', 'item_name', 'description', 'quantity',
      'unit_price', 'subtotal', 'notes', 'created_at', 'updated_at',
    ],
    include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'price', 'unit'] }],
  },
];

const ORDER_DETAIL_INCLUDES = [
  {
    model: Customer,
    as: 'customer',
    include: [{ model: User, as: 'user', attributes: ['id', 'username', 'first_name', 'last_name'] }],
  },
  { model: User, as: 'assignee', attributes: ['id', 'username'] },
  { model: User, as: 'creator', attributes: ['id', 'username'] },
  { model: OrderItem, as: 'order_items', include: [{ model: Service, as: 'service' }] },
];

function isRetryableDbError(err) {
  const code = err?.parent?.code || err?.original?.code || err?.code;
  const errno = err?.parent?.errno || err?.original?.errno || err?.errno;
  return code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT' || errno === 1213 || errno === 1205;
}

async function runWithDbRetry(fn, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (isRetryableDbError(err) && attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return undefined;
}

async function loadOrderDetail(orderId, transaction = null) {
  const options = { include: ORDER_DETAIL_INCLUDES };
  if (transaction) options.transaction = transaction;
  return Order.findByPk(orderId, options);
}

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

function buildOrderListWhere(user, query, customer) {
  const where = {};
  const isStaff = ['admin', 'superadmin', 'employee'].includes(user.role);

  if (isStaff) {
    if (query.customer_id) where.customer_id = query.customer_id;
    if (query.assigned_to) where.assigned_to = query.assigned_to;
  } else if (user.role === 'client') {
    if (!customer) return null;
    where.customer_id = customer.id;
  } else {
    return null;
  }

  if (query.order_status) where.order_status = query.order_status;
  if (query.payment_status) where.payment_status = query.payment_status;

  if (query.order_number) {
    const num = String(query.order_number).trim();
    if (/^ORD-[A-Z0-9]{8}$/i.test(num)) {
      where.order_number = num.toUpperCase();
    } else {
      where.order_number = { [Op.like]: `%${num}%` };
    }
  } else if (query.search) {
    where.order_number = { [Op.like]: `%${String(query.search).trim()}%` };
  }

  if (query.created_from) {
    const from = parseDateStart(query.created_from);
    if (from) where.created_at = { ...where.created_at, [Op.gte]: from };
  }
  if (query.created_to) {
    const to = parseDateEndExclusive(query.created_to);
    if (to) where.created_at = { ...where.created_at, [Op.lt]: to };
  }

  return where;
}

function generateOrderNumber() {
  return `ORD-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

async function recalculateOrderTotal(orderId, transaction) {
  const items = await OrderItem.findAll({ where: { order_id: orderId }, transaction });
  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
  const order = await Order.findByPk(orderId, { transaction });
  const discount = parseFloat(order.discount_amount || 0);
  order.total_amount = Math.max(0, subtotal - discount);
  order.updated_at = new Date();
  await order.save({ transaction });
  return order;
}

async function updateCustomerStats(customerId, transaction) {
  const id = parseInt(customerId, 10);
  await Customer.update(
    {
      total_orders: sequelize.literal(
        `(SELECT COUNT(*) FROM orders WHERE customer_id = ${id})`
      ),
      total_spent: sequelize.literal(
        `(SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE customer_id = ${id})`
      ),
      last_order_date: sequelize.literal(
        `(SELECT MAX(created_at) FROM orders WHERE customer_id = ${id})`
      ),
      updated_at: new Date(),
    },
    { where: { id }, transaction }
  );
}

async function incrementCustomerStatsOnCreate(customerId, orderTotal, orderDate, transaction = null) {
  const id = parseInt(customerId, 10);
  const total = parseFloat(orderTotal);
  const dateSql = sequelize.escape(orderDate);
  const options = {
    where: { id },
    ...(transaction ? { transaction } : {}),
  };

  await Customer.update(
    {
      total_orders: sequelize.literal('total_orders + 1'),
      total_spent: sequelize.literal(`total_spent + ${total}`),
      last_order_date: sequelize.literal(`GREATEST(COALESCE(last_order_date, '1970-01-01 00:00:00'), ${dateSql})`),
      updated_at: new Date(),
    },
    options
  );
}

async function listOrders(user, query = {}) {
  const { page, pageSize, offset, limit } = parsePagination(query);

  let customer = null;
  if (user.role === 'client') {
    customer = await Customer.findOne({ where: { user_id: user.id } });
  }

  const where = buildOrderListWhere(user, query, customer);
  if (where === null) {
    return paginatedResponse({ count: 0, page, pageSize, results: [] });
  }

  const count = await Order.count({ where });
  const rows = await Order.findAll({
    where,
    include: ORDER_LIST_INCLUDES,
    order: [['created_at', 'DESC']],
    offset,
    limit,
    subQuery: true,
  });

  return paginatedResponse({
    count,
    page,
    pageSize,
    results: rows.map(formatOrder),
  });
}

async function getOrderById(orderId, user) {
  const order = await loadOrderDetail(orderId);

  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);

  if (user.role === 'client') {
    const customer = await Customer.findOne({ where: { user_id: user.id } });
    if (!customer || order.customer_id !== customer.id) {
      throw new AppError('PERMISSION_DENIED', 'You can only view your own orders', 403);
    }
  } else if (!['admin', 'superadmin', 'employee'].includes(user.role)) {
    throw new AppError('PERMISSION_DENIED', 'You do not have permission to view this order', 403);
  }

  return formatOrder(order);
}

async function createOrder(data, user) {
  if (!['admin', 'superadmin', 'employee'].includes(user.role)) {
    throw new AppError('INSUFFICIENT_PERMISSIONS', 'Only admins, superadmins, and staff can create orders', 403);
  }

  const orderItemsData = data.order_items_data || [];
  if (!orderItemsData.length) {
    throw new AppError('VALIDATION_ERROR', 'At least one order item is required', 400);
  }

  if (!data.customer_id) {
    throw new AppError('VALIDATION_ERROR', 'Customer is required', 400);
  }

  const customer = await Customer.findByPk(data.customer_id);
  if (!customer) throw new AppError('VALIDATION_ERROR', 'Customer not found', 400);

  let assignedTo = data.assigned_to;
  if (user.role === 'employee' && !assignedTo) {
    assignedTo = user.id;
  }

  const now = new Date();

  const createInTransaction = async () => {
    let createdOrderId;
    let createdOrderTotal;
    await sequelize.transaction(async (t) => {
      const order = await Order.create(
        {
          order_number: generateOrderNumber(),
          customer_id: customer.id,
          assigned_to: assignedTo || null,
          order_status: data.order_status || 'pending',
          payment_status: data.payment_status || 'pending',
          discount_amount: data.discount_amount || 0,
          delivery_notes: data.delivery_notes || null,
          special_instructions: data.special_instructions || null,
          pickup_date: data.pickup_date || null,
          delivery_date: data.delivery_date || null,
          estimated_completion_date: data.estimated_completion_date || null,
          created_by: user.id,
          created_at: now,
          updated_at: now,
        },
        { transaction: t }
      );

      for (const itemData of orderItemsData) {
        const service = await Service.findByPk(itemData.service_id, { transaction: t });
        if (!service) {
          throw new AppError('VALIDATION_ERROR', `Service with id ${itemData.service_id} not found`, 400);
        }

        const quantity = itemData.quantity || 1;
        if (quantity <= 0) throw new AppError('VALIDATION_ERROR', 'Quantity must be greater than 0', 400);

        const unitPrice = parseFloat(itemData.unit_price ?? service.price);
        const subtotal = quantity * unitPrice;

        await OrderItem.create(
          {
            order_id: order.id,
            service_id: service.id,
            item_name: itemData.item_name || service.name,
            description: itemData.description || service.description,
            quantity,
            unit_price: unitPrice,
            subtotal,
            notes: itemData.notes || '',
            created_at: now,
            updated_at: now,
          },
          { transaction: t }
        );
      }

      const updatedOrder = await recalculateOrderTotal(order.id, t);
      createdOrderId = order.id;
      createdOrderTotal = updatedOrder.total_amount;
    });
    return { orderId: createdOrderId, orderTotal: createdOrderTotal };
  };

  const { orderId, orderTotal } = await runWithDbRetry(createInTransaction);

  try {
    await runWithDbRetry(() => incrementCustomerStatsOnCreate(customer.id, orderTotal, now));
  } catch (err) {
    // Order is already committed; stats can be reconciled later without failing the create.
    if (!isRetryableDbError(err)) throw err;
  }

  const fullOrder = await loadOrderDetail(orderId);
  return formatOrder(fullOrder);
}

async function updateOrder(orderId, data, user) {
  if (!['admin', 'superadmin', 'employee'].includes(user.role)) {
    throw new AppError('INSUFFICIENT_PERMISSIONS', 'Only staff can update orders', 403);
  }

  const order = await Order.findByPk(orderId);
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);

  const oldStatus = order.order_status;
  const allowed = [
    'assigned_to', 'order_status', 'payment_status', 'discount_amount',
    'delivery_notes', 'special_instructions', 'pickup_date', 'delivery_date',
    'estimated_completion_date', 'completed_at',
  ];

  for (const field of allowed) {
    if (data[field] !== undefined) order[field] = data[field];
  }

  order.updated_by = user.id;
  order.updated_at = new Date();

  if (data.order_status === 'completed' && !order.completed_at) {
    order.completed_at = new Date();
  }

  await sequelize.transaction(async (t) => {
    await order.save({ transaction: t });

    if (data.discount_amount !== undefined) {
      await recalculateOrderTotal(order.id, t);
    }

    if (data.order_status && data.order_status !== oldStatus) {
      await OrderStatusHistory.create(
        {
          order_id: order.id,
          old_status: oldStatus,
          new_status: data.order_status,
          changed_by: user.id,
          changed_at: new Date(),
        },
        { transaction: t }
      );
    }
  });

  const updated = await loadOrderDetail(order.id);
  return formatOrder(updated);
}

async function syncOrderPaymentStatus(orderId, transaction) {
  const order = await Order.findByPk(orderId, { transaction });
  const result = await Payment.findOne({
    where: { order_id: orderId, status: 'success' },
    attributes: [[fn('SUM', col('amount')), 'total_paid']],
    raw: true,
    transaction,
  });

  const totalPaid = Math.min(parseFloat(result?.total_paid || 0), parseFloat(order.total_amount));
  order.amount_paid = totalPaid;

  if (totalPaid >= parseFloat(order.total_amount)) {
    order.payment_status = 'paid';
  } else if (totalPaid > 0) {
    order.payment_status = 'partially_paid';
  } else {
    order.payment_status = 'pending';
  }

  order.updated_at = new Date();
  await order.save({ transaction });
  return order;
}

module.exports = {
  listOrders,
  getOrderById,
  createOrder,
  updateOrder,
  syncOrderPaymentStatus,
  recalculateOrderTotal,
  updateCustomerStats,
};
