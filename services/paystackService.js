const axios = require('axios');
const paystackConfig = require('../config/paystack');

async function initializeTransaction(payload) {
  const response = await axios.post(
    `${paystackConfig.apiBase}/transaction/initialize`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${paystackConfig.secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
  return response.data;
}

async function verifyTransaction(reference) {
  const response = await axios.get(
    `${paystackConfig.apiBase}/transaction/verify/${reference}`,
    {
      headers: { Authorization: `Bearer ${paystackConfig.secretKey}` },
      timeout: 30000,
    }
  );
  return response.data;
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
};
