const express = require('express');
const ordersController = require('../controllers/ordersController');
const { authenticate } = require('../middleware/auth');
const { isStaff } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get('/list/', authenticate, asyncHandler(ordersController.list));
router.post('/create/', authenticate, asyncHandler(ordersController.create));
router.get('/:id/', authenticate, asyncHandler(ordersController.getById));
router.put('/:id/update/', authenticate, asyncHandler(ordersController.update));
router.post('/:id/complete/', authenticate, isStaff, asyncHandler(ordersController.complete));

module.exports = router;
