const authService = require('../services/authService');
const userService = require('../services/userService');
const { DEFAULT_CUSTOMER_PASSWORD } = require('../utils/constants');
const { formatUser } = require('../utils/serializers');
const { verifyCsrf } = require('../middleware/csrf');
const { AppError } = require('../utils/errors');
const {
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshFromRequest,
} = require('../utils/cookieHelpers');

async function login(req, res) {
  verifyCsrf(req);
  const { username, password } = req.body;
  const { user, tokens, requiresPasswordChange } = await authService.login(username, password);

  setRefreshCookie(res, tokens.refresh);

  const response = {
    access: tokens.access,
    user: formatUser(user),
    requires_password_change: requiresPasswordChange,
  };

  if (requiresPasswordChange) {
    response.message = 'Please change your default password';
  }

  res.json(response);
}

async function logout(req, res) {
  verifyCsrf(req);
  const refreshToken = readRefreshFromRequest(req);
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  clearRefreshCookie(res);
  res.json({ message: 'Logged out successfully' });
}

async function refreshToken(req, res) {
  verifyCsrf(req);
  const refreshToken = readRefreshFromRequest(req);
  if (!refreshToken) {
    throw new AppError('MISSING_TOKEN', 'Refresh token is required', 401);
  }
  const tokens = await authService.refresh(refreshToken);
  setRefreshCookie(res, tokens.refresh);
  res.json({ access: tokens.access });
}

async function changePassword(req, res) {
  const { old_password, new_password, confirm_password } = req.body;
  await authService.changePassword(req.user.id, old_password, new_password, confirm_password);
  res.json({ message: 'Password changed successfully', password_changed: true });
}

async function getProfile(req, res) {
  const profile = await userService.getUserProfile(req.user.id);
  res.json({ message: 'User profile retrieved successfully', user: profile });
}

async function updateClientSelf(req, res) {
  const user = await userService.updateClientSelf(req.user, req.body);
  res.json({ message: 'Profile updated successfully', user });
}

async function createAdmin(req, res) {
  const user = await userService.createAdmin(req.body, req.user);
  res.status(201).json({
    message: 'Admin created successfully with default password',
    user: formatUser(user),
    default_password: DEFAULT_CUSTOMER_PASSWORD,
    note: 'Admin must change password on first login',
  });
}

async function updateAdminSelf(req, res) {
  const user = await userService.updateSelfProfile(
    req.user,
    req.body,
    ['username', 'email', 'first_name', 'last_name']
  );
  res.json({ message: 'Profile updated successfully', user });
}

async function updateEmployeeByAdmin(req, res) {
  const user = await userService.updateEmployeeByAdmin(
    req.params.userId,
    req.body,
    req.user
  );
  res.json({ message: 'Employee updated successfully', user });
}

async function createEmployee(req, res) {
  const user = await userService.createEmployee(req.body, req.user);
  res.status(201).json({
    message: 'Employee created successfully with default password',
    user: formatUser(user),
    default_password: DEFAULT_CUSTOMER_PASSWORD,
    note: 'Employee must change password on first login',
  });
}

async function updateEmployeeSelf(req, res) {
  const user = await userService.updateSelfProfile(
    req.user,
    req.body,
    ['username', 'email', 'first_name', 'last_name']
  );
  res.json({ message: 'Profile updated successfully', user });
}

async function updateClientByStaff(req, res) {
  const user = await userService.updateClientByStaff(req.params.userId, req.body, req.user);
  res.json({ message: 'Client updated successfully', user });
}

async function getStaffUserById(req, res) {
  const user = await userService.getUserByIdForStaff(req.params.userId);
  res.json({ message: 'User profile retrieved successfully', user });
}

async function createSuperadmin(req, res) {
  const user = await userService.createSuperadmin(req.body, req.user);
  res.status(201).json({
    message: 'Superadmin created successfully with default password',
    user: formatUser(user),
    default_password: DEFAULT_CUSTOMER_PASSWORD,
    note: 'Superadmin must change password on first login',
  });
}

async function superadminUpdateAdmin(req, res) {
  const user = await userService.superadminUpdateUser(req.params.userId, req.body, req.user, 'admin');
  res.json({ message: 'Admin updated successfully', user });
}

async function superadminUpdateEmployee(req, res) {
  const user = await userService.superadminUpdateUser(req.params.userId, req.body, req.user, 'employee');
  res.json({ message: 'Employee updated successfully', user });
}

async function superadminUpdateClient(req, res) {
  const user = await userService.superadminUpdateUser(req.params.userId, req.body, req.user, 'client');
  res.json({ message: 'Client updated successfully', user });
}

async function getSuperadminUserById(req, res) {
  const user = await userService.getUserByIdForSuperadmin(req.params.userId);
  res.json({ message: 'User profile retrieved successfully', user });
}

async function getAllAdmins(req, res) {
  const data = await userService.listUsers('admin', req.query, userService.formatUserListItem);
  res.json(data);
}

async function getAllEmployees(req, res) {
  const data = await userService.listUsers('employee', req.query, userService.formatUserListItem);
  res.json(data);
}

async function getAllClients(req, res) {
  const data = await userService.listUsers('client', req.query, userService.formatClientListItem);
  res.json(data);
}

async function updateSuperadminSelf(req, res) {
  const user = await userService.updateSelfProfile(
    req.user,
    req.body,
    ['username', 'email', 'first_name', 'last_name']
  );
  res.json({ message: 'Profile updated successfully', user });
}

async function getAllSuperadmins(req, res) {
  const data = await userService.listUsers('superadmin', req.query, userService.formatUserListItem);
  res.json(data);
}

module.exports = {
  login,
  logout,
  refreshToken,
  changePassword,
  getProfile,
  updateClientSelf,
  createAdmin,
  updateAdminSelf,
  updateEmployeeByAdmin,
  createEmployee,
  updateEmployeeSelf,
  updateClientByStaff,
  getStaffUserById,
  createSuperadmin,
  superadminUpdateAdmin,
  superadminUpdateEmployee,
  superadminUpdateClient,
  getSuperadminUserById,
  getAllAdmins,
  getAllEmployees,
  getAllClients,
  updateSuperadminSelf,
  getAllSuperadmins,
};
