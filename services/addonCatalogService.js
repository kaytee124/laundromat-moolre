const { Op } = require('sequelize');
const { AddonCatalogItem } = require('../models');
const { AppError } = require('../utils/errors');

function formatAddon(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    is_active: item.is_active,
    sort_order: item.sort_order,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

async function listAddons(query = {}) {
  const includeInactive =
    query.include_inactive === '1' ||
    query.include_inactive === 'true' ||
    query.include_inactive === true;

  const where = includeInactive ? {} : { is_active: true };
  const rows = await AddonCatalogItem.findAll({
    where,
    order: [
      ['sort_order', 'ASC'],
      ['name', 'ASC'],
    ],
  });

  return {
    count: rows.length,
    results: rows.map(formatAddon),
  };
}

async function createAddon(data, user) {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) {
    throw new AppError('MISSING_FIELDS', 'name is required', 400);
  }

  const existing = await AddonCatalogItem.findOne({ where: { name } });
  if (existing) {
    throw new AppError('ADDON_EXISTS', 'Add-on name already exists', 409);
  }

  const now = new Date();
  const item = await AddonCatalogItem.create({
    name,
    category: data.category != null ? String(data.category).trim() || null : null,
    is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    sort_order: data.sort_order !== undefined ? Number(data.sort_order) || 0 : 0,
    created_by: user?.id || null,
    updated_by: user?.id || null,
    created_at: now,
    updated_at: now,
  });

  return formatAddon(item);
}

async function updateAddon(id, data, user) {
  const item = await AddonCatalogItem.findByPk(id);
  if (!item) {
    throw new AppError('NOT_FOUND', 'Add-on not found', 404);
  }

  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) {
      throw new AppError('VALIDATION_ERROR', 'name cannot be empty', 400);
    }
    const clash = await AddonCatalogItem.findOne({
      where: { name, id: { [Op.ne]: item.id } },
    });
    if (clash) {
      throw new AppError('ADDON_EXISTS', 'Add-on name already exists', 409);
    }
    item.name = name;
  }

  if (data.category !== undefined) {
    item.category = data.category == null ? null : String(data.category).trim() || null;
  }
  if (data.is_active !== undefined) {
    item.is_active = Boolean(data.is_active);
  }
  if (data.sort_order !== undefined) {
    item.sort_order = Number(data.sort_order) || 0;
  }

  item.updated_by = user?.id || null;
  item.updated_at = new Date();
  await item.save();
  return formatAddon(item);
}

async function softDeleteAddon(id, user) {
  const item = await AddonCatalogItem.findByPk(id);
  if (!item) {
    throw new AppError('NOT_FOUND', 'Add-on not found', 404);
  }
  item.is_active = false;
  item.updated_by = user?.id || null;
  item.updated_at = new Date();
  await item.save();
  return formatAddon(item);
}

module.exports = {
  listAddons,
  createAddon,
  updateAddon,
  softDeleteAddon,
  formatAddon,
};
