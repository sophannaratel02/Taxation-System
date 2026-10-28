const { runWithTenantCompany } = require('../services/tenantContext');
const { hasPermission, permissionForRequest } = require('../services/permissions');

function enforceTenantContext(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  const requestPath = `${req.baseUrl || ''}${req.path || ''}`.replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  if (role === 'superadmin') {
    if (requestPath.startsWith('/superadmin/') || requestPath === '/me') {
      req.companyId = null;
      return runWithTenantCompany(null, next);
    }
    return res.status(403).json({ message: 'Super Admin accounts cannot access tenant operations.' });
  }

  const companyId = Number(req.user?.company_id);
  if (!Number.isSafeInteger(companyId) || companyId < 1) {
    return res.status(403).json({ message: 'This account is not assigned to a company workspace.' });
  }

  const permission = permissionForRequest(requestPath, req.method, req.query);
  if (!hasPermission(req.user, permission)) {
    return res.status(403).json({ message: `Permission required: ${permission}` });
  }

  req.companyId = companyId;
  runWithTenantCompany(companyId, next);
}

module.exports = { enforceTenantContext };