const { requireEnv } = require('./env');

module.exports = {
  secret: requireEnv('JWT_SECRET'),
  accessExpires: requireEnv('JWT_ACCESS_EXPIRES'),
  refreshExpires: requireEnv('JWT_REFRESH_EXPIRES'),
  algorithm: 'HS256',
};
