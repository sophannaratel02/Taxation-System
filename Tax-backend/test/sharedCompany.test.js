const assert = require('node:assert/strict');
const test = require('node:test');
const { getSharedCompanyId } = require('../src/services/sharedCompany');
const { getOrCreateOwnedCompany } = require('../src/services/companyProfile');

test('new accounts use the primary owner company', async () => {
  const calls = [];
  const connection = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes('FROM users')) return [[{ id: 1, company_id: 24 }]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  assert.equal(await getSharedCompanyId(connection), 24);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /LOWER\(role\) = 'owner'/);
});

test('shared company bootstrap creates and assigns an owner company when missing', async () => {
  const calls = [];
  const connection = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes('FROM users')) {
        return [[{ id: 1, name: 'Company Owner', enterprise_name: null, office_phone: null, email: 'owner@example.test', company_id: null }]];
      }
      if (sql.includes('FROM companies')) return [[]];
      if (sql.includes('FROM settings')) return [[{ setting_value: { companyName: 'Shared Business', phone: '12345678' } }]];
      if (sql.includes('INSERT INTO companies')) return [{ insertId: 42 }];
      if (sql.includes('UPDATE users')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  assert.equal(await getSharedCompanyId(connection), 42);
  const insert = calls.find(({ sql }) => sql.includes('INSERT INTO companies'));
  assert.deepEqual(insert.values, [1, 'Shared Business', '12345678', 'owner@example.test']);
  assert.ok(calls.some(({ sql, values }) => sql.includes('UPDATE users') && values[0] === 42));
});

test('shared company resolution reports a configuration error when no owner exists', async () => {
  const connection = { async query() { return [[]]; } };

  await assert.rejects(
    getSharedCompanyId(connection),
    (error) => error.status === 503 && /shared company is not configured/i.test(error.message)
  );
});

test('unassigned staff cannot fall back into another company workspace', async () => {
  const connection = {
    async query(sql) {
      if (sql.includes('FROM companies WHERE owner_user_id')) return [[]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await assert.rejects(
    getOrCreateOwnedCompany(connection, { id: 8, role: 'staff', company_id: null }, true),
    (error) => error.status === 403 && /not assigned to a company/i.test(error.message)
  );
});
