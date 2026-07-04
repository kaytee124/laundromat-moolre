const { requireEnv } = require('./env');

module.exports = {
  apiUser: requireEnv('MOOLRE_API_USER'),
  apiPubkey: requireEnv('MOOLRE_API_PUBKEY'),
  accountNumber: requireEnv('MOOLRE_ACCOUNT_NUMBER'),
  webhookUrl: requireEnv('MOOLRE_WEBHOOK_URL'),
  redirectUrl: process.env.MOOLRE_REDIRECT_URL?.trim() || null,
  webhookSecret: requireEnv('MOOLRE_WEBHOOK_SECRET'),
  smsVasKey: requireEnv('MOOLRE_SMS_VAS_KEY'),
  smsSenderId: requireEnv('MOOLRE_SMS_SENDER_ID'),
  apiBase: 'https://api.moolre.com',
};
