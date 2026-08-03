#!/usr/bin/env node
/**
 * Manually process pending SMS outbox rows.
 * Usage: node scripts/processSmsOutbox.js
 */
require('dotenv').config();

const { sequelize } = require('../models');
const { processPendingSms } = require('../services/smsOutboxService');

async function main() {
  await sequelize.authenticate();
  const result = await processPendingSms({ limit: 500 });
  console.log(JSON.stringify({ event: 'sms_outbox_processed', ...result }));
  await sequelize.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
