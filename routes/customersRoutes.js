const express = require('express');
const customersController = require('../controllers/customersController');
const { authenticate } = require('../middleware/auth');
const { isStaff } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.post('/register/', asyncHandler(customersController.register));
router.post('/create/', authenticate, isStaff, asyncHandler(customersController.createByStaff));

module.exports = router;
