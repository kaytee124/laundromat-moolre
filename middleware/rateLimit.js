const { createRateLimiter } = require('./rateLimitCore');
const { requireEnvInt } = require('../config/env');

const moolreWebhookRateLimit = createRateLimiter({
  max: requireEnvInt('MOOLRE_WEBHOOK_RATE_LIMIT_MAX'),
  windowMs: requireEnvInt('MOOLRE_WEBHOOK_RATE_LIMIT_WINDOW_MS'),
  keyPrefix: 'moolre-webhook',
});

const welcomeLoginRateLimit = createRateLimiter({
  max: parseInt(process.env.WELCOME_LOGIN_RATE_LIMIT_MAX || '20', 10),
  windowMs: parseInt(process.env.WELCOME_LOGIN_RATE_LIMIT_WINDOW_MS || '900000', 10),
  keyPrefix: 'welcome-login',
});

module.exports = {
  createRateLimiter,
  moolreWebhookRateLimit,
  welcomeLoginRateLimit,
};
