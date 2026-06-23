require('dotenv').config();

// Override with DB_POOL_MAX (e.g. 20 for production/benchmark load).
function poolForEnv(env) {
  const fromEnv = parseInt(process.env.DB_POOL_MAX, 10);
  const max = Number.isFinite(fromEnv)
    ? fromEnv
    : env === 'production' || env === 'benchmark'
      ? 20
      : 5;
  return {
    max,
    min: 0,
    acquire: 30000,
    idle: 10000,
  };
}

const development = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'laundry_management_system',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  dialect: 'mysql',
  dialectOptions: {
    charset: 'utf8mb4',
  },
  define: {
    underscored: false,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  logging: false,
  pool: poolForEnv('development'),
};

module.exports = {
  development,
  test: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME_TEST || 'laundry_management_system_test',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    dialect: 'mysql',
    logging: false,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    dialect: 'mysql',
    dialectOptions: {
      charset: 'utf8mb4',
    },
    logging: false,
    pool: poolForEnv('production'),
  },
  benchmark: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME_BENCHMARK || 'laundry_management_system_benchmark',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    dialect: 'mysql',
    dialectOptions: {
      charset: 'utf8mb4',
    },
    define: {
      underscored: false,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    logging: false,
    pool: poolForEnv('benchmark'),
  },
};
