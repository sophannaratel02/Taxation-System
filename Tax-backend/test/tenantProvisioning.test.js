const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  provisionCompany,
  seedDefaultBranchAccess,
} = require('../src/services/companyProvisioning');
const {
  assignUnlinkedUsers,
  ensureAccountingCompositeForeignKeys,
  ensureTenantWriteTriggers,
  TENANT_COMPOSITE_FOREIGN_KEYS,
  TENANT_UNIQUE_KEYS,
} = require('../src/services/tenantMigration');

test('new company provisioning starts with no items or units of measure', async () => {
  const statements = [];
  const connection = {
    async query(sql, params) {
      statements.push({ sql, params });
      return [{ insertId: 1 }];
    },
  };

  await provisionCompany(connection, 24, 31, 'Example Ltd');

  assert.equal(statements.length, 2);
  assert.deepEqual(statements[0].params, [31, 'Main Branch', 24]);
  assert.match(statements[0].sql, /INSERT INTO user_branch_access/);
  assert.deepEqual(statements[1].params, [
    24,
    'company',
    JSON.stringify({
      companyName: 'Example Ltd',
      address: '',
      phone: '',
      baseCurrency: 'USD',
      exchangeRate: 4000,
      vatRate: 10,
      branch: 'Main Branch',
    }),
  ]);
  assert.match(statements[1].sql, /INSERT INTO company_settings/);
  assert.ok(statements.every(({ sql }) => !/INSERT INTO (chart_of_accounts|fixed_asset_classes|company_tax_rates|categories|invoices|invoice_lines|journal_entries|journal_entry_lines|items|customers|vendors|purchase_orders|sale_records|purchase_records)\b/i.test(sql)));
  assert.equal(statements.some(({ sql }) => /INSERT INTO items\b/i.test(sql)), false);
  assert.equal(statements.some(({ sql }) => /units\s*(?:,|\))/i.test(sql)), false);
});

test('startup seeds branch access with an explicit company ID', async () => {
  const statements = [];
  const database = {
    async query(sql, params) {
      statements.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };

  await seedDefaultBranchAccess(database, 24, 'Main Branch');

  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /user_branch_access \(user_id, branch, company_id\)/);
  assert.deepEqual(statements[0].params, ['Main Branch', 24, 24]);
  await assert.rejects(seedDefaultBranchAccess(database, null, 'Main Branch'), /valid startup company/);
});

test('tenant write triggers permit schema migrations but retain request-time tenant checks', async () => {
  const statements = [];
  const connection = {
    async query(sql) {
      statements.push(sql);
      if (sql.startsWith('SELECT ACTION_STATEMENT')) return [[{ ACTION_STATEMENT: 'legacy trigger body' }]];
      return [{ affectedRows: 0 }];
    },
  };

  await ensureTenantWriteTriggers(connection, 'tax_test', 'items');

  const triggerStatements = statements.filter((sql) => sql.startsWith('CREATE TRIGGER'));
  assert.equal(triggerStatements.length, 3);
  assert.ok(triggerStatements.every((sql) => sql.includes('@tax_schema_migration_context')));
  assert.ok(triggerStatements.some((sql) => sql.includes('Tenant context required for tenant data')));
  assert.ok(triggerStatements.some((sql) => sql.includes('Cross-tenant write rejected')));
});

test('tenant migration keeps unowned legacy users in the legacy company and preserves recorded owners', async () => {
  const statements = [];
  let nextCompanyId = 100;
  const connection = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.includes('SELECT id, name, enterprise_name, is_owner FROM users')) {
        return [[
          { id: 7, name: 'Staff User', enterprise_name: 'Legacy Company', is_owner: 0 },
          { id: 8, name: 'Recorded Owner', enterprise_name: null, is_owner: 1 },
        ]];
      }
      if (sql.includes('SELECT id FROM companies WHERE owner_user_id')) return [[]];
      if (sql.startsWith('INSERT INTO companies')) return [{ insertId: nextCompanyId++ }];
      return [{ affectedRows: 1 }];
    },
  };

  await assignUnlinkedUsers(connection, 24);

  assert.deepEqual(
    statements.filter(({ sql }) => sql.startsWith('INSERT INTO companies')).map(({ params }) => params),
    [[8, "Recorded Owner's Company"]]
  );
  assert.deepEqual(
    statements.filter(({ sql }) => sql.startsWith('UPDATE users SET company_id')).map(({ params }) => params),
    [[24, 7], [100, 8]]
  );
});

test('business identifiers and open-register constraints are unique per tenant', () => {
  assert.ok(TENANT_UNIQUE_KEYS.some(([table, column]) => table === 'fixed_asset_classes' && column === 'class_code'));
  assert.ok(TENANT_UNIQUE_KEYS.some(([table, column]) => table === 'cash_registers' && column === 'open_branch'));
  assert.ok(TENANT_UNIQUE_KEYS.some(([table, column]) => table === 'journal_entries' && column === 'entry_number'));
});

test('accounting database constraints prevent cross-company parent and ledger references', async () => {
  const statements = [];
  const connection = {
    async query(sql, params) {
      statements.push({ sql, params });
      return [[{ count: 0 }]];
    },
  };

  await ensureAccountingCompositeForeignKeys(connection, 'tax_test');

  const ddl = statements.filter(({ sql }) => sql.startsWith('ALTER TABLE'));
  assert.equal(ddl.length, 5);
  assert.ok(ddl.some(({ sql }) => sql.includes('uq_chart_accounts_company_id')));
  assert.ok(ddl.some(({ sql }) => sql.includes('uq_journal_entries_company_id')));
  assert.ok(ddl.some(({ sql }) => sql.includes('FOREIGN KEY (`company_id`, `parent_id`)')));
  assert.ok(ddl.some(({ sql }) => sql.includes('FOREIGN KEY (`company_id`, `journal_entry_id`)')));
  assert.ok(ddl.some(({ sql }) => sql.includes('FOREIGN KEY (`company_id`, `account_id`)')));
  assert.equal(TENANT_COMPOSITE_FOREIGN_KEYS.length, 4);
});

test('accounting migration refuses to add tenant constraints over cross-company links', async () => {
  let mismatchCheck = false;
  const connection = {
    async query(sql) {
      if (sql.startsWith('SELECT COUNT(*) AS count FROM chart_of_accounts child')) {
        mismatchCheck = true;
        return [[{ count: 1 }]];
      }
      return [[{ count: 0 }]];
    },
  };

  await assert.rejects(
    ensureAccountingCompositeForeignKeys(connection, 'tax_test'),
    /another company's data/
  );
  assert.equal(mismatchCheck, true);
});

test('fresh-install accounting tables enforce company ownership and same-company references', () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '../schema.sql'), 'utf8');
  const tableDefinition = (name) => {
    const match = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\(([\\s\\S]*?)\\n\\) ENGINE=InnoDB;`));
    assert.ok(match, `Missing ${name} table definition`);
    return match[1];
  };
  const accounts = tableDefinition('chart_of_accounts');
  const journals = tableDefinition('journal_entries');
  const lines = tableDefinition('journal_entry_lines');

  assert.match(accounts, /company_id BIGINT NOT NULL/);
  assert.match(accounts, /FOREIGN KEY \(company_id, parent_id\) REFERENCES chart_of_accounts\(company_id, id\)/);
  assert.match(journals, /company_id BIGINT NOT NULL/);
  assert.match(lines, /company_id BIGINT NOT NULL/);
  assert.match(lines, /FOREIGN KEY \(company_id, journal_entry_id\) REFERENCES journal_entries\(company_id, id\)/);
  assert.match(lines, /FOREIGN KEY \(company_id, account_id\) REFERENCES chart_of_accounts\(company_id, id\)/);
});
