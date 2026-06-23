require('dotenv').config();

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

module.exports = {
  secretKey: process.env.PAYSTACK_SECRET_KEY || '',
  baseUrl,
  callbackUrl: `${baseUrl}/api/payments/callback/`,
  apiBase: 'https://api.paystack.co',
};
