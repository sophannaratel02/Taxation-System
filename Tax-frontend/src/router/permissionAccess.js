export const staffPermissions = [
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
];

export const staffPresets = {
  manager: [...staffPermissions],
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
};

export const permissionLabels = {
  'workspace.access': { en: 'Workspace and notifications', km: 'ផ្ទាំងការងារ និងការជូនដំណឹង' },
  'sales.read': { en: 'View sales, invoices and customers', km: 'មើលការលក់ វិក្កយបត្រ និងអតិថិជន' },
  'sales.write': { en: 'Create sales and manage customer balances', km: 'បង្កើតការលក់ និងគ្រប់គ្រងសមតុល្យអតិថិជន' },
  'sales.register': { en: 'Operate cash registers', km: 'ប្រើប្រាស់ម៉ាស៊ីនគិតលុយ' },
  'inventory.read': { en: 'View items and stock', km: 'មើលទំនិញ និងស្តុក' },
  'inventory.write': { en: 'Manage items and stock adjustments', km: 'គ្រប់គ្រងទំនិញ និងការកែតម្រូវស្តុក' },
  'inventory.transfer': { en: 'Transfer stock between branches', km: 'ផ្ទេរស្តុករវាងសាខា' },
  'purchases.read': { en: 'View vendors and purchase orders', km: 'មើលអ្នកផ្គត់ផ្គង់ និងបញ្ជាទិញ' },
  'purchases.write': { en: 'Manage purchases and supplier payments', km: 'គ្រប់គ្រងការទិញ និងការទូទាត់ទៅអ្នកផ្គត់ផ្គង់' },
  'accounting.read': { en: 'View accounting and fixed assets', km: 'មើលគណនេយ្យ និងទ្រព្យសកម្មថេរ' },
  'accounting.write': { en: 'Manage accounting and fixed assets', km: 'គ្រប់គ្រងគណនេយ្យ និងទ្រព្យសកម្មថេរ' },
  'tax.read': { en: 'View tax records', km: 'មើលកំណត់ត្រាពន្ធ' },
  'tax.write': { en: 'Manage tax filings', km: 'គ្រប់គ្រងការដាក់លិខិតប្រកាសពន្ធ' },
  'reports.read': { en: 'View reports', km: 'មើលរបាយការណ៍' },
  'approvals.manage': { en: 'Review submissions and requests', km: 'ពិនិត្យការដាក់ស្នើ និងសំណើ' },
  'documents.manage': { en: 'Manage submissions and documents', km: 'គ្រប់គ្រងការដាក់ស្នើ និងឯកសារ' },
};

export function permissionsForUser(user) {
  const role = String(user?.role || '').toLowerCase();
  if (role === 'owner' || (role !== 'superadmin' && Number(user?.is_owner) === 1)) return [...staffPermissions];
  const raw = user?.permissions;
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (Array.isArray(parsed)) return parsed.filter((permission) => staffPermissions.includes(permission));
  if (parsed && typeof parsed === 'object') {
    const presetGrants = Object.hasOwn(staffPresets, parsed.preset) ? staffPresets[parsed.preset] : [];
    const grants = Array.isArray(parsed.grants) ? parsed.grants : presetGrants;
    return grants.filter((permission) => staffPermissions.includes(permission));
  }
  if (role === 'admin') return [...staffPresets.manager];
  return staffPresets.cashier;
}

export function permissionForPath(path, method = 'GET') {
  const normalizedPath = String(path || '').replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase());
  if (/^\/(settings\/users|users|admin\/users)(\/|$)/.test(normalizedPath)) return 'staff.manage';
  if (/^\/admin\/(activity|projects|files|leave-requests)/.test(normalizedPath)) return 'approvals.manage';
  if (/^\/(settings\/company|company\/profile)(\/|$)/.test(normalizedPath)) return 'company.manage';
  if (/^\/inventory\/items\/(?:new|\d+\/edit)$/.test(normalizedPath) || /^\/inventory\/adjustments(?:\/|$)/.test(normalizedPath)) return 'inventory.write';
  if (/^\/settings(\/|$)/.test(normalizedPath)) return write ? 'company.manage' : 'workspace.access';
  if (/^\/company(\/|$)/.test(normalizedPath)) return write ? 'company.manage' : 'workspace.access';
  if (/^\/pos(\/|$)/.test(normalizedPath)) return 'sales.register';
  if (/^\/(sales|invoices|ar|register|khqr)(\/|$)/.test(normalizedPath)) {
    return /^\/register(\/|$)/.test(normalizedPath) ? 'sales.register' : write ? 'sales.write' : 'sales.read';
  }
  if (/^\/(items|stock|inventory|transactions)(\/|$)/.test(normalizedPath)) {
    if (/^\/inventory\/transfers/.test(normalizedPath)) return 'inventory.transfer';
    return write ? 'inventory.write' : 'inventory.read';
  }
  if (/^\/(vendors|purchase-orders|ap)(\/|$)/.test(normalizedPath)) return write ? 'purchases.write' : 'purchases.read';
  if (/^\/(accounting|fixed-assets)(\/|$)/.test(normalizedPath)) return write ? 'accounting.write' : 'accounting.read';
  if (/^\/tax\/annual-filing(\/|$)/.test(normalizedPath)) return 'tax.write';
  if (/^\/(tax-periods|annual-tax-returns|taxes)(\/|$)/.test(normalizedPath)) return write ? 'tax.write' : 'tax.read';
  if (/^\/tax(\/|$)/.test(normalizedPath)) return write ? 'tax.write' : 'tax.read';
  if (/^\/reports(\/|$)/.test(normalizedPath)) return 'reports.read';
  if (/^\/(projects|files|leave-requests)(\/|$)/.test(normalizedPath)) return 'documents.manage';
  return 'workspace.access';
}

export function userHasPermission(user, permission) {
  const role = String(user?.role || '').toLowerCase();
  if (role === 'owner' || (role !== 'superadmin' && Number(user?.is_owner) === 1)) return true;
  if (role !== 'staff' && role !== 'user' && role !== 'admin') return false;
  if (role === 'admin' && permission === 'staff.manage') return false;
  return permissionsForUser(user).includes(permission);
}
