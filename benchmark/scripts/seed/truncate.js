'use strict';

const { createConnection } = require('../lib/db');

const TABLES = [
  'order_status_history',
  'refresh_tokens',
  'payments',
  'order_items',
  'orders',
  'services',
  'customers',
  'users',
];

async function truncateBenchmarkTables(conn) {
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES) {
    await conn.query(`TRUNCATE TABLE \`${table}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

module.exports = { truncateBenchmarkTables, TABLES };
