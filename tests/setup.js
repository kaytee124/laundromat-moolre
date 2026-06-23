/**
 * Prerequisite: CREATE DATABASE IF NOT EXISTS laundry_management_system_test;
 * Then run: npm run db:migrate:test
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { sequelize } = require('../models');
const { truncateAll, closeDb } = require('./helpers/db');
const { seedBaseline } = require('./helpers/seed');
const { printSecurityNotes } = require('./reportSummary');

beforeAll(async () => {
  await sequelize.authenticate();
  await truncateAll();
  global.testContext = await seedBaseline();
});

afterAll(async () => {
  printSecurityNotes();
  await closeDb();
});
