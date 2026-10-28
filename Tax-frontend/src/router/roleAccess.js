import { permissionForPath, userHasPermission } from './permissionAccess.js';

export function homeRouteName(user) {
  const role = String(user?.role || '').toLowerCase();
  if (role === 'superadmin') return 'SuperAdminDashboard';
  if (role === 'owner' || (role !== 'superadmin' && Number(user?.is_owner) === 1)) return 'AdminDashboard';
  return 'UserDashboard';
}

export function canAccessRoles(user, allowedRoles) {
  if (!user) return false;

  const role = String(user.role || '').toLowerCase();
  const roles = allowedRoles.map((allowedRole) => String(allowedRole).toLowerCase());
  if (role === 'superadmin') return roles.includes('superadmin');
  if (role === 'owner' || (role !== 'superadmin' && Number(user.is_owner) === 1)) return !roles.includes('superadmin');
  if (role === 'staff' || role === 'user' || role === 'admin') {
    return roles.includes('staff') || roles.includes('user') || roles.includes('admin');
  }
  return false;
}

export function canAccessRoute(user, routeName, allowedRoles, path) {
  if (String(user?.role || '').toLowerCase() === 'superadmin') {
    return ['SuperAdminDashboard', 'NotFound'].includes(routeName);
  }
  if (!canAccessRoles(user, allowedRoles || ['owner', 'staff', 'user', 'admin'])) return false;
  const permission = permissionForPath(path);
  if (permission === 'staff.manage') return String(user?.role || '').toLowerCase() === 'owner';
  return userHasPermission(user, permission);
}
