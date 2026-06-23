const orderService = require('../services/orderService');

async function list(req, res) {
  const data = await orderService.listOrders(req.user, req.query);
  res.json({ status: 'success', data });
}

async function getById(req, res) {
  const data = await orderService.getOrderById(req.params.id, req.user);
  res.json({ status: 'success', data });
}

async function create(req, res) {
  const data = await orderService.createOrder(req.body, req.user);
  res.status(201).json({ status: 'success', message: 'Order created successfully', data });
}

async function update(req, res) {
  const body = { ...req.body };
  delete body.amount_paid;
  const data = await orderService.updateOrder(req.params.id, body, req.user);
  res.json({ status: 'success', message: 'Order updated successfully', data });
}

module.exports = { list, getById, create, update };
