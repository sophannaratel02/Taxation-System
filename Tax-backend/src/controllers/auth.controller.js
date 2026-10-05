const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { resolveJwtSecret } = require('../config/runtime');
const { transporter, mailFrom, mailConfigurationError, passwordResetEmail } = require('../config/mailer');

const jwtSecret = resolveJwtSecret();

function wasRecipientAccepted(message, email) {
  return (message.accepted || []).some((recipient) => {
    const address = typeof recipient === 'string' ? recipient : recipient.address;
    return String(address || '').toLowerCase() === email.toLowerCase();
  });
}

async function findValidReset(email, otp, connection = pool) {
  const identifier = String(email || '').trim().toLowerCase();
  const [rows] = await connection.query(
    `SELECT pr.*, u.id AS account_id
     FROM password_resets pr
     JOIN users u ON u.id = pr.user_id
     WHERE (LOWER(pr.email) = ? OR LOWER(u.username) = ?)
       AND pr.is_used = 0 AND pr.expires_at > NOW()
    ORDER BY pr.created_at DESC LIMIT 1
    FOR UPDATE`,
    [identifier, identifier]
  );

  if (!rows[0] || !(await bcrypt.compare(String(otp || ''), rows[0].otp_hash))) return null;
  return rows[0];
}

async function forgotPassword(req, res) {
  let connection;
  let transactionStarted = false;
  try {
    const emailOrUsername = String(req.body?.emailOrUsername || req.body?.email || '').trim();
    if (!emailOrUsername) {
      return res.status(400).json({ message: 'Enter your account username or recovery email.' });
    }

    if (!transporter) {
      console.error(mailConfigurationError || 'Password reset email transport is not configured.');
      return res.status(503).json({ message: 'Password reset email is not configured correctly. Check the SMTP settings in Tax-backend/.env and restart the backend.' });
    }

    const [users] = await pool.query(
      'SELECT id, email FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1',
      [emailOrUsername, emailOrUsername]
    );
    const user = users[0];
    if (!user) {
      return res.status(404).json({ message: 'No account was found. Check the username or recovery email and try again.' });
    }
    if (!user.email) {
      return res.status(400).json({ message: 'This account has no recovery email. Ask an administrator to add one, then try again.' });
    }

    const recoveryEmail = String(user.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
      return res.status(400).json({ message: 'This account has an invalid recovery email. Ask an administrator to update it.' });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otp, 10);

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query('UPDATE password_resets SET is_used = 1 WHERE user_id = ? AND is_used = 0', [user.id]);
    await connection.query(
      `INSERT INTO password_resets (user_id, email, otp_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [user.id, recoveryEmail.toLowerCase(), otpHash]
    );

    const message = await transporter.sendMail({
      from: { name: 'Tax System', address: mailFrom },
      to: recoveryEmail,
      subject: 'Your Tax System password reset code',
      text: `Your password reset code is ${otp}. It expires in 10 minutes. Do not share this code.`,
      html: passwordResetEmail(otp),
    });
    if (!wasRecipientAccepted(message, recoveryEmail)) {
      throw new Error('SMTP server did not accept the recovery email recipient.');
    }

    await connection.commit();
    transactionStarted = false;
    console.log('Password reset email accepted by SMTP.');
    return res.json({ ok: true, message: 'Verification code sent to the recovery email.' });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback().catch(() => {});
    console.error('Password reset email failed:', error.message);
    return res.status(503).json({ message: 'The verification email could not be sent. Check the SMTP host, port, sender, and app password, then try again.' });
  } finally {
    connection?.release();
  }
}

async function verifyOtp(req, res) {
  let connection;
  let transactionStarted = false;
  try {
    const email = String(req.body?.email || '').trim();
    const otp = String(req.body?.otp || '').trim();
    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'Enter the email or username and the 6-digit verification code.' });
    }

    connection = await pool.getConnection();
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

async function resetPassword(req, res) {
  let connection;
  let transactionStarted = false;
  try {
    const { email, otp, newPassword, resetToken } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
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

    connection = await pool.getConnection();
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
    await connection.query('UPDATE password_resets SET is_used = 1 WHERE id = ?', [reset.id]);
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

module.exports = { forgotPassword, verifyOtp, resetPassword };
