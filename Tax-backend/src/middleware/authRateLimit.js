const crypto = require('crypto');
const { ipKeyGenerator, rateLimit } = require('express-rate-limit');

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function identifierKey(field) {
  return (req) => {
    const body = req.body || {};
    const rawIdentifier = typeof field === 'function' ? field(body) : body[field];
    const identifier = String(rawIdentifier || '').trim().toLowerCase().slice(0, 254);
    if (!identifier) return `ip:${ipKeyGenerator(req.ip)}`;
    const digest = crypto.createHash('sha256').update(identifier).digest('hex');
    return `account:${digest}`;
  };
}

function createLimiter({ windowMs, limit, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler(_req, res) {
      res.status(429).json({ message });
    },
  });
}

function createAuthRateLimiters({
  windowMs = FIFTEEN_MINUTES,
  loginIpLimit = 10,
  identifierLimit = 5,
  recoveryIpLimit = 10,
  otpIpLimit = 10,
  resetIpLimit = 10,
  registrationIpLimit = 5,
  verifyEmailIpLimit = 10,
  resendVerificationIpLimit = 5,
} = {}) {
  return {
    registerIp: createLimiter({
      windowMs,
      limit: registrationIpLimit,
      message: 'Too many registration attempts. Try again later.',
    }),
    verifyEmailIp: createLimiter({
      windowMs,
      limit: verifyEmailIpLimit,
      message: 'Too many email verification attempts. Try again later.',
    }),
    resendVerificationIp: createLimiter({
      windowMs,
      limit: resendVerificationIpLimit,
      message: 'Too many verification email requests. Try again later.',
    }),
    resendVerificationIdentifier: createLimiter({
      windowMs,
      limit: identifierLimit,
      message: 'Too many verification email requests for this address. Try again later.',
      keyGenerator: identifierKey('email'),
    }),
    loginIp: createLimiter({
      windowMs,
      limit: loginIpLimit,
      message: 'Too many login attempts. Try again later.',
    }),
    loginIdentifier: createLimiter({
      windowMs,
      limit: identifierLimit,
      message: 'Too many login attempts for this account. Try again later.',
      keyGenerator: identifierKey('username'),
    }),
    forgotPasswordIp: createLimiter({
      windowMs,
      limit: recoveryIpLimit,
      message: 'Too many password recovery requests. Try again later.',
    }),
    forgotPasswordIdentifier: createLimiter({
      windowMs,
      limit: identifierLimit,
      message: 'Too many password recovery requests for this account. Try again later.',
      keyGenerator: identifierKey((body) => body.emailOrUsername || body.email),
    }),
    verifyOtpIp: createLimiter({
      windowMs,
      limit: otpIpLimit,
      message: 'Too many verification attempts. Try again later.',
    }),
    verifyOtpIdentifier: createLimiter({
      windowMs,
      limit: identifierLimit,
      message: 'Too many verification attempts for this account. Try again later.',
      keyGenerator: identifierKey('email'),
    }),
    resetPasswordIp: createLimiter({
      windowMs,
      limit: resetIpLimit,
      message: 'Too many password reset attempts. Try again later.',
    }),
    resetPasswordIdentifier: createLimiter({
      windowMs,
      limit: identifierLimit,
      message: 'Too many password reset attempts for this account. Try again later.',
      keyGenerator: identifierKey('email'),
    }),
  };
}

const authRateLimiters = createAuthRateLimiters();

module.exports = { authRateLimiters, createAuthRateLimiters };
