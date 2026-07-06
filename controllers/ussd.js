const ussdService = require('../services/ussdService');
const { parseUssdCallbackBody, parseUssdNew } = require('../utils/ussdCallbackBody');

async function initializePayment(req, res) {
  const { phone_number, order_id, amount, network, session_id } = req.body;
  const data = await ussdService.initializePayment({
    phoneNumber: phone_number,
    orderId: order_id,
    amount,
    network,
    moolreSessionId: session_id,
    payerMsisdn: phone_number,
  });
  res.json({
    status: 'success',
    message: 'Payment initialized successfully',
    data,
  });
}

async function handleCallback(req, res) {
  const body = parseUssdCallbackBody(req);
  const sessionId = body.sessionId ?? body.sessionid;
  const isNew = parseUssdNew(body.new);
  const msisdn = body.msisdn;
  const message = body.message;

  console.log(
    JSON.stringify({
      event: 'ussd_callback_request',
      contentType: req.headers['content-type'],
      rawBody: req.body,
      normalizedBody: body,
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
    network: body.network,
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
