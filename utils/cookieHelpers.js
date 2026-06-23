const cookieConfig = require('../config/cookies');

function baseCookieOptions(maxAgeMs) {
  return {
    path: cookieConfig.cookiePath,
    sameSite: cookieConfig.sameSite,
    secure: cookieConfig.secure,
    maxAge: maxAgeMs,
  };
}

function setRefreshCookie(res, refreshToken) {
  res.cookie(cookieConfig.refreshCookieName, refreshToken, {
    ...baseCookieOptions(cookieConfig.refreshMaxAgeMs),
    httpOnly: true,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(cookieConfig.refreshCookieName, {
    path: cookieConfig.cookiePath,
    sameSite: cookieConfig.sameSite,
    secure: cookieConfig.secure,
    httpOnly: true,
  });
}

function setCsrfCookie(res, csrfToken) {
  res.cookie(cookieConfig.csrfCookieName, csrfToken, {
    ...baseCookieOptions(cookieConfig.csrfMaxAgeMs),
    httpOnly: false,
  });
}

function readRefreshFromRequest(req) {
  return req.cookies?.[cookieConfig.refreshCookieName] || null;
}

module.exports = {
  setRefreshCookie,
  clearRefreshCookie,
  setCsrfCookie,
  readRefreshFromRequest,
};
