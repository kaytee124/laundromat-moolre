const { AppError } = require('../utils/errors');
const { User } = require('../models');
const { authenticate } = require('./auth');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('NO_TOKEN', 'Authentication credentials not provided', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('PERMISSION_DENIED', 'You do not have permission to perform this action', 403));
    }
    next();
  };
}

const isSuperadmin = requireRole('superadmin');
const isAdmin = requireRole('admin');
const isAdminOrSuperadmin = requireRole('admin', 'superadmin');
const isEmployee = requireRole('employee');
const isClient = requireRole('client');
const isStaff = requireRole('admin', 'employee', 'superadmin');

async function requireSuperadminCreationAccess(req, res, next) {
  try {
    const superadminCount = await User.count({ where: { role: 'superadmin' } });

    if (superadminCount === 0) {
      return next();
    }

    return authenticate(req, res, (err) => {
      if (err) return next(err);
      isSuperadmin(req, res, next);
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  isSuperadmin,
  isAdmin,
  isAdminOrSuperadmin,
  isEmployee,
  isClient,
  isStaff,
  requireSuperadminCreationAccess,
};
