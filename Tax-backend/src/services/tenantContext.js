const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

function getTenantCompanyId(fallback = null) {
  const companyId = storage.getStore();
  return companyId === undefined ? fallback : companyId;
}

function runWithTenantCompany(companyId, next) {
  storage.run(companyId === null || companyId === undefined ? null : Number(companyId), next);
}

module.exports = { getTenantCompanyId, runWithTenantCompany };
