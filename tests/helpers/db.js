const { sequelize } = require('../../models');

const TABLES = [
  'ussd_sessions',
  'welcome_login_tokens',
  'sms_outbox',
  'addon_catalog_items',
  'order_status_history',
  'refresh_tokens',
  'payments',
  'order_items',
  'order_services',
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
