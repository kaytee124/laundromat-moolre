const fs = require('fs');
const path = require('path');
const request = require('supertest');
const SwaggerParser = require('swagger-parser');
const app = require('../../app');
const { loadOpenApiSpec } = require('../../config/swagger');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function countOperations(spec) {
  return Object.values(spec.paths || {}).reduce((sum, pathItem) => {
    const ops = Object.keys(pathItem).filter((key) => HTTP_METHODS.includes(key));
    return sum + ops.length;
  }, 0);
}

function responseJsonContent(openApiSpec, path, method, status) {
  return openApiSpec.paths[path]?.[method]?.responses?.[status]?.content?.['application/json'];
}

function hasResponseExample(openApiSpec, path, method, status) {
  const content = responseJsonContent(openApiSpec, path, method, status);
  if (!content) return false;
  if (content.example !== undefined) return true;
  if (content.examples && Object.keys(content.examples).length > 0) return true;
  return false;
}

function hasErrorExamples(openApiSpec, path, method, status) {
  const content = responseJsonContent(openApiSpec, path, method, status);
  return Boolean(content?.examples && Object.keys(content.examples).length > 0);
}

describe('Swagger API documentation', () => {
  let spec;

  beforeAll(async () => {
    const specPath = path.join(__dirname, '../../docs/openapi.json');
    const raw = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    spec = await SwaggerParser.validate(raw);
  });

  describe('OpenAPI spec', () => {
    it('documents at least 41 operations', () => {
      expect(countOperations(spec)).toBeGreaterThanOrEqual(41);
    });

    it('includes critical API paths', () => {
      expect(spec.paths['/health']).toBeDefined();
      expect(spec.paths['/api/accounts/login/']).toBeDefined();
      expect(spec.paths['/api/orders/list/']).toBeDefined();
      expect(spec.paths['/api/dashboard/metrics/']).toBeDefined();
    });

    it('defines security schemes', () => {
      expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(spec.components.securitySchemes.csrfHeader).toBeDefined();
    });

    it('defines standard error schema', () => {
      expect(spec.components.schemas.ApiError).toBeDefined();
      expect(spec.components.schemas.ApiError.properties.error_code).toBeDefined();
      expect(spec.components.schemas.ApiError.example).toBeDefined();
    });

    it('includes response examples on key endpoints', () => {
      expect(hasResponseExample(spec, '/health', 'get', 200)).toBe(true);
      expect(hasResponseExample(spec, '/api/accounts/login/', 'post', 200)).toBe(true);
      expect(hasErrorExamples(spec, '/api/accounts/login/', 'post', 401)).toBe(true);
      expect(hasResponseExample(spec, '/api/payments/initialize/', 'post', 200)).toBe(true);
      expect(hasResponseExample(spec, '/api/payments/callback/', 'get', 200)).toBe(true);
      expect(hasResponseExample(spec, '/api/ussd/callback/', 'post', 200)).toBe(true);
    });

    it('documents payment callback order_id on success', () => {
      const props = spec.components.schemas.PaymentCallbackResponse.properties;
      expect(props.order_id).toBeDefined();
      const callback = responseJsonContent(spec, '/api/payments/callback/', 'get', 200);
      expect(callback.examples.success.value.order_id).toBeDefined();
    });

    it('documents health degraded state', () => {
      const health = responseJsonContent(spec, '/health', 'get', 200);
      expect(health.examples.degraded.value.status).toBe('degraded');
    });
  });

  describe('Swagger UI mount (test env)', () => {
    it('exposes /api/docs', async () => {
      const res = await request(app).get('/api/docs/');
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/swagger/i);
    });

    it('exposes /api/docs/openapi.json', async () => {
      const res = await request(app)
        .get('/api/docs/openapi.json')
        .set('Host', 'localhost:3000');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body.openapi).toBe('3.0.3');
      expect(res.body.paths['/health']).toBeDefined();
    });

    it('injects request host into served spec servers', async () => {
      const res = await request(app)
        .get('/api/docs/openapi.json')
        .set('Host', 'api.example.com');

      expect(res.body.servers[0].url).toBe('http://api.example.com');
    });

    it('ignores BASE_URL and uses request host for served spec servers', async () => {
      const previous = process.env.BASE_URL;
      process.env.BASE_URL = 'https://api.prod.example.com/';

      const res = await request(app)
        .get('/api/docs/openapi.json')
        .set('Host', 'api.example.com');

      process.env.BASE_URL = previous;

      expect(res.body.servers[0].url).toBe('http://api.example.com');
    });

    it('loadOpenApiSpec returns a server URL from request host', () => {
      const loaded = loadOpenApiSpec({
        protocol: 'https',
        get(name) {
          if (name === 'host') return 'docs.example.com';
          return undefined;
        },
      });
      expect(loaded.servers[0].url).toBe('https://docs.example.com');
    });
  });

  describe('when SWAGGER_ENABLED=false', () => {
    const previous = process.env.SWAGGER_ENABLED;

    afterAll(() => {
      if (previous === undefined) {
        delete process.env.SWAGGER_ENABLED;
      } else {
        process.env.SWAGGER_ENABLED = previous;
      }
      jest.resetModules();
    });

    it('does not expose /api/docs or openapi.json', async () => {
      jest.resetModules();
      process.env.SWAGGER_ENABLED = 'false';
      const disabledApp = require('../../app');

      const ui = await request(disabledApp).get('/api/docs/');
      const json = await request(disabledApp).get('/api/docs/openapi.json');

      expect(ui.status).toBe(404);
      expect(json.status).toBe(404);

      jest.resetModules();
      process.env.SWAGGER_ENABLED = previous ?? 'true';
    });
  });
});
