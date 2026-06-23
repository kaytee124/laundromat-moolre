const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');

function isSwaggerEnabled() {
  return process.env.SWAGGER_ENABLED !== 'false';
}

function loadOpenApiSpec() {
  const specPath = path.join(__dirname, '..', 'docs', 'openapi.json');
  const raw = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return {
    ...raw,
    servers: [{ url: baseUrl, description: 'Current environment' }],
  };
}

function mountSwagger(app) {
  const spec = loadOpenApiSpec();

  app.get('/api/docs/openapi.json', (req, res) => {
    res.json(spec);
  });

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
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
};
