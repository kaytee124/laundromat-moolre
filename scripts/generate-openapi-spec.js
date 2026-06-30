'use strict';

const fs = require('fs');
const path = require('path');

const ERROR_CATALOG = {
  NO_TOKEN: { error_code: 'NO_TOKEN', message: 'Authentication credentials not provided', status_code: 401 },
  MISSING_TOKEN: { error_code: 'MISSING_TOKEN', message: 'Refresh token is required', status_code: 401 },
  INVALID_TOKEN: { error_code: 'INVALID_TOKEN', message: 'Invalid or expired token', status_code: 401 },
  INVALID_CREDENTIALS: { error_code: 'INVALID_CREDENTIALS', message: 'Invalid username or password', status_code: 401 },
  PERMISSION_DENIED: { error_code: 'PERMISSION_DENIED', message: 'You do not have permission to perform this action', status_code: 403 },
  CSRF_VALIDATION_FAILED: { error_code: 'CSRF_VALIDATION_FAILED', message: 'CSRF token missing or invalid', status_code: 403 },
  INSUFFICIENT_PERMISSIONS: { error_code: 'INSUFFICIENT_PERMISSIONS', message: 'Only staff can update orders', status_code: 403 },
  NOT_FOUND: { error_code: 'NOT_FOUND', message: 'User not found', status_code: 404 },
  ORDER_NOT_FOUND: { error_code: 'ORDER_NOT_FOUND', message: 'Order not found', status_code: 404 },
  CUSTOMER_NOT_FOUND: { error_code: 'CUSTOMER_NOT_FOUND', message: 'Customer profile not found', status_code: 404 },
  MISSING_FIELDS: { error_code: 'MISSING_FIELDS', message: 'Username and password are required', status_code: 400 },
  VALIDATION_ERROR: { error_code: 'VALIDATION_ERROR', message: 'Validation failed', status_code: 400 },
  ORDER_ALREADY_PAID: { error_code: 'ORDER_ALREADY_PAID', message: 'This order has already been fully paid', status_code: 400 },
  NO_AMOUNT_DUE: { error_code: 'NO_AMOUNT_DUE', message: 'No amount due for this order', status_code: 400 },
  AMOUNT_EXCEEDS_BALANCE: { error_code: 'AMOUNT_EXCEEDS_BALANCE', message: 'Payment amount cannot exceed remaining balance', status_code: 400 },
  MISSING_DATES: { error_code: 'MISSING_DATES', message: 'Start date and end date are required', status_code: 400 },
  INVALID_DATE_RANGE: { error_code: 'INVALID_DATE_RANGE', message: 'End date must be after start date', status_code: 400 },
  DATE_RANGE_TOO_LARGE: { error_code: 'DATE_RANGE_TOO_LARGE', message: 'Date range cannot exceed 366 days', status_code: 400 },
  USERNAME_EXISTS: { error_code: 'USERNAME_EXISTS', message: 'Username already taken', status_code: 409 },
  EMAIL_EXISTS: { error_code: 'EMAIL_EXISTS', message: 'Email already registered', status_code: 409 },
  PHONE_EXISTS: { error_code: 'PHONE_EXISTS', message: 'Phone number already registered', status_code: 409 },
  INVALID_PASSWORD: { error_code: 'INVALID_PASSWORD', message: 'Password must be at least 8 characters', status_code: 422 },
  INVALID_DATE_FORMAT: { error_code: 'INVALID_DATE_FORMAT', message: 'Dates must be in YYYY-MM-DD format', status_code: 422 },
  PAYSTACK_ERROR: { error_code: 'PAYSTACK_ERROR', message: 'Failed to initialize payment', status_code: 500 },
  SERVER_ERROR: { error_code: 'SERVER_ERROR', message: 'An unexpected error occurred', status_code: 500 },
};

const DEFAULT_ERROR_KEYS = {
  400: ['VALIDATION_ERROR', 'MISSING_FIELDS'],
  401: ['NO_TOKEN', 'INVALID_TOKEN'],
  403: ['PERMISSION_DENIED', 'CSRF_VALIDATION_FAILED'],
  404: ['NOT_FOUND', 'ORDER_NOT_FOUND'],
  409: ['USERNAME_EXISTS', 'EMAIL_EXISTS'],
  422: ['VALIDATION_ERROR', 'INVALID_PASSWORD'],
  500: ['PAYSTACK_ERROR', 'SERVER_ERROR'],
};

function errorResponse(status, description, ...keys) {
  const codes = keys.length ? keys : DEFAULT_ERROR_KEYS[status] || ['VALIDATION_ERROR'];
  const examples = {};
  codes.forEach((key) => {
    if (ERROR_CATALOG[key]) examples[key] = { value: ERROR_CATALOG[key] };
  });
  const body = { schema: { $ref: '#/components/schemas/ApiError' } };
  if (Object.keys(examples).length) body.examples = examples;
  return { description, content: { 'application/json': body } };
}

function jsonResponse(description, schemaRef, example) {
  const body = { schema: { $ref: schemaRef } };
  if (example !== undefined) body.example = example;
  return { description, content: { 'application/json': body } };
}

const stdErrors = {
  400: errorResponse(400, 'Bad request'),
  401: errorResponse(401, 'Unauthorized'),
  403: errorResponse(403, 'Forbidden'),
  404: errorResponse(404, 'Not found'),
  409: errorResponse(409, 'Conflict'),
  422: errorResponse(422, 'Validation error'),
  500: errorResponse(500, 'Server error'),
};

const EXAMPLE_USER = {
  id: 1,
  username: 'client1',
  email: 'client1@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
  role: 'client',
  is_active: true,
  is_staff: false,
  is_superuser: false,
};

const EXAMPLE_SERVICE = {
  id: 1,
  name: 'Wash & Fold',
  description: 'Standard laundry service',
  price: '25.00',
  unit: 'per item',
  category: 'wash',
  estimated_days: 2,
  is_active: true,
};

const EXAMPLE_ORDER = {
  id: 1,
  order_number: 'ORD-ABC12345',
  customer_id: 1,
  customer_username: 'client1',
  customer_name: 'Jane Doe',
  assigned_to: 2,
  assigned_to_username: 'employee1',
  order_status: 'pending',
  payment_status: 'pending',
  total_amount: '50.00',
  amount_paid: '0.00',
  discount_amount: '0.00',
  order_items: [
    {
      id: 1,
      service_id: 1,
      service_name: 'Wash & Fold',
      item_name: 'Wash & Fold',
      quantity: 2,
      unit_price: '25.00',
      subtotal: '50.00',
    },
  ],
};

const PUBLIC = [];
const bearer = [{ bearerAuth: [] }];
const csrfOnly = [{ csrfHeader: [] }];
const bearerCsrf = [{ bearerAuth: [] }, { csrfHeader: [] }];
const refreshCsrf = [{ refreshCookie: [] }, { csrfHeader: [] }];

const AUTH_BEARER = 'Access JWT — `Authorization: Bearer <access>` (from login response field `access`). Paste in Swagger **Authorize**.';

const AUTH_META = {
  'GET /health': { security: PUBLIC, requiredAuth: 'None' },
  'GET /api/accounts/csrf/': { security: PUBLIC, requiredAuth: 'None' },
  'POST /api/accounts/login/': {
    security: csrfOnly,
    requiredAuth: 'CSRF only — `csrf_token` cookie + `X-CSRF-Token` header (no JWT). Swagger auto-injects.',
  },
  'POST /api/accounts/logout/': {
    security: bearerCsrf,
    requiredAuth: `${AUTH_BEARER} Plus CSRF — \`X-CSRF-Token\` header matching \`csrf_token\` cookie.`,
  },
  'POST /api/accounts/token/refresh/': {
    security: refreshCsrf,
    requiredAuth: 'Refresh cookie + CSRF — `refresh_token` HttpOnly cookie and `X-CSRF-Token` header (no Bearer).',
  },
  'POST /api/accounts/token/verify/': {
    security: PUBLIC,
    requiredAuth: 'None — JWT passed in request body field `token`, not `Authorization` header.',
  },
  'POST /api/accounts/change-password/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: any authenticated user.`,
  },
  'PUT /api/accounts/change-password/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: any authenticated user.`,
  },
  'GET /api/accounts/user/profile/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: any authenticated user.`,
  },
  'PATCH /api/accounts/client/update/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: client.`,
  },
  'POST /api/accounts/admin/create/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: superadmin.`,
  },
  'PATCH /api/accounts/admin/update/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: admin or superadmin.`,
  },
  'PATCH /api/accounts/admin/employee/{userId}/update/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: admin.`,
  },
  'POST /api/accounts/employee/create/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: admin or superadmin.`,
  },
  'PATCH /api/accounts/employee/update/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: employee.`,
  },
  'PATCH /api/accounts/staff/client/{userId}/update/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: staff (admin, employee, or superadmin).`,
  },
  'GET /api/accounts/staff/user/{userId}/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: staff (admin, employee, or superadmin).`,
  },
  'POST /api/accounts/superadmin/create/': {
    security: PUBLIC,
    requiredAuth:
      'None for first bootstrap (no superadmin exists). After bootstrap: superadmin access JWT via `Authorization: Bearer <access>`.',
  },
  'PATCH /api/accounts/superadmin/admin/{userId}/update/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: superadmin.`,
  },
  'PATCH /api/accounts/superadmin/employee/{userId}/update/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: superadmin.`,
  },
  'PATCH /api/accounts/superadmin/client/{userId}/update/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: superadmin.`,
  },
  'GET /api/accounts/superadmin/user/{userId}/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: superadmin.`,
  },
  'GET /api/accounts/admins/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: superadmin.`,
  },
  'GET /api/accounts/employees/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: admin or superadmin.`,
  },
  'GET /api/accounts/clients/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: staff (admin, employee, or superadmin).`,
  },
  'POST /api/customers/register/': { security: PUBLIC, requiredAuth: 'None' },
  'POST /api/customers/create/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: staff (admin, employee, or superadmin).`,
  },
  'GET /api/services/list/': { security: PUBLIC, requiredAuth: 'None' },
  'POST /api/services/create/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: admin or superadmin.`,
  },
  'GET /api/services/{id}/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: admin or superadmin.`,
  },
  'PATCH /api/services/{id}/update/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: admin or superadmin.`,
  },
  'GET /api/orders/list/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: any authenticated user (results scoped by role).`,
  },
  'POST /api/orders/create/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: staff (admin, employee, or superadmin).`,
  },
  'GET /api/orders/{id}/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: any authenticated user (access scoped by role).`,
  },
  'PUT /api/orders/{id}/update/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: staff (admin, employee, or superadmin).`,
  },
  'POST /api/payments/initialize/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: client.`,
  },
  'GET /api/payments/callback/': { security: PUBLIC, requiredAuth: 'None (Paystack redirect callback)' },
  'POST /api/ussd/payments/initialize/': { security: PUBLIC, requiredAuth: 'None (customer identified by phone_number)' },
  'POST /api/ussd/callback/': { security: PUBLIC, requiredAuth: 'None (Moolre USSD webhook)' },
  'GET /api/dashboard/metrics/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: any authenticated user (metrics vary by role).`,
  },
  'GET /api/dashboard/revenue-report/': {
    security: bearer,
    requiredAuth: `${AUTH_BEARER} Role: admin or superadmin.`,
  },
};

function authOpKey(path, method) {
  return `${method.toUpperCase()} ${path}`;
}

function applyAuthDocumentation(openApiSpec) {
  const schemes = openApiSpec.components.securitySchemes;
  schemes.bearerAuth.description =
    'Access JWT from `POST /api/accounts/login/` response field `access`. ' +
    'Send as `Authorization: Bearer <access>`. Use Swagger **Authorize** to paste the token.';
  schemes.csrfHeader.description =
    'Header `X-CSRF-Token` must match the `csrf_token` cookie from `GET /api/accounts/csrf/`. ' +
    'Required for login, logout, and token refresh. Swagger UI auto-injects on those routes.';
  schemes.refreshCookie.description =
    'HttpOnly refresh token cookie set on login (`refresh_token` by default, configurable via REFRESH_COOKIE_NAME). ' +
    'Required for `POST /api/accounts/token/refresh/` together with `X-CSRF-Token`.';

  for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;

      const key = authOpKey(path, method);
      const meta = AUTH_META[key];
      if (!meta) continue;

      operation.security = meta.security;

      const authLine = `**Required auth:** ${meta.requiredAuth}`;
      if (operation.description && !operation.description.includes('**Required auth:**')) {
        operation.description = `${authLine}\n\n${operation.description}`;
      } else if (!operation.description) {
        operation.description = authLine;
      }
    }
  }
}

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Bubblebytes Laundry Management API',
    version: '1.0.0',
    description: [
      'REST API for laundry order management, customers, payments, and dashboards.',
      '',
      '**Server URL** — resolved from the request host at runtime when viewing Swagger (not `BASE_URL`).',
      '',
      '**Success envelope** (most mutations): `{ "status": "success", "message": "...", "data": { ... } }`',
      '',
      '**Error format**: `{ "error_code": "CODE", "message": "Human-readable message", "status_code": 400 }`',
      '',
      '**Authentication**',
      '1. `GET /api/accounts/csrf/` — sets `csrf_token` cookie and returns the same value in JSON.',
      '2. **Double-submit CSRF** — login/logout/refresh require BOTH the `csrf_token` cookie AND `X-CSRF-Token` header with the same value.',
      '3. Swagger UI at `/api/docs` auto-fetches CSRF and injects the header on login/logout/refresh (withCredentials enabled).',
      '4. Login returns `access` JWT; use `Authorization: Bearer <access>` in Swagger **Authorize**.',
      '5. Refresh token is stored in HttpOnly cookie (`refresh_token` by default).',
      '',
      '**Authentication matrix**',
      '| Auth type | Header / cookie | Endpoints |',
      '|-----------|-----------------|-----------|',
      '| None | — | health, csrf, register, services list, payment callback, USSD, token verify (body) |',
      '| CSRF only | `csrf_token` cookie + `X-CSRF-Token` | login |',
      '| Access JWT | `Authorization: Bearer <access>` | most `/api/*` routes (see per-operation **Required auth**) |',
      '| Access JWT + CSRF | Bearer + `X-CSRF-Token` | logout |',
      '| Refresh + CSRF | `refresh_token` cookie + `X-CSRF-Token` | token refresh |',
      '',
      '**Notes**',
      '- `POST /api/accounts/token/verify/` — JWT in body field `token`, not Bearer header.',
      '- `POST /api/accounts/superadmin/create/` — no JWT for first bootstrap; superadmin Bearer after.',
      '- Expired access JWT: if `refresh_token` cookie and `X-CSRF-Token` are present, `authenticate` may silently refresh.',
      '',
      '**Roles**: `superadmin`, `admin`, `employee`, `client`.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'Resolved from request host at runtime' }],
  tags: [
    { name: 'Health' },
    { name: 'Accounts' },
    { name: 'Customers' },
    { name: 'Services' },
    { name: 'Orders' },
    { name: 'Payments' },
    { name: 'Ussd' },
    { name: 'Dashboard' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          200: jsonResponse(
            'Healthy or degraded (database check included)',
            '#/components/schemas/HealthResponse'
          ),
        },
      },
    },
    '/api/accounts/csrf/': {
      get: {
        tags: ['Accounts'],
        summary: 'Issue CSRF token',
        description:
          'Sets the `csrf_token` cookie and returns the same token in the JSON body. ' +
          'The body value is for API clients (Postman, scripts); browsers also need the cookie. ' +
          'For login/logout/refresh, send `X-CSRF-Token` matching the cookie (Swagger UI does this automatically).',
        responses: {
          200: jsonResponse('CSRF token issued', '#/components/schemas/CsrfResponse', {
            csrf_token: 'csrf-token-example',
          }),
        },
      },
    },
    '/api/accounts/login/': {
      post: {
        tags: ['Accounts'],
        summary: 'Login',
        description:
          'Requires double-submit CSRF: `csrf_token` cookie (from GET /api/accounts/csrf/) AND `X-CSRF-Token` header with the same value. ' +
          'Swagger UI auto-injects CSRF; in Postman, call CSRF first, then set the header manually.',
        security: csrfOnly,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: jsonResponse('Login successful', '#/components/schemas/LoginResponse', {
            access: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example',
            user: EXAMPLE_USER,
            requires_password_change: false,
          }),
          400: errorResponse(400, 'Missing credentials', 'MISSING_FIELDS'),
          401: errorResponse(401, 'Invalid credentials', 'INVALID_CREDENTIALS'),
          403: errorResponse(403, 'CSRF validation failed', 'CSRF_VALIDATION_FAILED'),
        },
      },
    },
    '/api/accounts/logout/': {
      post: {
        tags: ['Accounts'],
        summary: 'Logout',
        security: bearerCsrf,
        responses: {
          200: jsonResponse('Logged out', '#/components/schemas/MessageResponse', {
            message: 'Logged out successfully',
          }),
          401: stdErrors[401],
          403: errorResponse(403, 'CSRF validation failed', 'CSRF_VALIDATION_FAILED'),
        },
      },
    },
    '/api/accounts/token/refresh/': {
      post: {
        tags: ['Accounts'],
        summary: 'Refresh access token',
        security: refreshCsrf,
        responses: {
          200: {
            description: 'New access token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/accounts/token/verify/': {
      post: {
        tags: ['Accounts'],
        summary: 'Verify JWT',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenVerifyRequest' } } },
        },
        responses: {
          200: { description: 'Token valid', content: { 'application/json': { schema: { type: 'object' } } } },
          400: stdErrors[400],
          401: stdErrors[401],
        },
      },
    },
    '/api/accounts/change-password/': {
      post: {
        tags: ['Accounts'],
        summary: 'Change password (POST)',
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangePasswordRequest' } } },
        },
        responses: {
          200: {
            description: 'Password changed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PasswordChangedResponse' } } },
          },
          400: stdErrors[400],
          401: stdErrors[401],
        },
      },
      put: {
        tags: ['Accounts'],
        summary: 'Change password (PUT)',
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangePasswordRequest' } } },
        },
        responses: {
          200: {
            description: 'Password changed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PasswordChangedResponse' } } },
          },
          400: stdErrors[400],
          401: stdErrors[401],
        },
      },
    },
    '/api/accounts/user/profile/': {
      get: {
        tags: ['Accounts'],
        summary: 'Get current user profile',
        security: bearer,
        responses: {
          200: {
            description: 'Profile',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileResponse' } } },
          },
          401: stdErrors[401],
        },
      },
    },
    '/api/accounts/client/update/': {
      patch: {
        tags: ['Accounts'],
        summary: 'Client updates own profile',
        security: bearer,
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ClientSelfUpdateRequest' } } },
        },
        responses: {
          200: {
            description: 'Updated profile',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileUpdateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/accounts/admin/create/': {
      post: {
        tags: ['Accounts'],
        summary: 'Create admin (superadmin only)',
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffCreateRequest' } } },
        },
        responses: {
          201: {
            description: 'Admin created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffCreateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          409: stdErrors[409],
        },
      },
    },
    '/api/accounts/admin/update/': {
      patch: {
        tags: ['Accounts'],
        summary: 'Admin updates own profile',
        security: bearer,
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffSelfUpdateRequest' } } },
        },
        responses: {
          200: {
            description: 'Updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileUpdateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/accounts/admin/employee/{userId}/update/': {
      patch: {
        tags: ['Accounts'],
        summary: 'Admin updates employee',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/userId' }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffSelfUpdateRequest' } } },
        },
        responses: {
          200: {
            description: 'Employee updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileUpdateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/accounts/employee/create/': {
      post: {
        tags: ['Accounts'],
        summary: 'Create employee (admin or superadmin)',
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffCreateRequest' } } },
        },
        responses: {
          201: {
            description: 'Employee created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffCreateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          409: stdErrors[409],
        },
      },
    },
    '/api/accounts/employee/update/': {
      patch: {
        tags: ['Accounts'],
        summary: 'Employee updates own profile',
        security: bearer,
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffSelfUpdateRequest' } } },
        },
        responses: {
          200: {
            description: 'Updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileUpdateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/accounts/staff/client/{userId}/update/': {
      patch: {
        tags: ['Accounts'],
        summary: 'Staff updates client profile',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/userId' }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ClientStaffUpdateRequest' } } },
        },
        responses: {
          200: {
            description: 'Client updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileUpdateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/accounts/staff/user/{userId}/': {
      get: {
        tags: ['Accounts'],
        summary: 'Staff gets user by ID',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/userId' }],
        responses: {
          200: {
            description: 'User detail',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffUserDetailResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/accounts/superadmin/create/': {
      post: {
        tags: ['Accounts'],
        summary: 'Create superadmin',
        description:
          'Public when no superadmin exists (initial bootstrap). After that, requires superadmin Bearer token.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffCreateRequest' } } },
        },
        responses: {
          201: {
            description: 'Superadmin created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StaffCreateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          409: stdErrors[409],
        },
      },
    },
    '/api/accounts/superadmin/admin/{userId}/update/': {
      patch: {
        tags: ['Accounts'],
        summary: 'Superadmin updates admin',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/userId' }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SuperadminUserUpdateRequest' } } },
        },
        responses: {
          200: {
            description: 'Admin updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileUpdateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/accounts/superadmin/employee/{userId}/update/': {
      patch: {
        tags: ['Accounts'],
        summary: 'Superadmin updates employee',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/userId' }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SuperadminUserUpdateRequest' } } },
        },
        responses: {
          200: {
            description: 'Employee updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileUpdateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/accounts/superadmin/client/{userId}/update/': {
      patch: {
        tags: ['Accounts'],
        summary: 'Superadmin updates client',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/userId' }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SuperadminUserUpdateRequest' } } },
        },
        responses: {
          200: {
            description: 'Client updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileUpdateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/accounts/superadmin/user/{userId}/': {
      get: {
        tags: ['Accounts'],
        summary: 'Superadmin gets user by ID',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/userId' }],
        responses: {
          200: {
            description: 'User detail',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SuperadminUserDetailResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/accounts/admins/': {
      get: {
        tags: ['Accounts'],
        summary: 'List admins (superadmin)',
        security: bearer,
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/pageSize' },
          { $ref: '#/components/parameters/search' },
        ],
        responses: {
          200: {
            description: 'Paginated admin list',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedUserList' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/accounts/employees/': {
      get: {
        tags: ['Accounts'],
        summary: 'List employees (admin or superadmin)',
        security: bearer,
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/pageSize' },
          { $ref: '#/components/parameters/search' },
        ],
        responses: {
          200: {
            description: 'Paginated employee list',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedUserList' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/accounts/clients/': {
      get: {
        tags: ['Accounts'],
        summary: 'List clients (staff)',
        security: bearer,
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/pageSize' },
          { $ref: '#/components/parameters/search' },
        ],
        responses: {
          200: {
            description: 'Paginated client list',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedClientList' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/customers/register/': {
      post: {
        tags: ['Customers'],
        summary: 'Public customer registration',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerRegisterRequest' } } },
        },
        responses: {
          201: {
            description: 'Registered',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerRegisterResponse' } } },
          },
          400: stdErrors[400],
          409: stdErrors[409],
          422: stdErrors[422],
        },
      },
    },
    '/api/customers/create/': {
      post: {
        tags: ['Customers'],
        summary: 'Staff creates customer',
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerStaffCreateRequest' } } },
        },
        responses: {
          201: {
            description: 'Customer created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerStaffCreateResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          409: stdErrors[409],
        },
      },
    },
    '/api/services/list/': {
      get: {
        tags: ['Services'],
        summary: 'List active services',
        parameters: [{ name: 'category', in: 'query', schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Service list',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceListResponse' } } },
          },
        },
      },
    },
    '/api/services/create/': {
      post: {
        tags: ['Services'],
        summary: 'Create service (admin or superadmin)',
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceCreateRequest' } } },
        },
        responses: {
          201: {
            description: 'Service created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceMutationResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/services/{id}/': {
      get: {
        tags: ['Services'],
        summary: 'Get service by ID',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/id' }],
        responses: {
          200: {
            description: 'Service detail',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceDetailResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/services/{id}/update/': {
      patch: {
        tags: ['Services'],
        summary: 'Update service',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/id' }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceUpdateRequest' } } },
        },
        responses: {
          200: {
            description: 'Service updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceMutationResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/orders/list/': {
      get: {
        tags: ['Orders'],
        summary: 'List orders',
        security: bearer,
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/pageSize' },
          { name: 'customer_id', in: 'query', schema: { type: 'integer' } },
          { name: 'assigned_to', in: 'query', schema: { type: 'integer' } },
          { name: 'order_status', in: 'query', schema: { type: 'string' } },
          { name: 'payment_status', in: 'query', schema: { type: 'string' } },
          { name: 'order_number', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'created_from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'created_to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: {
            description: 'Paginated orders',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderListResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/orders/create/': {
      post: {
        tags: ['Orders'],
        summary: 'Create order (staff)',
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderCreateRequest' } } },
        },
        responses: {
          201: {
            description: 'Order created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderMutationResponse' } } },
          },
          400: stdErrors[400],
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/orders/{id}/': {
      get: {
        tags: ['Orders'],
        summary: 'Get order by ID',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/id' }],
        responses: {
          200: {
            description: 'Order detail',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderDetailResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/orders/{id}/update/': {
      put: {
        tags: ['Orders'],
        summary: 'Update order',
        security: bearer,
        parameters: [{ $ref: '#/components/parameters/id' }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderUpdateRequest' } } },
        },
        responses: {
          200: {
            description: 'Order updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderMutationResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
        },
      },
    },
    '/api/payments/initialize/': {
      post: {
        tags: ['Payments'],
        summary: 'Initialize Paystack payment (client)',
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentInitializeRequest' } } },
        },
        responses: {
          200: {
            description: 'Payment initialized',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentInitializeResponse' } } },
          },
          400: stdErrors[400],
          401: stdErrors[401],
          403: stdErrors[403],
          404: stdErrors[404],
          500: stdErrors[500],
        },
      },
    },
    '/api/payments/callback/': {
      get: {
        tags: ['Payments'],
        summary: 'Paystack payment callback',
        parameters: [
          { name: 'reference', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Verification result',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentCallbackResponse' } } },
          },
        },
      },
    },
    '/api/ussd/payments/initialize/': {
      post: {
        tags: ['Ussd'],
        summary: 'Initialize Paystack payment via USSD (no auth)',
        description: 'Identifies the customer by phone number. No JWT required.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UssdPaymentInitializeRequest' } } },
        },
        responses: {
          200: {
            description: 'Payment initialized',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentInitializeResponse' } } },
          },
          400: stdErrors[400],
          404: stdErrors[404],
          500: stdErrors[500],
        },
      },
    },
    '/api/ussd/callback/': {
      post: {
        tags: ['Ussd'],
        summary: 'Moolre USSD callback',
        description: 'Interactive USSD menu handler. Configure this URL in the Moolre dashboard.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MoolreUssdCallbackRequest' } } },
        },
        responses: {
          200: {
            description: 'USSD menu response',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MoolreUssdCallbackResponse' } } },
          },
        },
      },
    },
    '/api/dashboard/metrics/': {
      get: {
        tags: ['Dashboard'],
        summary: 'Role-based dashboard metrics',
        security: bearer,
        responses: {
          200: {
            description: 'Metrics (shape varies by role)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DashboardMetricsResponse' } } },
          },
          401: stdErrors[401],
        },
      },
    },
    '/api/dashboard/revenue-report/': {
      get: {
        tags: ['Dashboard'],
        summary: 'Revenue report (admin or superadmin)',
        security: bearer,
        parameters: [
          { name: 'start_date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'end_date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'group_by', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' } },
        ],
        responses: {
          200: {
            description: 'Revenue report',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RevenueReportResponse' } } },
          },
          400: stdErrors[400],
          401: stdErrors[401],
          403: stdErrors[403],
          422: stdErrors[422],
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token from login response',
      },
      csrfHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description:
          'Must match the `csrf_token` cookie from GET /api/accounts/csrf/. Swagger UI sets this automatically.',
      },
      refreshCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refresh_token',
        description: 'HttpOnly refresh token cookie (name configurable via REFRESH_COOKIE_NAME)',
      },
    },
    parameters: {
      id: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      userId: { name: 'userId', in: 'path', required: true, schema: { type: 'integer' } },
      page: { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
      pageSize: { name: 'page_size', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      search: { name: 'search', in: 'query', schema: { type: 'string' } },
    },
    schemas: {
      ApiError: {
        type: 'object',
        required: ['error_code', 'message', 'status_code'],
        properties: {
          error_code: {
            type: 'string',
            enum: Object.keys(ERROR_CATALOG),
          },
          message: { type: 'string' },
          status_code: { type: 'integer' },
        },
        example: ERROR_CATALOG.NO_TOKEN,
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'], example: 'ok' },
          database: { type: 'string', enum: ['ok', 'unavailable'], example: 'ok' },
        },
        example: { status: 'ok', database: 'ok' },
      },
      CsrfResponse: {
        type: 'object',
        properties: { csrf_token: { type: 'string' } },
      },
      MessageResponse: {
        type: 'object',
        properties: { message: { type: 'string' } },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          email: { type: 'string', format: 'email' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          role: { type: 'string', enum: ['superadmin', 'admin', 'employee', 'client'] },
          is_active: { type: 'boolean' },
          is_staff: { type: 'boolean' },
          is_superuser: { type: 'boolean' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string', format: 'password' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          access: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
          requires_password_change: { type: 'boolean' },
          message: { type: 'string' },
        },
        example: {
          access: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example',
          user: EXAMPLE_USER,
          requires_password_change: false,
        },
      },
      RefreshResponse: {
        type: 'object',
        properties: { access: { type: 'string' } },
      },
      TokenVerifyRequest: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['old_password', 'new_password', 'confirm_password'],
        properties: {
          old_password: { type: 'string' },
          new_password: { type: 'string' },
          confirm_password: { type: 'string' },
        },
      },
      PasswordChangedResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          password_changed: { type: 'boolean' },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          email: { type: 'string' },
          status: { type: 'string' },
          phone_number: { type: 'string', nullable: true },
          whatsapp_number: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          preferred_contact_method: { type: 'string', nullable: true },
          notes: { type: 'string', nullable: true },
          total_orders: { type: 'integer' },
          total_spent: { type: 'string' },
          last_order_date: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      ProfileResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          user: { $ref: '#/components/schemas/UserProfile' },
        },
      },
      ProfileUpdateResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      ClientSelfUpdateRequest: {
        type: 'object',
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          email: { type: 'string' },
          phone_number: { type: 'string' },
          whatsapp_number: { type: 'string' },
          address: { type: 'string' },
          preferred_contact_method: { type: 'string', enum: ['phone', 'whatsapp'] },
        },
      },
      StaffCreateRequest: {
        type: 'object',
        required: ['username', 'email', 'first_name', 'last_name'],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
        },
      },
      StaffCreateResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
          default_password: { type: 'string' },
          note: { type: 'string' },
        },
      },
      StaffSelfUpdateRequest: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
        },
      },
      ClientStaffUpdateRequest: {
        type: 'object',
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          email: { type: 'string' },
          phone_number: { type: 'string' },
          whatsapp_number: { type: 'string' },
          address: { type: 'string' },
          preferred_contact_method: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      SuperadminUserUpdateRequest: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          is_active: { type: 'boolean' },
        },
      },
      StaffUserDetail: {
        allOf: [{ $ref: '#/components/schemas/User' }, {
          type: 'object',
          properties: {
            status: { type: 'string' },
            phone_number: { type: 'string', nullable: true },
            customer: { type: 'object', properties: { id: { type: 'integer' } }, nullable: true },
          },
        }],
      },
      StaffUserDetailResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          user: { $ref: '#/components/schemas/StaffUserDetail' },
        },
      },
      SuperadminUserDetailResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          user: { $ref: '#/components/schemas/StaffUserDetail' },
        },
      },
      UserListItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          email: { type: 'string' },
          status: { type: 'string' },
        },
      },
      ClientListItem: {
        allOf: [{ $ref: '#/components/schemas/UserListItem' }, {
          type: 'object',
          properties: {
            username: { type: 'string' },
            phone_number: { type: 'string', nullable: true },
            total_orders: { type: 'integer' },
            total_spent: { type: 'string' },
            customer: { type: 'object', properties: { id: { type: 'integer' } }, nullable: true },
          },
        }],
      },
      PaginatedUserList: {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          page: { type: 'integer' },
          page_size: { type: 'integer' },
          total_pages: { type: 'integer' },
          results: { type: 'array', items: { $ref: '#/components/schemas/UserListItem' } },
        },
      },
      PaginatedClientList: {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          page: { type: 'integer' },
          page_size: { type: 'integer' },
          total_pages: { type: 'integer' },
          results: { type: 'array', items: { $ref: '#/components/schemas/ClientListItem' } },
        },
      },
      CustomerRegisterRequest: {
        type: 'object',
        required: [
          'username', 'email', 'password', 'first_name', 'last_name',
          'phone_number', 'whatsapp_number', 'address', 'preferred_contact_method',
        ],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          password: { type: 'string', minLength: 8 },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          phone_number: { type: 'string' },
          whatsapp_number: { type: 'string' },
          address: { type: 'string' },
          preferred_contact_method: { type: 'string', enum: ['phone', 'whatsapp'] },
        },
      },
      CustomerRegisterResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
          customer: { type: 'object', properties: { id: { type: 'integer' } } },
        },
      },
      CustomerStaffCreateRequest: {
        type: 'object',
        required: [
          'username', 'email', 'first_name', 'last_name',
          'phone_number', 'whatsapp_number', 'address', 'preferred_contact_method',
        ],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          phone_number: { type: 'string' },
          whatsapp_number: { type: 'string' },
          address: { type: 'string' },
          preferred_contact_method: { type: 'string', enum: ['phone', 'whatsapp'] },
        },
      },
      CustomerStaffCreateResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
          customer: { type: 'object', properties: { id: { type: 'integer' } } },
          default_password: { type: 'string' },
          note: { type: 'string' },
        },
      },
      Service: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          price: { type: 'string' },
          unit: { type: 'string' },
          category: { type: 'string', nullable: true },
          estimated_days: { type: 'integer', nullable: true },
          is_active: { type: 'boolean' },
        },
      },
      ServiceListResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: { type: 'array', items: { $ref: '#/components/schemas/Service' } },
        },
      },
      ServiceDetailResponse: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          data: { $ref: '#/components/schemas/Service' },
        },
      },
      ServiceCreateRequest: {
        type: 'object',
        required: ['name', 'price'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number' },
          unit: { type: 'string' },
          category: { type: 'string' },
          estimated_days: { type: 'integer' },
        },
      },
      ServiceUpdateRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number' },
          unit: { type: 'string' },
          category: { type: 'string' },
          estimated_days: { type: 'integer' },
          is_active: { type: 'boolean' },
        },
      },
      ServiceMutationResponse: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          message: { type: 'string' },
          data: { $ref: '#/components/schemas/Service' },
        },
      },
      OrderItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          service_id: { type: 'integer' },
          service_name: { type: 'string', nullable: true },
          item_name: { type: 'string' },
          description: { type: 'string', nullable: true },
          quantity: { type: 'integer' },
          unit_price: { type: 'string' },
          subtotal: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          order_number: { type: 'string' },
          customer_id: { type: 'integer' },
          customer_username: { type: 'string', nullable: true },
          customer_name: { type: 'string', nullable: true },
          assigned_to: { type: 'integer', nullable: true },
          assigned_to_username: { type: 'string', nullable: true },
          order_status: { type: 'string' },
          payment_status: { type: 'string' },
          total_amount: { type: 'string' },
          amount_paid: { type: 'string' },
          discount_amount: { type: 'string' },
          delivery_notes: { type: 'string', nullable: true },
          special_instructions: { type: 'string', nullable: true },
          pickup_date: { type: 'string', format: 'date', nullable: true },
          delivery_date: { type: 'string', format: 'date', nullable: true },
          estimated_completion_date: { type: 'string', format: 'date', nullable: true },
          completed_at: { type: 'string', format: 'date-time', nullable: true },
          order_items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
        },
      },
      PaginatedOrders: {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          page: { type: 'integer' },
          page_size: { type: 'integer' },
          total_pages: { type: 'integer' },
          results: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
        },
      },
      OrderListResponse: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          data: { $ref: '#/components/schemas/PaginatedOrders' },
        },
      },
      OrderDetailResponse: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          data: { $ref: '#/components/schemas/Order' },
        },
      },
      OrderCreateRequest: {
        type: 'object',
        required: ['customer_id', 'order_items_data'],
        properties: {
          customer_id: { type: 'integer' },
          assigned_to: { type: 'integer' },
          order_status: { type: 'string' },
          payment_status: { type: 'string' },
          discount_amount: { type: 'number' },
          delivery_notes: { type: 'string' },
          special_instructions: { type: 'string' },
          pickup_date: { type: 'string', format: 'date' },
          delivery_date: { type: 'string', format: 'date' },
          estimated_completion_date: { type: 'string', format: 'date' },
          order_items_data: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['service_id'],
              properties: {
                service_id: { type: 'integer' },
                quantity: { type: 'integer', minimum: 1 },
                unit_price: { type: 'number' },
                item_name: { type: 'string' },
                description: { type: 'string' },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
      OrderUpdateRequest: {
        type: 'object',
        properties: {
          assigned_to: { type: 'integer' },
          order_status: { type: 'string' },
          payment_status: { type: 'string' },
          discount_amount: { type: 'number' },
          delivery_notes: { type: 'string' },
          special_instructions: { type: 'string' },
          pickup_date: { type: 'string', format: 'date' },
          delivery_date: { type: 'string', format: 'date' },
          estimated_completion_date: { type: 'string', format: 'date' },
          completed_at: { type: 'string', format: 'date-time' },
        },
      },
      OrderMutationResponse: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          message: { type: 'string' },
          data: { $ref: '#/components/schemas/Order' },
        },
      },
      PaymentInitializeRequest: {
        type: 'object',
        required: ['order_id', 'amount'],
        properties: {
          order_id: { type: 'integer' },
          amount: { type: 'number' },
        },
      },
      UssdPaymentInitializeRequest: {
        type: 'object',
        required: ['phone_number', 'order_id', 'amount'],
        properties: {
          phone_number: { type: 'string', example: '0200000001' },
          order_id: { type: 'integer' },
          amount: { type: 'number' },
        },
      },
      MoolreUssdCallbackRequest: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Unique USSD session id (also accepted as sessionid)' },
          new: { type: 'boolean', description: 'True when the user first dials the code' },
          msisdn: { type: 'string', example: '233200000001' },
          network: { type: 'integer', description: '3=MTN, 5=AT, 6=Telecel' },
          message: { type: 'string', description: 'User input for continuing sessions' },
          extension: { type: 'string' },
          data: { type: 'string' },
        },
      },
      MoolreUssdCallbackResponse: {
        type: 'object',
        required: ['message', 'reply'],
        properties: {
          message: { type: 'string' },
          reply: { type: 'boolean', description: 'True if another user input is expected' },
        },
      },
      PaymentInitializeData: {
        type: 'object',
        properties: {
          authorization_url: { type: 'string', format: 'uri' },
          access_code: { type: 'string' },
          reference: { type: 'string' },
          payment_id: { type: 'integer' },
        },
      },
      PaymentInitializeResponse: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          message: { type: 'string' },
          data: { $ref: '#/components/schemas/PaymentInitializeData' },
        },
      },
      PaymentCallbackResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          order_id: { type: 'integer', description: 'Present on successful verification' },
        },
        example: {
          success: true,
          message: 'Payment processed successfully',
          order_id: 1,
        },
      },
      DashboardMetricsResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            additionalProperties: true,
            description: 'Shape depends on role (superadmin, admin, employee, client)',
          },
        },
      },
      RevenueReportSummary: {
        type: 'object',
        properties: {
          unique_orders: { type: 'integer' },
          total_transactions: { type: 'integer' },
          grand_total: { type: 'string' },
          min_transaction: { type: 'string' },
          max_transaction: { type: 'string' },
          average_transaction: { type: 'string' },
        },
      },
      RevenueBreakdownRow: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          payment_method: { type: 'string' },
          transaction_count: { type: 'integer' },
          total_amount: { type: 'number' },
        },
      },
      RevenueReportData: {
        type: 'object',
        properties: {
          summary: { $ref: '#/components/schemas/RevenueReportSummary' },
          daily_breakdown: { type: 'array', items: { $ref: '#/components/schemas/RevenueBreakdownRow' } },
        },
      },
      RevenueReportResponse: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          data: { $ref: '#/components/schemas/RevenueReportData' },
        },
      },
    },
  },
};

const EXAMPLE_PAYMENT_INIT = {
  status: 'success',
  message: 'Payment initialized successfully',
  data: {
    authorization_url: 'https://checkout.paystack.com/example',
    access_code: 'ACCESS_CODE',
    reference: 'REF-123456',
    payment_id: 1,
  },
};

const EXAMPLE_PAGINATED_ORDERS = {
  status: 'success',
  data: {
    count: 1,
    page: 1,
    page_size: 20,
    total_pages: 1,
    results: [EXAMPLE_ORDER],
  },
};

const EXAMPLE_PAGINATED_USERS = {
  count: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  results: [{ id: 2, first_name: 'Admin', last_name: 'User', email: 'admin@example.com', status: 'active' }],
};

const EXAMPLE_PAGINATED_CLIENTS = {
  count: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  results: [{
    id: 1,
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'client1@example.com',
    status: 'active',
    username: 'client1',
    phone_number: '0200000001',
    total_orders: 3,
    total_spent: '150.00',
    customer: { id: 1 },
  }],
};

const EXAMPLE_REVENUE = {
  status: 'success',
  data: {
    summary: {
      unique_orders: 10,
      total_transactions: 12,
      grand_total: '1200.00',
      min_transaction: '25.00',
      max_transaction: '200.00',
      average_transaction: '100.00',
    },
    daily_breakdown: [
      { date: '2025-06-01', payment_method: 'card', transaction_count: 5, total_amount: 500 },
    ],
  },
};

/** Patch path operations and request bodies with examples aligned to controllers. */
function applyDocumentation(openApiSpec) {
  const { schemas } = openApiSpec.components;

  schemas.CustomerRegisterResponse.example = {
    message: 'Registration successful',
    user: EXAMPLE_USER,
    customer: { id: 1 },
  };
  schemas.CustomerStaffCreateResponse.example = {
    message: 'Customer created successfully with default password',
    user: EXAMPLE_USER,
    customer: { id: 1 },
    default_password: 'TempPass123!',
    note: 'Customer should change password on first login',
  };
  schemas.StaffCreateResponse.example = {
    message: 'Admin created successfully with default password',
    user: { ...EXAMPLE_USER, role: 'admin', is_staff: true },
    default_password: 'TempPass123!',
    note: 'User should change password on first login',
  };
  schemas.ServiceListResponse.example = { status: 'success', data: [EXAMPLE_SERVICE] };
  schemas.ServiceDetailResponse.example = { status: 'success', data: EXAMPLE_SERVICE };
  schemas.ServiceMutationResponse.example = {
    status: 'success',
    message: 'Service created successfully',
    data: EXAMPLE_SERVICE,
  };
  schemas.OrderMutationResponse.example = {
    status: 'success',
    message: 'Order created successfully',
    data: EXAMPLE_ORDER,
  };
  schemas.PaymentInitializeResponse.example = EXAMPLE_PAYMENT_INIT;
  schemas.MoolreUssdCallbackResponse.example = {
    message: 'Welcome to Bubblebytes\n1. My Orders\n2. Payment History\n0. Exit',
    reply: true,
  };
  schemas.PaginatedUserList.example = EXAMPLE_PAGINATED_USERS;
  schemas.PaginatedClientList.example = EXAMPLE_PAGINATED_CLIENTS;
  schemas.PasswordChangedResponse.example = {
    message: 'Password changed successfully',
    password_changed: true,
  };
  schemas.ProfileResponse.example = {
    message: 'User profile retrieved successfully',
    user: {
      username: 'client1',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'client1@example.com',
      status: 'active',
      phone_number: '0200000001',
      total_orders: 3,
      total_spent: '150.00',
    },
  };
  schemas.ProfileUpdateResponse.example = {
    message: 'Profile updated successfully',
    user: EXAMPLE_USER,
  };
  schemas.RefreshResponse.example = { access: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refreshed' };
  schemas.DashboardMetricsResponse.example = {
    status: 'success',
    data: { total_orders: 42, pending_orders: 5, revenue_today: '350.00' },
  };
  schemas.RevenueReportResponse.example = EXAMPLE_REVENUE;

  const opKey = (path, method) => `${method.toUpperCase()} ${path}`;

  const successExamples = {
    [opKey('/health', 'get')]: {
      200: {
        healthy: { value: { status: 'ok', database: 'ok' } },
        degraded: { value: { status: 'degraded', database: 'unavailable' } },
      },
    },
    [opKey('/api/accounts/token/refresh/', 'post')]: {
      200: { access: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refreshed' },
    },
    [opKey('/api/accounts/token/verify/', 'post')]: {
      200: {},
    },
    [opKey('/api/accounts/change-password/', 'post')]: {
      200: schemas.PasswordChangedResponse.example,
    },
    [opKey('/api/accounts/change-password/', 'put')]: {
      200: schemas.PasswordChangedResponse.example,
    },
    [opKey('/api/accounts/user/profile/', 'get')]: {
      200: schemas.ProfileResponse.example,
    },
    [opKey('/api/accounts/client/update/', 'patch')]: {
      200: schemas.ProfileUpdateResponse.example,
    },
    [opKey('/api/accounts/admin/create/', 'post')]: {
      201: {
        message: 'Admin created successfully with default password',
        user: { ...EXAMPLE_USER, role: 'admin', is_staff: true },
        default_password: 'TempPass123!',
        note: 'User should change password on first login',
      },
    },
    [opKey('/api/accounts/admin/update/', 'patch')]: {
      200: schemas.ProfileUpdateResponse.example,
    },
    [opKey('/api/accounts/admin/employee/{userId}/update/', 'patch')]: {
      200: { message: 'Employee updated successfully', user: { ...EXAMPLE_USER, role: 'employee' } },
    },
    [opKey('/api/accounts/employee/create/', 'post')]: {
      201: {
        message: 'Employee created successfully with default password',
        user: { ...EXAMPLE_USER, role: 'employee', is_staff: true },
        default_password: 'TempPass123!',
        note: 'User should change password on first login',
      },
    },
    [opKey('/api/accounts/employee/update/', 'patch')]: {
      200: schemas.ProfileUpdateResponse.example,
    },
    [opKey('/api/accounts/staff/client/{userId}/update/', 'patch')]: {
      200: { message: 'Client updated successfully', user: EXAMPLE_USER },
    },
    [opKey('/api/accounts/staff/user/{userId}/', 'get')]: {
      200: {
        message: 'User profile retrieved successfully',
        user: { ...EXAMPLE_USER, status: 'active', phone_number: '0200000001', customer: { id: 1 } },
      },
    },
    [opKey('/api/accounts/superadmin/create/', 'post')]: {
      201: {
        message: 'Superadmin created successfully with default password',
        user: { ...EXAMPLE_USER, role: 'superadmin', is_superuser: true, is_staff: true },
        default_password: 'TempPass123!',
        note: 'User should change password on first login',
      },
    },
    [opKey('/api/accounts/superadmin/admin/{userId}/update/', 'patch')]: {
      200: { message: 'Admin updated successfully', user: { ...EXAMPLE_USER, role: 'admin', is_staff: true } },
    },
    [opKey('/api/accounts/superadmin/employee/{userId}/update/', 'patch')]: {
      200: { message: 'Employee updated successfully', user: { ...EXAMPLE_USER, role: 'employee' } },
    },
    [opKey('/api/accounts/superadmin/client/{userId}/update/', 'patch')]: {
      200: { message: 'Client updated successfully', user: EXAMPLE_USER },
    },
    [opKey('/api/accounts/superadmin/user/{userId}/', 'get')]: {
      200: {
        message: 'User profile retrieved successfully',
        user: { ...EXAMPLE_USER, status: 'active', phone_number: '0200000001', customer: { id: 1 } },
      },
    },
    [opKey('/api/accounts/admins/', 'get')]: { 200: EXAMPLE_PAGINATED_USERS },
    [opKey('/api/accounts/employees/', 'get')]: { 200: EXAMPLE_PAGINATED_USERS },
    [opKey('/api/accounts/clients/', 'get')]: { 200: EXAMPLE_PAGINATED_CLIENTS },
    [opKey('/api/customers/register/', 'post')]: { 201: schemas.CustomerRegisterResponse.example },
    [opKey('/api/customers/create/', 'post')]: { 201: schemas.CustomerStaffCreateResponse.example },
    [opKey('/api/services/list/', 'get')]: { 200: schemas.ServiceListResponse.example },
    [opKey('/api/services/create/', 'post')]: { 201: schemas.ServiceMutationResponse.example },
    [opKey('/api/services/{id}/', 'get')]: { 200: schemas.ServiceDetailResponse.example },
    [opKey('/api/services/{id}/update/', 'patch')]: {
      200: { status: 'success', message: 'Service updated successfully', data: EXAMPLE_SERVICE },
    },
    [opKey('/api/orders/list/', 'get')]: { 200: EXAMPLE_PAGINATED_ORDERS },
    [opKey('/api/orders/create/', 'post')]: { 201: schemas.OrderMutationResponse.example },
    [opKey('/api/orders/{id}/', 'get')]: { 200: { status: 'success', data: EXAMPLE_ORDER } },
    [opKey('/api/orders/{id}/update/', 'put')]: {
      200: { status: 'success', message: 'Order updated successfully', data: EXAMPLE_ORDER },
    },
    [opKey('/api/payments/initialize/', 'post')]: { 200: EXAMPLE_PAYMENT_INIT },
    [opKey('/api/ussd/payments/initialize/', 'post')]: { 200: EXAMPLE_PAYMENT_INIT },
    [opKey('/api/ussd/callback/', 'post')]: {
      200: schemas.MoolreUssdCallbackResponse.example,
    },
    [opKey('/api/dashboard/metrics/', 'get')]: { 200: schemas.DashboardMetricsResponse.example },
    [opKey('/api/dashboard/revenue-report/', 'get')]: { 200: EXAMPLE_REVENUE },
  };

  const errorOverrides = {
    [opKey('/api/accounts/token/refresh/', 'post')]: {
      401: errorResponse(401, 'Missing or invalid refresh token', 'MISSING_TOKEN', 'INVALID_TOKEN'),
      403: errorResponse(403, 'CSRF validation failed', 'CSRF_VALIDATION_FAILED'),
    },
    [opKey('/api/accounts/superadmin/create/', 'post')]: {
      401: errorResponse(401, 'Unauthorized after bootstrap', 'NO_TOKEN', 'INVALID_TOKEN'),
      403: errorResponse(403, 'Requires superadmin after bootstrap', 'PERMISSION_DENIED'),
      409: errorResponse(409, 'Username or email conflict', 'USERNAME_EXISTS', 'EMAIL_EXISTS'),
    },
    [opKey('/api/customers/register/', 'post')]: {
      409: errorResponse(409, 'Duplicate registration', 'USERNAME_EXISTS', 'EMAIL_EXISTS', 'PHONE_EXISTS'),
      422: errorResponse(422, 'Validation failed', 'INVALID_PASSWORD', 'VALIDATION_ERROR'),
    },
    [opKey('/api/payments/initialize/', 'post')]: {
      400: errorResponse(400, 'Payment validation', 'ORDER_ALREADY_PAID', 'NO_AMOUNT_DUE', 'AMOUNT_EXCEEDS_BALANCE'),
      403: errorResponse(403, 'Client only', 'PERMISSION_DENIED'),
      404: errorResponse(404, 'Customer or order not found', 'CUSTOMER_NOT_FOUND', 'ORDER_NOT_FOUND'),
      500: errorResponse(500, 'Paystack error', 'PAYSTACK_ERROR'),
    },
    [opKey('/api/payments/callback/', 'get')]: {
      200: {
        description: 'Verification result (success or failure)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PaymentCallbackResponse' },
            examples: {
              success: {
                value: { success: true, message: 'Payment processed successfully', order_id: 1 },
              },
              failure: {
                value: { success: false, message: 'Failed to verify payment' },
              },
            },
          },
        },
      },
    },
    [opKey('/api/ussd/payments/initialize/', 'post')]: {
      404: errorResponse(404, 'Customer not found', 'CUSTOMER_NOT_FOUND'),
      500: errorResponse(500, 'Paystack error', 'PAYSTACK_ERROR'),
    },
    [opKey('/api/dashboard/revenue-report/', 'get')]: {
      400: errorResponse(400, 'Date validation', 'MISSING_DATES', 'INVALID_DATE_RANGE', 'DATE_RANGE_TOO_LARGE'),
      422: errorResponse(422, 'Invalid date format', 'INVALID_DATE_FORMAT'),
    },
    [opKey('/api/orders/create/', 'post')]: {
      403: errorResponse(403, 'Staff only', 'INSUFFICIENT_PERMISSIONS'),
    },
    [opKey('/api/orders/{id}/update/', 'put')]: {
      403: errorResponse(403, 'Staff only', 'INSUFFICIENT_PERMISSIONS'),
    },
  };

  const requestExamples = {
    [opKey('/api/accounts/login/', 'post')]: {
      username: 'client1',
      password: 'secretpassword',
    },
    [opKey('/api/customers/register/', 'post')]: {
      username: 'newclient',
      email: 'new@example.com',
      password: 'securepass1',
      first_name: 'New',
      last_name: 'Client',
      phone_number: '0200000099',
      whatsapp_number: '0200000099',
      address: '123 Main St',
      preferred_contact_method: 'phone',
    },
    [opKey('/api/ussd/callback/', 'post')]: {
      sessionId: 'sess-abc-123',
      new: true,
      msisdn: '233200000001',
      network: 3,
      message: '',
    },
    [opKey('/api/ussd/payments/initialize/', 'post')]: {
      phone_number: '0200000001',
      order_id: 1,
      amount: 50,
    },
    [opKey('/api/payments/initialize/', 'post')]: {
      order_id: 1,
      amount: 50,
    },
    [opKey('/api/orders/create/', 'post')]: {
      customer_id: 1,
      order_items_data: [{ service_id: 1, quantity: 2 }],
    },
  };

  for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;

      const key = opKey(path, method);

      const overrides = errorOverrides[key];
      if (overrides) {
        Object.assign(operation.responses, overrides);
      }

      const examples = successExamples[key];
      if (examples) {
        for (const [status, exampleOrMap] of Object.entries(examples)) {
          const response = operation.responses[status];
          if (!response?.content?.['application/json']) continue;
          const body = response.content['application/json'];
          if (exampleOrMap && typeof exampleOrMap === 'object' && !Array.isArray(exampleOrMap)) {
            const firstVal = Object.values(exampleOrMap)[0];
            if (firstVal && typeof firstVal === 'object' && 'value' in firstVal) {
              body.examples = exampleOrMap;
              delete body.example;
            } else if (!body.examples) {
              body.example = exampleOrMap;
            }
          }
        }
      }

      const reqExample = requestExamples[key];
      if (reqExample && operation.requestBody?.content?.['application/json']) {
        operation.requestBody.content['application/json'].example = reqExample;
      }
    }
  }
}

applyAuthDocumentation(spec);
applyDocumentation(spec);

const outPath = path.join(__dirname, '..', 'docs', 'openapi.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
