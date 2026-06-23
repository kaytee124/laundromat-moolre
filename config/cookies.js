require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  csrfCookieName: process.env.CSRF_COOKIE_NAME || 'csrf_token',
  refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'refresh_token',
  cookiePath: '/',
  sameSite: 'strict',
  secure: isProduction,
  csrfMaxAgeMs: 24 * 60 * 60 * 1000,
  refreshMaxAgeMs: 24 * 60 * 60 * 1000,
};
