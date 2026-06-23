'use strict';

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 */
function createRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function intBetween(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function decimalBetween(rng, min, max, decimals = 2) {
  const v = min + rng() * (max - min);
  return v.toFixed(decimals);
}

const ORDER_STATUSES = ['pending', 'in_progress', 'ready', 'completed', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'partial', 'paid'];
const PAYMENT_METHODS = ['cash', 'card', 'bank', 'ussd', 'paystack'];
const CONTACT_METHODS = ['phone', 'whatsapp', 'email'];
const SERVICE_CATEGORIES = ['wash', 'dry_clean', 'iron', 'express', 'specialty'];
const SERVICE_UNITS = ['kg', 'piece', 'set'];

function generateOrderNumber(orderId) {
  return `ORD-${orderId.toString(16).toUpperCase().padStart(8, '0')}`;
}

function generateReference(paymentId) {
  return `PAY-${paymentId.toString(16).toUpperCase().padStart(12, '0')}`;
}

function generateJti(tokenId) {
  return tokenId.toString(16).padStart(32, '0');
}

function randomDate(rng, startYear = 2020, endYear = 2025) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  return new Date(start + rng() * (end - start));
}

function formatDateTime(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function formatDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function weightedPick(rng, items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

module.exports = {
  createRng,
  pick,
  intBetween,
  decimalBetween,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  CONTACT_METHODS,
  SERVICE_CATEGORIES,
  SERVICE_UNITS,
  generateOrderNumber,
  generateReference,
  generateJti,
  randomDate,
  formatDateTime,
  formatDateOnly,
  weightedPick,
};
