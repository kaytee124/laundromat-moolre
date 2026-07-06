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
  const sessionId = body.sessionId ?? body.sessionid;
  const isNew = body.new === true || body.new === 'true';
  const msisdn = body.msisdn;
  const message = body.message;

  console.log(
    JSON.stringify({
      event: 'ussd_callback_request',
      contentType: req.headers['content-type'],
      body,
      parsed: {
        sessionId,
        newRaw: body.new,
        isNew,
        msisdn,
        message,
        network: body.network,
        extension: body.extension,
        data: body.data,
      },
    })
  );

  const result = await ussdService.handleUssdRequest({
    sessionId,
    new: isNew,
    msisdn,
    message,
  });

  console.log(
    JSON.stringify({
      event: 'ussd_callback_response',
      sessionId,
      isNew,
      reply: result.reply,
      messagePreview: String(result.message).slice(0, 80),
    })
  );

  res.json(result);
}

module.exports = { initializePayment, handleCallback };
