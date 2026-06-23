const { AppError } = require('../utils/errors');

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

module.exports = {
  isSuperadmin,
  isAdmin,
  isAdminOrSuperadmin,
  isEmployee,
  isClient,
  isStaff,
};
