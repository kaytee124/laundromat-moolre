class AppError extends Error {
  constructor(errorCode, message, statusCode = 400) {
    super(message);
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.isOperational = true;
  }

  toJSON() {
    return {
      error_code: this.errorCode,
      message: this.message,
      status_code: this.statusCode,
    };
  }
}

module.exports = { AppError };
