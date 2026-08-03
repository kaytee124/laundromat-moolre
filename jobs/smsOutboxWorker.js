const { processPendingSms } = require('../services/smsOutboxService');

const SMS_OUTBOX_INTERVAL_MS = 2 * 60 * 60 * 1000;
let intervalId = null;

function startSmsOutboxWorker() {
  if (intervalId) return;

  intervalId = setInterval(() => {
    processPendingSms().catch((err) => {
      console.error('SMS outbox worker error:', err);
    });
  }, SMS_OUTBOX_INTERVAL_MS);

  if (intervalId.unref) {
    intervalId.unref();
  }
}

function stopSmsOutboxWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  startSmsOutboxWorker,
  stopSmsOutboxWorker,
  SMS_OUTBOX_INTERVAL_MS,
};
