const PERMISSIONS = Object.freeze([
  'workspace.access',
  'sales.read',
  'sales.write',
  'sales.register',
  'inventory.read',
  'inventory.write',
  'inventory.transfer',
  'purchases.read',
  'purchases.write',
  'accounting.read',
  'accounting.write',
  'tax.read',
  'tax.write',
  'reports.read',
  'approvals.manage',
  'documents.manage',
]);

const STAFF_PRESETS = Object.freeze({
  manager: [...PERMISSIONS],
  cashier: ['workspace.access', 'sales.read', 'sales.write', 'sales.register', 'inventory.read'],
  inventory: ['workspace.access', 'inventory.read', 'inventory.write', 'inventory.transfer', 'reports.read'],
  accountant: [
    'workspace.access',
    'sales.read',
    'purchases.read',
    'purchases.write',
    'accounting.read',
    'accounting.write',
    'tax.read',
    'tax.write',
    'reports.read',
  ],
});

function parsePermissions(value) {
  if (value === null || value === undefined || value === '') return { preset: 'cashier', grants: [...STAFF_PRESETS.cashier] };
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (Array.isArray(parsed)) {
    return { preset: 'custom', grants: parsed.filter((grant) => PERMISSIONS.includes(grant)) };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('User permissions must be a JSON object or array.');
  }
  const preset = STAFF_PRESETS[parsed.preset] ? parsed.preset : 'custom';
  const source = Array.isArray(parsed.grants) ? parsed.grants : STAFF_PRESETS[preset] || [];
  return {
    preset,
    grants: [...new Set(source.filter((grant) => PERMISSIONS.includes(grant)))],
  };
}

function buildPermissions(preset, grants) {
  if (preset !== 'custom' && !Object.hasOwn(STAFF_PRESETS, preset)) {
    throw new TypeError('A valid staff permission preset is required.');
  }
  if (!Array.isArray(grants)) throw new TypeError('Staff permissions must be an array.');
  const normalized = [...new Set(grants)];
  if (normalized.some((grant) => !PERMISSIONS.includes(grant))) {
    throw new TypeError('One or more staff permissions are invalid.');
  }
  return { preset, grants: normalized };
}

function hasPermission(user, permission) {
  const role = String(user?.role || '').toLowerCase();
  if (role === 'owner' || (role !== 'superadmin' && Number(user?.is_owner) === 1)) return true;
  if (role === 'admin') return permission !== 'staff.manage' && STAFF_PRESETS.manager.includes(permission);
  if (role === 'user') return STAFF_PRESETS.cashier.includes(permission);
  if (role !== 'staff') return false;
  return parsePermissions(user.permissions).grants.includes(permission);
}

function permissionForRequest(path, method, query) {
  const normalizedPath = String(path || '').replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  const verb = String(method || 'GET').toUpperCase();
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(verb);

  if (normalizedPath === '/transactions' && !write && query?.type === 'Purchase') return 'purchases.read';
  if (/^\/(users|admin\/users)(\/|$)/.test(normalizedPath)) return 'staff.manage';
  if (/^\/admin\/activity/.test(normalizedPath)) return 'approvals.manage';
  if (/^\/admin\/(projects|files|leave-requests)/.test(normalizedPath)) return 'approvals.manage';
  if (/^\/manager\/override(\/|$)/.test(normalizedPath)) return 'approvals.manage';
  if (/^\/settings(\/|$)/.test(normalizedPath)) return write ? 'company.manage' : 'workspace.access';
  if (/^\/company(\/|$)/.test(normalizedPath)) return write ? 'company.manage' : 'workspace.access';
  if (/^\/pos(\/|$)/.test(normalizedPath)) return 'sales.register';
  if (/^\/(sales|invoices|ar|register|khqr|customers|pos)(\/|$)/.test(normalizedPath)) {
    return /^\/register(\/|$)/.test(normalizedPath) ? 'sales.register' : write ? 'sales.write' : 'sales.read';
  }
  if (/^\/(items|stock|inventory|transactions)(\/|$)/.test(normalizedPath)) {
    if (/^\/inventory\/transfers/.test(normalizedPath)) return 'inventory.transfer';
    return write ? 'inventory.write' : 'inventory.read';
  }
  if (/^\/(vendors|purchase-orders|ap)(\/|$)/.test(normalizedPath)) return write ? 'purchases.write' : 'purchases.read';
  if (/^\/(accounting|fixed-assets)(\/|$)/.test(normalizedPath)) return write ? 'accounting.write' : 'accounting.read';
  if (/^\/(tax-periods|annual-tax-returns|taxes)(\/|$)/.test(normalizedPath)) return write ? 'tax.write' : 'tax.read';
  if (/^\/reports(\/|$)/.test(normalizedPath)) return 'reports.read';
  if (/^\/(projects|files|leave-requests)(\/|$)/.test(normalizedPath)) return 'documents.manage';
  if (/^\/notifications(\/|$)/.test(normalizedPath) || normalizedPath === '/me') return 'workspace.access';
  return write ? 'company.manage' : 'workspace.access';
}

module.exports = {
  PERMISSIONS,
  STAFF_PRESETS,
  buildPermissions,
  hasPermission,
  parsePermissions,
  permissionForRequest,
};
