const { Op } = require('sequelize');
const { Service } = require('../models');
const { AppError } = require('../utils/errors');
const { formatService } = require('../utils/serializers');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

async function listServices(query = {}) {
  const { page, pageSize, offset, limit } = parsePagination(query);
  const where = {};
  if (query.is_active !== undefined) {
    where.is_active = ['true', '1', 'yes'].includes(String(query.is_active).toLowerCase());
  }
  if (query.category) where.category = query.category;
  if (query.search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${query.search}%` } },
      { description: { [Op.like]: `%${query.search}%` } },
      { category: { [Op.like]: `%${query.search}%` } },
    ];
  }

  const { count, rows } = await Service.findAndCountAll({
    where,
    order: [['name', 'ASC']],
    offset,
    limit,
  });

  return paginatedResponse({
    count,
    page,
    pageSize,
    results: rows.map(formatService),
  });
}

async function getServiceById(id) {
  const service = await Service.findByPk(id);
  if (!service) throw new AppError('NOT_FOUND', 'Service not found', 404);
  return formatService(service);
}

async function validateServiceData(data, isUpdate = false, instance = null) {
  if (!isUpdate) {
    if (!data.name || !data.name.trim()) {
      throw new AppError('MISSING_FIELDS', 'Name and price are required', 400);
    }
    if (data.price === undefined || data.price === null) {
      throw new AppError('MISSING_FIELDS', 'Name and price are required', 400);
    }
  }

  if (data.name !== undefined && (!data.name || !String(data.name).trim())) {
    throw new AppError('MISSING_FIELDS', 'Name and price are required', 400);
  }

  if (data.price !== undefined) {
    const price = parseFloat(data.price);
    if (isNaN(price) || price <= 0) {
      throw new AppError('INVALID_PRICE', 'Price must be greater than 0', 422);
    }
  }

  if (data.name) {
    const name = data.name.trim();
    const existing = await Service.findOne({
      where: {
        name: { [Op.like]: name },
        ...(instance ? { id: { [Op.ne]: instance.id } } : {}),
      },
    });
    if (existing && existing.name.toLowerCase() === name.toLowerCase()) {
      throw new AppError('SERVICE_EXISTS', 'Service with this name already exists', 409);
    }
  }
}

async function createService(data, user) {
  await validateServiceData(data, false);
  const now = new Date();

  const service = await Service.create({
    name: data.name.trim(),
    description: data.description || '',
    price: data.price,
    unit: data.unit || '',
    category: data.category || '',
    estimated_days: data.estimated_days ?? 1,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: user.id,
    created_at: now,
    updated_at: now,
  });

  return formatService(service);
}

async function updateService(id, data, user) {
  const service = await Service.findByPk(id);
  if (!service) throw new AppError('NOT_FOUND', 'Service not found', 404);

  await validateServiceData(data, true, service);

  const fields = ['name', 'description', 'price', 'unit', 'category', 'estimated_days', 'is_active'];
  for (const field of fields) {
    if (data[field] !== undefined) {
      service[field] = field === 'name' ? data[field].trim() : data[field];
    }
  }
  service.updated_by = user.id;
  service.updated_at = new Date();
  await service.save();

  return formatService(service);
}

module.exports = {
  listServices,
  getServiceById,
  createService,
  updateService,
};
