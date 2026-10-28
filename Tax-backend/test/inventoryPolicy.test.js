const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_INVENTORY_POLICY,
  invalidateInventoryPolicyCache,
  loadInventoryPolicy,
} = require('../src/services/inventoryPolicy');
const { assertBranchAccess, getAuthorizedBranches } = require('../src/services/branchAuthorization');

test('inventory policy defaults to blocking negative stock, requiring admins and notes', async () => {
  invalidateInventoryPolicyCache();
  const connection = { query: async () => [[]] };
  assert.deepEqual(await loadInventoryPolicy(connection), DEFAULT_INVENTORY_POLICY);
});

test('inventory policy caches settings until explicitly invalidated', async () => {
  invalidateInventoryPolicyCache();
  let calls = 0;
  const connection = {
    query: async () => {
      calls += 1;
      return [[{ setting_value: { policy: { inventory: { negativeStockBlocked: false } } } }]];
    },
  };

  assert.deepEqual(await loadInventoryPolicy(connection), {
    negativeStockBlocked: false,
    adjustmentRequiresAdmin: true,
    auditNotesRequired: true,
  });
  assert.deepEqual(await loadInventoryPolicy(connection), {
    negativeStockBlocked: false,
    adjustmentRequiresAdmin: true,
    auditNotesRequired: true,
  });
  assert.equal(calls, 1);
  invalidateInventoryPolicyCache();
});

test('branch authorization rejects users without an exact assigned branch', async () => {
  const connection = {
    query: async () => [[{ branch: 'North' }]],
  };
  await assert.rejects(
    assertBranchAccess(connection, { id: 4, role: 'user' }, 'South'),
    { status: 403, message: 'Forbidden: Unauthorized branch access' }
  );
  assert.deepEqual(await getAuthorizedBranches(connection, { id: 4, role: 'user' }), ['North']);
});

test('company owners have access to every branch without a membership lookup', async () => {
  const connection = { query: async () => { throw new Error('unexpected branch lookup'); } };
  await assert.doesNotReject(assertBranchAccess(connection, { id: 1, role: 'owner' }, 'Any branch'));
  assert.equal(await getAuthorizedBranches(connection, { id: 1, role: 'owner' }), null);
});
