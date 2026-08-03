const { AppError } = require('./errors');

const LOCAL_RE = /^0\d{9}$/;
const INTL_RE = /^\+233\d{9}$/;

function isValidGhanaPhone(input) {
  const s = String(input ?? '').trim();
  return LOCAL_RE.test(s) || INTL_RE.test(s);
}

/**
 * @param {unknown} input
 * @param {string} [fieldName]
 * @returns {string} trimmed valid input
 */
function assertValidGhanaPhone(input, fieldName = 'phone_number') {
  const s = String(input ?? '').trim();
  if (!isValidGhanaPhone(s)) {
    throw new AppError(
      'VALIDATION_ERROR',
      `${fieldName} must be a valid Ghana number (10 digits starting with 0, or +233 followed by 9 digits)`,
      400
    );
  }
  return s;
}

/**
 * Validate Ghana format then normalize to local `0XXXXXXXXX`.
 * @param {unknown} input
 * @param {string} [fieldName]
 */
function normalizeValidGhanaPhone(input, fieldName = 'phone_number') {
  return normalizeMsisdn(assertValidGhanaPhone(input, fieldName));
}

function normalizeMsisdn(msisdn) {
  const digits = String(msisdn).replace(/\D/g, '');
  if (digits.startsWith('233')) {
    return `0${digits.slice(3)}`;
  }
  if (digits.startsWith('0')) {
    return digits;
  }
  return `0${digits}`;
}

function getMsisdnLookupVariants(msisdn) {
  const digits = String(msisdn).replace(/\D/g, '');
  const normalized = normalizeMsisdn(msisdn);
  const variants = new Set([normalized, digits]);
  if (digits.startsWith('233')) {
    variants.add(`0${digits.slice(3)}`);
  }
  return [...variants];
}

function formatSmsRecipient(msisdn) {
  const digits = String(msisdn).replace(/\D/g, '');
  if (digits.startsWith('233')) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `233${digits.slice(1)}`;
  }
  return `233${digits}`;
}

function formatMoolrePaymentPayer(msisdn) {
  return normalizeMsisdn(msisdn);
}

module.exports = {
  isValidGhanaPhone,
  assertValidGhanaPhone,
  normalizeValidGhanaPhone,
  normalizeMsisdn,
  getMsisdnLookupVariants,
  formatSmsRecipient,
  formatMoolrePaymentPayer,
};
