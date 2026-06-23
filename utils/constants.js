module.exports = {
  DEFAULT_CUSTOMER_PASSWORD: 'ChangeMe123!',
  ROLES: ['superadmin', 'admin', 'employee', 'client'],
  ORDER_STATUSES: ['pending', 'in_progress', 'ready', 'completed', 'cancelled'],
  PAYMENT_STATUSES: ['pending', 'partially_paid', 'paid'],
  PAYMENT_RECORD_STATUSES: ['pending', 'success', 'failed', 'abandoned'],
  PAYMENT_METHODS: ['paystack', 'cash', 'bank_transfer', 'ussd'],
  CONTACT_METHODS: ['phone', 'whatsapp'],
};
