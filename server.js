const { requireEnv, requireEnvInt } = require('./config/env');

const app = require('./app');
const { sequelize } = require('./models');
const { runPendingMigrations, shouldRunMigrationsOnStart } = require('./lib/runMigrations');
const { startPaymentReconciliation } = require('./jobs/paymentReconciliation');
const { ensurePostmanCustomer } = require('./lib/seedPostmanCustomer');
const { backfillOrderSheet } = require('./lib/backfillOrderSheet');
const { seedSampleOrders } = require('./lib/seedSampleOrders');

const PORT = requireEnvInt('PORT');
const NODE_ENV = requireEnv('NODE_ENV');

/** Development always; production only when SEED_ORDER_SHEET_ON_START=true */
function shouldSeedOrderSheetOnStart() {
  return NODE_ENV === 'development' || process.env.SEED_ORDER_SHEET_ON_START === 'true';
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

    if (NODE_ENV === 'development') {
      await ensurePostmanCustomer();
    }

    if (NODE_ENV !== 'test') {
      startPaymentReconciliation();
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
