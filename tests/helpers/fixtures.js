const { Service, Order, OrderItem, OrderService } = require('../../models');
const { v4: uuidv4 } = require('uuid');

let counter = 0;

function uniqueId() {
  counter += 1;
  return `${Date.now()}${counter}`;
}

function uniqueUsername(prefix = 'user') {
  return `${prefix}_${uniqueId()}`;
}

function uniquePhone() {
  return `02${String(uniqueId()).slice(-8)}`;
}

async function createService(user, overrides = {}) {
  const id = uniqueId();
  return Service.create({
    name: overrides.name || `Service ${id}`,
    description: overrides.description || 'Test service',
    price: overrides.price !== undefined ? overrides.price : 25.0,
    unit: 'per item',
    category: overrides.category || 'wash',
    estimated_days: 2,
    is_active: overrides.is_active !== undefined ? overrides.is_active : true,
    created_by: user.id,
    created_at: new Date(),
    updated_at: new Date(),
  });
}

async function createOrder(employee, customer, service, overrides = {}) {
  const dirty = overrides.dirty_quantity ?? overrides.quantity ?? 2;
  const clean = overrides.clean_quantity ?? 0;
  const unitPrice = overrides.unit_price || parseFloat(service.price);
  const subtotal = unitPrice * (dirty + clean);
  const discount = overrides.discount_amount || 0;
  const serviceIds = overrides.service_ids || [service.id];

  const order = await Order.create({
    order_number: `ORD-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    customer_id: customer.id,
    assigned_to: overrides.assigned_to || employee.id,
    order_status: overrides.order_status || 'pending',
    payment_status: overrides.payment_status || 'pending',
    total_amount: subtotal - discount,
    amount_paid: overrides.amount_paid || 0,
    discount_amount: discount,
    delivery_date: overrides.delivery_date || null,
    delivery_time: overrides.delivery_time || null,
    estimated_completion_date: overrides.estimated_completion_date || null,
    picked_up: overrides.picked_up || false,
    picked_up_at: overrides.picked_up_at || null,
    created_by: employee.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  for (const serviceId of serviceIds) {
    await OrderService.create({
      order_id: order.id,
      service_id: serviceId,
    });
  }

  await OrderItem.create({
    order_id: order.id,
    service_id: null,
    item_name: overrides.item_name || 'SHIRTS',
    description: overrides.description || null,
    dirty_quantity: dirty,
    clean_quantity: clean,
    unit_price: unitPrice,
    subtotal,
    notes: overrides.notes || null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return order;
}

module.exports = {
  uniqueUsername,
  uniquePhone,
  createService,
  createOrder,
};
