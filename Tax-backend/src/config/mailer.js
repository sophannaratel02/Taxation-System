const nodemailer = require('nodemailer');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;

const TIMEOUT_CONFIG = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
};


const gmailConfig = {
  user: String(process.env.GMAIL_USER || '').trim(),
  pass: String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
};

const smtpConfig = {
  host: String(process.env.SMTP_HOST || '').trim(),
  port: Number(process.env.SMTP_PORT || 587),
  user: String(process.env.SMTP_USER || '').trim(),
  pass: String(process.env.SMTP_PASSWORD || '').trim(),
  from: String(process.env.SMTP_FROM || '').trim(),
  secureInput: String(process.env.SMTP_SECURE || '').trim().toLowerCase(),
};

// --------------------------------------------------
// Validation Checks
// --------------------------------------------------
const isGmailValid =
  EMAIL_REGEX.test(gmailConfig.user) &&
  /^[A-Za-z0-9]{16}$/.test(gmailConfig.pass);

const isValidPort =
  Number.isInteger(smtpConfig.port) &&
  smtpConfig.port >= 1 &&
  smtpConfig.port <= 65535;

const isSmtpSecure =
  smtpConfig.port === 465 || ['true', '1', 'yes'].includes(smtpConfig.secureInput);

const resolvedSmtpFrom = smtpConfig.from || smtpConfig.user || gmailConfig.user;
const isValidSmtpFrom = EMAIL_REGEX.test(resolvedSmtpFrom);

const isCustomSmtpComplete = Boolean(
  smtpConfig.host &&
  isValidPort &&
  smtpConfig.user &&
  smtpConfig.pass &&
  isValidSmtpFrom
);

const hasPartialSmtpSettings = Boolean(
  smtpConfig.host || smtpConfig.user || smtpConfig.pass || process.env.SMTP_FROM?.trim()
);

const mailConfigurationError =
  hasPartialSmtpSettings && !isCustomSmtpComplete && !isGmailValid
    ? 'Custom SMTP requires SMTP_HOST, a valid SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and a valid SMTP_FROM address.'
    : null;

const mailFrom = resolvedSmtpFrom;

function hasUsableMailConfiguration() {
  return Boolean(isCustomSmtpComplete || isGmailValid);
}

// --------------------------------------------------
// Transporter Initialization
// --------------------------------------------------
function createEmailTransporter() {
  if (isCustomSmtpComplete) {
    return nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: isSmtpSecure,
      auth: { user: smtpConfig.user, pass: smtpConfig.pass },
      ...TIMEOUT_CONFIG,
    });
  }

  if (isGmailValid) {
    return nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailConfig.user, pass: gmailConfig.pass },
      ...TIMEOUT_CONFIG,
    });
  }

  return null;
}

const transporter = createEmailTransporter();

// --------------------------------------------------
// Transporter Verification
// --------------------------------------------------
async function verifyTransporter() {
  if (!transporter) {
    const warning =
      mailConfigurationError ||
      'Password reset email is disabled. Configure SMTP_HOST/SMTP_USER/SMTP_PASSWORD or GMAIL_USER/GMAIL_APP_PASSWORD in Tax-backend/.env.';
    console.warn(warning);
    return false;
  }

  if (!hasUsableMailConfiguration() || !mailFrom || !EMAIL_REGEX.test(String(mailFrom))) {
    const warning = 'Mail sender configuration is invalid. Set a valid SMTP_FROM address or GMAIL_USER before enabling password reset emails.';
    console.warn(warning);
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

// --------------------------------------------------
// Email Template
// --------------------------------------------------
function passwordResetEmail(otp) {
  const code = String(otp);
  if (!OTP_REGEX.test(code)) {
    throw new Error('Password reset code must contain exactly six digits.');
  }

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
            <tr>
              <td style="padding:24px;border-top:5px solid #f59e0b">
                <h1 style="margin:0;font-size:22px">Axis Investment Consulting</h1>
                <p style="margin:7px 0 0;color:#64748b">Tax System password recovery</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px">
                <p>Use this verification code to create a new password:</p>
                <p style="margin:22px 0;text-align:center;background:#fff7ed;color:#9a3412;border-radius:8px;padding:18px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>
                <p>This code expires in <strong>10 minutes</strong> and can only be used once.</p>
                <p style="margin-bottom:0;color:#64748b;font-size:13px">If you did not request this, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = {
  transporter,
  mailFrom,
  mailConfigurationError,
  passwordResetEmail,
  verifyTransporter,
  hasUsableMailConfiguration,
};