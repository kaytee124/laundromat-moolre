const addonCatalogService = require('../services/addonCatalogService');

async function list(req, res) {
  const data = await addonCatalogService.listAddons(req.query);
  res.json({ status: 'success', data });
}

async function create(req, res) {
  const data = await addonCatalogService.createAddon(req.body, req.user);
  res.status(201).json({ status: 'success', message: 'Add-on created successfully', data });
}

async function update(req, res) {
  const data = await addonCatalogService.updateAddon(req.params.id, req.body, req.user);
  res.json({ status: 'success', message: 'Add-on updated successfully', data });
}

async function remove(req, res) {
  const data = await addonCatalogService.softDeleteAddon(req.params.id, req.user);
  res.json({ status: 'success', message: 'Add-on deactivated successfully', data });
}

module.exports = { list, create, update, remove };
