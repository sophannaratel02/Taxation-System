const assert = require('node:assert/strict');
const test = require('node:test');
const { getOrCreateLegacyCompany } = require('../src/services/tenantMigration');

test('legacy migration assigns the former Super Admin company to an eligible active Admin', async () => {
  const statements = [];
  const connection = {
    async query(sql, parameters = []) {
      statements.push({ sql, parameters });
      if (sql.includes("FROM users WHERE LOWER(role) = 'superadmin'")) {
        return [[{ id: 1, name: 'Platform Admin', enterprise_name: 'Legacy Company', company_id: 7 }]];
      }
      if (sql.includes('SELECT owner_user_id FROM companies')) return [[{ owner_user_id: null }]];
      if (sql.includes("LOWER(role) = 'admin'")) return [[{ id: 12 }]];
      return [{ affectedRows: 1 }];
    },
  };

  assert.equal(await getOrCreateLegacyCompany(connection), 7);
  assert.ok(statements.some(({ sql, parameters }) => (
    sql.includes('UPDATE users SET company_id = NULL, is_owner = 0') && parameters[0] === 1
  )));
  assert.ok(statements.some(({ sql, parameters }) => (
    sql.includes('UPDATE companies SET owner_user_id = ? WHERE id = ?')
    && parameters[0] === 12
    && parameters[1] === 7
  )));
});

test('legacy migration reuses an existing company after Super Admin is detached', async () => {
  const statements = [];
  const connection = {
    async query(sql, parameters = []) {
      statements.push({ sql, parameters });
      if (sql.includes("FROM users WHERE LOWER(role) = 'superadmin'")) {
        return [[{ id: 1, name: 'Platform Admin', enterprise_name: 'Legacy Company', company_id: null }]];
      }
      if (sql.includes('FROM companies WHERE owner_user_id')) return [[]];
      if (sql.includes('SELECT id FROM companies ORDER BY id')) return [[{ id: 7 }]];
      if (sql.includes('SELECT owner_user_id FROM companies')) return [[{ owner_user_id: 12 }]];
      return [{ affectedRows: 1 }];
    },
  };

  assert.equal(await getOrCreateLegacyCompany(connection), 7);
  assert.equal(statements.some(({ sql }) => sql.includes('INSERT INTO companies')), false);
  assert.equal(statements.some(({ sql }) => sql.includes("LOWER(role) = 'admin'")), false);
});
