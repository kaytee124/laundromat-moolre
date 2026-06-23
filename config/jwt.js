require('dotenv').config();

module.exports = {
  secret: process.env.JWT_SECRET || 'change-me-in-production',
  accessExpires: process.env.JWT_ACCESS_EXPIRES || '60m',
  refreshExpires: process.env.JWT_REFRESH_EXPIRES || '1d',
  algorithm: 'HS256',
};
