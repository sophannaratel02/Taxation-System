const jwt = require('jsonwebtoken');
const { resolveJwtSecret } = require('../config/runtime');
const { pool } = require('../db');
const { loadAccessPolicy, loginBlockMessage } = require('../services/accessPolicy');
const { effectiveAccountRole } = require('../services/authentication');
const { enforceTenantContext } = require('./enforceTenantContext');

const jwtSecret = resolveJwtSecret();

function createAuthenticate(database = pool) {
  return async function authenticate(req, res, next) {
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return res.status(401).json({ message: 'Authentication required' });

    let tokenUser;
    try {
      tokenUser = jwt.verify(token, jwtSecret);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    if (!Number.isSafeInteger(Number(tokenUser.id)) || Number(tokenUser.id) < 1) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    try {
      const [rows] = await database.query(
        'SELECT id, name, username, role, active, approval_status, is_verified, status, company_id, is_owner, permissions, created_by_user_id FROM users WHERE id = ? LIMIT 1',
        [tokenUser.id]
      );
      const account = rows[0];
      if (!account) return res.status(401).json({ message: 'Account no longer exists' });
      const accessPolicy = await loadAccessPolicy(database);
      const blockMessage = loginBlockMessage(account, accessPolicy);
      if (blockMessage) return res.status(401).json({ message: blockMessage });

      req.user = {
        ...tokenUser,
        id: Number(account.id),
        name: account.name,
        username: account.username,
        role: effectiveAccountRole(account),
        is_verified: Number(account.is_verified),
        status: account.status,
        company_id: account.company_id === null ? null : Number(account.company_id),
        is_owner: Number(account.is_owner || 0),
        permissions: account.permissions,
        created_by_user_id: account.created_by_user_id === null ? null : Number(account.created_by_user_id),
      };
      return enforceTenantContext(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

const authenticate = createAuthenticate();

function requireAdmin(req, res, next) {
  const { hasPermission, permissionForRequest } = require('../services/permissions');
  const permission = permissionForRequest(`${req.baseUrl || ''}${req.path || ''}`, req.method);
  if (hasPermission(req.user, permission)) return next();
  return res.status(403).json({ message: 'You do not have permission to perform this action.' });
}

function requireOwner(req, res, next) {
  if (String(req.user?.role || '').toLowerCase() !== 'owner') {
    return res.status(403).json({ message: 'Company owner access required' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (String(req.user?.role || '').toLowerCase() !== 'superadmin') {
    return res.status(403).json({ message: 'Super Admin access required' });
  }
  next();
}

function requireAdminForWrites(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return requireAdmin(req, res, next);
}

module.exports = { authenticate, createAuthenticate, requireAdmin, requireAdminForWrites, requireOwner, requireSuperAdmin };
