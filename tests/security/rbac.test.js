const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { uniqueUsername, uniqueEmail } = require('../helpers/fixtures');

describe('Security: RBAC', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  const cases = [
    { name: 'client cannot list admins', method: 'get', path: '/api/accounts/admins/', token: 'client', expect: 403 },
    { name: 'client cannot create employee', method: 'post', path: '/api/accounts/employee/create/', token: 'client', body: { username: 'x', email: 'x@test.com' }, expect: 403 },
    { name: 'employee cannot create admin', method: 'post', path: '/api/accounts/admin/create/', token: 'employee', body: { username: uniqueUsername('rbac'), email: uniqueEmail('rbac') }, expect: 403 },
    { name: 'admin cannot create superadmin', method: 'post', path: '/api/accounts/superadmin/create/', token: 'admin', body: { username: uniqueUsername('rbac2'), email: uniqueEmail('rbac2') }, expect: 403 },
    { name: 'employee cannot view revenue report', method: 'get', path: '/api/dashboard/revenue-report/?start_date=2025-01-01&end_date=2025-12-31', token: 'employee', expect: 403 },
    { name: 'client cannot create service', method: 'post', path: '/api/services/create/', token: 'client', body: { name: 'X', price: 5 }, expect: 403 },
    { name: 'client cannot access superadmin user', method: 'get', path: () => `/api/accounts/superadmin/user/${ctx.admin.id}/`, token: 'client', expect: 403 },
  ];

  test.each(cases)('$name', async ({ method, path, token, body, expect: expected }) => {
    const url = typeof path === 'function' ? path() : path;
    const req = request(app)[method](url).set(tokens[token].headers);
    if (body) req.send(body);
    const res = await req;
    expect(res.status).toBe(expected);
  });
});
