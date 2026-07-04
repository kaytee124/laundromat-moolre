function createRateLimiter({ max, windowMs, keyPrefix = '' }) {
  const hits = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = hits.get(key) || [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= max) {
      return res.status(429).json({
        error_code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        status_code: 429,
      });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    return next();
  };
}

module.exports = {
  createRateLimiter,
};
