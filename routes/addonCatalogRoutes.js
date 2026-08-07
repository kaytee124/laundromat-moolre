const express = require('express');
const addonCatalogController = require('../controllers/addonCatalogController');
const { authenticate } = require('../middleware/auth');
const { isStaff, isAdminOrSuperadmin } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get('/list/', authenticate, isStaff, asyncHandler(addonCatalogController.list));
router.post('/create/', authenticate, isAdminOrSuperadmin, asyncHandler(addonCatalogController.create));
router.patch('/:id/', authenticate, isAdminOrSuperadmin, asyncHandler(addonCatalogController.update));
router.delete('/:id/', authenticate, isAdminOrSuperadmin, asyncHandler(addonCatalogController.remove));

module.exports = router;
