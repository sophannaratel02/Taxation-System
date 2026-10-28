import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessRoles, canAccessRoute, homeRouteName } from '../src/router/roleAccess.js';
import { permissionForPath, userHasPermission } from '../src/router/permissionAccess.js';

test('Super Admin lands on the platform dashboard and cannot enter company admin routes', () => {
  const user = { role: 'superadmin', is_owner: 0 };

  assert.equal(homeRouteName(user), 'SuperAdminDashboard');
  assert.equal(canAccessRoles(user, ['superadmin']), true);
  assert.equal(canAccessRoles(user, ['admin']), false);
  assert.equal(canAccessRoles(user, ['user']), false);
  assert.equal(canAccessRoute(user, 'SuperAdminDashboard'), true);
  assert.equal(canAccessRoute(user, 'POS'), false);
  assert.equal(canAccessRoute(user, 'UserSettings'), false);
});

test('owners and staff use tenant dashboards and role access', () => {
  assert.equal(homeRouteName({ role: 'owner' }), 'AdminDashboard');
  assert.equal(homeRouteName({ role: 'staff' }), 'UserDashboard');
  assert.equal(canAccessRoles({ role: 'owner' }, ['owner']), true);
  assert.equal(canAccessRoles({ role: 'owner' }, ['superadmin']), false);
  assert.equal(canAccessRoles({ role: 'staff' }, ['owner']), false);
  assert.equal(canAccessRoles({ role: 'staff' }, ['staff']), true);
});

test('staff route access follows grants and legacy owner flags stay compatible', () => {
  const staff = { role: 'staff', permissions: { preset: 'custom', grants: ['inventory.write'] } };
  assert.equal(canAccessRoute(staff, 'EditItem', ['owner', 'staff'], '/inventory/items/1/edit'), true);
  assert.equal(canAccessRoute(staff, 'UserSettings', ['owner'], '/settings/users'), false);
  assert.equal(userHasPermission({ role: 'user', is_owner: 1 }, 'staff.manage'), true);
  assert.equal(permissionForPath('/transactions'), 'inventory.read');
});
