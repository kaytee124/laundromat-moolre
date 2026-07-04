const { requireEnv, requireEnvInt } = require('./env');

function poolConfig() {
  return {
    max: requireEnvInt('DB_POOL_MAX'),
    min: 0,
    acquire: 30000,
    idle: 10000,
  };
}

const sharedDialect = {
  dialect: 'mysql',
  dialectOptions: {
    charset: 'utf8mb4',
  },
  logging: false,
};

const sharedDefine = {
  underscored: false,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const dbCredentials = {
  username: requireEnv('DB_USER'),
  password: requireEnv('DB_PASSWORD'),
  host: requireEnv('DB_HOST'),
  port: requireEnvInt('DB_PORT'),
};

module.exports = {
  development: {
    ...dbCredentials,
    database: requireEnv('DB_NAME'),
    ...sharedDialect,
    define: sharedDefine,
    pool: poolConfig(),
  },
  test: {
    ...dbCredentials,
    database: requireEnv('DB_NAME_TEST'),
    dialect: 'mysql',
    logging: false,
  },
  production: {
    ...dbCredentials,
    database: requireEnv('DB_NAME'),
    ...sharedDialect,
    pool: poolConfig(),
  },
  benchmark: {
    ...dbCredentials,
    database: requireEnv('DB_NAME_BENCHMARK'),
    ...sharedDialect,
    define: sharedDefine,
    pool: poolConfig(),
  },
};
