const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { pool } = require('../db');
const {
  transporter,
  mailFrom,
  emailVerificationEmail,
} = require('../config/mailer');
const { loadAccessPolicy, registrationAccessState } = require('../services/accessPolicy');
const { prepareRegistration } = require('../services/annexProfiles');
const { requestError } = require('../services/accountingLedger');
const { authRateLimiters } = require('../middleware/authRateLimit');
const { provisionCompany } = require('../services/companyProvisioning');

function wasRecipientAccepted(message, email) {
  return (message.accepted || []).some((recipient) => {
    const address = typeof recipient === 'string' ? recipient : recipient.address;
    return String(address || '').toLowerCase() === email.toLowerCase();
  });
}

function verificationPageUrl() {
  const configuredOrigin = String(process.env.FRONTEND_URL || process.env.CORS_ORIGIN || '').split(',')[0].trim();
  const origin = configuredOrigin || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  if (!origin) throw new Error('FRONTEND_URL must be configured to send email verification links in production.');
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error('FRONTEND_URL must be a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('FRONTEND_URL must use HTTP or HTTPS.');
  const basePath = parsed.pathname.replace(/\/+$/, '');
  return new URL(`${basePath}/verify-email`, parsed.origin).toString();
}

async function sendVerificationEmail(emailTransporter, senderAddress, email, firstName, verificationLink, subject) {
  const message = await emailTransporter.sendMail({
    from: { name: 'Tax System', address: senderAddress },
    to: email,
    subject,
    text: `Hello ${firstName}, verify your Tax System email address using this link: ${verificationLink}\n\nThis link expires in 24 hours.`,
    html: emailVerificationEmail(verificationLink, firstName),
  });
  if (!wasRecipientAccepted(message, email)) {
    throw new Error('SMTP server did not accept the registration email recipient.');
  }
}

function createRegistrationRouter({
  database = pool,
  emailTransporter = transporter,
  senderAddress = mailFrom,
  accessPolicyLoader = loadAccessPolicy,
  companyProvisioner = provisionCompany,
  passwordHasher = (password) => bcrypt.hash(password, 12),
  limiters = authRateLimiters,
} = {}) {
  const router = express.Router();

  router.post('/register', limiters.registerIp, async (req, res, next) => {
    let connection;
    let transactionStarted = false;
    try {
      const input = prepareRegistration(req.body || {});
      const policy = await accessPolicyLoader(database);
      if (input.password.length < Math.max(8, policy.passwordMinLength)) {
        throw requestError(400, `Password must be at least ${Math.max(8, policy.passwordMinLength)} characters.`);
      }
      const accessState = registrationAccessState(policy);

      connection = await database.getConnection();
      const [existing] = await connection.query(
        'SELECT username, email FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1',
        [input.email, input.username]
      );
      if (existing.length) {
        if (existing.some((account) => String(account.email || '').toLowerCase() === input.email)) {
          throw requestError(409, 'Email address is already registered.');
        }
        throw requestError(409, 'Username is already in use.');
      }

      await connection.beginTransaction();
      transactionStarted = true;
      const [companyResult] = await connection.query(
        `INSERT INTO companies (enterprise_name, office_phone, official_email)
         VALUES (?, ?, ?)`,
        [input.enterpriseName, input.officePhone, input.email]
      );
      const companyId = Number(companyResult.insertId);
      await connection.query('SET @tax_company_id = ?', [companyId]);

      const [userResult] = await connection.query(
        `INSERT INTO users
          (name, first_name, last_name, position, official_address, website, enterprise_name,
           office_phone, username, email, password_hash, role, company_id, is_owner,
           is_verified, status, active, approval_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'owner', ?, 1, 1, 'ACTIVE', ?, ?)` ,
        [
          input.name,
          input.firstName,
          input.lastName,
          input.position,
          input.officialAddress,
          input.website,
          input.enterpriseName,
          input.officePhone,
          input.username,
          input.email,
          await passwordHasher(input.password),
          companyId,
          accessState.active,
          accessState.approvalStatus,
        ]
      );
      await connection.query(
        'UPDATE companies SET owner_user_id = ? WHERE id = ?',
        [userResult.insertId, companyId]
      );
      await companyProvisioner(connection, companyId, userResult.insertId, input.enterpriseName);
      await connection.commit();
      transactionStarted = false;
      connection.release();
      connection = null;

      res.status(201).json({
        message: accessState.active
          ? 'Registration successful. You can now sign in.'
          : 'Registration successful. Your account is waiting for administrator approval.',
        email: input.email,
        status: 'ACTIVE',
        approvalStatus: accessState.approvalStatus,
      });
    } catch (error) {
      if (connection && transactionStarted) await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') {
        error.status = 409;
        error.message = 'Username or email address is already in use.';
      }
      next(error);
    } finally {
      connection?.release();
    }
  });

  router.get('/verify-email', limiters.verifyEmailIp, async (req, res, next) => {
    let connection;
    let transactionStarted = false;
    try {
      const token = String(req.query.token || '');
      if (!/^[a-f0-9]{64}$/i.test(token)) throw requestError(400, 'Verification token is invalid.');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      connection = await database.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;
      const [users] = await connection.query(
        `SELECT id, token_expires_at, token_expires_at <= NOW() AS token_expired FROM users
         WHERE verification_token = ? FOR UPDATE`,
        [tokenHash]
      );
      if (!users.length) throw requestError(400, 'Verification token is invalid or has already been used.');
      if (!users[0].token_expires_at || Number(users[0].token_expired)) {
        await connection.query(
          'UPDATE users SET verification_token = NULL, token_expires_at = NULL WHERE id = ?',
          [users[0].id]
        );
        await connection.commit();
        transactionStarted = false;
        throw requestError(410, 'Verification link has expired. Please register again or contact support.');
      }
      await connection.query(
        `UPDATE users SET is_verified = 1, status = 'ACTIVE',
           active = CASE WHEN approval_status = 'approved' THEN 1 ELSE 0 END,
           verification_token = NULL, token_expires_at = NULL
         WHERE id = ?`,
        [users[0].id]
      );
      await connection.commit();
      transactionStarted = false;
      res.json({ message: 'Email verified. You can now sign in.', status: 'ACTIVE' });
    } catch (error) {
      if (connection && transactionStarted) await connection.rollback();
      next(error);
    } finally {
      connection?.release();
    }
  });

  router.post(
    '/resend-verification',
    limiters.resendVerificationIp,
    limiters.resendVerificationIdentifier,
    async (req, res, next) => {
      let connection;
      let transactionStarted = false;
      let sendingEmail = false;
      try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
          throw requestError(400, 'Enter a valid email address.');
        }
        if (!emailTransporter) {
          return res.status(503).json({ message: 'Verification email is unavailable. Configure SMTP settings and restart the backend.' });
        }
        const verificationBaseUrl = verificationPageUrl();
        connection = await database.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;
        const [users] = await connection.query(
          `SELECT id, first_name, email FROM users
           WHERE LOWER(email) = ? AND is_verified = 0 AND status = 'PENDING_VERIFICATION'
           LIMIT 1 FOR UPDATE`,
          [email]
        );
        if (!users.length) {
          await connection.commit();
          transactionStarted = false;
          return res.json({ message: 'If this address has a pending account, a new verification link has been sent.' });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        await connection.query(
          `UPDATE users SET verification_token = ?, token_expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)
           WHERE id = ?`,
          [tokenHash, users[0].id]
        );
        const verificationLink = new URL(verificationBaseUrl);
        verificationLink.searchParams.set('token', rawToken);
        await connection.commit();
        transactionStarted = false;

        sendingEmail = true;
        await sendVerificationEmail(
          emailTransporter,
          senderAddress,
          users[0].email,
          users[0].first_name,
          verificationLink.toString(),
          'Your new Tax System verification link'
        );
        sendingEmail = false;
        res.json({ message: 'If this address has a pending account, a new verification link has been sent.' });
      } catch (error) {
        if (connection && transactionStarted) await connection.rollback();
        if (!error.status && (sendingEmail || /FRONTEND_URL/i.test(error.message || ''))) {
          console.error('Verification email resend failed:', error.message);
          return res.status(503).json({ message: 'The verification email could not be sent. Retry the request or check the mail configuration.' });
        }
        next(error);
      } finally {
        connection?.release();
      }
    }
  );

  return router;
}

const router = createRegistrationRouter();
module.exports = router;
module.exports.createRegistrationRouter = createRegistrationRouter;
