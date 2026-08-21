/**
 * Retry pending SMS that failed with Moolre ASMS05 (duplicate ref)
 * by assigning a unique ref, then processing the outbox.
 *
 * Usage: node scripts/retryPendingSmsUniqueRefs.js
 */
require('dotenv').config();

const { Op } = require('sequelize');
const { SmsOutbox, sequelize } = require('../models');
const {
  processPendingSms,
  OBSOLETE_SMS_PURPOSES,
} = require('../services/smsOutboxService');

async function main() {
  const pending = await SmsOutbox.findAll({
    where: {
      status: 'pending',
      last_error: { [Op.like]: '%not unique%' },
      purpose: { [Op.notIn]: OBSOLETE_SMS_PURPOSES },
    },
    order: [['id', 'ASC']],
  });

  console.log(`Found ${pending.length} pending SMS with duplicate-ref errors`);

  for (const row of pending) {
    const base = row.ref || row.purpose || 'sms';
    row.ref = `${base}-retry-${row.id}-${Date.now()}`;
    await row.save();
    console.log(`Updated ref for outbox id=${row.id} -> ${row.ref}`);
  }

  const result = await processPendingSms({ limit: 500 });
  console.log(JSON.stringify({ event: 'retry_pending_sms_done', updated: pending.length, ...result }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
