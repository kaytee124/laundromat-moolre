const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles, login, logoutWithAgent, refreshWithAgent, createAgent, fetchCsrf } = require('../helpers/auth');
const { uniqueUsername, uniquePhone } = require('../helpers/fixtures');
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

    it('returns requires_password_change false even for default staff password', async () => {
      const { buildDefaultPassword } = require('../../utils/passwords');
      const { hashPassword } = require('../../services/authService');
      const username = uniqueUsername('defpass');
      const defaultPassword = buildDefaultPassword(username);
      await User.create({
        username,
        password_hash: await hashPassword(defaultPassword),
        first_name: 'Default',
        last_name: 'Pass',
        role: 'admin',
        is_active: true,
        is_staff: true,
        is_superuser: false,
        date_joined: new Date(),
        updated_at: new Date(),
      });
      const res = await login(username, defaultPassword);
      expect(res.status).toBe(200);
      expect(res.body.requires_password_change).toBe(false);
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
          first_name: 'New',
          last_name: 'Admin',
          phone_number: uniquePhone(),
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
          first_name: 'Fail',
          last_name: 'Admin',
          phone_number: uniquePhone(),
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

  describe('PATCH /api/accounts/superadmin/update/', () => {
    it('superadmin updates self', async () => {
      const res = await request(app)
        .patch('/api/accounts/superadmin/update/')
        .set(tokens.superadmin.headers)
        .send({ first_name: 'SuperUpdated' });
      expect(res.status).toBe(200);
      expect(res.body.user.first_name).toBe('SuperUpdated');
    });

    it('denies non-superadmin from superadmin self-update', async () => {
      const res = await request(app)
        .patch('/api/accounts/superadmin/update/')
        .set(tokens.admin.headers)
        .send({ first_name: 'Nope' });
      expect(res.status).toBe(403);
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
    it('admin creates employee and sends credential SMS without magic link', async () => {
      const moolreService = require('../../services/moolreService');
      const { buildDefaultPassword } = require('../../utils/passwords');
      const { waitForSms } = require('../helpers/wait');
      const sendSmsSpy = jest.spyOn(moolreService, 'sendSms').mockResolvedValue({ status: 1, message: 'ok' });

      const username = uniqueUsername('newemp');
      const phone = uniquePhone();
      const res = await request(app)
        .post('/api/accounts/employee/create/')
        .set(tokens.admin.headers)
        .send({
          username,
          first_name: 'New',
          last_name: 'Employee',
          phone_number: phone,
        });
      expect(res.status).toBe(201);
      expect(res.body.default_password).toBe(buildDefaultPassword(username));

      await waitForSms(sendSmsSpy);

      expect(sendSmsSpy).toHaveBeenCalled();
      const msg = sendSmsSpy.mock.calls[0][0].message;
      expect(msg).toContain(username);
      expect(msg).toContain(buildDefaultPassword(username));
      expect(msg).toMatch(/keep your credentials secret/i);
      expect(msg).not.toContain('/welcome?');
      expect(msg).not.toContain('token=');

      sendSmsSpy.mockRestore();
    });

    it('rejects employee create without phone_number', async () => {
      const res = await request(app)
        .post('/api/accounts/employee/create/')
        .set(tokens.admin.headers)
        .send({
          username: uniqueUsername('nophone'),
          first_name: 'No',
          last_name: 'Phone',
        });
      expect(res.status).toBe(400);
      expect(res.body.error_code).toBe('MISSING_FIELDS');
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
          first_name: 'New',
          last_name: 'Super',
          phone_number: uniquePhone(),
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

    it('superadmin lists superadmins', async () => {
      const res = await request(app)
        .get('/api/accounts/superadmins/')
        .set(tokens.superadmin.headers);
      expect(res.status).toBe(200);
      expect(res.body.results).toBeDefined();
      expect(res.body.results.some((u) => u.id === ctx.superadmin.id)).toBe(true);
    });

    it('denies non-superadmin from listing superadmins', async () => {
      const res = await request(app)
        .get('/api/accounts/superadmins/')
        .set(tokens.admin.headers);
      expect(res.status).toBe(403);
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

    it('accepts page_size=200 and caps higher values', async () => {
      const ok = await request(app)
        .get('/api/accounts/clients/?page=1&page_size=200')
        .set(tokens.admin.headers);
      expect(ok.status).toBe(200);
      expect(ok.body.page_size).toBe(200);

      const capped = await request(app)
        .get('/api/accounts/clients/?page=1&page_size=500')
        .set(tokens.admin.headers);
      expect(capped.status).toBe(200);
      expect(capped.body.page_size).toBe(200);
    });

    it('lists clients alphabetically by username', async () => {
      const { hashPassword } = require('../../services/authService');
      const laterName = uniqueUsername('zzz_sort');
      const earlierName = uniqueUsername('aaa_sort');
      const password_hash = await hashPassword(ctx.passwords.client);

      await User.create({
        username: laterName,
        password_hash,
        first_name: 'Zed',
        last_name: 'Sort',
        role: 'client',
        is_active: true,
        is_staff: false,
        is_superuser: false,
        date_joined: new Date(),
        updated_at: new Date(),
      });
      await User.create({
        username: earlierName,
        password_hash,
        first_name: 'Ann',
        last_name: 'Sort',
        role: 'client',
        is_active: true,
        is_staff: false,
        is_superuser: false,
        date_joined: new Date(),
        updated_at: new Date(),
      });

      const res = await request(app)
        .get('/api/accounts/clients/?page=1&page_size=200')
        .set(tokens.admin.headers);
      expect(res.status).toBe(200);
      const usernames = res.body.results.map((c) => c.username);
      expect(usernames).toEqual([...usernames].sort((a, b) => a.localeCompare(b)));
      expect(usernames.indexOf(earlierName)).toBeLessThan(usernames.indexOf(laterName));
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

  describe('POST /api/accounts/superadmin/create/ bootstrap', () => {
    let savedSuperadmin;

    beforeAll(async () => {
      savedSuperadmin = await User.findByPk(ctx.superadmin.id);
      await User.destroy({ where: { role: 'superadmin' } });
    });

    afterAll(async () => {
      await User.destroy({ where: { role: 'superadmin' } });
      if (savedSuperadmin) {
        const plain = savedSuperadmin.get({ plain: true });
        await User.create(plain);
      }
    });

    it('creates the first superadmin without authentication', async () => {
      const res = await request(app)
        .post('/api/accounts/superadmin/create/')
        .send({
          username: uniqueUsername('bootstrap'),
          first_name: 'Bootstrap',
          last_name: 'Super',
          phone_number: uniquePhone(),
        });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('superadmin');
    });

    it('rejects a second superadmin without authentication', async () => {
      const res = await request(app)
        .post('/api/accounts/superadmin/create/')
        .send({
          username: uniqueUsername('bootstrap2'),
          phone_number: uniquePhone(),
        });

      expect(res.status).toBe(401);
      expect(res.body.error_code).toBe('NO_TOKEN');
    });

    it('rejects superadmin creation by non-superadmin', async () => {
      const res = await request(app)
        .post('/api/accounts/superadmin/create/')
        .set(tokens.admin.headers)
        .send({
          username: uniqueUsername('bootstrap3'),
          phone_number: uniquePhone(),
        });

      expect(res.status).toBe(403);
      expect(res.body.error_code).toBe('PERMISSION_DENIED');
    });
  });
});
