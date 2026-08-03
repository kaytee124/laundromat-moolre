const crypto = require('crypto');
const { WelcomeLoginToken } = require('../models');
const { AppError } = require('../utils/errors');

const DEFAULT_TTL_HOURS = 720; // 30 days

function getWelcomeTokenTtlMs() {
  const hours = parseInt(process.env.WELCOME_LOGIN_TOKEN_TTL_HOURS || String(DEFAULT_TTL_HOURS), 10);
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_TTL_HOURS;
  return safeHours * 60 * 60 * 1000;
}

function hashWelcomeToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken), 'utf8').digest('hex');
}

function generateRawWelcomeToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Create a reusable welcome/portal login token for a user (valid until expiry).
 * @returns {Promise<string>} raw token (send in SMS only; store hash)
 */
async function createWelcomeLoginToken(userId) {
  const rawToken = generateRawWelcomeToken();
  const token_hash = hashWelcomeToken(rawToken);
  const now = new Date();

  await WelcomeLoginToken.create({
    user_id: userId,
    token_hash,
    expires_at: new Date(now.getTime() + getWelcomeTokenTtlMs()),
    used_at: null,
    created_at: now,
  });

  return rawToken;
}

/**
 * Validate a welcome/portal token (reusable until expiry). Returns user_id on success.
 */
async function consumeWelcomeLoginToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new AppError('MISSING_FIELDS', 'Welcome token is required', 400);
  }

  const token_hash = hashWelcomeToken(rawToken.trim());
  const record = await WelcomeLoginToken.findOne({ where: { token_hash } });

  if (!record || new Date(record.expires_at) < new Date()) {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired welcome link', 401);
  }

  return record.user_id;
}

module.exports = {
  createWelcomeLoginToken,
  consumeWelcomeLoginToken,
  hashWelcomeToken,
  getWelcomeTokenTtlMs,
  DEFAULT_TTL_HOURS,
};
