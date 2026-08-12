const { Op } = require('sequelize');
const {
  User,
  Customer,
} = require('../models');
const { hashPassword } = require('./authService');
const { buildDefaultPassword } = require('../utils/passwords');
const { AppError } = require('../utils/errors');
const { normalizeValidGhanaPhone } = require('../utils/phone');
const { notifyStaffCredentialsSms } = require('./staffNotificationService');
const { checkUniqueness } = require('./customerService');
const {
  formatUser,
  formatUserListItem,
  formatClientListItem,
  formatUserProfile,
  formatStaffUserDetail,
  formatSuperadminUserDetail,
} = require('../utils/serializers');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

async function createStaffUser({ username, first_name, last_name, phone_number, role, flags }, updatedBy) {
  if (!username) {
    throw new AppError('MISSING_FIELDS', 'Username is required', 400);
  }
  const phoneInput = typeof phone_number === 'string' ? phone_number.trim() : phone_number;
  if (!phoneInput) {
    throw new AppError('MISSING_FIELDS', 'phone_number is required', 400);
  }

  const existing = await User.findOne({ where: { username } });
  if (existing) {
    throw new AppError('USERNAME_EXISTS', 'Username already taken', 409);
  }

  const normalizedPhone = normalizeValidGhanaPhone(phoneInput, 'phone_number');
  const password_hash = await hashPassword(buildDefaultPassword(username));
  const user = await User.create({
    username,
    first_name: first_name || '',
    last_name: last_name || '',
    phone_number: normalizedPhone,
    password_hash,
    role,
    is_active: flags.is_active ?? true,
    is_staff: flags.is_staff ?? false,
    is_superuser: flags.is_superuser ?? false,
    updated_by: updatedBy?.id || null,
    date_joined: new Date(),
    updated_at: new Date(),
  });

  notifyStaffCredentialsSms({
    phoneNumber: normalizedPhone,
    username: user.username,
    role: user.role,
    userId: user.id,
  });

  return user;
}

async function createAdmin(data, updatedBy) {
  return createStaffUser(
    { ...data, role: 'admin', flags: { is_active: true, is_staff: true, is_superuser: false } },
    updatedBy
  );
}

async function createEmployee(data, updatedBy) {
  return createStaffUser(
    { ...data, role: 'employee', flags: { is_active: true, is_staff: true, is_superuser: false } },
    updatedBy
  );
}

async function createSuperadmin(data, updatedBy) {
  const superadminCount = await User.count({ where: { role: 'superadmin' } });
  if (superadminCount > 0 && !updatedBy) {
    throw new AppError(
      'PERMISSION_DENIED',
      'Superadmin creation requires an existing superadmin',
      403
    );
  }

  return createStaffUser(
    { ...data, role: 'superadmin', flags: { is_active: true, is_staff: true, is_superuser: true } },
    updatedBy
  );
}

async function getUserProfile(userId) {
  const user = await User.findByPk(userId, {
    include: [
      { model: User, as: 'updater', attributes: ['id', 'username', 'first_name', 'last_name'] },
      {
        model: Customer,
        as: 'customer_profile',
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'first_name', 'last_name'] },
          { model: User, as: 'customerUpdater', attributes: ['id', 'username', 'first_name', 'last_name'] },
        ],
      },
    ],
  });
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  return formatUserProfile(user);
}

async function getUserByIdForStaff(userId) {
  const user = await User.findByPk(userId, {
    include: [{ model: Customer, as: 'customer_profile' }],
  });
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  return formatStaffUserDetail(user);
}

async function getUserByIdForSuperadmin(userId) {
  const user = await User.findByPk(userId, {
    include: [{ model: Customer, as: 'customer_profile' }],
  });
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  return formatSuperadminUserDetail(user);
}

async function updateSelfProfile(user, data, allowedFields) {
  const dbUser = typeof user.save === 'function' ? user : await User.findByPk(user.id);
  if (!dbUser) throw new AppError('NOT_FOUND', 'User not found', 404);

  const updates = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (updates.username) {
    const exists = await User.findOne({
      where: { username: updates.username, id: { [Op.ne]: dbUser.id } },
    });
    if (exists) throw new AppError('VALIDATION_ERROR', 'Username already exists', 400);
  }

  Object.assign(dbUser, updates);
  dbUser.updated_at = new Date();
  dbUser.updated_by = dbUser.id;
  await dbUser.save();
  return formatUser(dbUser);
}

async function applyCustomerContactUpdates(customer, data, updaterId, { createIfMissing = false, createDefaults = {} } = {}) {
  const customerFields = ['phone_number', 'whatsapp_number', 'address', 'preferred_contact_method', 'notes'];
  const hasCustomerData = customerFields.some((f) => data[f] !== undefined);

  if (!customer && !hasCustomerData) {
    return null;
  }

  if (!customer && createIfMissing) {
    const phone_number = data.phone_number
      ? normalizeValidGhanaPhone(data.phone_number, 'phone_number')
      : createDefaults.phone_number || '';
    const whatsapp_number = data.whatsapp_number
      ? normalizeValidGhanaPhone(data.whatsapp_number, 'whatsapp_number')
      : createDefaults.whatsapp_number || '';
    if (data.phone_number || data.whatsapp_number) {
      await checkUniqueness({ phone_number, whatsapp_number });
    }
    return Customer.create({
      user_id: createDefaults.user_id,
      phone_number,
      whatsapp_number,
      phone_needs_correction: false,
      address: data.address || createDefaults.address || '',
      preferred_contact_method: data.preferred_contact_method || createDefaults.preferred_contact_method || 'phone',
      notes: data.notes || '',
      created_by: updaterId,
      updated_by: updaterId,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  if (!customer) return null;

  const next = { ...customer.get() };
  if (data.phone_number !== undefined) {
    next.phone_number = normalizeValidGhanaPhone(data.phone_number, 'phone_number');
  }
  if (data.whatsapp_number !== undefined) {
    next.whatsapp_number = normalizeValidGhanaPhone(data.whatsapp_number, 'whatsapp_number');
  }
  for (const field of ['address', 'preferred_contact_method', 'notes']) {
    if (data[field] !== undefined) next[field] = data[field];
  }

  if (data.phone_number !== undefined || data.whatsapp_number !== undefined) {
    await checkUniqueness(
      {
        phone_number: data.phone_number !== undefined ? next.phone_number : undefined,
        whatsapp_number: data.whatsapp_number !== undefined ? next.whatsapp_number : undefined,
      },
      customer.id
    );
  }

  if (data.phone_number !== undefined) {
    customer.phone_number = next.phone_number;
    customer.phone_needs_correction = false;
  }
  if (data.whatsapp_number !== undefined) {
    customer.whatsapp_number = next.whatsapp_number;
  }
  for (const field of ['address', 'preferred_contact_method', 'notes']) {
    if (data[field] !== undefined) customer[field] = data[field];
  }
  customer.updated_by = updaterId;
  customer.updated_at = new Date();
  await customer.save();
  return customer;
}

async function updateClientSelf(user, data) {
  const userFields = ['username', 'first_name', 'last_name'];
  await updateSelfProfile(user, data, userFields);

  const customerFields = ['phone_number', 'whatsapp_number', 'address', 'preferred_contact_method'];
  const hasCustomerData = customerFields.some((f) => data[f] !== undefined);

  if (hasCustomerData) {
    let customer = await Customer.findOne({ where: { user_id: user.id } });
    await applyCustomerContactUpdates(customer, data, user.id, {
      createIfMissing: true,
      createDefaults: { user_id: user.id },
    });
  }

  return formatUser(await User.findByPk(user.id));
}

async function updateEmployeeByAdmin(employeeId, data, admin) {
  const employee = await User.findOne({ where: { id: employeeId, role: 'employee' } });
  if (!employee) throw new AppError('NOT_FOUND', 'Employee not found', 404);

  const allowed = ['first_name', 'last_name', 'is_active', 'is_staff'];
  for (const field of allowed) {
    if (data[field] !== undefined) employee[field] = data[field];
  }
  employee.updated_at = new Date();
  employee.updated_by = admin.id;
  await employee.save();
  return formatUser(employee);
}

async function updateClientByStaff(clientId, data, staff) {
  const client = await User.findOne({ where: { id: clientId, role: 'client' } });
  if (!client) throw new AppError('NOT_FOUND', 'Client not found', 404);

  if (data.username !== undefined) {
    throw new AppError('VALIDATION_ERROR', 'Username cannot be changed by other users. Only the user themselves can change their username.', 400);
  }

  const userFields = ['first_name', 'last_name', 'is_active', 'is_staff'];
  for (const field of userFields) {
    if (data[field] !== undefined) client[field] = data[field];
  }

  await client.save();

  const customer = await Customer.findOne({ where: { user_id: client.id } });
  if (customer) {
    await applyCustomerContactUpdates(customer, data, staff.id);
  }

  const updated = await User.findByPk(client.id, {
    include: [{ model: Customer, as: 'customer_profile' }],
  });
  return formatStaffUserDetail(updated);
}

async function superadminUpdateUser(targetUser, data, superadmin, expectedRole) {
  const user = await User.findOne({
    where: { id: targetUser, role: expectedRole },
    include: [{ model: Customer, as: 'customer_profile' }],
  });
  if (!user) throw new AppError('NOT_FOUND', `${expectedRole.charAt(0).toUpperCase() + expectedRole.slice(1)} not found`, 404);

  if (data.username !== undefined) {
    throw new AppError('VALIDATION_ERROR', 'Username cannot be changed by other users. Only the user themselves can change their username.', 400);
  }

  if (data.role !== undefined && data.role !== user.role) {
    if (['client', 'admin'].includes(expectedRole)) {
      throw new AppError('ROLE_CHANGE_NOT_ALLOWED', 'User role cannot be changed after registration', 400);
    }
  }

  const originalRole = user.role;
  const isRoleLocked = ['client', 'admin'].includes(expectedRole);
  const userFields = isRoleLocked
    ? ['first_name', 'last_name', 'is_active']
    : ['first_name', 'last_name', 'role', 'is_active', 'is_staff', 'is_superuser'];

  for (const field of userFields) {
    if (data[field] !== undefined) user[field] = data[field];
  }

  if (user.role === 'superadmin' && originalRole === 'superadmin' && data.role && data.role !== 'superadmin') {
    throw new AppError('VALIDATION_ERROR', 'Cannot demote superadmin', 400);
  }

  if (expectedRole === 'employee' && data.role && data.role !== originalRole) {
    const wasStaff = ['superadmin', 'admin', 'employee'].includes(originalRole);
    if (data.role === 'client' && wasStaff) {
      const customer = await Customer.findOne({ where: { user_id: user.id } });
      if (!customer) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Cannot convert staff member to client. This user does not have customer details. Only users who were originally clients can be converted back to client role.',
          400
        );
      }
    }
    if (data.role === 'superadmin') {
      user.is_staff = true;
      user.is_superuser = true;
    } else if (data.role === 'admin' || data.role === 'employee') {
      user.is_staff = true;
      user.is_superuser = false;
    } else if (data.role === 'client') {
      user.is_staff = false;
      user.is_superuser = false;
    }
  }

  user.updated_by = superadmin.id;
  user.updated_at = new Date();
  await user.save();

  if (user.role === 'client') {
    let customer = await Customer.findOne({ where: { user_id: user.id } });
    const customerFields = ['phone_number', 'whatsapp_number', 'address', 'preferred_contact_method', 'notes'];
    const hasCustomerData = customerFields.some((f) => data[f] !== undefined);

    if (hasCustomerData) {
      await applyCustomerContactUpdates(customer, data, superadmin.id, {
        createIfMissing: true,
        createDefaults: { user_id: user.id },
      });
    }
  }

  const updated = await User.findByPk(user.id, {
    include: [{ model: Customer, as: 'customer_profile' }],
  });
  return formatSuperadminUserDetail(updated);
}

// List query filters: page, page_size, search (username/name), is_active
function buildUserListQuery(role, query) {
  const where = { role };
  if (query.is_active !== undefined) {
    const active = ['true', '1', 'yes'].includes(String(query.is_active).toLowerCase());
    where.is_active = active;
  }
  if (query.search) {
    where[Op.or] = [
      { username: { [Op.like]: `%${query.search}%` } },
      { first_name: { [Op.like]: `%${query.search}%` } },
      { last_name: { [Op.like]: `%${query.search}%` } },
    ];
  }
  return where;
}

async function listUsers(role, query, formatter) {
  const { page, pageSize, offset, limit } = parsePagination(query);
  const where = buildUserListQuery(role, query);

  const { count, rows } = await User.findAndCountAll({
    where,
    include: role === 'client' ? [{ model: Customer, as: 'customer_profile' }] : [],
    order: role === 'client'
      ? [['first_name', 'ASC'], ['last_name', 'ASC'], ['id', 'ASC']]
      : [['id', 'ASC']],
    offset,
    limit,
  });

  return paginatedResponse({
    count,
    page,
    pageSize,
    results: rows.map((u) => formatter(u, u.customer_profile)),
  });
}

module.exports = {
  createAdmin,
  createEmployee,
  createSuperadmin,
  getUserProfile,
  getUserByIdForStaff,
  getUserByIdForSuperadmin,
  updateSelfProfile,
  updateClientSelf,
  updateEmployeeByAdmin,
  updateClientByStaff,
  superadminUpdateUser,
  listUsers,
  formatUser,
  formatUserListItem,
  formatClientListItem,
};
