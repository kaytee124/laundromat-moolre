const jwt = require('jsonwebtoken');
const authService = require('../services/authService');
const jwtConfig = require('../config/jwt');
const { verifyCsrf } = require('./csrf');
const { readRefreshFromRequest } = require('../utils/cookieHelpers');
const { AppError } = require('../utils/errors');

function attachNewToken(res, token) {
  res.locals.newAccessToken = token;
  res.locals.tokenRefreshed = true;
}

function tokenRefreshMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.locals.newAccessToken) {
      return originalJson({
        ...body,
        new_access_token: res.locals.newAccessToken,
        token_refreshed: true,
      });
    }
    return originalJson(body);
  };
  next();
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  let token = null;

  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    return next(new AppError('NO_TOKEN', 'Authentication credentials not provided', 401));
  }

  try {
    const user = await authService.getUserFromAccessToken(token);
    if (user) {
      req.user = user;
      return next();
    }
  } catch (err) {
    if (err.name !== 'TokenExpiredError') {
      return next(new AppError('INVALID_TOKEN', 'Invalid or expired token', 401));
    }
  }

  const refreshToken = readRefreshFromRequest(req);

  if (!refreshToken) {
    return next(new AppError('INVALID_TOKEN', 'Invalid or expired token', 401));
  }

  try {
    verifyCsrf(req);
    const newAccess = await authService.refreshAccessOnly(refreshToken);
    const user = await authService.getUserFromAccessToken(newAccess);
    req.user = user;
    attachNewToken(res, newAccess);
    return next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    return next(new AppError('INVALID_TOKEN', 'Invalid or expired token', 401));
  }
}

function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return next();

  authenticate(req, res, (err) => {
    if (err && err.errorCode === 'NO_TOKEN') return next();
    if (err) return next(err);
    next();
  });
}

async function verifyTokenHandler(req, res, next) {
  const token = req.body?.token;
  if (!token) {
    return next(new AppError('MISSING_TOKEN', 'Token is required', 400));
  }
  await authService.verifyToken(token);
  res.json({});
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  tokenRefreshMiddleware,
  verifyTokenHandler,
};
