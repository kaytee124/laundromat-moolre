const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { User } = require('../../models');

describe('Security: Role lock', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  it('rejects client role change to admin', async () => {
    const res = await request(app)
      .patch(`/api/accounts/superadmin/client/${ctx.client.id}/update/`)
      .set(tokens.superadmin.headers)
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });

  it('rejects admin role change to employee', async () => {
    const res = await request(app)
      .patch(`/api/accounts/superadmin/admin/${ctx.admin.id}/update/`)
      .set(tokens.superadmin.headers)
      .send({ role: 'employee' });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });

  it('ignores is_superuser escalation on client PATCH', async () => {
    await request(app)
      .patch(`/api/accounts/superadmin/client/${ctx.client.id}/update/`)
      .set(tokens.superadmin.headers)
      .send({ is_superuser: true, is_staff: true });
    const user = await User.findByPk(ctx.client.id);
    expect(user.is_superuser).toBe(false);
    expect(user.is_staff).toBe(false);
  });

  it('allows employee promotion to admin', async () => {
    const res = await request(app)
      .patch(`/api/accounts/superadmin/employee/${ctx.employee.id}/update/`)
      .set(tokens.superadmin.headers)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    const user = await User.findByPk(ctx.employee.id);
    expect(user.role).toBe('admin');
    // restore for other tests
    await User.update(
      { role: 'employee', is_staff: true, is_superuser: false },
      { where: { id: ctx.employee.id } }
    );
  });
});
