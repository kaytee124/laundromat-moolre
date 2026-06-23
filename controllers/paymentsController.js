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

async function callback(req, res) {
  const result = await paymentService.handleCallback(req.query.reference);
  res.json(result);
}

module.exports = { initialize, callback };
