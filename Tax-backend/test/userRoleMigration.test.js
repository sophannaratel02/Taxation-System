const assert = require('node:assert/strict');
const test = require('node:test');
const { migrateUserRoleModel } = require('../src/db');

test('owner migration promotes active manager staff in ownerless workspaces', async () => {
  const statements = [];
  const warnings = [];
  const database = {
    async query(sql, parameters = []) {
      statements.push({ sql, parameters });
      if (sql.includes('SELECT company.id')) {
        return [[{ id: 1 }, { id: 2 }]];
      }
      if (sql.includes('SELECT id FROM users candidate')) {
        return [parameters[0] === 1 ? [{ id: 11 }] : []];
      }
      if (sql.startsWith('UPDATE companies SET owner_user_id')) {
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    },
  };
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);

  try {
    await migrateUserRoleModel(database);
  } finally {
    console.warn = originalWarn;
  }

  const candidateQuery = statements.find(({ sql }) => sql.includes('SELECT id FROM users candidate'));
  assert.match(candidateQuery.sql, /LOWER\(role\) = 'staff'/);
  assert.match(candidateQuery.sql, /JSON_EXTRACT\(permissions, '\$\.preset'\)\) = 'manager'/);
  assert.deepEqual(
    statements
      .filter(({ sql }) => sql.startsWith('UPDATE companies SET owner_user_id'))
      .map(({ parameters }) => parameters),
    [[11, 1]]
  );
  assert.ok(statements.some(({ sql, parameters }) => (
    sql.startsWith("UPDATE users SET role = 'owner', is_owner = 1, permissions = NULL")
    && parameters[0] === 11
  )));
  assert.match(warnings[0], /workspace\(s\) 2 have no eligible active manager/);
});
