const express = require('express');
const apiController = require('../controllers/api.controller');
const taxController = require('../controllers/tax.controller');
const annualTaxController = require('../controllers/annualTax.controller');
const monthlyWhtController = require('../controllers/monthlyWht.controller');

const router = express.Router();
router.use('/tax-periods', taxController);
router.use('/annual-tax-returns', annualTaxController);
router.use('/taxes', monthlyWhtController);
router.use('/', apiController);

module.exports = router;
