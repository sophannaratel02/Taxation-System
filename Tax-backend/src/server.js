const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
require('dotenv').config({ path: envPath });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const app = require('./app');
const { pool, initializeDatabase } = require('./db');
const { verifyTransporter } = require('./config/mailer');
const { isProduction } = require('./config/runtime');

const port = Number(process.env.PORT || 4000);

function validateRuntimeSettings() {
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (isProduction() && (!jwtSecret || jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be set to a strong value (minimum 32 characters) in production.');
  }

  const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();
  if (isProduction() && (!adminPassword || adminPassword.length < 8)) {
    throw new Error('ADMIN_PASSWORD must be set to a strong password in production.');
  }

  const corsOrigin = String(process.env.CORS_ORIGIN || '').trim();
  if (isProduction() && !corsOrigin) {
    throw new Error('CORS_ORIGIN must be configured in production to allow only trusted frontend origins.');
  }
}

async function startServer() {
  try {
    validateRuntimeSettings();
    await verifyTransporter();
    await initializeDatabase();
    const server = app.listen(port, () => {
      console.log(`Taxation backend listening on http://localhost:${port}`);
    });
    return server;
  } catch (error) {
    console.error('Startup validation failed:', error.message);
    console.error('Check JWT_SECRET, ADMIN_PASSWORD, CORS_ORIGIN, MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE in Tax-backend/.env.');
    await pool.end().catch(() => {});
    process.exitCode = 1;
    return null;
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
