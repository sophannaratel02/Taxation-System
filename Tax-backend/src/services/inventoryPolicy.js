const DEFAULT_INVENTORY_POLICY = Object.freeze({
  negativeStockBlocked: true,
  adjustmentRequiresAdmin: true,
  auditNotesRequired: true,
});

const POLICY_CACHE_TTL_MS = 5000;
let cachedPolicy = null;
let cacheExpiresAt = 0;
let pendingLoad = null;
let cacheVersion = 0;

function parseSettingValue(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value && typeof value === 'object' ? value : {};
}

async function loadInventoryPolicy(connection) {
  if (cachedPolicy && Date.now() < cacheExpiresAt) return cachedPolicy;
  if (pendingLoad) return pendingLoad;

  const version = cacheVersion;
  const loading = (async () => {
    const [rows] = await connection.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      ['company']
    );
    const settings = rows[0] ? parseSettingValue(rows[0].setting_value) : {};
    const inventory = settings.policy?.inventory || {};
    const policy = Object.freeze({
      negativeStockBlocked: inventory.negativeStockBlocked !== false,
      adjustmentRequiresAdmin: inventory.adjustmentRequiresAdmin !== false,
      auditNotesRequired: inventory.auditNotesRequired !== false,
    });
    if (version === cacheVersion) {
      cachedPolicy = policy;
      cacheExpiresAt = Date.now() + POLICY_CACHE_TTL_MS;
    }
    return policy;
  })();
  pendingLoad = loading;

  try {
    return await loading;
  } finally {
    if (pendingLoad === loading) pendingLoad = null;
  }
}

function invalidateInventoryPolicyCache() {
  cachedPolicy = null;
  cacheExpiresAt = 0;
  cacheVersion += 1;
  pendingLoad = null;
}

module.exports = {
  DEFAULT_INVENTORY_POLICY,
  invalidateInventoryPolicyCache,
  loadInventoryPolicy,
};
