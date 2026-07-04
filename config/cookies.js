const { requireEnv } = require('./env');

const isProduction = requireEnv('NODE_ENV') === 'production';

module.exports = {
  csrfCookieName: requireEnv('CSRF_COOKIE_NAME'),
  refreshCookieName: requireEnv('REFRESH_COOKIE_NAME'),
  cookiePath: '/',
  sameSite: 'strict',
  secure: isProduction,
  csrfMaxAgeMs: 24 * 60 * 60 * 1000,
  refreshMaxAgeMs: 24 * 60 * 60 * 1000,
};
