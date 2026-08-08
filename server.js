const { requireEnv, requireEnvInt } = require('./config/env');

const app = require('./app');
const { sequelize } = require('./models');
const { runPendingMigrations, shouldRunMigrationsOnStart } = require('./lib/runMigrations');
const { startPaymentReconciliation } = require('./jobs/paymentReconciliation');
const { startSmsOutboxWorker } = require('./jobs/smsOutboxWorker');
const { startOrderDueReminderWorker } = require('./jobs/orderDueReminder');
const { backfillOrderSheet } = require('./lib/backfillOrderSheet');
const { seedSampleOrders } = require('./lib/seedSampleOrders');

const PORT = requireEnvInt('PORT');
const NODE_ENV = requireEnv('NODE_ENV');

/** Only when SEED_ORDER_SHEET_ON_START=true (never implicit on development). */
function shouldSeedOrderSheetOnStart() {
  return process.env.SEED_ORDER_SHEET_ON_START === 'true';
}

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    if (shouldRunMigrationsOnStart()) {
      await runPendingMigrations(sequelize);
    }

    if (shouldSeedOrderSheetOnStart()) {
      await backfillOrderSheet();
      await seedSampleOrders();
    }

    if (NODE_ENV !== 'test') {
      startPaymentReconciliation();
      startSmsOutboxWorker();
      startOrderDueReminderWorker();
    }

    app.listen(PORT, () => {
      console.log(`Bubblebytes API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
