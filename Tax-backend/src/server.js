require('dotenv').config();

const app = require('./app');
const { pool, initializeDatabase } = require('./db');
const { verifyTransporter } = require('./config/mailer');

const port = Number(process.env.PORT || 4000);

async function startServer() {
  try {
    await verifyTransporter();
    await initializeDatabase();
    const server = app.listen(port, () => {
      console.log(`Taxation backend listening on http://localhost:${port}`);
    });
    return server;
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    console.error('Check MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE in Tax-backend/.env.');
    await pool.end().catch(() => {});
    process.exitCode = 1;
    return null;
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
