const { v4: uuidv4 } = require('uuid');
const { fn, col, Op } = require('sequelize');
const {
  Order,
  OrderItem,
  OrderService,
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
const { ORDER_IN_PROGRESS_PAYMENT_RATIO } = require('../utils/constants');
const orderNotificationService = require('./orderNotificationService');

const ORDER_ITEM_ATTRIBUTES = [
  'id',
  'item_name',
  'dirty_quantity',
  'clean_quantity',
  'unit_price',
  'subtotal',
  'notes',
  'created_at',
  'updated_at',
];

const SERVICE_SLIM_ATTRIBUTES = ['id', 'name', 'description', 'category', 'is_active'];

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
    attributes: ORDER_ITEM_ATTRIBUTES,
  },
  {
    model: OrderService,
    as: 'order_services',
    attributes: ['id', 'service_id'],
    include: [{ model: Service, as: 'service', attributes: SERVICE_SLIM_ATTRIBUTES }],
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
  {
    model: OrderItem,
    as: 'order_items',
    attributes: ORDER_ITEM_ATTRIBUTES,
  },
  {
    model: OrderService,
    as: 'order_services',
    attributes: ['id', 'service_id'],
    include: [{ model: Service, as: 'service', attributes: SERVICE_SLIM_ATTRIBUTES }],
  },
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

function normalizeServiceIds(serviceIds) {
  if (!Array.isArray(serviceIds)) return [];
  const unique = [...new Set(serviceIds.map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0))];
  return unique;
}

function normalizeOrderItemsData(orderItemsData) {
  if (!Array.isArray(orderItemsData)) return [];
  return orderItemsData
    .map((item) => {
      const dirty = parseInt(item.dirty_quantity ?? 0, 10) || 0;
      const clean = parseInt(item.clean_quantity ?? 0, 10) || 0;
      return {
        item_name: String(item.item_name || '').trim(),
        dirty_quantity: dirty,
        clean_quantity: clean,
        unit_price: item.unit_price,
        notes: item.notes != null ? String(item.notes) : '',
        description: item.description != null ? String(item.description) : null,
      };
    })
    .filter((item) => item.item_name && item.dirty_quantity + item.clean_quantity > 0);
}

function computeItemSubtotal(unitPrice, dirtyQuantity, cleanQuantity) {
  return parseFloat(unitPrice) * (dirtyQuantity + cleanQuantity);
}

async function validateServicesExist(serviceIds, transaction) {
  if (!serviceIds.length) {
    throw new AppError('VALIDATION_ERROR', 'At least one service is required', 400);
  }
  const services = await Service.findAll({
    where: { id: { [Op.in]: serviceIds } },
    transaction,
  });
  if (services.length !== serviceIds.length) {
    throw new AppError('VALIDATION_ERROR', 'One or more services were not found', 400);
  }
  return services;
}

async function replaceOrderServices(orderId, serviceIds, transaction) {
  await OrderService.destroy({ where: { order_id: orderId }, transaction });
  for (const serviceId of serviceIds) {
    await OrderService.create(
      { order_id: orderId, service_id: serviceId },
      { transaction }
    );
  }
}

async function replaceOrderItems(orderId, items, now, transaction) {
  await OrderItem.destroy({ where: { order_id: orderId }, transaction });
  for (const item of items) {
    const unitPrice = parseFloat(item.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new AppError('VALIDATION_ERROR', 'unit_price is required and must be a non-negative number', 400);
    }
    const subtotal = computeItemSubtotal(unitPrice, item.dirty_quantity, item.clean_quantity);
    await OrderItem.create(
      {
        order_id: orderId,
        service_id: null,
        item_name: item.item_name,
        description: item.description,
        dirty_quantity: item.dirty_quantity,
        clean_quantity: item.clean_quantity,
        unit_price: unitPrice,
        subtotal,
        notes: item.notes || '',
        created_at: now,
        updated_at: now,
      },
      { transaction }
    );
  }
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
    distinct: true,
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

  if (!data.customer_id) {
    throw new AppError('VALIDATION_ERROR', 'Customer is required', 400);
  }

  const serviceIds = normalizeServiceIds(data.service_ids);
  const orderItemsData = normalizeOrderItemsData(data.order_items_data || []);

  if (!serviceIds.length) {
    throw new AppError('VALIDATION_ERROR', 'At least one service is required', 400);
  }
  if (!orderItemsData.length) {
    throw new AppError('VALIDATION_ERROR', 'At least one order item with dirty or clean quantity is required', 400);
  }

  const customer = await Customer.findByPk(data.customer_id);
  if (!customer) throw new AppError('VALIDATION_ERROR', 'Customer not found', 400);
  if (customer.phone_needs_correction) {
    throw new AppError(
      'PHONE_NEEDS_CORRECTION',
      'Customer phone number must be corrected before creating orders',
      422
    );
  }

  let assignedTo = data.assigned_to;
  if (user.role === 'employee' && !assignedTo) {
    assignedTo = user.id;
  }

  const now = new Date();

  const createInTransaction = async () => {
    let createdOrderId;
    let createdOrderTotal;
    await sequelize.transaction(async (t) => {
      await validateServicesExist(serviceIds, t);

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
          delivery_time: data.delivery_time || null,
          estimated_completion_date: data.estimated_completion_date || null,
          picked_up: false,
          picked_up_at: null,
          created_by: user.id,
          created_at: now,
          updated_at: now,
        },
        { transaction: t }
      );

      await replaceOrderServices(order.id, serviceIds, t);
      await replaceOrderItems(order.id, orderItemsData, now, t);

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
    if (!isRetryableDbError(err)) throw err;
  }

  orderNotificationService.notifyOrderCreated(orderId).catch((err) => {
    console.error(
      JSON.stringify({
        event: 'order_created_notification_error',
        orderId,
        error: err.message,
      })
    );
  });

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
  const previousEstimatedCompletion = order.estimated_completion_date;
  const previousPickedUp = Boolean(order.picked_up);

  const allowed = [
    'assigned_to',
    'order_status',
    'payment_status',
    'discount_amount',
    'delivery_notes',
    'special_instructions',
    'pickup_date',
    'delivery_date',
    'delivery_time',
    'estimated_completion_date',
    'completed_at',
    'picked_up',
  ];

  for (const field of allowed) {
    if (data[field] !== undefined) order[field] = data[field];
  }

  order.updated_by = user.id;
  order.updated_at = new Date();

  if (data.order_status === 'completed' && !order.completed_at) {
    order.completed_at = new Date();
  }

  let pickedUpAtForSms = null;
  if (data.picked_up !== undefined) {
    if (data.picked_up && !previousPickedUp) {
      order.picked_up = true;
      order.picked_up_at = order.picked_up_at || new Date();
      pickedUpAtForSms = order.picked_up_at;
    } else if (!data.picked_up) {
      order.picked_up = false;
      order.picked_up_at = null;
    }
  }

  const hasServiceIds = data.service_ids !== undefined;
  const hasItems = data.order_items_data !== undefined;
  let serviceIds = null;
  let orderItemsData = null;

  if (hasServiceIds) {
    serviceIds = normalizeServiceIds(data.service_ids);
    if (!serviceIds.length) {
      throw new AppError('VALIDATION_ERROR', 'At least one service is required', 400);
    }
  }
  if (hasItems) {
    orderItemsData = normalizeOrderItemsData(data.order_items_data);
    if (!orderItemsData.length) {
      throw new AppError(
        'VALIDATION_ERROR',
        'At least one order item with dirty or clean quantity is required',
        400
      );
    }
  }

  const now = new Date();

  await sequelize.transaction(async (t) => {
    if (hasServiceIds) {
      await validateServicesExist(serviceIds, t);
      await replaceOrderServices(order.id, serviceIds, t);
    }
    if (hasItems) {
      await replaceOrderItems(order.id, orderItemsData, now, t);
    }

    await order.save({ transaction: t });

    if (data.discount_amount !== undefined || hasItems) {
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

  if (data.order_status && data.order_status !== oldStatus) {
    orderNotificationService
      .notifyOrderStatusChange(order.id, oldStatus, data.order_status)
      .catch((err) => {
        console.error(
          JSON.stringify({
            event: 'order_notification_error',
            orderId: order.id,
            error: err.message,
          })
        );
      });
  }

  if (data.estimated_completion_date !== undefined) {
    orderNotificationService
      .notifyEstimatedCompletionChange(
        order.id,
        previousEstimatedCompletion,
        order.estimated_completion_date
      )
      .catch((err) => {
        console.error(
          JSON.stringify({
            event: 'order_schedule_notification_error',
            orderId: order.id,
            error: err.message,
          })
        );
      });
  }

  if (pickedUpAtForSms) {
    orderNotificationService
      .notifyOrderPickedUp(order.id, pickedUpAtForSms)
      .catch((err) => {
        console.error(
          JSON.stringify({
            event: 'order_pickup_notification_error',
            orderId: order.id,
            error: err.message,
          })
        );
      });
  }

  const updated = await loadOrderDetail(order.id);
  return formatOrder(updated);
}

async function syncOrderPaymentStatus(orderId, transaction) {
  const order = await Order.findByPk(orderId, { transaction });
  const previousOrderStatus = order.order_status;
  const result = await Payment.findOne({
    where: { order_id: orderId, status: 'paid' },
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

  const threshold = parseFloat(order.total_amount) * ORDER_IN_PROGRESS_PAYMENT_RATIO;
  const shouldAutoInProgress =
    previousOrderStatus === 'pending' && totalPaid >= threshold;

  if (shouldAutoInProgress) {
    order.order_status = 'in_progress';
  }

  order.updated_at = new Date();
  await order.save({ transaction });

  if (shouldAutoInProgress) {
    await OrderStatusHistory.create(
      {
        order_id: order.id,
        old_status: previousOrderStatus,
        new_status: 'in_progress',
        changed_by: null,
        changed_at: new Date(),
      },
      { transaction }
    );
  }

  return { order, previousOrderStatus };
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
