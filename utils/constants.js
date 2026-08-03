const { requireEnv } = require('../config/env');
const { buildDefaultPassword } = require('./passwords');

module.exports = {
  ORDER_IN_PROGRESS_PAYMENT_RATIO: 0.3,
  /** @deprecated Use buildDefaultPassword(username). Kept only for re-export convenience. */
  buildDefaultPassword,
  CUSTOMER_APP_URL: requireEnv('CUSTOMER_APP_URL').replace(/\/$/, ''),
  ROLES: ['superadmin', 'admin', 'employee', 'client'],
  ORDER_STATUSES: ['pending', 'in_progress', 'ready', 'completed', 'cancelled'],
  PAYMENT_STATUSES: ['pending', 'partially_paid', 'paid'],
  PAYMENT_RECORD_STATUSES: ['pending', 'paid', 'failed'],
  PAYMENT_METHODS: ['moolre', 'cash', 'bank_transfer', 'ussd'],
  CONTACT_METHODS: ['phone', 'whatsapp'],
};
