const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');

let baseSpec = null;

const CSRF_PROTECTED_PATHS = new Set([
  '/api/accounts/login/',
  '/api/accounts/logout/',
  '/api/accounts/token/refresh/',
]);

function isSwaggerEnabled() {
  return process.env.SWAGGER_ENABLED !== 'false';
}

function loadBaseOpenApiSpec() {
  if (!baseSpec) {
    const specPath = path.join(__dirname, '..', 'docs', 'openapi.json');
    baseSpec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  }
  return baseSpec;
}

function resolveBaseUrl(req) {
  const host = req.get('host');
  if (!host) {
    throw new Error('Host header is required to resolve Swagger server URL');
  }
  return `${req.protocol}://${host}`;
}

function getOpenApiSpecForRequest(req) {
  const baseUrl = resolveBaseUrl(req);
  return {
    ...loadBaseOpenApiSpec(),
    servers: [{ url: baseUrl, description: 'Current environment' }],
  };
}

function loadOpenApiSpec(req) {
  return getOpenApiSpecForRequest(req);
}

function normalizePathname(url) {
  try {
    const pathname = new URL(url, 'http://localhost').pathname;
    return pathname.endsWith('/') ? pathname : `${pathname}/`;
  } catch {
    return url;
  }
}

function isCsrfProtectedRequest(url) {
  return CSRF_PROTECTED_PATHS.has(normalizePathname(url));
}

/**
 * Returns a self-contained browser function (no external closure refs) so
 * swagger-ui-express can serialize it into swagger-ui-init.js.
 */
function createCsrfRequestInterceptor() {
  return function csrfSwaggerRequestInterceptor(req) {
    var protectedPaths = [
      '/api/accounts/login/',
      '/api/accounts/logout/',
      '/api/accounts/token/refresh/',
    ];

    function normalizePath(url) {
      try {
        var pathname = new URL(url, window.location.origin).pathname;
        return pathname.endsWith('/') ? pathname : pathname + '/';
      } catch (e) {
        return url;
      }
    }

    function isProtected(url) {
      return protectedPaths.indexOf(normalizePath(url)) !== -1;
    }

    if (!isProtected(req.url)) {
      return req;
    }

    if (!csrfSwaggerRequestInterceptor._state) {
      csrfSwaggerRequestInterceptor._state = { token: null, promise: null };
    }
    var state = csrfSwaggerRequestInterceptor._state;

    function applyToken(token) {
      req.headers = req.headers || {};
      req.headers['X-CSRF-Token'] = token;
      return req;
    }

    function fetchCsrf() {
      if (!state.promise) {
        state.promise = fetch('/api/accounts/csrf/', { credentials: 'include' })
          .then(function (res) {
            if (!res.ok) {
              throw new Error('CSRF fetch failed (' + res.status + ')');
            }
            return res.json();
          })
          .then(function (data) {
            state.token = data.csrf_token;
            return state.token;
          })
          .finally(function () {
            state.promise = null;
          });
      }
      return state.promise;
    }

    if (state.token) {
      return applyToken(state.token);
    }

    return fetchCsrf().then(applyToken);
  };
}

function getSwaggerUiOptions() {
  return {
    url: '/api/docs/openapi.json',
    withCredentials: true,
    persistAuthorization: true,
    requestInterceptor: createCsrfRequestInterceptor(),
  };
}

function mountSwagger(app) {
  const initialSpec = {
    ...loadBaseOpenApiSpec(),
    servers: [{ url: '/', description: 'Current environment' }],
  };

  app.get('/api/docs/openapi.json', (req, res) => {
    res.json(getOpenApiSpecForRequest(req));
  });

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(initialSpec, {
      customSiteTitle: 'Bubblebytes API',
      swaggerOptions: getSwaggerUiOptions(),
    })
  );
}

module.exports = {
  isSwaggerEnabled,
  mountSwagger,
  loadOpenApiSpec,
  getOpenApiSpecForRequest,
  resolveBaseUrl,
  getSwaggerUiOptions,
  CSRF_PROTECTED_PATHS,
  isCsrfProtectedRequest,
};
