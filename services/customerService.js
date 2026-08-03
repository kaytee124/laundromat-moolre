const { Op } = require('sequelize');
const { User, Customer, sequelize } = require('../models');
const { hashPassword } = require('./authService');
const { buildDefaultPassword } = require('../utils/passwords');
const { AppError } = require('../utils/errors');
const { normalizeValidGhanaPhone } = require('../utils/phone');
const { notifyWelcomeSms } = require('./customerNotificationService');
const { createWelcomeLoginToken } = require('./welcomeLoginTokenService');

function validateRegistrationFields(data, requirePassword = true) {
  const required = [
    'username', 'first_name',
    'phone_number', 'whatsapp_number', 'address', 'preferred_contact_method',
  ];
  if (requirePassword) required.push('password');

  for (const field of required) {
    if (!data[field] || String(data[field]).trim() === '') {
      throw new AppError('MISSING_FIELDS', 'Required fields missing', 400);
    }
  }

  if (requirePassword && data.password.length < 8) {
    throw new AppError('INVALID_PASSWORD', 'Password must be at least 8 characters', 422);
  }

  if (!['phone', 'whatsapp'].includes(data.preferred_contact_method)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid preferred contact method', 400);
  }
}

async function checkUniqueness(data, excludeCustomerId = null) {
  if (data.username) {
    const userExists = await User.findOne({
      where: {
        username: data.username,
        ...(data.excludeUserId ? { id: { [Op.ne]: data.excludeUserId } } : {}),
      },
    });
    if (userExists) {
      throw new AppError('USERNAME_EXISTS', 'Username already taken', 409);
    }
  }

  if (data.phone_number) {
    const phoneExists = await Customer.findOne({
      where: {
        phone_number: data.phone_number,
        ...(excludeCustomerId ? { id: { [Op.ne]: excludeCustomerId } } : {}),
      },
    });
    if (phoneExists) throw new AppError('PHONE_EXISTS', 'Phone number already registered', 409);
  }

  if (data.whatsapp_number) {
    const waExists = await Customer.findOne({
      where: {
        whatsapp_number: data.whatsapp_number,
        ...(excludeCustomerId ? { id: { [Op.ne]: excludeCustomerId } } : {}),
      },
    });
    if (waExists) throw new AppError('WHATSAPP_EXISTS', 'WhatsApp number already registered', 409);
  }
}

async function registerCustomer(data) {
  validateRegistrationFields(data, true);
  const phone_number = normalizeValidGhanaPhone(data.phone_number, 'phone_number');
  const whatsapp_number = normalizeValidGhanaPhone(data.whatsapp_number, 'whatsapp_number');
  await checkUniqueness({ ...data, phone_number, whatsapp_number });

  const password_hash = await hashPassword(data.password);
  const now = new Date();

  return sequelize.transaction(async (t) => {
    const user = await User.create(
      {
        username: data.username,
        password_hash,
        first_name: data.first_name,
        last_name: data.last_name || '',
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
        phone_number,
        whatsapp_number,
        phone_needs_correction: false,
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
  const phone_number = normalizeValidGhanaPhone(data.phone_number, 'phone_number');
  const whatsapp_number = normalizeValidGhanaPhone(data.whatsapp_number, 'whatsapp_number');
  await checkUniqueness({ ...data, phone_number, whatsapp_number });

  const password_hash = await hashPassword(buildDefaultPassword(data.username));
  const now = new Date();

  const result = await sequelize.transaction(async (t) => {
    const user = await User.create(
      {
        username: data.username,
        password_hash,
        first_name: data.first_name,
        last_name: data.last_name || '',
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
        phone_number,
        whatsapp_number,
        phone_needs_correction: false,
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

  const welcomeToken = await createWelcomeLoginToken(result.user.id);

  notifyWelcomeSms({
    phoneNumber: result.customer.phone_number,
    username: result.user.username,
    welcomeToken,
    customerId: result.customer.id,
  });

  return result;
}

module.exports = {
  registerCustomer,
  createCustomerByStaff,
  checkUniqueness,
};
