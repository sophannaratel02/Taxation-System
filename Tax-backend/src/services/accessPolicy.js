const { pool } = require('../db');

const DEFAULT_ACCESS_POLICY = Object.freeze({
  inactiveLoginBlocked: true,
  registrationRequiresApproval: false,
  passwordMinLength: 6,
});

const ACCESS_POLICY_CACHE_TTL_MS = 5000;
let cachedPolicy = null;
let cacheExpiresAt = 0;
let pendingLoad = null;
let cacheVersion = 0;

function parseSettingValue(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value && typeof value === 'object' ? value : {};
}

async function loadAccessPolicy(connection) {
  if (connection === pool) {
    if (cachedPolicy && Date.now() < cacheExpiresAt) return cachedPolicy;
    if (pendingLoad) return pendingLoad;
  }

  const version = cacheVersion;
  const loading = (async () => {
    const [rows] = await connection.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      ['company']
    );
    const settings = rows[0] ? parseSettingValue(rows[0].setting_value) : {};
    const access = settings.policy?.access || {};
    const configuredPasswordMinLength = Number(access.passwordMinLength);
    const policy = Object.freeze({
      inactiveLoginBlocked: access.inactiveLoginBlocked !== false,
      registrationRequiresApproval: access.registrationRequiresApproval === true,
      passwordMinLength: Number.isFinite(configuredPasswordMinLength)
        ? Math.max(6, Math.min(128, Math.floor(configuredPasswordMinLength)))
        : DEFAULT_ACCESS_POLICY.passwordMinLength,
    });
    if (connection === pool && version === cacheVersion) {
      cachedPolicy = policy;
      cacheExpiresAt = Date.now() + ACCESS_POLICY_CACHE_TTL_MS;
    }
    return policy;
  })();

  if (connection !== pool) return loading;
  pendingLoad = loading;
  try {
    return await loading;
  } finally {
    if (pendingLoad === loading) pendingLoad = null;
  }
}

function invalidateAccessPolicyCache() {
  cachedPolicy = null;
  cacheExpiresAt = 0;
  cacheVersion += 1;
  pendingLoad = null;
}

function passwordMeetsPolicy(password, policy) {
  return Boolean(password) && String(password).length >= policy.passwordMinLength;
}

function registrationAccessState(policy) {
  return policy.registrationRequiresApproval
    ? { active: 0, approvalStatus: 'pending' }
    : { active: 1, approvalStatus: 'approved' };
}

function loginBlockMessage(user, policy) {
  if (user.approval_status === 'pending') {
    return 'Your account is waiting for administrator approval.';
  }
  if (!Number(user.active) && policy.inactiveLoginBlocked) {
    return 'This account is inactive. Contact an administrator.';
  }
  return '';
}

module.exports = {
  DEFAULT_ACCESS_POLICY,
  invalidateAccessPolicyCache,
  loadAccessPolicy,
  loginBlockMessage,
  passwordMeetsPolicy,
  registrationAccessState,
};
