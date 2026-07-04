/**
 * Prerequisite: CREATE DATABASE IF NOT EXISTS laundry_management_system_test;
 * Then run: npm run db:migrate:test
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

process.env.MOOLRE_API_USER = process.env.MOOLRE_API_USER || 'test-moolre-user';
process.env.MOOLRE_API_PUBKEY = process.env.MOOLRE_API_PUBKEY || 'test-moolre-pubkey';
process.env.MOOLRE_ACCOUNT_NUMBER = process.env.MOOLRE_ACCOUNT_NUMBER || '0000000000';
process.env.MOOLRE_WEBHOOK_URL =
  process.env.MOOLRE_WEBHOOK_URL || 'http://localhost:3000/api/payments/moolre/webhook/';
delete process.env.MOOLRE_REDIRECT_URL;
process.env.MOOLRE_WEBHOOK_SECRET = process.env.MOOLRE_WEBHOOK_SECRET || 'test-webhook-secret';

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
