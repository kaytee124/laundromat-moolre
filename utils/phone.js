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

module.exports = {
  normalizeMsisdn,
  getMsisdnLookupVariants,
  formatSmsRecipient,
};
