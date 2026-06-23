'use strict';



const { createConnection } = require('../lib/db');

const { readManifest } = require('../lib/paths');

const {

  BASE_URL,

  HttpClient,

  fetchCsrf,

  loginWithSession,

} = require('../lib/http-auth');



async function loginRole(role) {

  const manifest = readManifest();

  const creds = manifest?.credentials?.[role];

  if (!creds) throw new Error(`No credentials for role: ${role}`);

  return loginWithSession(creds.username, creds.password);

}



async function dbQuery(sql, params = []) {

  const conn = await createConnection();

  try {

    const [rows] = await conn.query(sql, params);

    return rows;

  } finally {

    await conn.end();

  }

}



async function getOrder(orderId) {

  const rows = await dbQuery('SELECT * FROM orders WHERE id = ?', [orderId]);

  return rows[0];

}



async function getOrderHistoryCount(orderId) {

  const rows = await dbQuery(

    'SELECT COUNT(*) AS c FROM order_status_history WHERE order_id = ?',

    [orderId]

  );

  return rows[0].c;

}



async function getPaymentsForOrder(orderId) {

  return dbQuery('SELECT * FROM payments WHERE order_id = ?', [orderId]);

}



async function getCustomerStats(customerId) {

  const rows = await dbQuery('SELECT total_orders, total_spent FROM customers WHERE id = ?', [

    customerId,

  ]);

  return rows[0];

}



async function insertPendingPayment(orderId, reference, amount, adminId = 2) {

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await dbQuery(

    `INSERT INTO payments (order_id, reference, amount, status, payment_method, currency, fees, created_by, created_at, updated_at)

     VALUES (?, ?, ?, 'pending', 'paystack', 'GHS', 0, ?, ?, ?)`,

    [orderId, reference, amount, adminId, now, now]

  );

}



async function ensureRaceOrder() {

  const manifest = readManifest();

  const orderId = manifest?.sampleOrderIds?.[0];

  if (!orderId) throw new Error('No sample order in manifest — run benchmark:seed first');

  return orderId;

}



async function getServiceId() {

  const manifest = readManifest();

  return manifest?.sampleServiceId || 1;

}



async function getBenchmarkCustomerId() {

  const manifest = readManifest();

  return manifest?.benchmarkCustomerId || 1;

}



function parallel(count, fn) {

  return Promise.allSettled(Array.from({ length: count }, (_, i) => fn(i)));

}



function result(id, name, passed, details, extra = {}) {

  return {

    id,

    name,

    passed,

    details,

    timestamp: new Date().toISOString(),

    ...extra,

  };

}



module.exports = {

  BASE_URL,

  HttpClient,

  loginWithSession,

  loginRole,

  fetchCsrf,

  dbQuery,

  getOrder,

  getOrderHistoryCount,

  getPaymentsForOrder,

  getCustomerStats,

  insertPendingPayment,

  ensureRaceOrder,

  getServiceId,

  getBenchmarkCustomerId,

  parallel,

  result,

  readManifest,

};

