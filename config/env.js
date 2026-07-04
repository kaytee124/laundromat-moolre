require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireEnvInt(name) {
  const n = parseInt(requireEnv(name), 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid integer environment variable: ${name}`);
  }
  return n;
}

module.exports = {
  requireEnv,
  requireEnvInt,
};
