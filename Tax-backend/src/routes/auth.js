const express = require('express');
const authController = require('../controllers/auth.controller');
const registrationController = require('../controllers/registration.controller');
const { authRateLimiters } = require('../middleware/authRateLimit');

const router = express.Router();

router.use('/', registrationController);
router.post('/forgot-password', authRateLimiters.forgotPasswordIdentifier, authController.forgotPassword);
router.post('/verify-otp', authRateLimiters.verifyOtpIdentifier, authController.verifyOtp);
router.post('/reset-password', authRateLimiters.resetPasswordIdentifier, authController.resetPassword);

module.exports = router;