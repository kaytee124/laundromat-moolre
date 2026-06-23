const { Service, Order, OrderItem } = require('../../models');
const { v4: uuidv4 } = require('uuid');

let counter = 0;

function uniqueId() {
  counter += 1;
  return `${Date.now()}${counter}`;
}

function uniqueUsername(prefix = 'user') {
  return `${prefix}_${uniqueId()}`;
}

function uniqueEmail(prefix = 'user') {
  return `${prefix}_${uniqueId()}@test.com`;
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
  const quantity = overrides.quantity || 2;
  const unitPrice = overrides.unit_price || parseFloat(service.price);
  const subtotal = quantity * unitPrice;
  const discount = overrides.discount_amount || 0;

  const order = await Order.create({
    order_number: `ORD-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    customer_id: customer.id,
    assigned_to: overrides.assigned_to || employee.id,
    order_status: overrides.order_status || 'pending',
    payment_status: overrides.payment_status || 'pending',
    total_amount: subtotal - discount,
    amount_paid: overrides.amount_paid || 0,
    discount_amount: discount,
    created_by: employee.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  await OrderItem.create({
    order_id: order.id,
    service_id: service.id,
    item_name: service.name,
    description: service.description,
    quantity,
    unit_price: unitPrice,
    subtotal,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return order;
}

module.exports = {
  uniqueUsername,
  uniqueEmail,
  uniquePhone,
  createService,
  createOrder,
};
