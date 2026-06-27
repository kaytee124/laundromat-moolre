const ussdService = require('../services/ussdService');

async function initializePayment(req, res) {
  const { phone_number, order_id, amount } = req.body;
  const data = await ussdService.initializePayment(phone_number, order_id, amount);
  res.json({
    status: 'success',
    message: 'Payment initialized successfully',
    data,
  });
}

async function handleCallback(req, res) {
  const body = req.body || {};
  const result = await ussdService.handleUssdRequest({
    sessionId: body.sessionId ?? body.sessionid,
    new: body.new === true || body.new === 'true',
    msisdn: body.msisdn,
    message: body.message,
  });
  res.json(result);
}

module.exports = { initializePayment, handleCallback };
