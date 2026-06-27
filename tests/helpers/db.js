const { sequelize } = require('../../models');

const TABLES = [
  'ussd_sessions',
  'order_status_history',
  'refresh_tokens',
  'payments',
  'order_items',
  'orders',
  'customers',
  'services',
  'users',
];

async function truncateAll() {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES) {
    await sequelize.query(`TRUNCATE TABLE \`${table}\``);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function closeDb() {
  await sequelize.close();
}

module.exports = { truncateAll, closeDb };
