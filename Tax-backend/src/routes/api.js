const express = require('express');
const apiController = require('../controllers/api.controller');
const taxController = require('../controllers/tax.controller');
const annualTaxController = require('../controllers/annualTax.controller');
const monthlyWhtController = require('../controllers/monthlyWht.controller');
const accountingController = require('../controllers/accounting.controller');
const fixedAssetsController = require('../controllers/fixedAssets.controller');
const companyController = require('../controllers/company.controller');
const { authRateLimiters } = require('../middleware/authRateLimit');

const router = express.Router();
router.use('/auth/login', authRateLimiters.loginIdentifier);
router.use('/tax-periods', taxController);
router.use('/annual-tax-returns', annualTaxController);
router.use('/taxes', monthlyWhtController);
router.use('/accounting', accountingController);
router.use('/fixed-assets', fixedAssetsController);
router.use('/company', companyController);
router.use('/', apiController);

module.exports = router;
