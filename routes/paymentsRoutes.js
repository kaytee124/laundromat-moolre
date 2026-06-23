const express = require('express');
const paymentsController = require('../controllers/paymentsController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.post('/initialize/', authenticate, asyncHandler(paymentsController.initialize));
router.get('/callback/', asyncHandler(paymentsController.callback));

module.exports = router;
