const { Op } = require('sequelize');
const { User, Customer, sequelize } = require('../models');
const { hashPassword } = require('./authService');
const { DEFAULT_CUSTOMER_PASSWORD } = require('../utils/constants');
const { AppError } = require('../utils/errors');

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function validateRegistrationFields(data, requirePassword = true) {
  const required = [
    'username', 'email', 'first_name', 'last_name',
    'phone_number', 'whatsapp_number', 'address', 'preferred_contact_method',
  ];
  if (requirePassword) required.push('password');

  for (const field of required) {
    if (!data[field] || String(data[field]).trim() === '') {
      throw new AppError('MISSING_FIELDS', 'Required fields missing', 400);
    }
  }

  if (!EMAIL_REGEX.test(data.email)) {
    throw new AppError('INVALID_EMAIL', 'Invalid email format', 422);
  }

  if (requirePassword && data.password.length < 8) {
    throw new AppError('INVALID_PASSWORD', 'Password must be at least 8 characters', 422);
  }

  if (!['phone', 'whatsapp'].includes(data.preferred_contact_method)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid preferred contact method', 400);
  }
}

async function checkUniqueness(data, excludeUserId = null) {
  const userWhere = [];
  if (data.username) userWhere.push({ username: data.username });
  if (data.email) userWhere.push({ email: data.email });

  if (userWhere.length) {
    const userExists = await User.findOne({
      where: {
        [Op.or]: userWhere,
        ...(excludeUserId ? { id: { [Op.ne]: excludeUserId } } : {}),
      },
    });
    if (userExists) {
      if (userExists.username === data.username) {
        throw new AppError('USERNAME_EXISTS', 'Username already taken', 409);
      }
      throw new AppError('EMAIL_EXISTS', 'Email already registered', 409);
    }
  }

  if (data.phone_number) {
    const phoneExists = await Customer.findOne({ where: { phone_number: data.phone_number } });
    if (phoneExists) throw new AppError('PHONE_EXISTS', 'Phone number already registered', 409);
  }

  if (data.whatsapp_number) {
    const waExists = await Customer.findOne({ where: { whatsapp_number: data.whatsapp_number } });
    if (waExists) throw new AppError('WHATSAPP_EXISTS', 'WhatsApp number already registered', 409);
  }
}

async function registerCustomer(data) {
  validateRegistrationFields(data, true);
  await checkUniqueness(data);

  const password_hash = await hashPassword(data.password);
  const now = new Date();

  return sequelize.transaction(async (t) => {
    const user = await User.create(
      {
        username: data.username,
        email: data.email,
        password_hash,
        first_name: data.first_name,
        last_name: data.last_name,
        role: 'client',
        is_active: true,
        is_staff: false,
        is_superuser: false,
        date_joined: now,
        updated_at: now,
      },
      { transaction: t }
    );

    const customer = await Customer.create(
      {
        user_id: user.id,
        phone_number: data.phone_number,
        whatsapp_number: data.whatsapp_number,
        address: data.address,
        preferred_contact_method: data.preferred_contact_method,
        notes: '',
        created_at: now,
        updated_at: now,
      },
      { transaction: t }
    );

    return { user, customer };
  });
}

async function createCustomerByStaff(data, creator) {
  validateRegistrationFields(data, false);
  await checkUniqueness(data);

  const password_hash = await hashPassword(DEFAULT_CUSTOMER_PASSWORD);
  const now = new Date();

  return sequelize.transaction(async (t) => {
    const user = await User.create(
      {
        username: data.username,
        email: data.email,
        password_hash,
        first_name: data.first_name,
        last_name: data.last_name,
        role: 'client',
        is_active: true,
        is_staff: false,
        is_superuser: false,
        date_joined: now,
        updated_at: now,
        updated_by: creator.id,
      },
      { transaction: t }
    );

    const customer = await Customer.create(
      {
        user_id: user.id,
        phone_number: data.phone_number,
        whatsapp_number: data.whatsapp_number,
        address: data.address,
        preferred_contact_method: data.preferred_contact_method,
        notes: data.notes || '',
        created_by: creator.id,
        updated_by: creator.id,
        created_at: now,
        updated_at: now,
      },
      { transaction: t }
    );

    return { user, customer };
  });
}

module.exports = {
  registerCustomer,
  createCustomerByStaff,
};
