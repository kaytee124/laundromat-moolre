const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, RefreshToken } = require('../models');
const jwtConfig = require('../config/jwt');
const { DEFAULT_CUSTOMER_PASSWORD } = require('../utils/constants');
const { AppError } = require('../utils/errors');

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateJti() {
  return crypto.randomBytes(32).toString('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role, type: 'access' },
    jwtConfig.secret,
    { expiresIn: jwtConfig.accessExpires, algorithm: jwtConfig.algorithm }
  );
}

function signRefreshToken(user, jti) {
  return jwt.sign(
    { userId: user.id, jti, type: 'refresh' },
    jwtConfig.secret,
    { expiresIn: jwtConfig.refreshExpires, algorithm: jwtConfig.algorithm }
  );
}

async function storeRefreshToken(userId, jti, expiresAt) {
  await RefreshToken.create({ user_id: userId, token_jti: jti, expires_at: expiresAt });
}

async function blacklistRefreshToken(jti) {
  await RefreshToken.update(
    { blacklisted_at: new Date() },
    { where: { token_jti: jti, blacklisted_at: null } }
  );
}

async function isRefreshTokenBlacklisted(jti) {
  const record = await RefreshToken.findOne({ where: { token_jti: jti } });
  if (!record) return true;
  if (record.blacklisted_at) return true;
  if (new Date(record.expires_at) < new Date()) return true;
  return false;
}

async function issueTokens(user) {
  const jti = generateJti();
  const refreshToken = signRefreshToken(user, jti);
  const decoded = jwt.decode(refreshToken);
  await storeRefreshToken(user.id, jti, new Date(decoded.exp * 1000));
  return {
    access: signAccessToken(user),
    refresh: refreshToken,
  };
}

async function login(username, password) {
  if (!username || !password) {
    throw new AppError('MISSING_FIELDS', 'Username and password are required', 400);
  }

  const user = await User.findOne({ where: { username } });

  if (user && !user.is_active) {
    throw new AppError(
      'ACCOUNT_INACTIVE',
      'Your account has been deactivated. Please contact the administrator for assistance.',
      401
    );
  }

  if (!user || !(await comparePassword(password, user.password_hash))) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password', 401);
  }

  if (!user.is_active) {
    throw new AppError(
      'ACCOUNT_INACTIVE',
      'Your account has been deactivated. Please contact the administrator for assistance.',
      401
    );
  }

  user.last_login = new Date();
  await user.save();

  const tokens = await issueTokens(user);
  const requiresPasswordChange = await comparePassword(DEFAULT_CUSTOMER_PASSWORD, user.password_hash);

  return { user, tokens, requiresPasswordChange };
}

async function logout(refreshToken) {
  if (!refreshToken) {
    throw new AppError('MISSING_TOKEN', 'Refresh token is required', 400);
  }

  try {
    const decoded = jwt.verify(refreshToken, jwtConfig.secret);
    if (decoded.type !== 'refresh' || !decoded.jti) {
      throw new AppError('INVALID_TOKEN', 'Invalid or expired token', 401);
    }
    await blacklistRefreshToken(decoded.jti);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('INVALID_TOKEN', 'Invalid or expired token', 401);
  }
}

async function refresh(refreshToken) {
  if (!refreshToken) {
    throw new AppError('MISSING_TOKEN', 'Refresh token is required', 400);
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, jwtConfig.secret);
  } catch {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired refresh token', 401);
  }

  if (decoded.type !== 'refresh' || !decoded.jti) {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired refresh token', 401);
  }

  if (await isRefreshTokenBlacklisted(decoded.jti)) {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired refresh token', 401);
  }

  const user = await User.findByPk(decoded.userId);
  if (!user || !user.is_active) {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired refresh token', 401);
  }

  await blacklistRefreshToken(decoded.jti);
  const tokens = await issueTokens(user);
  return tokens;
}

async function verifyToken(token) {
  try {
    jwt.verify(token, jwtConfig.secret);
    return { valid: true };
  } catch {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired token', 401);
  }
}

async function changePassword(userId, oldPassword, newPassword, confirmPassword) {
  if (!oldPassword || !newPassword || !confirmPassword) {
    throw new AppError('MISSING_FIELDS', 'All password fields are required', 400);
  }

  if (newPassword !== confirmPassword) {
    throw new AppError('VALIDATION_ERROR', 'New password and confirm password do not match.', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('VALIDATION_ERROR', 'Password must be at least 8 characters', 422);
  }

  if (newPassword === DEFAULT_CUSTOMER_PASSWORD) {
    throw new AppError(
      'VALIDATION_ERROR',
      'You cannot use the default password. Please choose a different password.',
      422
    );
  }

  const user = await User.findByPk(userId);
  if (!(await comparePassword(oldPassword, user.password_hash))) {
    throw new AppError('VALIDATION_ERROR', 'Old password is incorrect.', 400);
  }

  user.password_hash = await hashPassword(newPassword);
  user.updated_at = new Date();
  await user.save();
}

async function getUserFromAccessToken(token, ignoreExpiration = false) {
  const decoded = jwt.verify(token, jwtConfig.secret, { ignoreExpiration });
  if (decoded.type !== 'access' || !decoded.userId) return null;
  return {
    id: decoded.userId,
    username: decoded.username,
    role: decoded.role,
    is_active: true,
  };
}

async function refreshAccessOnly(refreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, jwtConfig.secret);
  } catch {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired token', 401);
  }

  if (decoded.type !== 'refresh' || !decoded.jti) {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired token', 401);
  }

  if (await isRefreshTokenBlacklisted(decoded.jti)) {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired token', 401);
  }

  const user = await User.findByPk(decoded.userId);
  if (!user || !user.is_active) {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired token', 401);
  }

  return signAccessToken(user);
}

module.exports = {
  hashPassword,
  comparePassword,
  login,
  logout,
  refresh,
  verifyToken,
  changePassword,
  getUserFromAccessToken,
  refreshAccessOnly,
  signAccessToken,
  issueTokens,
};
