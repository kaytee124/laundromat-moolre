'use strict';

const fs = require('fs');
const path = require('path');

const errorRef = (code) => ({
  description: code,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
});

const stdErrors = {
  400: errorRef('Bad request'),
  401: errorRef('Unauthorized'),
  403: errorRef('Forbidden'),
  404: errorRef('Not found'),
  409: errorRef('Conflict'),
  422: errorRef('Validation error'),
  500: errorRef('Server error'),
};

const bearer = [{ bearerAuth: [] }];
const csrfOnly = [{ csrfHeader: [] }];
const bearerCsrf = [{ bearerAuth: [] }, { csrfHeader: [] }];
const refreshCsrf = [{ refreshCookie: [] }, { csrfHeader: [] }];

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Bubblebytes Laundry Management API',
    version: '1.0.0',
    description: [
      'REST API for laundry order management, customers, payments, and dashboards.',
      '',
      '**Authentication**',
      '1. `GET /api/accounts/csrf/` — receive `csrf_token` (also set as cookie).',
      '2. For login/logout/refresh: send `X-CSRF-Token` header matching the cookie.',
      '3. Login returns `access` JWT; use `Authorization: Bearer <access>`.',
      '4. Refresh token is stored in HttpOnly cookie (`refresh_token` by default).',
      '',
      '**Roles**: `superadmin`, `admin`, `employee`, `client`.',
    ].join('\n'),
  },
  servers: [{ url: 'http://localhost:3000', description: 'Overwritten at runtime from BASE_URL' }],
  tags: [
    { name: 'Health' },
    { name: 'Accounts' },
    { name: 'Customers' },
    { name: 'Services' },
    { name: 'Orders' },
    { name: 'Payments' },
    { name: 'Dashboard' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Service is healthy',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
          },
        },
      },
    },
    '/api/accounts/csrf/': {
      get: {
        tags: ['Accounts'],
        summary: 'Issue CSRF token',
        description: 'Sets CSRF cookie and returns token for mutating auth requests.',
        responses: {
          200: {
            description: 'CSRF token issued',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CsrfResponse' } } },
          },
        },
      },
    },
    '/api/accounts/login/': {
      post: {
        tags: ['Accounts'],
        summary: 'Login',
        security: csrfOnly,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
          },
          400: stdErrors[400],
          401: stdErrors[401],
          403: stdErrors[403],
        },
      },
    },
    '/api/accounts/logout/': {
      post: {
        tags: ['Accounts'],
        summary: 'Logout',
        security: bearerCsrf,
        responses: {
          200: {
            description: 'Logged out',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } },
          },
          401: stdErrors[401],
          403: stdErrors[403],
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
        security: bearer,
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
        description: 'Must match CSRF cookie from GET /api/accounts/csrf/',
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
          error_code: { type: 'string' },
          message: { type: 'string' },
          status_code: { type: 'integer' },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: { status: { type: 'string', example: 'ok' } },
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

const outPath = path.join(__dirname, '..', 'docs', 'openapi.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
