const { processDueReminders } = require('../services/orderDueReminderService');

const DUE_REMINDER_INTERVAL_MS = 5 * 60 * 1000;
let intervalId = null;

function startOrderDueReminderWorker() {
  if (intervalId) return;

  intervalId = setInterval(() => {
    processDueReminders().catch((err) => {
      console.error('Order due reminder worker error:', err);
    });
  }, DUE_REMINDER_INTERVAL_MS);

  if (intervalId.unref) {
    intervalId.unref();
  }
}

function stopOrderDueReminderWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  startOrderDueReminderWorker,
  stopOrderDueReminderWorker,
  DUE_REMINDER_INTERVAL_MS,
};
