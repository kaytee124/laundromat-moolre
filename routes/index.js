const express = require('express');
const accountsRoutes = require('./accountsRoutes');
const customersRoutes = require('./customersRoutes');
const servicesRoutes = require('./servicesRoutes');
const ordersRoutes = require('./ordersRoutes');
const paymentsRoutes = require('./paymentsRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const ussdRoutes = require('./ussdRoutes');
const addonCatalogRoutes = require('./addonCatalogRoutes');
const reportsRoutes = require('./reportsRoutes');

const router = express.Router();

router.use('/accounts', accountsRoutes);
router.use('/customers', customersRoutes);
router.use('/services', servicesRoutes);
router.use('/orders', ordersRoutes);
router.use('/payments', paymentsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/ussd', ussdRoutes);
router.use('/addon-catalog', addonCatalogRoutes);
router.use('/reports', reportsRoutes);

module.exports = router;
