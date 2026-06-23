import http from 'k6/http';

export function parseSetCookie(res) {
  const cookies = {};
  const raw = res.headers['Set-Cookie'] || res.headers['set-cookie'];
  if (!raw) return cookies;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const c of list) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }
  return cookies;
}

export function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function buildSession(baseUrl, username, password) {
  const jar = {};
  const csrfRes = http.get(`${baseUrl}/api/accounts/csrf/`);
  Object.assign(jar, parseSetCookie(csrfRes));

  const csrf = csrfRes.json('csrf_token') || jar.csrf_token;
  if (!csrf) {
    return {
      ok: false,
      status: csrfRes.status,
      res: csrfRes,
      session: null,
      error: `CSRF token missing (status ${csrfRes.status})`,
    };
  }

  const loginRes = http.post(
    `${baseUrl}/api/accounts/login/`,
    JSON.stringify({ username, password }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
        Cookie: cookieHeader(jar),
      },
    }
  );
  Object.assign(jar, parseSetCookie(loginRes));

  const access = loginRes.status === 200 ? loginRes.json('access') : null;
  const session = access
    ? { access, csrf: jar.csrf_token || csrf, jar }
    : null;

  return {
    ok: loginRes.status === 200 && !!access,
    status: loginRes.status,
    res: loginRes,
    session,
    error: session ? null : `Login failed (status ${loginRes.status})`,
  };
}

/** Non-throwing login for VU iterations — record errors via check(), not throws. */
export function loginOnce(baseUrl, username, password) {
  return buildSession(baseUrl, username, password);
}

/** Throws on failure — use in setup() only. */
export function loginSessionStrict(baseUrl, username, password) {
  const result = buildSession(baseUrl, username, password);
  if (!result.ok || !result.session) {
    throw new Error(
      result.error ||
        `Login failed for ${username} (status ${result.status}): ${result.res.body?.substring(0, 120)}`
    );
  }
  return result.session;
}

/** Alias for setup() in endpoint benchmarks. */
export const loginSession = loginSessionStrict;

export function authHeaders(session, extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access}`,
    ...extra,
  };
  if (session.csrf) {
    headers['X-CSRF-Token'] = session.csrf;
  }
  if (session.jar && Object.keys(session.jar).length) {
    headers.Cookie = cookieHeader(session.jar);
  }
  return headers;
}
