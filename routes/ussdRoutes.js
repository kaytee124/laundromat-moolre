const express = require('express');
const ussdController = require('../controllers/ussd');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.post('/payments/initialize/', asyncHandler(ussdController.initializePayment));
router.post('/callback/', asyncHandler(ussdController.handleCallback));

module.exports = router;
