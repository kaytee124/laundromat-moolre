const express = require('express');
const accountsController = require('../controllers/accountsController');
const { authenticate, verifyTokenHandler } = require('../middleware/auth');
const { issueCsrfToken } = require('../middleware/csrf');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  isSuperadmin,
  isAdmin,
  isAdminOrSuperadmin,
  isEmployee,
  isClient,
  isStaff,
} = require('../middleware/permissions');

const router = express.Router();

router.get('/csrf/', asyncHandler(issueCsrfToken));
router.post('/login/', asyncHandler(accountsController.login));
router.post('/logout/', authenticate, asyncHandler(accountsController.logout));
router.post('/token/refresh/', asyncHandler(accountsController.refreshToken));
router.post('/token/verify/', asyncHandler(verifyTokenHandler));

router.post('/change-password/', authenticate, asyncHandler(accountsController.changePassword));
router.put('/change-password/', authenticate, asyncHandler(accountsController.changePassword));

router.get('/user/profile/', authenticate, asyncHandler(accountsController.getProfile));
router.patch('/client/update/', authenticate, isClient, asyncHandler(accountsController.updateClientSelf));

router.post('/admin/create/', authenticate, isSuperadmin, asyncHandler(accountsController.createAdmin));
router.patch('/admin/update/', authenticate, isAdminOrSuperadmin, asyncHandler(accountsController.updateAdminSelf));
router.patch('/admin/employee/:userId/update/', authenticate, isAdmin, asyncHandler(accountsController.updateEmployeeByAdmin));

router.post('/employee/create/', authenticate, isAdminOrSuperadmin, asyncHandler(accountsController.createEmployee));
router.patch('/employee/update/', authenticate, isEmployee, asyncHandler(accountsController.updateEmployeeSelf));

router.patch('/staff/client/:userId/update/', authenticate, isStaff, asyncHandler(accountsController.updateClientByStaff));
router.get('/staff/user/:userId/', authenticate, isStaff, asyncHandler(accountsController.getStaffUserById));

router.post('/superadmin/create/', authenticate, isSuperadmin, asyncHandler(accountsController.createSuperadmin));
router.patch('/superadmin/admin/:userId/update/', authenticate, isSuperadmin, asyncHandler(accountsController.superadminUpdateAdmin));
router.patch('/superadmin/employee/:userId/update/', authenticate, isSuperadmin, asyncHandler(accountsController.superadminUpdateEmployee));
router.patch('/superadmin/client/:userId/update/', authenticate, isSuperadmin, asyncHandler(accountsController.superadminUpdateClient));
router.get('/superadmin/user/:userId/', authenticate, isSuperadmin, asyncHandler(accountsController.getSuperadminUserById));

router.get('/admins/', authenticate, isSuperadmin, asyncHandler(accountsController.getAllAdmins));
router.get('/employees/', authenticate, isAdminOrSuperadmin, asyncHandler(accountsController.getAllEmployees));
router.get('/clients/', authenticate, isStaff, asyncHandler(accountsController.getAllClients));

module.exports = router;
