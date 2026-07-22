const { requireEnv } = require('../config/env');

module.exports = {
  ORDER_IN_PROGRESS_PAYMENT_RATIO: 0.3,
  DEFAULT_CUSTOMER_PASSWORD: requireEnv('DEFAULT_CUSTOMER_PASSWORD'),
  CUSTOMER_APP_URL: requireEnv('CUSTOMER_APP_URL').replace(/\/$/, ''),
  ROLES: ['superadmin', 'admin', 'employee', 'client'],
  ORDER_STATUSES: ['pending', 'in_progress', 'ready', 'completed', 'cancelled'],
  PAYMENT_STATUSES: ['pending', 'partially_paid', 'paid'],
  PAYMENT_RECORD_STATUSES: ['pending', 'paid', 'failed'],
  PAYMENT_METHODS: ['moolre', 'cash', 'bank_transfer', 'ussd'],
  CONTACT_METHODS: ['phone', 'whatsapp'],
};
