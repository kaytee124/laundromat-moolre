const express = require('express');
const reportsController = require('../controllers/reportsController');
const { authenticate } = require('../middleware/auth');
const { isSuperadmin } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get(
  '/transactions/',
  authenticate,
  isSuperadmin,
  asyncHandler(reportsController.transactions)
);
router.get('/summary/', authenticate, isSuperadmin, asyncHandler(reportsController.summary));

module.exports = router;
