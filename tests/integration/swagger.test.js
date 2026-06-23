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

describe('Swagger API documentation', () => {
  let spec;

  beforeAll(async () => {
    const specPath = path.join(__dirname, '../../docs/openapi.json');
    const raw = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    spec = await SwaggerParser.validate(raw);
  });

  describe('OpenAPI spec', () => {
    it('documents at least 39 operations', () => {
      expect(countOperations(spec)).toBeGreaterThanOrEqual(39);
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
    });
  });

  describe('Swagger UI mount (test env)', () => {
    it('exposes /api/docs', async () => {
      const res = await request(app).get('/api/docs/');
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/swagger/i);
    });

    it('exposes /api/docs/openapi.json', async () => {
      const res = await request(app).get('/api/docs/openapi.json');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body.openapi).toBe('3.0.3');
      expect(res.body.paths['/health']).toBeDefined();
    });

    it('injects BASE_URL into served spec servers', () => {
      const loaded = loadOpenApiSpec();
      expect(loaded.servers[0].url).toBeTruthy();
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
