const { Op } = require('sequelize');
const {
  User,
  Customer,
} = require('../models');
const { hashPassword } = require('./authService');
const { DEFAULT_CUSTOMER_PASSWORD } = require('../utils/constants');
const { AppError } = require('../utils/errors');
const {
  formatUser,
  formatUserListItem,
  formatClientListItem,
  formatUserProfile,
  formatStaffUserDetail,
  formatSuperadminUserDetail,
} = require('../utils/serializers');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

async function createStaffUser({ email, username, first_name, last_name, role, flags }, updatedBy) {
  const existing = await User.findOne({
    where: { [Op.or]: [{ email }, { username }] },
  });
  if (existing) {
    if (existing.email === email) {
      throw new AppError('EMAIL_EXISTS', 'Email already registered', 409);
    }
    throw new AppError('USERNAME_EXISTS', 'Username already taken', 409);
  }

  const password_hash = await hashPassword(DEFAULT_CUSTOMER_PASSWORD);
  const user = await User.create({
    email,
    username,
    first_name: first_name || '',
    last_name: last_name || '',
    password_hash,
    role,
    is_active: flags.is_active ?? true,
    is_staff: flags.is_staff ?? false,
    is_superuser: flags.is_superuser ?? false,
    updated_by: updatedBy?.id || null,
    date_joined: new Date(),
    updated_at: new Date(),
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

  if (updates.email) {
    const exists = await User.findOne({
      where: { email: updates.email, id: { [Op.ne]: dbUser.id } },
    });
    if (exists) throw new AppError('VALIDATION_ERROR', 'Email already exists', 400);
  }

  Object.assign(dbUser, updates);
  dbUser.updated_at = new Date();
  dbUser.updated_by = dbUser.id;
  await dbUser.save();
  return formatUser(dbUser);
}

async function updateClientSelf(user, data) {
  const userFields = ['username', 'email', 'first_name', 'last_name'];
  await updateSelfProfile(user, data, userFields);

  const customerFields = ['phone_number', 'whatsapp_number', 'address', 'preferred_contact_method'];
  const customerData = {};
  for (const field of customerFields) {
    if (data[field] !== undefined) customerData[field] = data[field];
  }

  if (Object.keys(customerData).length > 0) {
    let customer = await Customer.findOne({ where: { user_id: user.id } });
    if (!customer) {
      customer = await Customer.create({
        user_id: user.id,
        phone_number: customerData.phone_number || '',
        whatsapp_number: customerData.whatsapp_number || '',
        address: customerData.address || '',
        preferred_contact_method: customerData.preferred_contact_method || 'phone',
        notes: '',
        updated_by: user.id,
      });
    } else {
      Object.assign(customer, customerData);
      customer.updated_by = user.id;
      customer.updated_at = new Date();
      await customer.save();
    }
  }

  return formatUser(await User.findByPk(user.id));
}

async function updateEmployeeByAdmin(employeeId, data, admin) {
  const employee = await User.findOne({ where: { id: employeeId, role: 'employee' } });
  if (!employee) throw new AppError('NOT_FOUND', 'Employee not found', 404);

  const allowed = ['email', 'first_name', 'last_name', 'is_active', 'is_staff'];
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

  const userFields = ['email', 'first_name', 'last_name', 'is_active', 'is_staff'];
  for (const field of userFields) {
    if (data[field] !== undefined) client[field] = data[field];
  }

  if (data.email) {
    const exists = await User.findOne({
      where: { email: data.email, id: { [Op.ne]: client.id } },
    });
    if (exists) throw new AppError('VALIDATION_ERROR', 'Email already exists', 400);
  }

  await client.save();

  const customer = await Customer.findOne({ where: { user_id: client.id } });
  if (customer) {
    const customerFields = ['phone_number', 'whatsapp_number', 'address', 'preferred_contact_method', 'notes'];
    for (const field of customerFields) {
      if (data[field] !== undefined) customer[field] = data[field];
    }
    customer.updated_by = staff.id;
    customer.updated_at = new Date();
    await customer.save();
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
    ? ['email', 'first_name', 'last_name', 'is_active']
    : ['email', 'first_name', 'last_name', 'role', 'is_active', 'is_staff', 'is_superuser'];

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

    if (!customer && hasCustomerData) {
      customer = await Customer.create({
        user_id: user.id,
        phone_number: data.phone_number || '',
        whatsapp_number: data.whatsapp_number || '',
        address: data.address || '',
        preferred_contact_method: data.preferred_contact_method || 'phone',
        notes: data.notes || '',
        created_by: superadmin.id,
        updated_by: superadmin.id,
      });
    } else if (customer) {
      for (const field of customerFields) {
        if (data[field] !== undefined) customer[field] = data[field];
      }
      customer.updated_by = superadmin.id;
      customer.updated_at = new Date();
      await customer.save();
    }
  }

  const updated = await User.findByPk(user.id, {
    include: [{ model: Customer, as: 'customer_profile' }],
  });
  return formatSuperadminUserDetail(updated);
}

// List query filters: page, page_size, search (username/email/name), is_active
function buildUserListQuery(role, query) {
  const where = { role };
  if (query.is_active !== undefined) {
    const active = ['true', '1', 'yes'].includes(String(query.is_active).toLowerCase());
    where.is_active = active;
  }
  if (query.search) {
    where[Op.or] = [
      { username: { [Op.like]: `%${query.search}%` } },
      { email: { [Op.like]: `%${query.search}%` } },
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
    order: [['id', 'ASC']],
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
