const express = require('express');
const apiController = require('../controllers/api.controller');

const router = express.Router();
router.use('/', apiController);

module.exports = router;
