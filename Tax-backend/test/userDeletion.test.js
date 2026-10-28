const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../src/controllers/api.controller');
const { ensureUserReferenceSetNull } = require('../src/db');
const { requireOwner, requireSuperAdmin } = require('../src/middleware/auth');

test('company user deletion is owner-only and platform deletion is Super Admin-only', () => {
  const companyRoute = api.stack.find((layer) => layer.route?.path === '/admin/users/:id' && layer.route.methods.delete);
  const platformRoute = api.stack.find((layer) => layer.route?.path === '/superadmin/users/:id' && layer.route.methods.delete);
  assert.ok(companyRoute);
  assert.ok(platformRoute);
  assert.ok(companyRoute.route.stack.some((layer) => layer.handle === requireOwner));
  assert.ok(platformRoute.route.stack.some((layer) => layer.handle === requireSuperAdmin));
});

test('user reference migration makes required attribution nullable and preserves its constraint name', async () => {
  const statements = [];
  const database = {
    async query(sql, parameters) {
      statements.push({ sql, parameters });
      if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
        return [[{
          CONSTRAINT_NAME: 'projects_ibfk_1',
          DELETE_RULE: 'NO ACTION',
          IS_NULLABLE: 'NO',
        }]];
      }
      return [{ affectedRows: 0 }];
    },
  };

  await ensureUserReferenceSetNull('projects', 'submitted_by', database);

  assert.match(statements[1].sql, /DROP FOREIGN KEY `projects_ibfk_1`/);
  assert.match(statements[2].sql, /MODIFY COLUMN `submitted_by` INT NULL/);
  assert.match(statements[3].sql, /ADD CONSTRAINT `projects_ibfk_1`/);
  assert.match(statements[3].sql, /ON DELETE SET NULL/);
});

test('user reference migration leaves an already-nullable SET NULL constraint unchanged', async () => {
  let queryCount = 0;
  const database = {
    async query(sql) {
      queryCount += 1;
      assert.match(sql, /information_schema.KEY_COLUMN_USAGE/);
      return [[{
        CONSTRAINT_NAME: 'cash_registers_ibfk_1',
        DELETE_RULE: 'SET NULL',
        IS_NULLABLE: 'YES',
      }]];
    },
  };

  await ensureUserReferenceSetNull('cash_registers', 'opened_by', database);
  assert.equal(queryCount, 1);
});
