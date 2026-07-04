const paymentService = require('../services/paymentService');

async function initialize(req, res) {
  const { order_id, amount } = req.body;
  const data = await paymentService.initializePayment(req.user, order_id, amount);
  res.json({
    status: 'success',
    message: 'Payment initialized successfully',
    data,
  });
}

async function moolreWebhook(req, res) {
  await paymentService.handleMoolreWebhook(req.body);
  res.status(200).json({ status: 'ok' });
}

async function getStatus(req, res) {
  const data = await paymentService.getPaymentStatus(req.params.externalref);
  res.json(data);
}

module.exports = { initialize, moolreWebhook, getStatus };
