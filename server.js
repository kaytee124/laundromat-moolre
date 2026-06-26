require('dotenv').config();

const app = require('./app');
const { sequelize } = require('./models');
const { runPendingMigrations, shouldRunMigrationsOnStart } = require('./lib/runMigrations');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    if (shouldRunMigrationsOnStart()) {
      await runPendingMigrations(sequelize);
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
