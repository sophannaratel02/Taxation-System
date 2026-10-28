const assert = require('node:assert/strict');
const test = require('node:test');
const { findUserForLogin } = require('../src/services/authentication');

test('login lookup accepts a registered username or email without case sensitivity', async () => {
  const expectedUser = { id: 1, username: 'sjenkins', email: 'sarah@example.test' };
  const calls = [];
  const database = {
    async query(sql, params) {
      calls.push({ sql, params });
      return [[expectedUser]];
    },
  };

  assert.equal(await findUserForLogin(database, ' SJENKINS '), expectedUser);
  assert.equal(await findUserForLogin(database, 'Sarah@Example.Test'), expectedUser);
  assert.match(calls[0].sql, /LOWER\(username\).*LOWER\(email\)/s);
  assert.deepEqual(calls.map(({ params }) => params), [
    ['SJENKINS', 'SJENKINS'],
    ['Sarah@Example.Test', 'Sarah@Example.Test'],
  ]);
});

test('email login finds an account stored with an internal username', async () => {
  const account = {
    id: 41,
    username: 'account-6a330539-45b0-4c0e-b016-fd77c2018819',
    email: 'owner@example.test',
  };
  const database = {
    async query(_sql, params) {
      assert.deepEqual(params, ['owner@example.test', 'owner@example.test']);
      return [[account]];
    },
  };

  assert.equal(await findUserForLogin(database, 'owner@example.test'), account);
});

test('login lookup rejects ambiguous identifiers and avoids queries for invalid identifiers', async () => {
  let queryCount = 0;
  const database = {
    async query() {
      queryCount += 1;
      return [[{ id: 1 }, { id: 2 }]];
    },
  };

  assert.equal(await findUserForLogin(database, 'shared@example.test'), null);
  assert.equal(await findUserForLogin(database, ''), null);
  assert.equal(await findUserForLogin(database, 'x'.repeat(255)), null);
  assert.equal(queryCount, 1);
});
