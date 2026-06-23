'use strict';

const bcrypt = require('bcrypt');
const {
  createRng,
  intBetween,
  decimalBetween,
  generateOrderNumber,
  generateReference,
  generateJti,
  randomDate,
  formatDateTime,
  formatDateOnly,
  weightedPick,
  SERVICE_CATEGORIES,
  SERVICE_UNITS,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  CONTACT_METHODS,
} = require('./generators');
const { truncateBenchmarkTables } = require('./truncate');
const { createConnection } = require('../lib/db');
const { loadJson, writeJson, ensureResultsDirs, resultPath } = require('../lib/paths');
const fs = require('fs');

const BENCH_USERS = [
  { username: 'bench_superadmin', email: 'bench_superadmin@benchmark.local', role: 'superadmin', password: 'BenchPass123!', is_staff: 1, is_superuser: 1 },
  { username: 'bench_admin', email: 'bench_admin@benchmark.local', role: 'admin', password: 'BenchPass123!', is_staff: 1, is_superuser: 0 },
  { username: 'bench_employee', email: 'bench_employee@benchmark.local', role: 'employee', password: 'BenchPass123!', is_staff: 1, is_superuser: 0 },
  { username: 'bench_client', email: 'bench_client@benchmark.local', role: 'client', password: 'BenchClient123!', is_staff: 0, is_superuser: 0 },
];

const PHASES = ['users', 'customers', 'services', 'orders', 'order_items', 'payments', 'status_history', 'refresh_tokens', 'done'];

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    resume: args.includes('--resume'),
    truncate: args.includes('--truncate') || !args.includes('--resume'),
    seed: parseInt(args.find((a) => a.startsWith('--seed='))?.split('=')[1], 10) || null,
  };
}

function checkpointPath() {
  return resultPath('seed', 'checkpoint.json');
}

function loadCheckpoint() {
  const p = checkpointPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveCheckpoint(data) {
  ensureResultsDirs();
  writeJson('seed/checkpoint.json', data);
}

async function hashPasswords() {
  const staffHash = await bcrypt.hash('BenchPass123!', 10);
  const clientHash = await bcrypt.hash('BenchClient123!', 10);
  const bulkHash = await bcrypt.hash('BulkUserPass!', 10);
  return { staffHash, clientHash, bulkHash };
}

function buildUserRow(id, u, hash, now) {
  return [
    id,
    u.username,
    u.email,
    hash,
    u.first_name || u.username,
    u.last_name || 'Bench',
    u.role,
    1,
    u.is_staff,
    u.is_superuser,
    now,
    now,
    null,
  ];
}

async function insertBenchmarkUsers(conn, hashes, now) {
  const ids = {};
  for (let i = 0; i < BENCH_USERS.length; i++) {
    const u = BENCH_USERS[i];
    const hash = u.role === 'client' ? hashes.clientHash : hashes.staffHash;
    const [result] = await conn.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role, is_active, is_staff, is_superuser, date_joined, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL)`,
      [u.username, u.email, hash, u.username, 'Bench', u.role, u.is_staff, u.is_superuser, now, now]
    );
    ids[u.role === 'superadmin' ? 'superadmin' : u.role === 'admin' ? 'admin' : u.role === 'employee' ? 'employee' : 'client'] = result.insertId;
  }
  return ids;
}

async function bulkInsertUsers(conn, volumes, rng, hashes, benchIds, batchSize, now, startId = 5) {
  const totalUsers = volumes.users;
  const staffTarget = Math.round(totalUsers * 0.05);
  const clientTarget = totalUsers - staffTarget;
  const extraStaff = staffTarget - 3;
  const extraClients = clientTarget - 1;

  let nextId = startId;
  const staffUserIds = [benchIds.admin, benchIds.employee, benchIds.superadmin];
  const clientUserIds = [benchIds.client];

  const insertBatch = async (rows) => {
    if (!rows.length) return;
    const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const flat = rows.flat();
    await conn.query(
      `INSERT INTO users (id, username, email, password_hash, first_name, last_name, role, is_active, is_staff, is_superuser, date_joined, updated_at, updated_by)
       VALUES ${placeholders}`,
      flat
    );
  };

  let staffDone = 0;
  let clientDone = 0;
  let batch = [];

  while (staffDone < extraStaff || clientDone < extraClients) {
    const isStaff = staffDone < extraStaff && (clientDone >= extraClients || rng() < 0.05);
    const role = isStaff ? (rng() < 0.3 ? 'admin' : 'employee') : 'client';
    const id = nextId++;
    const username = `user_${id}`;
    const email = `user_${id}@bench.local`;
    const hash = hashes.bulkHash;
    const is_staff = role !== 'client' ? 1 : 0;
    const is_superuser = 0;
    batch.push(buildUserRow(id, { username, email, role, is_staff, is_superuser }, hash, now));

    if (role !== 'client') {
      staffDone++;
      staffUserIds.push(id);
    } else {
      clientDone++;
      clientUserIds.push(id);
    }

    if (batch.length >= batchSize) {
      await insertBatch(batch);
      batch = [];
      process.stdout.write(`\r  users: ${staffDone + clientDone + 4}/${totalUsers}`);
    }
  }
  if (batch.length) await insertBatch(batch);
  process.stdout.write(`\r  users: ${totalUsers}/${totalUsers}\n`);
  return { staffUserIds, clientUserIds, nextId };
}

async function bulkInsertCustomers(conn, clientUserIds, rng, batchSize, now) {
  let batch = [];
  let customerId = 1;
  const customerIds = [];

  const insertBatch = async (rows) => {
    if (!rows.length) return;
    const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    await conn.query(
      `INSERT INTO customers (id, user_id, phone_number, whatsapp_number, address, preferred_contact_method, notes, total_orders, total_spent, created_at, updated_at, created_by, updated_by)
       VALUES ${placeholders}`,
      rows.flat()
    );
  };

  for (const userId of clientUserIds) {
    const phone = `02${String(userId).padStart(8, '0')}`.slice(0, 20);
    const wa = `03${String(userId).padStart(8, '0')}`.slice(0, 20);
    customerIds.push(customerId);
    batch.push([
      customerId++,
      userId,
      phone,
      wa,
      `${intBetween(rng, 1, 999)} Benchmark St`,
      CONTACT_METHODS[intBetween(rng, 0, CONTACT_METHODS.length - 1)],
      '',
      0,
      0,
      now,
      now,
      null,
      null,
    ]);
    if (batch.length >= batchSize) {
      await insertBatch(batch);
      batch = [];
      process.stdout.write(`\r  customers: ${customerIds.length}/${clientUserIds.length}`);
    }
  }
  if (batch.length) await insertBatch(batch);
  process.stdout.write(`\r  customers: ${clientUserIds.length}/${clientUserIds.length}\n`);
  return customerIds;
}

async function insertServices(conn, volumes, rng, adminId, now) {
  const rows = [];
  for (let i = 1; i <= volumes.services; i++) {
    rows.push([
      i,
      `Service ${i}`,
      `Benchmark service ${i}`,
      decimalBetween(rng, 5, 150),
      SERVICE_UNITS[intBetween(rng, 0, SERVICE_UNITS.length - 1)],
      SERVICE_CATEGORIES[intBetween(rng, 0, SERVICE_CATEGORIES.length - 1)],
      intBetween(rng, 1, 5),
      1,
      adminId,
      adminId,
      now,
      now,
    ]);
  }
  const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
  await conn.query(
    `INSERT INTO services (id, name, description, price, unit, category, estimated_days, is_active, created_by, updated_by, created_at, updated_at)
     VALUES ${placeholders}`,
    rows.flat()
  );
  return volumes.services;
}

async function bulkInsertOrders(conn, volumes, rng, customerIds, staffUserIds, adminId, batchSize, startOrderId, startSeq) {
  const total = volumes.orders;
  let orderId = startOrderId;
  let seq = startSeq;
  let inserted = 0;
  const sampleOrderIds = [];

  const insertBatch = async (rows) => {
    const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    await conn.query(
      `INSERT INTO orders (id, order_number, customer_id, assigned_to, order_status, payment_status, total_amount, amount_paid, discount_amount, delivery_notes, special_instructions, pickup_date, delivery_date, estimated_completion_date, completed_at, created_by, created_at, updated_at, updated_by)
       VALUES ${placeholders}`,
      rows.flat()
    );
  };

  let batch = [];
  while (inserted < total) {
    const customerId = customerIds[inserted % customerIds.length];
    const created = randomDate(rng);
    const status = weightedPick(rng, [
      { value: 'completed', weight: 50 },
      { value: 'pending', weight: 15 },
      { value: 'in_progress', weight: 15 },
      { value: 'ready', weight: 10 },
      { value: 'cancelled', weight: 10 },
    ]);
    const payStatus = weightedPick(rng, [
      { value: 'paid', weight: 70 },
      { value: 'partial', weight: 15 },
      { value: 'pending', weight: 15 },
    ]);
    const totalAmt = parseFloat(decimalBetween(rng, 20, 500));
    const paid = payStatus === 'paid' ? totalAmt : payStatus === 'partial' ? totalAmt * 0.5 : 0;
    const assignee = staffUserIds[intBetween(rng, 0, staffUserIds.length - 1)];

    if (sampleOrderIds.length < 20) sampleOrderIds.push(orderId);

    batch.push([
      orderId,
      generateOrderNumber(orderId),
      customerId,
      assignee,
      status,
      payStatus,
      totalAmt.toFixed(2),
      paid.toFixed(2),
      '0.00',
      null,
      null,
      formatDateOnly(created),
      null,
      formatDateOnly(new Date(created.getTime() + 86400000 * 3)),
      status === 'completed' ? formatDateTime(created) : null,
      adminId,
      formatDateTime(created),
      formatDateTime(created),
      adminId,
    ]);

    orderId++;
    inserted++;

    if (batch.length >= batchSize) {
      await insertBatch(batch);
      batch = [];
      if (inserted % (batchSize * 20) === 0) {
        saveCheckpoint({ phase: 'orders', orderId, seq, inserted });
        process.stdout.write(`\r  orders: ${inserted}/${total}`);
      }
    }
  }
  if (batch.length) await insertBatch(batch);
  process.stdout.write(`\r  orders: ${total}/${total}\n`);
  return { lastOrderId: orderId, seq, sampleOrderIds };
}

async function bulkInsertOrderItems(conn, volumes, rng, serviceCount, batchSize, orderStartId, orderCount) {
  const itemsPerOrder = volumes.orderItemsPerOrder;
  let itemId = 1;
  let inserted = 0;
  const target = Math.floor(orderCount * itemsPerOrder);
  const batch = [];

  const flush = async (rows) => {
    if (!rows.length) return;
    const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
    await conn.query(
      `INSERT INTO order_items (id, order_id, service_id, item_name, description, quantity, unit_price, subtotal, notes, created_at, updated_at)
       VALUES ${placeholders}`,
      rows.flat()
    );
  };

  let batchRows = [];
  for (let o = 0; o < orderCount; o++) {
    const orderId = orderStartId + o;
    const count = Math.max(1, Math.round(itemsPerOrder + (rng() < 0.5 ? 0 : 1)));
    for (let j = 0; j < count && inserted < target; j++) {
      const svcId = intBetween(rng, 1, serviceCount);
      const qty = intBetween(rng, 1, 5);
      const unitPrice = parseFloat(decimalBetween(rng, 5, 80));
      const subtotal = (qty * unitPrice).toFixed(2);
      batchRows.push([
        itemId++,
        orderId,
        svcId,
        `Item ${itemId}`,
        null,
        qty,
        unitPrice.toFixed(2),
        subtotal,
        null,
        formatDateTime(new Date()),
        formatDateTime(new Date()),
      ]);
      inserted++;
      if (batchRows.length >= batchSize) {
        await flush(batchRows);
        batchRows = [];
        if (inserted % (batchSize * 50) === 0) {
          process.stdout.write(`\r  order_items: ${inserted}/${target}`);
        }
      }
    }
  }
  if (batchRows.length) await flush(batchRows);
  process.stdout.write(`\r  order_items: ${inserted}/${target}\n`);
  return inserted;
}

async function bulkInsertPayments(conn, volumes, rng, batchSize, orderStartId, orderCount, adminId) {
  const ratio = volumes.paymentsRatio;
  const target = Math.floor(orderCount * ratio);
  let payId = 1;
  let inserted = 0;
  let batchRows = [];

  const flush = async (rows) => {
    if (!rows.length) return;
    const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    await conn.query(
      `INSERT INTO payments (id, order_id, reference, amount, status, payment_method, transaction_id, payer_phone, currency, fees, metadata, verified_at, created_by, created_at, updated_at, updated_by)
       VALUES ${placeholders}`,
      rows.flat()
    );
  };

  for (let o = 0; o < orderCount && inserted < target; o++) {
    if (rng() > ratio) continue;
    const orderId = orderStartId + o;
    const created = formatDateTime(randomDate(rng));
    const amount = decimalBetween(rng, 20, 500);
    const currentPayId = payId++;
    batchRows.push([
      currentPayId,
      orderId,
      generateReference(currentPayId),
      amount,
      'success',
      PAYMENT_METHODS[intBetween(rng, 0, PAYMENT_METHODS.length - 1)],
      `txn_${currentPayId}`,
      null,
      'GHS',
      '0.00',
      null,
      created,
      adminId,
      created,
      created,
      adminId,
    ]);
    inserted++;
    if (batchRows.length >= batchSize) {
      await flush(batchRows);
      batchRows = [];
      if (inserted % (batchSize * 20) === 0) {
        process.stdout.write(`\r  payments: ${inserted}/${target}`);
      }
    }
  }
  if (batchRows.length) await flush(batchRows);
  process.stdout.write(`\r  payments: ${inserted}/${target}\n`);
  return { inserted, sampleReference: generateReference(1) };
}

async function bulkInsertStatusHistory(conn, volumes, rng, batchSize, orderStartId, orderCount, adminId) {
  const perOrder = volumes.statusHistoryPerOrder;
  const target = orderCount * perOrder;
  let histId = 1;
  let inserted = 0;
  let batchRows = [];

  const flush = async (rows) => {
    if (!rows.length) return;
    const placeholders = rows.map(() => '(?,?,?,?,?,?)').join(',');
    await conn.query(
      `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, changed_at)
       VALUES ${placeholders}`,
      rows.flat()
    );
  };

  const transitions = ['pending', 'in_progress', 'ready', 'completed'];
  for (let o = 0; o < orderCount; o++) {
    const orderId = orderStartId + o;
    for (let t = 0; t < perOrder; t++) {
      const oldS = t === 0 ? null : transitions[t - 1];
      const newS = transitions[Math.min(t, transitions.length - 1)];
      const changed = formatDateTime(randomDate(rng));
      batchRows.push([histId++, orderId, oldS, newS, adminId, changed]);
      inserted++;
      if (batchRows.length >= batchSize) {
        await flush(batchRows);
        batchRows = [];
        if (inserted % (batchSize * 100) === 0) {
          process.stdout.write(`\r  status_history: ${inserted}/${target}`);
        }
      }
    }
  }
  if (batchRows.length) await flush(batchRows);
  process.stdout.write(`\r  status_history: ${inserted}/${target}\n`);
  return inserted;
}

async function bulkInsertRefreshTokens(conn, volumes, rng, batchSize, userCount, now) {
  const target = volumes.refreshTokens;
  let tokenId = 1;
  let inserted = 0;
  let batchRows = [];
  const expires = new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' ');

  const flush = async (rows) => {
    if (!rows.length) return;
    const placeholders = rows.map(() => '(?,?,?,?,?,?)').join(',');
    await conn.query(
      `INSERT INTO refresh_tokens (id, user_id, token_jti, expires_at, blacklisted_at, created_at)
       VALUES ${placeholders}`,
      rows.flat()
    );
  };

  while (inserted < target) {
    const userId = intBetween(rng, 1, userCount);
    const currentTokenId = tokenId++;
    batchRows.push([currentTokenId, userId, generateJti(currentTokenId), expires, null, now]);
    inserted++;
    if (batchRows.length >= batchSize) {
      await flush(batchRows);
      batchRows = [];
      if (inserted % (batchSize * 20) === 0) {
        process.stdout.write(`\r  refresh_tokens: ${inserted}/${target}`);
      }
    }
  }
  if (batchRows.length) await flush(batchRows);
  process.stdout.write(`\r  refresh_tokens: ${target}/${target}\n`);
}

async function getTableCounts(conn) {
  const tables = ['users', 'customers', 'services', 'orders', 'order_items', 'payments', 'order_status_history', 'refresh_tokens'];
  const counts = {};
  for (const t of tables) {
    const [[row]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
    counts[t] = row.c;
  }
  return counts;
}

async function main() {
  const args = parseArgs();
  let volumes = loadJson('volumes.json');
  if (process.env.BENCHMARK_QUICK === '1') {
    volumes = {
      ...volumes,
      tier: 'quick',
      users: 1000,
      customers: 950,
      orders: 10000,
      orderItemsPerOrder: 2.5,
      paymentsRatio: 0.8,
      statusHistoryPerOrder: 3,
      refreshTokens: 5000,
    };
    console.log('QUICK mode: reduced volumes for fast validation');
  }
  const rngSeed = args.seed ?? volumes.rngSeed;
  const rng = createRng(rngSeed);
  const batchSize = volumes.batchSize;
  const startTime = Date.now();

  ensureResultsDirs();
  const conn = await createConnection();
  const now = formatDateTime(new Date());
  const hashes = await hashPasswords();

  let checkpoint = args.resume ? loadCheckpoint() : null;
  let phase = checkpoint?.phase || 'users';

  if (args.truncate && phase === 'users') {
    console.log('Truncating benchmark tables...');
    await truncateBenchmarkTables(conn);
    checkpoint = null;
  }

  let benchIds = checkpoint?.benchIds;
  let staffUserIds = checkpoint?.staffUserIds;
  let clientUserIds = checkpoint?.clientUserIds;
  let customerIds = checkpoint?.customerIds;
  let serviceCount = checkpoint?.serviceCount || volumes.services;
  let orderStartId = checkpoint?.orderStartId || 1;
  let orderCount = volumes.orders;
  let seq = checkpoint?.seq || 0;
  let sampleOrderIds = checkpoint?.sampleOrderIds || [];

  try {
    if (PHASES.indexOf(phase) <= PHASES.indexOf('users')) {
      console.log('Seeding users...');
      if (!benchIds) {
        benchIds = await insertBenchmarkUsers(conn, hashes, now);
        const bulk = await bulkInsertUsers(conn, volumes, rng, hashes, benchIds, batchSize, now);
        staffUserIds = bulk.staffUserIds;
        clientUserIds = bulk.clientUserIds;
      }
      saveCheckpoint({ phase: 'customers', benchIds, staffUserIds, clientUserIds, rngSeed });
      phase = 'customers';
    }

    if (PHASES.indexOf(phase) <= PHASES.indexOf('customers')) {
      console.log('Seeding customers...');
      if (!customerIds) {
        customerIds = await bulkInsertCustomers(conn, clientUserIds, rng, batchSize, now);
      }
      saveCheckpoint({ phase: 'services', benchIds, staffUserIds, clientUserIds, customerIds, rngSeed });
      phase = 'services';
    }

    if (PHASES.indexOf(phase) <= PHASES.indexOf('services')) {
      console.log('Seeding services...');
      const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM services');
      if (c === 0) {
        await insertServices(conn, volumes, rng, benchIds.admin, now);
      }
      saveCheckpoint({ phase: 'orders', benchIds, staffUserIds, clientUserIds, customerIds, serviceCount, rngSeed });
      phase = 'orders';
    }

    if (PHASES.indexOf(phase) <= PHASES.indexOf('orders')) {
      console.log('Seeding orders...');
      const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM orders');
      if (c < orderCount) {
        const remaining = orderCount - c;
        const startId = c + 1;
        const result = await bulkInsertOrders(
          conn, { orders: remaining }, rng, customerIds, staffUserIds, benchIds.admin, batchSize, startId, seq
        );
        sampleOrderIds = result.sampleOrderIds;
        orderStartId = 1;
      }
      saveCheckpoint({ phase: 'order_items', benchIds, customerIds, serviceCount, orderStartId, orderCount, sampleOrderIds, rngSeed });
      phase = 'order_items';
    }

    if (PHASES.indexOf(phase) <= PHASES.indexOf('order_items')) {
      console.log('Seeding order items...');
      const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM order_items');
      const target = Math.floor(orderCount * volumes.orderItemsPerOrder);
      if (c < target) {
        await bulkInsertOrderItems(conn, volumes, rng, serviceCount, batchSize, orderStartId, orderCount);
      }
      saveCheckpoint({ phase: 'payments', benchIds, orderStartId, orderCount, sampleOrderIds, rngSeed });
      phase = 'payments';
    }

    if (PHASES.indexOf(phase) <= PHASES.indexOf('payments')) {
      console.log('Seeding payments...');
      const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM payments');
      const target = Math.floor(orderCount * volumes.paymentsRatio);
      if (c < target) {
        await bulkInsertPayments(conn, volumes, rng, batchSize, orderStartId, orderCount, benchIds.admin);
      }
      saveCheckpoint({ phase: 'status_history', benchIds, orderStartId, orderCount, rngSeed });
      phase = 'status_history';
    }

    if (PHASES.indexOf(phase) <= PHASES.indexOf('status_history')) {
      console.log('Seeding order status history...');
      const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM order_status_history');
      const target = orderCount * volumes.statusHistoryPerOrder;
      if (c < target) {
        await bulkInsertStatusHistory(conn, volumes, rng, batchSize, orderStartId, orderCount, benchIds.admin);
      }
      saveCheckpoint({ phase: 'refresh_tokens', benchIds, rngSeed });
      phase = 'refresh_tokens';
    }

    if (PHASES.indexOf(phase) <= PHASES.indexOf('refresh_tokens')) {
      console.log('Seeding refresh tokens...');
      const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM refresh_tokens');
      if (c < volumes.refreshTokens) {
        await bulkInsertRefreshTokens(conn, volumes, rng, batchSize, volumes.users, now);
      }
    }

    const counts = await getTableCounts(conn);
    const benchCustomerId = customerIds[0];
    const manifest = {
      seededAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      rngSeed,
      volumes,
      counts,
      benchmarkUsers: benchIds,
      benchmarkCustomerId: benchCustomerId,
      sampleOrderIds: sampleOrderIds.length ? sampleOrderIds : [1],
      sampleServiceId: 1,
      credentials: {
        superadmin: { username: 'bench_superadmin', password: 'BenchPass123!' },
        admin: { username: 'bench_admin', password: 'BenchPass123!' },
        employee: { username: 'bench_employee', password: 'BenchPass123!' },
        client: { username: 'bench_client', password: 'BenchClient123!' },
      },
    };
    writeJson('seed/manifest.json', manifest);
    saveCheckpoint({ phase: 'done', ...manifest });
    console.log('\nSeed complete. Manifest written to benchmark/results/seed/manifest.json');
    console.log('Counts:', counts);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
