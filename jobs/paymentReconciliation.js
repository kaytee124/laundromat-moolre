const paymentService = require('../services/paymentService');

const RECONCILIATION_INTERVAL_MS = 2 * 60 * 1000;
let intervalId = null;

function startPaymentReconciliation() {
  if (intervalId) return;

  intervalId = setInterval(() => {
    paymentService.reconcilePendingPayments().catch((err) => {
      console.error('Payment reconciliation error:', err);
    });
  }, RECONCILIATION_INTERVAL_MS);

  if (intervalId.unref) {
    intervalId.unref();
  }
}

function stopPaymentReconciliation() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  startPaymentReconciliation,
  stopPaymentReconciliation,
};
