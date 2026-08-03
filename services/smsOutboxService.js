const { SmsOutbox, Customer } = require('../models');
const moolreService = require('./moolreService');
const { formatSmsRecipient } = require('../utils/phone');

const PERMANENT_PHONE_PATTERNS = [
  /invalid\s*phone/i,
  /phone\s*number\s*(is\s*)?(invalid|does\s*not\s*exist|doesn't\s*exist)/i,
  /does\s*not\s*exist/i,
  /doesn't\s*exist/i,
  /unknown\s*subscriber/i,
  /number\s*(not|is\s*not)\s*(valid|found|exist)/i,
  /invalid\s*(msisdn|recipient|number)/i,
];

function isPermanentPhoneError(err) {
  const message = String(err?.message || '');
  const code = String(err?.code ?? '');
  const haystack = `${message} ${code}`;
  return PERMANENT_PHONE_PATTERNS.some((re) => re.test(haystack));
}

async function markCustomerPhoneNeedsCorrection(relatedType, relatedId) {
  if (relatedType !== 'customer' || !relatedId) return;
  await Customer.update(
    { phone_needs_correction: true, updated_at: new Date() },
    { where: { id: relatedId } }
  );
}

/**
 * Attempt to send one outbox row. Updates status in place.
 * @param {import('../models/SmsOutbox')} row
 */
async function attemptSend(row) {
  const now = new Date();
  row.attempts = (row.attempts || 0) + 1;
  row.last_attempt_at = now;

  try {
    await moolreService.sendSms({
      recipient: row.recipient,
      message: row.message,
      ref: row.ref || undefined,
    });
    row.status = 'sent';
    row.sent_at = now;
    row.last_error = null;
    await row.save();
    return { ok: true, row };
  } catch (err) {
    row.last_error = err.message || String(err);
    if (isPermanentPhoneError(err)) {
      row.status = 'failed_permanent';
      await row.save();
      await markCustomerPhoneNeedsCorrection(row.related_type, row.related_id);
      console.error(
        JSON.stringify({
          event: 'sms_outbox_permanent_failure',
          id: row.id,
          purpose: row.purpose,
          error: err.message,
          code: err.code,
        })
      );
      return { ok: false, permanent: true, row };
    }

    row.status = 'pending';
    await row.save();
    console.error(
      JSON.stringify({
        event: 'sms_outbox_transient_failure',
        id: row.id,
        purpose: row.purpose,
        error: err.message,
        code: err.code,
      })
    );
    return { ok: false, permanent: false, row };
  }
}

/**
 * Insert outbox row and try send immediately.
 * @param {{
 *   recipient: string,
 *   message: string,
 *   ref?: string,
 *   purpose: string,
 *   relatedType?: string|null,
 *   relatedId?: number|string|null,
 * }} payload
 */
async function enqueueSms({ recipient, message, ref, purpose, relatedType = null, relatedId = null }) {
  const formattedRecipient = formatSmsRecipient(recipient);
  const row = await SmsOutbox.create({
    recipient: formattedRecipient,
    message,
    ref: ref || null,
    purpose,
    related_type: relatedType || null,
    related_id: relatedId != null ? relatedId : null,
    status: 'pending',
    attempts: 0,
    created_at: new Date(),
  });

  return attemptSend(row);
}

async function processPendingSms({ limit = 100 } = {}) {
  const rows = await SmsOutbox.findAll({
    where: { status: 'pending' },
    order: [['id', 'ASC']],
    limit,
  });

  let sent = 0;
  let permanent = 0;
  let stillPending = 0;

  for (const row of rows) {
    const result = await attemptSend(row);
    if (result.ok) sent += 1;
    else if (result.permanent) permanent += 1;
    else stillPending += 1;
  }

  return { processed: rows.length, sent, permanent, stillPending };
}

module.exports = {
  isPermanentPhoneError,
  enqueueSms,
  attemptSend,
  processPendingSms,
};
