const { AppError } = require('../utils/errors');

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error_code: 'DUPLICATE_ENTRY',
      message: err.errors?.[0]?.message || 'Duplicate entry',
      status_code: 409,
    });
  }

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: err.errors?.map((e) => e.message).join('. ') || 'Validation failed',
      status_code: 400,
    });
  }

  console.error(err);
  return res.status(500).json({
    error_code: 'SERVER_ERROR',
    message: 'An unexpected error occurred',
    status_code: 500,
  });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
