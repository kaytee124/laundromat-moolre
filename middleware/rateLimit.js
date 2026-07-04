const { createRateLimiter } = require('./rateLimitCore');
const { requireEnvInt } = require('../config/env');

const moolreWebhookRateLimit = createRateLimiter({
  max: requireEnvInt('MOOLRE_WEBHOOK_RATE_LIMIT_MAX'),
  windowMs: requireEnvInt('MOOLRE_WEBHOOK_RATE_LIMIT_WINDOW_MS'),
  keyPrefix: 'moolre-webhook',
});

module.exports = {
  createRateLimiter,
  moolreWebhookRateLimit,
};
