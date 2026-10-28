const assert = require('node:assert/strict');
const test = require('node:test');
const {
  STAFF_PRESETS,
  buildPermissions,
  hasPermission,
  permissionForRequest,
} = require('../src/services/permissions');

test('staff permissions are limited to configured grants while owners retain tenant-wide access', () => {
  const cashier = { role: 'staff', permissions: { preset: 'cashier', grants: ['sales.read'] } };
  assert.equal(hasPermission(cashier, 'sales.read'), true);
  assert.equal(hasPermission(cashier, 'sales.write'), false);
  assert.equal(hasPermission(cashier, 'staff.manage'), false);
  assert.equal(hasPermission({ role: 'owner' }, 'staff.manage'), true);
  assert.equal(hasPermission({ role: 'superadmin' }, 'workspace.access'), false);
});

test('manager preset grants operational access including the workspace', () => {
  assert.ok(STAFF_PRESETS.manager.includes('workspace.access'));
  assert.ok(STAFF_PRESETS.manager.includes('approvals.manage'));
  assert.equal(STAFF_PRESETS.manager.includes('policy.write'), false);
  assert.equal(hasPermission({ role: 'staff', permissions: { preset: 'manager', grants: STAFF_PRESETS.manager } }, 'approvals.manage'), true);
  assert.equal(hasPermission({ role: 'staff', permissions: { preset: 'custom', grants: ['policy.write'] } }, 'policy.write'), false);
});

test('owners can configure custom permission grants without changing role', () => {
  assert.deepEqual(buildPermissions('custom', ['inventory.read', 'reports.read']), {
    preset: 'custom',
    grants: ['inventory.read', 'reports.read'],
  });
  assert.throws(() => buildPermissions('custom', ['company.manage']), /permissions are invalid/i);
});

test('request permissions separate tenant management from operational settings and actions', () => {
  assert.equal(permissionForRequest('/api/users', 'POST'), 'staff.manage');
  assert.equal(permissionForRequest('/api/settings', 'PUT'), 'company.manage');
  assert.equal(permissionForRequest('/api/pos/register', 'POST'), 'sales.register');
  assert.equal(permissionForRequest('/api/transactions', 'GET'), 'inventory.read');
  assert.equal(permissionForRequest('/api/transactions', 'GET', { type: 'Purchase' }), 'purchases.read');
  assert.equal(permissionForRequest('/api/transactions', 'GET', { type: 'Sale' }), 'inventory.read');
  assert.equal(permissionForRequest('/api/accounting/journal-entries', 'POST'), 'accounting.write');
  assert.equal(permissionForRequest('/api/unmapped-write', 'POST'), 'company.manage');
});
