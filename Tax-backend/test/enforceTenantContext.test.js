const assert = require('node:assert/strict');
const test = require('node:test');
const { enforceTenantContext } = require('../src/middleware/enforceTenantContext');

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('Super Admin can refresh their account but is blocked from tenant operations', () => {
  const meResponse = responseRecorder();
  let continued = false;
  enforceTenantContext(
    { baseUrl: '/api', path: '/me', method: 'GET', user: { role: 'superadmin' } },
    meResponse,
    () => { continued = true; }
  );
  assert.equal(continued, true);
  assert.equal(meResponse.statusCode, 200);

  const tenantResponse = responseRecorder();
  continued = false;
  enforceTenantContext(
    { baseUrl: '/api', path: '/sales', method: 'GET', user: { role: 'superadmin' } },
    tenantResponse,
    () => { continued = true; }
  );
  assert.equal(continued, false);
  assert.equal(tenantResponse.statusCode, 403);
});

test('staff requests remain assigned to their company and permission grants', () => {
  const response = responseRecorder();
  let continued = false;
  const request = {
    baseUrl: '/api',
    path: '/accounting/journal-entries',
    method: 'GET',
    user: {
      role: 'staff',
      company_id: 14,
      permissions: { preset: 'accountant', grants: ['accounting.read'] },
    },
  };

  enforceTenantContext(request, response, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(request.companyId, 14);

  const deniedResponse = responseRecorder();
  continued = false;
  enforceTenantContext(
    {
      baseUrl: '/api',
      path: '/accounting/journal-entries',
      method: 'POST',
      user: {
        role: 'staff',
        company_id: 14,
        permissions: { preset: 'cashier', grants: ['workspace.access'] },
      },
    },
    deniedResponse,
    () => { continued = true; }
  );
  assert.equal(continued, false);
  assert.equal(deniedResponse.statusCode, 403);
});

test('purchase-only movement history is available to purchase readers without exposing other stock movements', () => {
  const purchaseResponse = responseRecorder();
  let continued = false;
  enforceTenantContext(
    {
      baseUrl: '/api',
      path: '/transactions',
      method: 'GET',
      query: { type: 'Purchase' },
      user: {
        role: 'staff',
        company_id: 14,
        permissions: { preset: 'custom', grants: ['purchases.read'] },
      },
    },
    purchaseResponse,
    () => { continued = true; }
  );
  assert.equal(continued, true);

  const salesResponse = responseRecorder();
  continued = false;
  enforceTenantContext(
    {
      baseUrl: '/api',
      path: '/transactions',
      method: 'GET',
      query: { type: 'Sale' },
      user: {
        role: 'staff',
        company_id: 14,
        permissions: { preset: 'custom', grants: ['purchases.read'] },
      },
    },
    salesResponse,
    () => { continued = true; }
  );
  assert.equal(continued, false);
  assert.equal(salesResponse.statusCode, 403);
});