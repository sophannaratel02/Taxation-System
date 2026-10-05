function isProduction() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

let jwtSecretWarningShown = false;

function resolveJwtSecret() {
  const configured = String(process.env.JWT_SECRET || '').trim();
  if (configured) {
    return configured;
  }

  if (isProduction()) {
    throw new Error('JWT_SECRET must be set in production. Add a strong random secret to Tax-backend/.env.');
  }

  const devSecret = 'axis-tax-dev-secret-change-me';
  if (!jwtSecretWarningShown) {
    console.warn('JWT_SECRET is not configured. Using a development-only fallback secret. Set a strong value in Tax-backend/.env before deployment.');
    jwtSecretWarningShown = true;
  }
  return devSecret;
}

module.exports = {
  isProduction,
  resolveJwtSecret,
};
