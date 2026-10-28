const assert = require('node:assert/strict');
const test = require('node:test');
const { getTenantCompanyId, runWithTenantCompany } = require('../src/services/tenantContext');

test('database tenant context distinguishes platform scope from missing context', async () => {
  assert.equal(getTenantCompanyId(7), 7);
  await new Promise((resolve, reject) => {
    runWithTenantCompany(null, () => {
      try {
        assert.equal(getTenantCompanyId(7), null);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
  await new Promise((resolve, reject) => {
    runWithTenantCompany(14, () => {
      try {
        assert.equal(getTenantCompanyId(7), 14);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
});
