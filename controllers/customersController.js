const customerService = require('../services/customerService');
const { formatUser } = require('../utils/serializers');

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
    message: 'Customer created successfully. Login credentials were sent by SMS.',
    user: formatUser(user),
    customer: { id: customer.id },
    note: 'Customer must change password on first login. Default password is not returned in this response.',
  });
}

module.exports = { register, createByStaff };
