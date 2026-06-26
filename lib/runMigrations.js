const path = require('path');
const Umzug = require('umzug');
const { Sequelize } = require('sequelize');

function shouldRunMigrationsOnStart() {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.RUN_MIGRATIONS_ON_START === 'false') return false;
  return true;
}

async function runPendingMigrations(sequelize) {
  const umzug = new Umzug({
    migrations: {
      path: path.join(__dirname, '..', 'migrations'),
      params: [sequelize.getQueryInterface(), Sequelize],
    },
    storage: 'sequelize',
    storageOptions: { sequelize },
    logging: (msg) => console.log(msg),
  });

  const pending = await umzug.pending();
  if (pending.length === 0) {
    console.log('Database migrations: up to date.');
    return;
  }

  console.log(`Running ${pending.length} pending migration(s)...`);
  await umzug.up();
  console.log('Database migrations complete.');
}

module.exports = {
  shouldRunMigrationsOnStart,
  runPendingMigrations,
};
