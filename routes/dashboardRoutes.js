const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const { isAdminOrSuperadmin } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get('/metrics/', authenticate, asyncHandler(dashboardController.metrics));
router.get('/revenue-report/', authenticate, isAdminOrSuperadmin, asyncHandler(dashboardController.revenueReport));

module.exports = router;
