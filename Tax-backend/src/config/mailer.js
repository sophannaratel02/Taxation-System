const nodemailer = require('nodemailer');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;
const GMAIL_APP_PASSWORD_REGEX = /^[A-Za-z0-9]{16}$/;
const SMTP_SECURE_TRUE_VALUES = new Set(['true', '1', 'yes']);

const TIMEOUT_CONFIG = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
};

function readEnv(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function readAppPassword(name) {
  return String(process.env[name] ?? '').replace(/\s+/g, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function buildEmailLayout({ title, subtitle, intro, primaryActionText, primaryActionUrl, bodyText, footerText, code }) {
  const hasAction = Boolean(primaryActionText && primaryActionUrl);
  const actionMarkup = hasAction
    ? `<p style="margin:22px 0;text-align:center"><a href="${primaryActionUrl}" style="display:inline-block;background:#f59e0b;color:#172033;text-decoration:none;border-radius:8px;padding:14px 24px;font-weight:700">${primaryActionText}</a></p>`
    : '';
  const codeMarkup = code
    ? `<p style="margin:22px 0;text-align:center;background:#fff7ed;color:#9a3412;border-radius:8px;padding:18px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>`
    : '';

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
                <p style="margin:7px 0 0;color:#64748b">${subtitle}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px">
                ${intro}
                ${codeMarkup}
                ${actionMarkup}
                ${bodyText}
                ${footerText}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const gmailConfig = {
  user: readEnv('GMAIL_USER'),
  pass: readAppPassword('GMAIL_APP_PASSWORD'),
};

const smtpConfig = {
  host: readEnv('SMTP_HOST'),
  port: Number(readEnv('SMTP_PORT', '587')),
  user: readEnv('SMTP_USER'),
  pass: readEnv('SMTP_PASSWORD'),
  from: readEnv('SMTP_FROM'),
  secureInput: readEnv('SMTP_SECURE').toLowerCase(),
};

const isGmailValid = EMAIL_REGEX.test(gmailConfig.user) && GMAIL_APP_PASSWORD_REGEX.test(gmailConfig.pass);
const isValidPort = Number.isInteger(smtpConfig.port) && smtpConfig.port >= 1 && smtpConfig.port <= 65535;
const isSmtpSecure = smtpConfig.port === 465 || SMTP_SECURE_TRUE_VALUES.has(smtpConfig.secureInput);
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
  smtpConfig.host || smtpConfig.user || smtpConfig.pass || readEnv('SMTP_FROM')
);

const mailConfigurationError =
  hasPartialSmtpSettings && !isCustomSmtpComplete && !isGmailValid
    ? 'Custom SMTP requires SMTP_HOST, a valid SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and a valid SMTP_FROM address.'
    : null;

const mailFrom = resolvedSmtpFrom;

function hasUsableMailConfiguration() {
  return Boolean(isCustomSmtpComplete || isGmailValid);
}

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

function passwordResetEmail(otp) {
  const code = String(otp);
  if (!OTP_REGEX.test(code)) {
    throw new Error('Password reset code must contain exactly six digits.');
  }

  return buildEmailLayout({
    title: 'Axis Investment Consulting',
    subtitle: 'Tax System password recovery',
    intro: '<p>Use this verification code to create a new password:</p>',
    bodyText: '<p>This code expires in <strong>10 minutes</strong> and can only be used once.</p>',
    footerText: '<p style="margin-bottom:0;color:#64748b;font-size:13px">If you did not request this, you can safely ignore this email.</p>',
    code,
  });
}

function emailVerificationEmail(verificationLink, firstName) {
  const escapedName = escapeHtml(firstName || 'there');
  const sanitizedLink = escapeHtml(verificationLink || '');

  return buildEmailLayout({
    subtitle: 'Tax System email verification',
    intro: `<p>Hello ${escapedName},</p><p>Verify your email address to activate your Tax System account.</p>`,
    primaryActionText: 'Verify email address',
    primaryActionUrl: verificationLink,
    bodyText: `<p>This link expires in 24 hours and can only be used once.</p><p style="color:#64748b;font-size:13px">If you did not request this account, you can safely ignore this email.</p><p style="color:#64748b;font-size:12px;word-break:break-all">${sanitizedLink}</p>`,
    footerText: '',
  });
}

module.exports = {
  transporter,
  mailFrom,
  mailConfigurationError,
  passwordResetEmail,
  emailVerificationEmail,
  verifyTransporter,
  hasUsableMailConfiguration,
};