const serviceCatalogService = require('../services/serviceCatalogService');

async function list(req, res) {
  const data = await serviceCatalogService.listServices(req.query);
  res.json({ status: 'success', data });
}

async function getById(req, res) {
  const data = await serviceCatalogService.getServiceById(req.params.id);
  res.json({ status: 'success', data });
}

async function create(req, res) {
  const data = await serviceCatalogService.createService(req.body, req.user);
  res.status(201).json({ status: 'success', message: 'Service created successfully', data });
}

async function update(req, res) {
  const data = await serviceCatalogService.updateService(req.params.id, req.body, req.user);
  res.json({ status: 'success', message: 'Service updated successfully', data });
}

module.exports = { list, getById, create, update };
