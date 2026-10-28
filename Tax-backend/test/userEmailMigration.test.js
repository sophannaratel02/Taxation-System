const assert = require('node:assert/strict');
const test = require('node:test');
const { ensureUniqueUserEmailIndex } = require('../src/db');

test('duplicate legacy emails warn and allow startup without changing accounts', async () => {
  const statements = [];
  const warnings = [];
  const database = {
    async query(sql) {
      statements.push(sql);
      return [[{ normalized_email: 'hidden@example.test', account_count: 3 }]];
    },
  };
  const ensureIndex = async (...args) => statements.push(args);
  const logger = { warn: (message) => warnings.push(message) };

  const indexCreated = await ensureUniqueUserEmailIndex(database, ensureIndex, logger);

  assert.equal(indexCreated, false);
  assert.equal(statements.length, 1);
  assert.match(warnings[0], /shared by 3 accounts/);
  assert.doesNotMatch(warnings[0], /hidden@example\.test/);
});

test('unique user email index is added when no legacy duplicates exist', async () => {
  const database = {
    async query() {
      return [[]];
    },
  };
  const ensuredIndexes = [];
  const ensureIndex = async (...args) => ensuredIndexes.push(args);
  const logger = { warn() { assert.fail('no warning expected'); } };

  const indexCreated = await ensureUniqueUserEmailIndex(database, ensureIndex, logger);

  assert.equal(indexCreated, true);
  assert.deepEqual(ensuredIndexes, [['users', 'uq_users_email', 'email']]);
});
