const axios = require('axios');
const moolreConfig = require('../config/moolre');

const MOOLRE_HEADERS = {
  'X-API-USER': moolreConfig.apiUser,
  'X-API-PUBKEY': moolreConfig.apiPubkey,
  'Content-Type': 'application/json',
};

async function generatePaymentLink({ email, amount, externalref, metadata }) {
  const payload = {
    type: 1,
    amount: String(amount),
    currency: 'GHS',
    accountnumber: moolreConfig.accountNumber,
    email,
    externalref,
    callback: moolreConfig.webhookUrl,
    reusable: '0',
    metadata: metadata || {},
  };

  if (moolreConfig.redirectUrl) {
    payload.redirect = moolreConfig.redirectUrl;
  }

  const response = await axios.post(`${moolreConfig.apiBase}/embed/link`, payload, {
    headers: MOOLRE_HEADERS,
    timeout: 30000,
  });
  return response.data;
}

async function checkTransactionStatus({ idtype, id }) {
  const response = await axios.post(
    `${moolreConfig.apiBase}/open/transact/status`,
    {
      type: 1,
      idtype: String(idtype),
      id,
      accountnumber: moolreConfig.accountNumber,
    },
    { headers: MOOLRE_HEADERS, timeout: 30000 }
  );
  return response.data;
}

module.exports = {
  generatePaymentLink,
  checkTransactionStatus,
};
