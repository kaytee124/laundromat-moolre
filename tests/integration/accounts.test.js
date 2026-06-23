const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles, login, logoutWithAgent, refreshWithAgent, createAgent, fetchCsrf } = require('../helpers/auth');
const { uniqueUsername, uniqueEmail, uniquePhone } = require('../helpers/fixtures');
const { User } = require('../../models');

describe('Accounts API', () => {
  let tokens;
  let ctx;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
  });

  describe('POST /api/accounts/login/', () => {
    it('logs in with valid credentials', async () => {
      const res = await login(ctx.client.username, ctx.passwords.client);
      expect(res.status).toBe(200);
      expect(res.body.access).toBeDefined();
      expect(res.body.refresh).toBeUndefined();
      expect(res.body.user.username).toBe(ctx.client.username);
    });

    it('returns requires_password_change for default staff password', async () => {
      const res = await login(ctx.admin.username, ctx.passwords.staff);
      expect(res.status).toBe(200);
      expect(res.body.requires_password_change).toBe(true);
    });

    it('rejects missing fields', async () => {
      const agent = createAgent();
      const csrf = await fetchCsrf(agent);
      const res = await agent
        .post('/api/accounts/login/')
        .set('X-CSRF-Token', csrf)
        .send({ username: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('MISSING_FIELDS');
    });

    it('rejects invalid credentials', async () => {
      const res = await login(ctx.client.username, 'wrongpassword');
      expect(res.status).toBe(401);
      expect(res.body.error_code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects inactive account', async () => {
      await User.update({ is_active: false }, { where: { id: ctx.employee.id } });
      const res = await login(ctx.employee.username, ctx.passwords.staff);
      await User.update({ is_active: true }, { where: { id: ctx.employee.id } });
      expect(res.status).toBe(401);
      expect(res.body.error_code).toBe('ACCOUNT_INACTIVE');
    });
  });

  describe('POST /api/accounts/logout/', () => {
    it('logs out with refresh token cookie', async () => {
      const loginRes = await login(ctx.client.username, ctx.passwords.client);
      const res = await logoutWithAgent(loginRes.agent, loginRes.body.access, loginRes.csrf);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/accounts/token/refresh/', () => {
    it('refreshes tokens', async () => {
      const loginRes = await login(ctx.client.username, ctx.passwords.client);
      const res = await refreshWithAgent(loginRes.agent, loginRes.csrf);
      expect(res.status).toBe(200);
      expect(res.body.access).toBeDefined();
      expect(res.body.refresh).toBeUndefined();
    });

    it('rejects missing refresh token', async () => {
      const agent = createAgent();
      const csrf = await fetchCsrf(agent);
      const res = await agent
        .post('/api/accounts/token/refresh/')
        .set('X-CSRF-Token', csrf)
        .send({});
      expect(res.status).toBe(401);
      expect(res.body.error_code).toBe('MISSING_TOKEN');
    });
  });

  describe('POST /api/accounts/token/verify/', () => {
    it('verifies valid token', async () => {
      const res = await request(app)
        .post('/api/accounts/token/verify/')
        .send({ token: tokens.client.access });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/accounts/user/profile/', () => {
    it('returns profile for authenticated user', async () => {
      const res = await request(app)
        .get('/api/accounts/user/profile/')
        .set(tokens.client.headers);
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe(ctx.client.username);
    });
  });

  describe('PATCH /api/accounts/client/update/', () => {
    it('allows client to update profile', async () => {
      const res = await request(app)
        .patch('/api/accounts/client/update/')
        .set(tokens.client.headers)
        .send({ first_name: 'UpdatedClient' });
      expect(res.status).toBe(200);
    });

    it('denies non-client', async () => {
      const res = await request(app)
        .patch('/api/accounts/client/update/')
        .set(tokens.admin.headers)
        .send({ first_name: 'Nope' });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/accounts/admin/create/', () => {
    it('superadmin creates admin', async () => {
      const res = await request(app)
        .post('/api/accounts/admin/create/')
        .set(tokens.superadmin.headers)
        .send({
          username: uniqueUsername('newadmin'),
          email: uniqueEmail('newadmin'),
          first_name: 'New',
          last_name: 'Admin',
        });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('admin');
    });

    it('denies non-superadmin', async () => {
      const res = await request(app)
        .post('/api/accounts/admin/create/')
        .set(tokens.admin.headers)
        .send({
          username: uniqueUsername('failadmin'),
          email: uniqueEmail('failadmin'),
          first_name: 'Fail',
          last_name: 'Admin',
        });
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/accounts/admin/update/', () => {
    it('admin updates self', async () => {
      const res = await request(app)
        .patch('/api/accounts/admin/update/')
        .set(tokens.admin.headers)
        .send({ first_name: 'AdminUpdated' });
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/accounts/admin/employee/:userId/update/', () => {
    it('admin updates employee', async () => {
      const res = await request(app)
        .patch(`/api/accounts/admin/employee/${ctx.employee.id}/update/`)
        .set(tokens.admin.headers)
        .send({ first_name: 'EmpUpdated' });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-employee target', async () => {
      const res = await request(app)
        .patch(`/api/accounts/admin/employee/${ctx.client.id}/update/`)
        .set(tokens.admin.headers)
        .send({ first_name: 'Nope' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/accounts/employee/create/', () => {
    it('admin creates employee', async () => {
      const res = await request(app)
        .post('/api/accounts/employee/create/')
        .set(tokens.admin.headers)
        .send({
          username: uniqueUsername('newemp'),
          email: uniqueEmail('newemp'),
          first_name: 'New',
          last_name: 'Employee',
        });
      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /api/accounts/employee/update/', () => {
    it('employee updates self', async () => {
      const res = await request(app)
        .patch('/api/accounts/employee/update/')
        .set(tokens.employee.headers)
        .send({ first_name: 'EmployeeSelf' });
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/accounts/staff/client/:userId/update/', () => {
    it('staff updates client', async () => {
      const res = await request(app)
        .patch(`/api/accounts/staff/client/${ctx.client.id}/update/`)
        .set(tokens.employee.headers)
        .send({ first_name: 'StaffUpdatedClient' });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/accounts/staff/user/:userId/', () => {
    it('staff gets user by id', async () => {
      const res = await request(app)
        .get(`/api/accounts/staff/user/${ctx.client.id}/`)
        .set(tokens.employee.headers);
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe(ctx.client.username);
    });
  });

  describe('POST /api/accounts/superadmin/create/', () => {
    it('superadmin creates another superadmin', async () => {
      const res = await request(app)
        .post('/api/accounts/superadmin/create/')
        .set(tokens.superadmin.headers)
        .send({
          username: uniqueUsername('newsuper'),
          email: uniqueEmail('newsuper'),
          first_name: 'New',
          last_name: 'Super',
        });
      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /api/accounts/superadmin/*/update/', () => {
    it('superadmin updates admin profile', async () => {
      const res = await request(app)
        .patch(`/api/accounts/superadmin/admin/${ctx.admin.id}/update/`)
        .set(tokens.superadmin.headers)
        .send({ first_name: 'SuperUpdatedAdmin' });
      expect(res.status).toBe(200);
    });

    it('superadmin updates employee profile', async () => {
      const res = await request(app)
        .patch(`/api/accounts/superadmin/employee/${ctx.employee.id}/update/`)
        .set(tokens.superadmin.headers)
        .send({ first_name: 'SuperUpdatedEmp' });
      expect(res.status).toBe(200);
    });

    it('superadmin updates client profile', async () => {
      const res = await request(app)
        .patch(`/api/accounts/superadmin/client/${ctx.client.id}/update/`)
        .set(tokens.superadmin.headers)
        .send({ first_name: 'SuperUpdatedClient' });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/accounts/superadmin/user/:userId/', () => {
    it('superadmin gets user detail', async () => {
      const res = await request(app)
        .get(`/api/accounts/superadmin/user/${ctx.admin.id}/`)
        .set(tokens.superadmin.headers);
      expect(res.status).toBe(200);
    });
  });

  describe('GET list endpoints', () => {
    it('superadmin lists admins', async () => {
      const res = await request(app)
        .get('/api/accounts/admins/')
        .set(tokens.superadmin.headers);
      expect(res.status).toBe(200);
      expect(res.body.results).toBeDefined();
    });

    it('admin lists employees', async () => {
      const res = await request(app)
        .get('/api/accounts/employees/')
        .set(tokens.admin.headers);
      expect(res.status).toBe(200);
    });

    it('staff lists clients', async () => {
      const res = await request(app)
        .get('/api/accounts/clients/')
        .set(tokens.employee.headers);
      expect(res.status).toBe(200);
    });

    it('supports search on clients list', async () => {
      const res = await request(app)
        .get('/api/accounts/clients/?search=client1')
        .set(tokens.admin.headers);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/accounts/change-password/', () => {
    it('changes password with valid old password', async () => {
      const loginRes = await login(ctx.client2.username, ctx.passwords.client);
      const res = await request(app)
        .post('/api/accounts/change-password/')
        .set('Authorization', `Bearer ${loginRes.body.access}`)
        .send({
          old_password: ctx.passwords.client,
          new_password: 'NewSecurePass1!',
          confirm_password: 'NewSecurePass1!',
        });
      expect(res.status).toBe(200);
      // restore for other tests
      const loginNew = await login(ctx.client2.username, 'NewSecurePass1!');
      await request(app)
        .post('/api/accounts/change-password/')
        .set('Authorization', `Bearer ${loginNew.body.access}`)
        .send({
          old_password: 'NewSecurePass1!',
          new_password: ctx.passwords.client,
          confirm_password: ctx.passwords.client,
        });
    });
  });
});
