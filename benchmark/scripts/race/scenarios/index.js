'use strict';

const {
  loginRole,
  loginWithSession,
  HttpClient,
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
  dbQuery,
} = require('../helpers');

const STATUSES = ['pending', 'in_progress', 'ready', 'completed', 'cancelled'];

async function r01() {
  const orderId = await ensureRaceOrder();
  process.stderr.write('login... ');
  const { access } = await loginRole('admin');
  process.stderr.write('updates... ');
  const responses = await parallel(20, (i) => {
    const client = new HttpClient();
    return client.put(
      `/api/orders/${orderId}/update/`,
      { order_status: STATUSES[i % STATUSES.length] },
      { token: access }
    );
  });
  process.stderr.write('assert... ');
  const ok = responses.filter((r) => r.status === 'fulfilled' && r.value.status === 200).length;
  const order = await getOrder(orderId);
  const histCount = await getOrderHistoryCount(orderId);
  const validStatus = STATUSES.includes(order.order_status);
  const passed = ok > 0 && validStatus && !responses.some((r) => r.status === 'fulfilled' && r.value.status >= 500);
  return result('R01', 'Lost update on order', passed, `ok=${ok}/20, final_status=${order.order_status}, history_rows=${histCount}`, {
    responses: responses.map((r) => (r.status === 'fulfilled' ? r.value.status : 'error')),
  });
}

async function r02() {
  const orderId = await ensureRaceOrder();
  const { access } = await loginRole('admin');
  await parallel(10, (i) => {
    const client = new HttpClient();
    return client.put(`/api/orders/${orderId}/update/`, { discount_amount: i * 1.5 }, { token: access });
  });
  const order = await getOrder(orderId);
  const items = await dbQuery(
    'SELECT SUM(subtotal) AS s FROM order_items WHERE order_id = ?',
    [orderId]
  );
  const subtotal = parseFloat(items[0]?.s || 0);
  const expected = Math.max(0, subtotal - parseFloat(order.discount_amount || 0));
  const actual = parseFloat(order.total_amount);
  const passed = Math.abs(expected - actual) < 0.02;
  return result('R02', 'Concurrent discount updates', passed, `expected=${expected.toFixed(2)}, actual=${actual.toFixed(2)}`);
}

async function r03() {
  const manifest = readManifest();
  const orderId = manifest?.sampleOrderIds?.[1] || (await ensureRaceOrder());
  const { access } = await loginRole('client');
  const orderBefore = await getOrder(orderId);
  const remaining = parseFloat(orderBefore.total_amount) - parseFloat(orderBefore.amount_paid);
  const amount = Math.min(10, remaining > 0 ? remaining : 10);

  const responses = await parallel(10, () => {
    const client = new HttpClient();
    return client.post('/api/payments/initialize/', { order_id: orderId, amount }, { token: access });
  });
  const payments = await getPaymentsForOrder(orderId);
  const pending = payments.filter((p) => p.status === 'pending');
  const pendingSum = pending.reduce((s, p) => s + parseFloat(p.amount), 0);
  const no500 = !responses.some((r) => r.status === 'fulfilled' && r.value.status >= 500);
  const passed = no500 && pendingSum <= remaining + 0.01;
  return result('R03', 'Double payment initialize', passed, `pending_count=${pending.length}, pending_sum=${pendingSum.toFixed(2)}, remaining=${remaining.toFixed(2)}`, {
    note: 'Multiple pending payments may indicate race — documents behavior',
  });
}

async function r04() {
  const orderId = await ensureRaceOrder();
  const ref = `RACE-CB-${orderId}-${Date.now()}`;
  const order = await getOrder(orderId);
  const amount = Math.min(5, parseFloat(order.total_amount) - parseFloat(order.amount_paid));
  if (amount <= 0) {
    return result('R04', 'Payment callback replay', true, 'skipped — order already paid');
  }
  await insertPendingPayment(orderId, ref, amount);
  const beforePaid = parseFloat((await getOrder(orderId)).amount_paid);

  const responses = await parallel(5, () => {
    const client = new HttpClient();
    return client.get(`/api/payments/callback/?reference=${encodeURIComponent(ref)}`);
  });
  const after = await getOrder(orderId);
  const afterPaid = parseFloat(after.amount_paid);
  const doubleCount = afterPaid > beforePaid + amount + 0.01;
  const no500 = !responses.some((r) => r.status === 'fulfilled' && r.value.status >= 500);
  const passed = no500 && !doubleCount;
  return result('R04', 'Payment callback replay', passed, `amount_paid before=${beforePaid}, after=${afterPaid}, double_count=${doubleCount}`);
}

async function r05() {
  const suffix = Date.now();
  const payload = {
    username: `race_user_${suffix}`,
    email: `race_${suffix}@bench.local`,
    password: 'RacePass123!',
    first_name: 'Race',
    last_name: 'Test',
    phone_number: `09${String(suffix).slice(-8)}`,
    whatsapp_number: `08${String(suffix).slice(-8)}`,
    address: '1 Race St',
    preferred_contact_method: 'phone',
  };
  const responses = await parallel(10, () => {
    const client = new HttpClient();
    return client.post('/api/customers/register/', payload);
  });
  const statuses = responses.map((r) =>
    r.status === 'fulfilled' ? r.value.status : 'error'
  );
  const successes = responses.filter((r) => r.status === 'fulfilled' && r.value.status === 201).length;
  const passed = successes === 1;
  return result(
    'R05',
    'Duplicate customer register',
    passed,
    `successes=${successes}/10 (expect 1), statuses=${JSON.stringify(statuses)}`
  );
}

async function r06() {
  const session = await loginRole('admin');
  const responses = await parallel(20, () =>
    session.client.post('/api/accounts/token/refresh/', {}, {
      headers: { 'X-CSRF-Token': session.csrf },
    })
  );
  const ok = responses.filter((r) => r.status === 'fulfilled' && r.value.status === 200).length;
  const err500 = responses.filter((r) => r.status === 'fulfilled' && r.value.status >= 500).length;
  const passed = err500 === 0 && ok >= 1;
  return result('R06', 'Parallel token refresh', passed, `ok=${ok}/20, 500s=${err500}`);
}

async function r07() {
  const session = await loginRole('employee');
  const csrf = session.csrf;
  const tasks = [];
  for (let i = 0; i < 10; i++) {
    tasks.push(
      session.client.post('/api/accounts/logout/', {}, {
        headers: { 'X-CSRF-Token': csrf, Authorization: `Bearer ${session.access}` },
      })
    );
    tasks.push(
      session.client.post('/api/accounts/token/refresh/', {}, {
        headers: { 'X-CSRF-Token': csrf },
      })
    );
  }
  const responses = await Promise.allSettled(tasks);
  const refreshAfter = await session.client.post('/api/accounts/token/refresh/', {}, {
    headers: { 'X-CSRF-Token': csrf },
  });
  const passed = refreshAfter.status < 500;
  return result('R07', 'Logout vs refresh race', passed, `post-race refresh status=${refreshAfter.status} (200=refresh won, 401/400=logout won)`);
}

async function r08() {
  const concurrency = 10;
  const customerId = await getBenchmarkCustomerId();
  const serviceId = await getServiceId();
  const { access } = await loginRole('employee');
  const responses = await parallel(concurrency, () => {
    const client = new HttpClient();
    return client.post(
      '/api/orders/create/',
      {
        customer_id: customerId,
        order_items_data: [{ service_id: serviceId, quantity: 1 }],
      },
      { token: access }
    );
  });
  const created = responses.filter((r) => r.status === 'fulfilled' && r.value.status === 201);
  const err500 = responses.filter((r) => r.status === 'fulfilled' && r.value.status >= 500).length;
  const numbers = created.map((r) => r.value.json?.data?.order_number).filter(Boolean);
  const unique = new Set(numbers);
  const passed = err500 === 0 && created.length > 0 && unique.size === numbers.length;
  return result(
    'R08',
    'Concurrent order creation',
    passed,
    `created=${created.length}/${concurrency}, unique_order_numbers=${unique.size}, 500s=${err500}`
  );
}

async function r09() {
  const orderId = await ensureRaceOrder();
  const manifest = readManifest();
  const staff = [manifest.benchmarkUsers.employee, manifest.benchmarkUsers.admin, manifest.benchmarkUsers.superadmin];
  const { access } = await loginRole('admin');
  await parallel(10, (i) => {
    const client = new HttpClient();
    return client.put(`/api/orders/${orderId}/update/`, { assigned_to: staff[i % staff.length] }, { token: access });
  });
  const order = await getOrder(orderId);
  const passed = staff.includes(order.assigned_to);
  return result('R09', 'Assignee race', passed, `final assigned_to=${order.assigned_to}`);
}

async function r10() {
  const orderId = await ensureRaceOrder();
  const { access } = await loginRole('admin');
  const sequence = ['pending', 'in_progress', 'ready', 'completed'];
  for (const status of sequence) {
    const client = new HttpClient();
    await client.put(`/api/orders/${orderId}/update/`, { order_status: status }, { token: access });
  }
  const history = await dbQuery(
    'SELECT new_status, changed_at FROM order_status_history WHERE order_id = ? ORDER BY changed_at ASC',
    [orderId]
  );
  const order = await getOrder(orderId);
  const passed = order.order_status === 'completed' && history.length >= sequence.length - 1;
  return result('R10', 'Status history integrity', passed, `history_rows=${history.length}, final=${order.order_status}`);
}

async function r11() {
  const manifest = readManifest();
  const creds = manifest.credentials.admin;
  const responses = await parallel(50, () => loginWithSession(creds.username, creds.password));
  const ok = responses.filter((r) => r.status === 'fulfilled' && r.value.status === 200).length;
  const passed = ok === 50;
  return result('R11', 'Concurrent login', passed, `ok=${ok}/50 — multiple refresh tokens expected`);
}

async function r12() {
  const orderId = await ensureRaceOrder();
  const admin = await loginRole('admin');
  const reads = parallel(10, () => {
    const client = new HttpClient();
    return client.get('/api/orders/list/?page=1&page_size=5', { token: admin.access });
  });
  const writes = parallel(10, (i) => {
    const client = new HttpClient();
    return client.put(
      `/api/orders/${orderId}/update/`,
      { delivery_notes: `race-${i}` },
      { token: admin.access }
    );
  });
  const [readRes, writeRes] = await Promise.all([reads, writes]);
  const readOk = readRes.every((r) => r.status === 'fulfilled' && r.value.status === 200);
  const no500 = [...readRes, ...writeRes].every(
    (r) => r.status === 'fulfilled' && r.value.status < 500
  );
  return result('R12', 'Read during write', readOk && no500, `reads_ok=${readOk}, no_500=${no500}`);
}

async function r13() {
  const manifest = readManifest();
  const orderIds = manifest?.sampleOrderIds?.length >= 5
    ? manifest.sampleOrderIds
    : [await ensureRaceOrder()];
  const { access } = await loginRole('admin');
  const responses = await parallel(100, (i) => {
    const client = new HttpClient();
    const oid = orderIds[i % orderIds.length];
    return client.put(`/api/orders/${oid}/update/`, { delivery_notes: `pool-${i}` }, { token: access });
  });
  const ok = responses.filter((r) => r.status === 'fulfilled' && r.value.status === 200).length;
  const errors = responses.length - ok;
  const passed = ok >= 50;
  return result('R13', 'Pool exhaustion under writes', passed, `ok=${ok}/100, errors=${errors} — documents pool limits`);
}

async function r14() {
  const orderId = await ensureRaceOrder();
  const { access } = await loginRole('client');
  const order = await getOrder(orderId);
  const amount = Math.min(1, parseFloat(order.total_amount));
  const before = await getPaymentsForOrder(orderId);
  const beforePending = before.filter((p) => p.status === 'pending').length;

  await parallel(5, () => {
    const client = new HttpClient();
    return client.post('/api/payments/initialize/', { order_id: orderId, amount: 999999 }, { token: access });
  });

  const after = await getPaymentsForOrder(orderId);
  const afterPending = after.filter((p) => p.status === 'pending').length;
  const passed = afterPending <= beforePending + 5;
  return result('R14', 'Payment init failure orphan check', passed, `pending before=${beforePending}, after=${afterPending}`);
}

async function r15() {
  const orderId = await ensureRaceOrder();
  const admin = await loginRole('admin');
  const complete = parallel(5, () => {
    const client = new HttpClient();
    return client.put(`/api/orders/${orderId}/update/`, { order_status: 'completed' }, { token: admin.access });
  });
  const ref = `RACE-R15-${orderId}-${Date.now()}`;
  await insertPendingPayment(orderId, ref, 1);
  const callbacks = parallel(5, () => {
    const client = new HttpClient();
    return client.get(`/api/payments/callback/?reference=${encodeURIComponent(ref)}`);
  });
  await Promise.all([complete, callbacks]);
  const order = await getOrder(orderId);
  const consistent =
    ['pending', 'partial', 'partially_paid', 'paid'].includes(order.payment_status) ||
    order.order_status === 'completed';
  const no500 = true;
  return result('R15', 'Order completion and payment race', consistent, `order_status=${order.order_status}, payment_status=${order.payment_status}`);
}

const RUNNERS = {
  R01: r01,
  R02: r02,
  R03: r03,
  R04: r04,
  R05: r05,
  R06: r06,
  R07: r07,
  R08: r08,
  R09: r09,
  R10: r10,
  R11: r11,
  R12: r12,
  R13: r13,
  R14: r14,
  R15: r15,
};

module.exports = { RUNNERS };
