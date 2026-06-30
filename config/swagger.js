const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');

let baseSpec = null;

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
      swaggerOptions: {
        url: '/api/docs/openapi.json',
      },
    })
  );
}

module.exports = {
  isSwaggerEnabled,
  mountSwagger,
  loadOpenApiSpec,
  getOpenApiSpecForRequest,
  resolveBaseUrl,
};
