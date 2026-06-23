const express = require('express');
const accountsRoutes = require('./accountsRoutes');
const customersRoutes = require('./customersRoutes');
const servicesRoutes = require('./servicesRoutes');
const ordersRoutes = require('./ordersRoutes');
const paymentsRoutes = require('./paymentsRoutes');
const dashboardRoutes = require('./dashboardRoutes');

const router = express.Router();

router.use('/accounts', accountsRoutes);
router.use('/customers', customersRoutes);
router.use('/services', servicesRoutes);
router.use('/orders', ordersRoutes);
router.use('/payments', paymentsRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
