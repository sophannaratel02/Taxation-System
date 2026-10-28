const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { resolveJwtSecret } = require('../config/runtime');
const { transporter, mailFrom, mailConfigurationError, passwordResetEmail } = require('../config/mailer');
const { loadAccessPolicy, passwordMeetsPolicy } = require('../services/accessPolicy');

const jwtSecret = resolveJwtSecret();
const RECOVERY_ACKNOWLEDGEMENT = 'If an account with that username exists, instructions have been sent to the registered email.';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function respondRecoveryAcknowledgement(res) {
  return res.json({ ok: true, message: RECOVERY_ACKNOWLEDGEMENT });
}

function wasRecipientAccepted(message, email) {
  return (message.accepted || []).some((recipient) => {
    const address = typeof recipient === 'string' ? recipient : recipient.address;
    return String(address || '').toLowerCase() === email.toLowerCase();
  });
}

async function findValidReset(email, otp, connection = pool) {
  const identifier = String(email || '').trim().toLowerCase();
  const lookupColumn = EMAIL_PATTERN.test(identifier) ? 'LOWER(email)' : 'LOWER(username)';
  const [users] = await connection.query(
    `SELECT id, company_id FROM users WHERE ${lookupColumn} = ? LIMIT 1 FOR UPDATE`,
    [identifier]
  );
  if (!users.length) return null;

  const [rows] = await connection.query(
    `SELECT * FROM password_resets
    WHERE user_id = ? AND company_id = ? AND is_used = 0 AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
    FOR UPDATE`,
    [users[0].id, users[0].company_id]
  );

  if (!rows[0] || !(await bcrypt.compare(String(otp || ''), rows[0].otp_hash))) return null;
  return rows[0];
}

async function forgotPassword(req, res, next, dependencies = {}) {
  let connection;
  let transactionStarted = false;
  let sendingEmail = false;
  const database = dependencies.database || pool;
  const emailTransporter = dependencies.transporter || transporter;
  const sender = dependencies.sender || mailFrom;
  try {
    const emailOrUsername = String(req.body?.emailOrUsername || req.body?.email || '').trim();
    if (!emailOrUsername || emailOrUsername.length > 254) {
      return res.status(400).json({ message: 'Enter a valid account username or recovery email.' });
    }

    if (!emailTransporter) {
      console.error(dependencies.mailConfigurationError || mailConfigurationError || 'Password reset email transport is not configured.');
      return res.status(503).json({ message: 'Password reset email is not configured correctly. Check the SMTP settings in Tax-backend/.env and restart the backend.' });
    }

    connection = await database.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const lookupColumn = EMAIL_PATTERN.test(emailOrUsername.toLowerCase())
      ? 'LOWER(email)'
      : 'LOWER(username)';
    const [users] = await connection.query(
      `SELECT id, email, company_id FROM users
       WHERE ${lookupColumn} = LOWER(?)
       LIMIT 1 FOR UPDATE`,
      [emailOrUsername]
    );
    const user = users[0];
    if (!user || !user.email) {
      await connection.commit();
      transactionStarted = false;
      return respondRecoveryAcknowledgement(res);
    }

    const recoveryEmail = String(user.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
      await connection.commit();
      transactionStarted = false;
      return respondRecoveryAcknowledgement(res);
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otp, 10);

    await connection.query('UPDATE password_resets SET is_used = 1 WHERE user_id = ? AND company_id = ? AND is_used = 0', [user.id, user.company_id]);
    await connection.query(
      `INSERT INTO password_resets (company_id, user_id, email, otp_hash, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [user.company_id, user.id, recoveryEmail.toLowerCase(), otpHash]
    );

    sendingEmail = true;
    const message = await emailTransporter.sendMail({
      from: { name: 'Tax System', address: sender },
      to: recoveryEmail,
      subject: 'Your Tax System password reset code',
      text: `Your password reset code is ${otp}. It expires in 10 minutes. Do not share this code.`,
      html: passwordResetEmail(otp),
    });
    if (!wasRecipientAccepted(message, recoveryEmail)) {
      throw new Error('SMTP server did not accept the recovery email recipient.');
    }

    sendingEmail = false;
    await connection.commit();
    transactionStarted = false;
    console.log('Password reset email accepted by SMTP.');
    return respondRecoveryAcknowledgement(res);
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    if (sendingEmail) {
      console.error('Password reset email failed:', error.message);
      return res.status(503).json({ message: 'The verification email could not be sent. Check the SMTP host, port, sender, and app password, then try again.' });
    }
    return next(error);
  } finally {
    connection?.release();
  }
}

async function verifyOtp(req, res, _next, database = pool) {
  let connection;
  let transactionStarted = false;
  try {
    const email = String(req.body?.email || '').trim();
    const otp = String(req.body?.otp || '').trim();
    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'Enter the email or username and the 6-digit verification code.' });
    }

    connection = await database.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const reset = await findValidReset(email, otp, connection);
    if (!reset) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    await connection.commit();
    transactionStarted = false;
    const resetToken = jwt.sign(
      { purpose: 'password-reset', resetId: reset.id, userId: reset.user_id, email: reset.email },
      jwtSecret,
      { expiresIn: '10m' }
    );
    return res.json({ resetToken, expiresIn: 600 });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback().catch(() => {});
    console.error('OTP verification failed:', error.message);
    return res.status(500).json({ message: 'Unable to verify the code right now.' });
  } finally {
    connection?.release();
  }
}

async function resetPassword(req, res, _next, database = pool, policyLoader = loadAccessPolicy) {
  let connection;
  let transactionStarted = false;
  try {
    const { email, otp, newPassword, resetToken } = req.body || {};
    const accessPolicy = await policyLoader(database);
    if (!passwordMeetsPolicy(newPassword, accessPolicy)) {
      return res.status(400).json({ message: `Password must be at least ${accessPolicy.passwordMinLength} characters.` });
    }
    if (!String(email || '').trim() || !/^\d{6}$/.test(String(otp || '').trim())) {
      return res.status(400).json({ message: 'Enter the email or username and the 6-digit verification code.' });
    }

    let tokenPayload;
    try {
      tokenPayload = jwt.verify(resetToken || '', jwtSecret);
    } catch {
      return res.status(400).json({ message: 'Reset authorization has expired.' });
    }
    if (tokenPayload.purpose !== 'password-reset') {
      return res.status(400).json({ message: 'Invalid reset authorization.' });
    }

    connection = await database.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const reset = await findValidReset(email, otp, connection);
    if (!reset || reset.id !== tokenPayload.resetId || reset.user_id !== tokenPayload.userId) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await connection.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, reset.user_id]);
    await connection.query('UPDATE password_resets SET is_used = 1 WHERE user_id = ? AND company_id = ?', [reset.user_id, reset.company_id]);
    await connection.commit();
    transactionStarted = false;
    console.log('Password reset completed.');
    return res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback().catch(() => {});
    console.error('Password reset failed:', error.message);
    return res.status(500).json({ message: 'Unable to reset the password right now.' });
  } finally {
    connection?.release();
  }
}

module.exports = {
  RECOVERY_ACKNOWLEDGEMENT,
  forgotPassword,
  respondRecoveryAcknowledgement,
  resetPassword,
  verifyOtp,
};
