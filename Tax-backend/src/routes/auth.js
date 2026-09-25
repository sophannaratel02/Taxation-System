const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { transporter, mailFrom, passwordResetEmail } = require('../config/mailer');

const router = express.Router();
const jwtSecret = process.env.JWT_SECRET || 'development-secret-change-me';
const genericResponse = { message: 'If an account matches those details, a verification code has been sent.' };

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

router.post('/forgot-password', async (req, res) => {
  let connection;
  try {
    const emailOrUsername = String(req.body.emailOrUsername || req.body.email || '').trim();
    if (!emailOrUsername) return res.json(genericResponse);

    const [users] = await pool.query(
      'SELECT id, email FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1',
      [emailOrUsername, emailOrUsername]
    );
    const user = users[0];
    if (!user?.email) return res.json(genericResponse);

    if (!transporter) {
      console.error('Password reset email is not configured. Set GMAIL_USER and a 16-character GMAIL_APP_PASSWORD, then restart the backend.');
      return res.status(503).json({ message: 'Password reset email is not configured. Set Gmail credentials in Tax-backend/.env and restart the backend.' });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otp, 10);

    await transporter.sendMail({
      from: `Tax System <${mailFrom}>`,
      to: user.email,
      subject: 'Your Tax System password reset code',
      text: `Your password reset code is ${otp}. It expires in 10 minutes. Do not share this code.`,
      html: passwordResetEmail(otp),
    });

    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query('UPDATE password_resets SET is_used = 1 WHERE user_id = ? AND is_used = 0', [user.id]);
    await connection.query(
      `INSERT INTO password_resets (user_id, email, otp_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [user.id, user.email.trim().toLowerCase(), otpHash]
    );
    await connection.commit();
    console.log(`Password reset OTP sent to ${user.email}`);
    return res.json(genericResponse);
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Password reset email failed:', error);
    return res.status(503).json({ message: 'Password reset email could not be sent. Check SMTP configuration.' });
  } finally {
    connection?.release();
  }
});

router.post('/verify-otp', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const reset = await findValidReset(req.body.email, req.body.otp, connection);
    if (!reset) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    await connection.commit();
    const resetToken = jwt.sign(
      { purpose: 'password-reset', resetId: reset.id, userId: reset.user_id, email: reset.email },
      jwtSecret,
      { expiresIn: '10m' }
    );
    return res.json({ resetToken, expiresIn: 600 });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('OTP verification failed:', error);
    return res.status(500).json({ message: 'Unable to verify the code right now.' });
  } finally {
    connection?.release();
  }
});

router.post('/reset-password', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { email, otp, newPassword, resetToken } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
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

    await connection.beginTransaction();
    const reset = await findValidReset(email, otp, connection);
    if (!reset || reset.id !== tokenPayload.resetId) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await connection.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, reset.user_id]);
    await connection.query('UPDATE password_resets SET is_used = 1 WHERE id = ?', [reset.id]);
    await connection.commit();
    console.log(`Password reset completed for ${reset.email}`);
    return res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Password reset failed:', error);
    return res.status(500).json({ message: 'Unable to reset the password right now.' });
  } finally {
    connection.release();
  }
});

module.exports = router;
