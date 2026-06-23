const request = require('supertest');
const app = require('../../app');

function createAgent() {
  return request.agent(app);
}

async function fetchCsrf(agent) {
  const res = await agent.get('/api/accounts/csrf/');
  if (res.status !== 200) {
    throw new Error(`CSRF fetch failed: ${JSON.stringify(res.body)}`);
  }
  return res.body.csrf_token;
}

async function login(username, password, agent = createAgent()) {
  const csrf = await fetchCsrf(agent);
  const res = await agent
    .post('/api/accounts/login/')
    .set('X-CSRF-Token', csrf)
    .send({ username, password });
  res.agent = agent;
  res.csrf = csrf;
  return res;
}

function authHeader(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

async function loginAs(user, password) {
  const res = await login(user.username, password);
  if (res.status !== 200) {
    throw new Error(`Login failed for ${user.username}: ${JSON.stringify(res.body)}`);
  }
  return {
    access: res.body.access,
    agent: res.agent,
    csrf: res.csrf,
    user: res.body.user,
    headers: authHeader(res.body.access),
  };
}

async function refreshWithAgent(agent, csrf) {
  const token = csrf || (await fetchCsrf(agent));
  return agent
    .post('/api/accounts/token/refresh/')
    .set('X-CSRF-Token', token);
}

async function logoutWithAgent(agent, accessToken, csrf) {
  const token = csrf || (await fetchCsrf(agent));
  return agent
    .post('/api/accounts/logout/')
    .set('Authorization', `Bearer ${accessToken}`)
    .set('X-CSRF-Token', token);
}

async function getTokensForRoles(ctx) {
  const { passwords } = ctx;
  return {
    superadmin: await loginAs(ctx.superadmin, passwords.staff),
    admin: await loginAs(ctx.admin, passwords.staff),
    employee: await loginAs(ctx.employee, passwords.staff),
    client: await loginAs(ctx.client, passwords.client),
    client2: await loginAs(ctx.client2, passwords.client),
  };
}

module.exports = {
  createAgent,
  fetchCsrf,
  login,
  authHeader,
  loginAs,
  refreshWithAgent,
  logoutWithAgent,
  getTokensForRoles,
};
