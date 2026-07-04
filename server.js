const { requireEnv, requireEnvInt } = require('./config/env');

const app = require('./app');
const { sequelize } = require('./models');
const { runPendingMigrations, shouldRunMigrationsOnStart } = require('./lib/runMigrations');
const { startPaymentReconciliation } = require('./jobs/paymentReconciliation');
const { ensurePostmanCustomer } = require('./lib/seedPostmanCustomer');

const PORT = requireEnvInt('PORT');
const NODE_ENV = requireEnv('NODE_ENV');

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    if (shouldRunMigrationsOnStart()) {
      await runPendingMigrations(sequelize);
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
