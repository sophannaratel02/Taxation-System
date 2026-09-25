const nodemailer = require('nodemailer');

const gmailUser = String(process.env.GMAIL_USER || '').trim();
const gmailAppPassword = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const hasGmailConfig = Boolean(gmailUser && gmailAppPassword.length === 16);
const smtpHost = String(process.env.SMTP_HOST || '').trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = String(process.env.SMTP_USER || '').trim();
const smtpPassword = String(process.env.SMTP_PASSWORD || '');
const smtpFrom = String(process.env.SMTP_FROM || smtpUser || gmailUser).trim();

const transporter = smtpHost && smtpUser && smtpPassword
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: process.env.SMTP_SECURE === 'true' || smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
    })
  : hasGmailConfig
    ? nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailAppPassword },
      })
    : null;

const mailFrom = smtpFrom || gmailUser;

function verifyTransporter() {
  if (!transporter) {
    console.warn('Password reset email is disabled. Set SMTP_HOST/SMTP_USER/SMTP_PASSWORD or set GMAIL_USER and a 16-character GMAIL_APP_PASSWORD in Tax-backend/.env.');
    return;
  }

  transporter.verify()
    .then(() => console.log(`Password reset SMTP ready for ${mailFrom}`))
    .catch((error) => console.error('Password reset SMTP verification failed:', error.message));
}

function passwordResetEmail(otp) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
          <tr><td style="padding:24px;border-top:5px solid #f59e0b">
            <h1 style="margin:0;font-size:22px">Axis Investment Consulting</h1>
            <p style="margin:7px 0 0;color:#64748b">Tax System password recovery</p>
          </td></tr>
          <tr><td style="padding:0 24px 24px">
            <p>Use this verification code to create a new password:</p>
            <p style="margin:22px 0;text-align:center;background:#fff7ed;color:#9a3412;border-radius:8px;padding:18px;font-size:32px;font-weight:700;letter-spacing:8px">${otp}</p>
            <p>This code expires in <strong>10 minutes</strong> and can only be used once.</p>
            <p style="margin-bottom:0;color:#64748b;font-size:13px">If you did not request this, you can safely ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

module.exports = { transporter, mailFrom, passwordResetEmail, verifyTransporter };
