const { User, Customer } = require('../../models');
const { hashPassword } = require('../../services/authService');

const STAFF_PASSWORD = 'ChangeMe123!';
const CLIENT_PASSWORD = 'ClientPass123!';

async function createUser({ username, email, role, password, flags = {} }) {
  const password_hash = await hashPassword(password);
  const isStaff = ['superadmin', 'admin', 'employee'].includes(role);
  const user = await User.create({
    username,
    email,
    password_hash,
    first_name: username,
    last_name: 'Test',
    role,
    is_active: flags.is_active !== undefined ? flags.is_active : true,
    is_staff: flags.is_staff !== undefined ? flags.is_staff : isStaff,
    is_superuser: flags.is_superuser !== undefined ? flags.is_superuser : role === 'superadmin',
    date_joined: new Date(),
    updated_at: new Date(),
  });
  return user;
}

async function seedBaseline() {
  const superadmin = await createUser({
    username: 'superadmin1',
    email: 'superadmin1@test.com',
    role: 'superadmin',
    password: STAFF_PASSWORD,
  });

  const admin = await createUser({
    username: 'admin1',
    email: 'admin1@test.com',
    role: 'admin',
    password: STAFF_PASSWORD,
  });

  const employee = await createUser({
    username: 'employee1',
    email: 'employee1@test.com',
    role: 'employee',
    password: STAFF_PASSWORD,
  });

  const clientUser = await createUser({
    username: 'client1',
    email: 'client1@test.com',
    role: 'client',
    password: CLIENT_PASSWORD,
    flags: { is_staff: false, is_superuser: false },
  });

  const client2User = await createUser({
    username: 'client2',
    email: 'client2@test.com',
    role: 'client',
    password: CLIENT_PASSWORD,
    flags: { is_staff: false, is_superuser: false },
  });

  const customer = await Customer.create({
    user_id: clientUser.id,
    phone_number: '0200000001',
    whatsapp_number: '0200000002',
    address: '123 Test St',
    preferred_contact_method: 'phone',
    notes: '',
    created_at: new Date(),
    updated_at: new Date(),
  });

  const customer2 = await Customer.create({
    user_id: client2User.id,
    phone_number: '0200000003',
    whatsapp_number: '0200000004',
    address: '456 Other St',
    preferred_contact_method: 'whatsapp',
    notes: '',
    created_at: new Date(),
    updated_at: new Date(),
  });

  return {
    passwords: { staff: STAFF_PASSWORD, client: CLIENT_PASSWORD },
    superadmin,
    admin,
    employee,
    client: clientUser,
    client2: client2User,
    customer,
    customer2,
  };
}

module.exports = { seedBaseline, STAFF_PASSWORD, CLIENT_PASSWORD };
