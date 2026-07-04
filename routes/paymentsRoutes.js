const express = require('express');
const paymentsController = require('../controllers/paymentsController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { moolreWebhookRateLimit } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/initialize/', authenticate, asyncHandler(paymentsController.initialize));
router.post('/moolre/webhook/', moolreWebhookRateLimit, asyncHandler(paymentsController.moolreWebhook));
router.get('/:externalref/', asyncHandler(paymentsController.getStatus));

module.exports = router;
