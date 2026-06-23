const crypto = require('crypto');
const cookieConfig = require('../config/cookies');
const { setCsrfCookie } = require('../utils/cookieHelpers');
const { AppError } = require('../utils/errors');

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function issueCsrfToken(req, res) {
  const csrfToken = generateCsrfToken();
  setCsrfCookie(res, csrfToken);
  res.json({ csrf_token: csrfToken });
}

function verifyCsrf(req) {
  const cookieToken = req.cookies?.[cookieConfig.csrfCookieName];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken) {
    throw new AppError('CSRF_VALIDATION_FAILED', 'CSRF token missing or invalid', 403);
  }

  const cookieBuf = Buffer.from(cookieToken);
  const headerBuf = Buffer.from(headerToken);

  if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
    throw new AppError('CSRF_VALIDATION_FAILED', 'CSRF token missing or invalid', 403);
  }
}

function csrfProtection(req, res, next) {
  try {
    verifyCsrf(req);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  issueCsrfToken,
  verifyCsrf,
  csrfProtection,
};
