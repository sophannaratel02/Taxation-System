const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// --- Load Environment Variables ---
// Check standard root or parent locations deterministically
const candidateEnvPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '.env'),
];

for (const envFile of candidateEnvPaths) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
    break; // Stops after the first match so higher-priority configs win
  }
}

// --- Dependencies ---
const app = require('./app');
const { pool, initializeDatabase } = require('./db');
const { verifyTransporter } = require('./config/mailer');
const { isProduction } = require('./config/runtime');

/**
 * Validates and parses the application port.
 * @returns {number}
 */
function resolvePort() {
  const rawPort = String(process.env.PORT ?? '').trim();
  if (!rawPort) return 4000;

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535. Received: "${rawPort}"`);
  }
  return port;
}

/**
 * Validates mandatory production security constraints.
 */
function validateRuntimeSettings() {
  if (!isProduction()) return;

  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a strong value (minimum 32 characters) in production.');
  }

  const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();
  if (adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters in production.');
  }

  const corsOrigin = String(process.env.CORS_ORIGIN || '').trim();
  if (!corsOrigin) {
    throw new Error('CORS_ORIGIN must be configured in production to allow only trusted frontend origins.');
  }
}

/**
 * Promisified server listener wrapper.
 * @param {number} port
 * @returns {Promise<import('http').Server>}
 */
function listen(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);

    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };

    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };

    server.once('listening', onListening);
    server.once('error', onError);
  });
}

/**
 * Closes the server and releases DB connections.
 * @param {import('http').Server} [server]
 */
async function closeApp(server) {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (pool && typeof pool.end === 'function') {
    await pool.end();
  }
}

/**
 * Bootstraps the application services and starts listening for HTTP traffic.
 */
async function startServer() {
  let server;
  try {
    const port = resolvePort();
    validateRuntimeSettings();

    // Verify external dependencies before accepting traffic
    await verifyTransporter();
    await initializeDatabase();

    server = await listen(port);

    const address = server.address();
    const listeningPort = address && typeof address === 'object' ? address.port : port;
    console.log(`Taxation backend listening on port ${listeningPort}`);

    // Register graceful shutdown handlers
    const handleShutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      try {
        await closeApp(server);
        console.log('Server and database pool closed cleanly.');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    };

    process.once('SIGINT', () => handleShutdown('SIGINT'));
    process.once('SIGTERM', () => handleShutdown('SIGTERM'));

    return server;
  } catch (error) {
    try {
      await closeApp(server);
    } catch (cleanupError) {
      console.error('Failed to close database pool after startup failure:', cleanupError);
    }
    throw error;
  }
}

// Start immediately if executed directly via CLI
if (require.main === module) {
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Promise Rejection:', reason);
    process.exit(1);
  });

  startServer().catch((error) => {
    console.error('Backend startup failed:', error.message || error);
    process.exit(1);
  });
}

module.exports = { startServer, closeApp };