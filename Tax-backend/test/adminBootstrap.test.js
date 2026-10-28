const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const { ensureBootstrapAdmin } = require('../src/services/adminBootstrap');

function createPool(admin = null) {
  const statements = [];
  return {
    statements,
    async query(sql, parameters = []) {
      statements.push({ sql, parameters });
      if (sql.startsWith('SELECT id, role')) return [admin ? [admin] : []];
      return [{ affectedRows: 1 }];
    },
  };
}

test('fresh production bootstrap requires a strong explicitly configured password', async () => {
  const pool = createPool();
  await assert.rejects(
    ensureBootstrapAdmin(pool, { nodeEnv: 'production' }),
    /ADMIN_PASSWORD to at least 12 characters/i
  );
  assert.equal(pool.statements.some(({ sql }) => sql.startsWith('INSERT INTO users')), false);
});

test('existing production admin is not promoted or reset without explicit credentials', async () => {
  const pool = createPool({ id: 7, role: 'staff' });
  await assert.rejects(
    ensureBootstrapAdmin(pool, { nodeEnv: 'production' }),
    /explicitly promote/i
  );
  assert.equal(pool.statements.some(({ sql }) => sql.startsWith('UPDATE users')), false);
});

test('explicit production credentials rotate and promote the selected admin account', async () => {
  const pool = createPool({ id: 7, role: 'staff' });
  await ensureBootstrapAdmin(pool, {
    adminPassword: 'a-strong-production-password',
    adminEmail: ' ADMIN@EXAMPLE.COM ',
    nodeEnv: 'production',
  });

  const passwordUpdate = pool.statements.find(({ sql }) => sql.includes('SET password_hash'));
  assert.ok(passwordUpdate);
  assert.equal(passwordUpdate.parameters[1], 'superadmin');
  assert.equal(passwordUpdate.parameters[2], 7);
  assert.equal(await bcrypt.compare('a-strong-production-password', passwordUpdate.parameters[0]), true);
  assert.deepEqual(pool.statements.find(({ sql }) => sql.includes('SET email')).parameters, ['admin@example.com', 7]);
});

test('existing development admin is left unchanged when no bootstrap password is configured', async () => {
  const pool = createPool({ id: 7, role: 'staff' });
  await ensureBootstrapAdmin(pool, { nodeEnv: 'development' });
  assert.equal(pool.statements.length, 1);
});
