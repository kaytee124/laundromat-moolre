const express = require('express');
const servicesController = require('../controllers/servicesController');
const { authenticate } = require('../middleware/auth');
const { isAdminOrSuperadmin } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get('/list/', asyncHandler(servicesController.list));
router.post('/create/', authenticate, isAdminOrSuperadmin, asyncHandler(servicesController.create));
router.get('/:id/', authenticate, isAdminOrSuperadmin, asyncHandler(servicesController.getById));
router.patch('/:id/update/', authenticate, isAdminOrSuperadmin, asyncHandler(servicesController.update));

module.exports = router;
