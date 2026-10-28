const bcrypt = require('bcryptjs');

async function ensureBootstrapAdmin(connection, {
  adminPassword = process.env.ADMIN_PASSWORD || '',
  adminEmail = process.env.ADMIN_EMAIL || '',
  nodeEnv = process.env.NODE_ENV || 'development',
} = {}) {
  const [admins] = await connection.query(
    'SELECT id, role FROM users WHERE username = ? LIMIT 1',
    ['admin']
  );
  const existingAdmin = admins[0];
  const configuredPassword = String(adminPassword);
  const normalizedEmail = String(adminEmail).trim().toLowerCase();

  if (!existingAdmin) {
    if (nodeEnv === 'production' && configuredPassword.length < 12) {
      throw new Error('Set ADMIN_PASSWORD to at least 12 characters before creating the production admin account.');
    }

    const password = configuredPassword || 'admin123';
    await connection.query(
      'INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      ['Admin User', 'admin', normalizedEmail || null, await bcrypt.hash(password, 10), 'superadmin']
    );
    return;
  }

  if (configuredPassword) {
    if (nodeEnv === 'production' && configuredPassword.length < 12) {
      throw new Error('ADMIN_PASSWORD must be at least 12 characters to promote or reset the production admin account.');
    }

    await connection.query(
      'UPDATE users SET password_hash = ?, role = ?, active = 1 WHERE id = ?',
      [await bcrypt.hash(configuredPassword, 10), 'superadmin', existingAdmin.id]
    );
    if (normalizedEmail) {
      await connection.query(
        'UPDATE users SET email = ? WHERE id = ?',
        [normalizedEmail, existingAdmin.id]
      );
    }
    return;
  }

  if (nodeEnv === 'production' && String(existingAdmin.role).toLowerCase() !== 'superadmin') {
    throw new Error('Set ADMIN_PASSWORD to explicitly promote the existing admin account to Super Admin.');
  }
}

module.exports = { ensureBootstrapAdmin };
