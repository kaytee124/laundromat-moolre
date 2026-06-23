const customerService = require('../services/customerService');
const { formatUser } = require('../utils/serializers');
const { DEFAULT_CUSTOMER_PASSWORD } = require('../utils/constants');

async function register(req, res) {
  const { user, customer } = await customerService.registerCustomer(req.body);
  res.status(201).json({
    message: 'Registration successful',
    user: formatUser(user),
    customer: { id: customer.id },
  });
}

async function createByStaff(req, res) {
  const { user, customer } = await customerService.createCustomerByStaff(req.body, req.user);
  res.status(201).json({
    message: 'Customer created successfully with default password',
    user: formatUser(user),
    customer: { id: customer.id },
    default_password: DEFAULT_CUSTOMER_PASSWORD,
    note: 'Customer must change password on first login',
  });
}

module.exports = { register, createByStaff };
