const assert = require('node:assert/strict');
const express = require('express');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const annualTaxRoutes = require('../src/controllers/annualTax.controller');
const { requireAdmin } = require('../src/middleware/auth');
const { authRateLimiters, createAuthRateLimiters } = require('../src/middleware/authRateLimit');
const { resolveJwtSecret } = require('../src/config/runtime');
const app = require('../src/app');
const apiRoutes = require('../src/routes/api');
const authRoutes = require('../src/routes/auth');
const registrationRoutes = require('../src/controllers/registration.controller');
const {
  RECOVERY_ACKNOWLEDGEMENT,
  forgotPassword,
  respondRecoveryAcknowledgement,
  resetPassword,
  verifyOtp,
} = require('../src/controllers/auth.controller');

function responseRecorder() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function startServer(app) {
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function postJson(baseUrl, path, body, ip) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('login limiter returns a safe 429 after the per-IP attempt limit', async (t) => {
  const limiters = createAuthRateLimiters({
    windowMs: 60_000,
    loginIpLimit: 1,
    identifierLimit: 5,
  });
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/login', limiters.loginIp, limiters.loginIdentifier, (_req, res) => res.json({ ok: true }));
  const { server, baseUrl } = await startServer(app);
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

  const first = await postJson(baseUrl, '/login', { username: 'one' }, '198.51.100.10');
  const limited = await postJson(baseUrl, '/login', { username: 'two' }, '198.51.100.10');
  assert.equal(first.status, 200);
  assert.equal(limited.status, 429);
  assert.match(limited.body.message, /too many login attempts/i);
});

test('OTP limiter applies an account limit across source IPs', async (t) => {
  const limiters = createAuthRateLimiters({
    windowMs: 60_000,
    identifierLimit: 1,
    otpIpLimit: 10,
  });
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/verify-otp', limiters.verifyOtpIp, limiters.verifyOtpIdentifier, (_req, res) => res.json({ ok: true }));
  const { server, baseUrl } = await startServer(app);
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

  const first = await postJson(baseUrl, '/verify-otp', { email: 'person@example.test' }, '198.51.100.11');
  const limited = await postJson(baseUrl, '/verify-otp', { email: 'person@example.test' }, '198.51.100.12');
  assert.equal(first.status, 200);
  assert.equal(limited.status, 429);
  assert.match(limited.body.message, /too many verification attempts/i);
});

test('all authentication and password-reset routes mount their IP and identifier limiters', () => {
  for (const limiter of [
    authRateLimiters.loginIp,
    authRateLimiters.forgotPasswordIp,
    authRateLimiters.verifyOtpIp,
    authRateLimiters.resetPasswordIp,
  ]) {
    assert.ok(app.router.stack.some((layer) => layer.handle === limiter));
  }
  assert.ok(apiRoutes.stack.some((layer) => layer.handle === authRateLimiters.loginIdentifier));

  const expectedRouteLimiters = [
    ['/register', authRateLimiters.registerIp],
    ['/verify-email', authRateLimiters.verifyEmailIp],
    ['/resend-verification', authRateLimiters.resendVerificationIp],
    ['/resend-verification', authRateLimiters.resendVerificationIdentifier],
    ['/forgot-password', authRateLimiters.forgotPasswordIdentifier],
    ['/verify-otp', authRateLimiters.verifyOtpIdentifier],
    ['/reset-password', authRateLimiters.resetPasswordIdentifier],
  ];
  for (const [path, limiter] of expectedRouteLimiters) {
    const routes = [...registrationRoutes.stack, ...authRoutes.stack]
      .filter((layer) => layer.route?.path === path);
    assert.ok(routes.length, `${path} is mounted`);
    assert.ok(routes.some((route) => route.route.stack.some((layer) => layer.handle === limiter)), `${path} has its rate limiter`);
  }
});

test('annual tax routes require authentication and admin authorization', () => {
  const routeStart = annualTaxRoutes.stack.findIndex((layer) => layer.route);
  const accessMiddleware = annualTaxRoutes.stack.slice(0, routeStart).map((layer) => layer.handle);
  assert.ok(accessMiddleware.length >= 2);
  assert.ok(accessMiddleware.includes(requireAdmin));

  const denied = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let continued = false;
  requireAdmin({ path: '/annual-tax-returns', user: { role: 'staff', permissions: { preset: 'cashier', grants: ['workspace.access'] } } }, denied, () => { continued = true; });
  assert.equal(denied.statusCode, 403);
  assert.equal(continued, false);

  requireAdmin({ path: '/annual-tax-returns', user: { role: 'staff', permissions: { preset: 'accountant', grants: ['tax.read', 'tax.write'] } } }, denied, () => { continued = true; });
  assert.equal(continued, true);
});

test('annual tax return status can only stay draft or transition from draft to filed', () => {
  assert.equal(annualTaxRoutes.canTransitionStatus('draft', 'draft'), true);
  assert.equal(annualTaxRoutes.canTransitionStatus('draft', 'filed'), true);
  assert.equal(annualTaxRoutes.canTransitionStatus('filed', 'draft'), false);
  assert.equal(annualTaxRoutes.canTransitionStatus('filed', 'filed'), false);
  assert.equal(annualTaxRoutes.canTransitionStatus('draft', 'approved'), false);
});

test('password recovery acknowledgement does not reveal account state', () => {
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  respondRecoveryAcknowledgement(response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { ok: true, message: RECOVERY_ACKNOWLEDGEMENT });
});

test('password recovery issues a code under an account lock and consumes all outstanding codes on reset', async () => {
  const statements = [];
  const recoveryHash = await bcrypt.hash('123456', 4);
  const reset = {
    id: 41,
    user_id: 23,
    company_id: 5,
    email: 'person@example.test',
    otp_hash: recoveryHash,
  };
  const connection = {
    async beginTransaction() { statements.push('BEGIN'); },
    async commit() { statements.push('COMMIT'); },
    async rollback() { statements.push('ROLLBACK'); },
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.includes('FROM users')) return [[{ id: 23, company_id: 5, email: 'person@example.test' }]];
      if (sql.includes('FROM password_resets')) return [[reset]];
      if (sql.includes('INSERT INTO password_resets')) {
        reset.otp_hash = params[3];
        return [{ insertId: reset.id }];
      }
      return [{ affectedRows: 1 }];
    },
    release() {},
  };
  const database = { async getConnection() { return connection; } };
  let sentMessage;
  const mailTransporter = {
    async sendMail(message) {
      sentMessage = message;
      return { accepted: ['person@example.test'] };
    },
  };
  const recoveryResponse = responseRecorder();
  await forgotPassword(
    { body: { emailOrUsername: 'person' } },
    recoveryResponse,
    (error) => assert.ifError(error),
    { database, transporter: mailTransporter, sender: 'noreply@example.test' }
  );
  assert.equal(recoveryResponse.statusCode, 200);
  assert.deepEqual(recoveryResponse.body, { ok: true, message: RECOVERY_ACKNOWLEDGEMENT });
  const accountLookup = statements.find((entry) => typeof entry === 'object' && entry.sql.includes('FROM users'));
  assert.match(accountLookup.sql, /FOR UPDATE/);
  assert.ok(statements.indexOf('BEGIN') < statements.indexOf(accountLookup));
  assert.equal(statements.at(-1), 'COMMIT');
  const otp = sentMessage.text.match(/reset code is (\d{6})/i)?.[1];
  assert.ok(otp);

  const verifiedResponse = responseRecorder();
  await verifyOtp(
    { body: { email: 'person', otp } },
    verifiedResponse,
    undefined,
    database
  );
  assert.equal(verifiedResponse.statusCode, 200);
  const token = verifiedResponse.body.resetToken;
  assert.ok(token);

  const resetResponse = responseRecorder();
  await resetPassword(
    {
      body: { email: 'person', otp, resetToken: token, newPassword: 'new-long-password' },
    },
    resetResponse,
    undefined,
    database,
    async () => ({ passwordMinLength: 8 })
  );
  assert.equal(resetResponse.statusCode, 200);
  assert.equal(resetResponse.body.message, 'Password reset successfully.');
  assert.ok(statements.some((entry) => (
    typeof entry === 'object'
    && entry.sql.includes('UPDATE password_resets SET is_used = 1 WHERE user_id = ?')
    && entry.params[0] === 23
  )));
  assert.ok(statements.some((entry) => (
    typeof entry === 'object' && entry.sql.includes('UPDATE users SET password_hash = ?')
  )));
});

test('production startup rejects an unset JWT secret', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => resolveJwtSecret(), /JWT_SECRET must be set in production/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
