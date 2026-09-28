const nodemailer = require('nodemailer');

const gmailUser = String(process.env.GMAIL_USER || '').trim();
const gmailAppPassword = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmailUser);
const hasGmailConfig = Boolean(validEmail && /^[A-Za-z0-9]{16}$/.test(gmailAppPassword));
const smtpHost = String(process.env.SMTP_HOST || '').trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = String(process.env.SMTP_USER || '').trim();
const smtpPassword = String(process.env.SMTP_PASSWORD || '');
const smtpFrom = String(process.env.SMTP_FROM || smtpUser || gmailUser).trim();
const hasCustomSmtpSettings = Boolean(smtpHost || smtpUser || smtpPassword || process.env.SMTP_FROM?.trim());
const validSmtpPort = Number.isInteger(smtpPort) && smtpPort >= 1 && smtpPort <= 65535;
const smtpSecureSetting = String(process.env.SMTP_SECURE || '').trim().toLowerCase();
const smtpSecure = smtpPort === 465 || ['true', '1', 'yes'].includes(smtpSecureSetting);
const validSmtpFrom = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpFrom);
const smtpTimeouts = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
};

const customSmtpComplete = Boolean(smtpHost && validSmtpPort && smtpUser && smtpPassword && validSmtpFrom);
const mailConfigurationError = hasCustomSmtpSettings && !customSmtpComplete && !hasGmailConfig
  ? 'Custom SMTP requires SMTP_HOST, a valid SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and a valid SMTP_FROM address.'
  : null;

const transporter = customSmtpComplete
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPassword },
      ...smtpTimeouts,
    })
  : hasGmailConfig
    ? nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailAppPassword },
      ...smtpTimeouts,
      })
    : null;

const mailFrom = smtpFrom || gmailUser;

async function verifyTransporter() {
  if (!transporter) {
    console.warn(`${mailConfigurationError || 'Password reset email is disabled. Configure SMTP_HOST/SMTP_USER/SMTP_PASSWORD or GMAIL_USER/GMAIL_APP_PASSWORD in Tax-backend/.env.'}`);
    return false;
  }

  try {
    await transporter.verify();
    console.log('Password reset SMTP connection verified.');
    return true;
  } catch (error) {
    console.error('Password reset SMTP verification failed:', error.message);
    return false;
  }
}

function passwordResetEmail(otp) {
  const code = String(otp);
  if (!/^\d{6}$/.test(code)) throw new Error('Password reset code must contain exactly six digits.');

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
            <p style="margin:22px 0;text-align:center;background:#fff7ed;color:#9a3412;border-radius:8px;padding:18px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>
            <p>This code expires in <strong>10 minutes</strong> and can only be used once.</p>
            <p style="margin-bottom:0;color:#64748b;font-size:13px">If you did not request this, you can safely ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

module.exports = { transporter, mailFrom, mailConfigurationError, passwordResetEmail, verifyTransporter };
