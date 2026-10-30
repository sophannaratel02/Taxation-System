const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const api = require('../src/controllers/api.controller');
const { authenticate, createAuthenticate, requireAdmin, requireAdminForWrites, requireSuperAdmin } = require('../src/middleware/auth');
const { pool } = require('../src/db');
const { resolveJwtSecret } = require('../src/config/runtime');
const {
  DEFAULT_ACCESS_POLICY,
  invalidateAccessPolicyCache,
  loadAccessPolicy,
  loginBlockMessage,
  passwordMeetsPolicy,
  registrationAccessState,
} = require('../src/services/accessPolicy');
const { invoiceCustomerMismatch, isSystemAdministrator } = require('../src/services/branchAuthorization');
const { effectiveAccountRole } = require('../src/services/authentication');
const {
  backfillZeroCostAdjustments,
  branchFilter,
  movementCostExpression,
} = require('../src/services/stockCost');
const { resolveReportDateRange } = require('../src/services/reportDateRange');

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

function routeHandler(path, method = 'get') {
  const route = api.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  assert.ok(route, `${method.toUpperCase()} ${path} is registered`);
  return route.route.stack[route.route.stack.length - 1].handle;
}

function authTestDatabase(account, accessOverrides = {}) {
  return {
    query: async (sql) => {
      if (sql.includes('FROM users')) return [[account]];
      if (sql.includes('FROM settings')) {
        return [[{
          setting_value: {
            policy: {
              access: {
                inactiveLoginBlocked: true,
                registrationRequiresApproval: false,
                passwordMinLength: 6,
                ...accessOverrides,
              },
            },
          },
        }]];
      }
      throw new Error(`Unexpected authentication query: ${sql}`);
    },
  };
}

test('sensitive read endpoints require the shared authentication middleware', () => {
  for (const path of ['/vendors', '/customers', '/invoices', '/invoices/:identifier']) {
    const route = api.stack.find((layer) => layer.route?.path === path && layer.route.methods.get);
    assert.ok(route, `GET ${path} is registered`);
    assert.ok(route.route.stack.some((handler) => handler.handle === authenticate), `GET ${path} requires authentication`);
  }
});

test('staff accounting access follows the assigned permission grants', () => {
  const response = responseRecorder();
  let continued = false;
  const next = () => { continued = true; };

  requireAdminForWrites({ method: 'GET', path: '/accounting/entries', user: { role: 'staff' } }, response, next);
  assert.equal(continued, true);

  continued = false;
  requireAdminForWrites({
    method: 'POST',
    path: '/accounting/entries',
    user: { role: 'staff', permissions: { preset: 'cashier', grants: ['workspace.access'] } },
  }, response, next);
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);

  requireAdminForWrites({ method: 'POST', path: '/accounting/entries', user: { role: 'admin' } }, response, next);
  assert.equal(continued, true);
});

test('owner accounts are distinct from staff and Super Admin', () => {
  assert.equal(isSystemAdministrator({ role: 'owner', is_owner: 1 }), true);
  assert.equal(isSystemAdministrator({ role: 'staff', is_owner: 0 }), false);
  assert.equal(isSystemAdministrator({ role: 'superadmin', is_owner: 0 }), false);
});

test('company-owner sign-ins use the owner role without downgrading Super Admin', () => {
  assert.equal(effectiveAccountRole({ role: 'admin', is_owner: 1 }), 'owner');
  assert.equal(effectiveAccountRole({ role: 'user', is_owner: 1 }), 'owner');
  assert.equal(effectiveAccountRole({ role: 'superadmin', is_owner: 1 }), 'superadmin');
  assert.equal(effectiveAccountRole({ role: 'admin', is_owner: 0 }), 'staff');
});

test('new accounts created through the users API are always assigned the staff role', async () => {
  const handler = routeHandler('/users', 'post');
  const originalGetConnection = pool.getConnection;
  const statements = [];
  const connection = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('FROM settings')) return [[{ setting_value: { policy: { access: { passwordMinLength: 8 } } } }]];
      if (sql.includes('FROM company_settings')) return [[{ setting_value: { branch: 'Main Branch' } }]];
      if (sql.startsWith('SELECT id FROM users')) return [[]];
      if (sql.startsWith('INSERT INTO users')) return [{ insertId: 81 }];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  pool.getConnection = async () => connection;
  try {
    const res = responseRecorder();
    let forwardedError;
    await handler(
      {
        body: {
          name: 'New User',
          position: 'Cashier',
          username: 'new-user',
          email: 'new-user@example.test',
          password: 'secure-password',
          role: 'admin',
          branches: ['Main Branch'],
        },
        companyId: 4,
        user: { id: 7, role: 'admin' },
      },
      res,
      (error) => { forwardedError = error; }
    );
    assert.equal(forwardedError, undefined);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.role, 'staff');
    assert.equal(res.body.position, 'Cashier');
    const insert = statements.find(({ sql }) => sql.startsWith('INSERT INTO users'));
    assert.equal(insert.params[4], 'staff');
    assert.equal(insert.params[8], 'Cashier');
    assert.equal(statements.some(({ sql }) => sql.includes('INSERT INTO activity_logs')), true);
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test('company settings accept and trim a named operating branch', async () => {
  const handler = routeHandler('/settings', 'put');
  const originalQuery = pool.query;
  let savedSettings;
  pool.query = async (sql, params) => {
    if (sql.includes('SELECT setting_value')) return [[]];
    if (sql.includes('INSERT INTO company_settings')) savedSettings = JSON.parse(params[2]);
    return [{ affectedRows: 1 }];
  };
  try {
    const res = responseRecorder();
    let forwardedError;
    await handler(
      { body: { branch: '  Phnom Penh Branch  ' }, companyId: 4, user: { id: 7 } },
      res,
      (error) => { forwardedError = error; }
    );
    assert.equal(forwardedError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(savedSettings.branch, 'Phnom Penh Branch');
    assert.equal(res.body.branch, 'Phnom Penh Branch');
  } finally {
    pool.query = originalQuery;
  }
});

test('company settings reject a blank or oversized operating branch', async () => {
  const handler = routeHandler('/settings', 'put');
  const originalQuery = pool.query;
  let queryCalled = false;
  pool.query = async () => {
    queryCalled = true;
    return [{ affectedRows: 1 }];
  };
  try {
    for (const branch of ['  ', 'B'.repeat(121)]) {
      const res = responseRecorder();
      await handler(
        { body: { branch }, companyId: 4, user: { id: 7 } },
        res,
        (error) => { throw error; }
      );
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /1 to 120 characters/i);
    }
    assert.equal(queryCalled, false);
  } finally {
    pool.query = originalQuery;
  }
});

test('invoice list queries are scoped to assigned branches and admins remain unrestricted', async () => {
  const handler = routeHandler('/invoices');
  const originalQuery = pool.query;
  const statements = [];
  try {
    pool.query = async (sql, params = []) => {
      statements.push({ sql, params });
      return statements.length === 1
        ? [[{ branch: 'North' }]]
        : [[]];
    };
    const res = responseRecorder();
    let forwardedError;
    await handler(
      { user: { id: 8, role: 'user', company_id: 5 }, companyId: 5, params: {}, query: {} },
      res,
      (error) => { forwardedError = error; }
    );
    assert.equal(forwardedError, undefined);
    assert.match(statements[1].sql, /i\.branch IN \(\?\)/);
    assert.deepEqual(statements[1].params, [5, ['North']]);

    statements.length = 0;
    pool.query = async (sql, params = []) => {
      statements.push({ sql, params });
      return statements.length === 1
        ? [[]]
        : [[]];
    };
    await handler(
      { user: { id: 8, role: 'user', company_id: 5 }, companyId: 5, params: {}, query: {} },
      responseRecorder(),
      (error) => { forwardedError = error; }
    );
    assert.equal(forwardedError, undefined);
    assert.match(statements[1].sql, /AND 1 = 0/);
    assert.deepEqual(statements[1].params, [5]);

    statements.length = 0;
    pool.query = async (sql, params = []) => {
      statements.push({ sql, params });
      return [[]];
    };
    await handler(
      { user: { id: 1, role: 'owner', company_id: 6 }, companyId: 6, params: {}, query: {} },
      responseRecorder(),
      (error) => { forwardedError = error; }
    );
    assert.equal(forwardedError, undefined);
    assert.doesNotMatch(statements[0].sql, /user_branch_access/);
    assert.doesNotMatch(statements[0].sql, /i\.branch IN/);
  } finally {
    pool.query = originalQuery;
  }
});

test('invoice detail rejects another branch before reading line items', async () => {
  const handler = routeHandler('/invoices/:identifier');
  const originalQuery = pool.query;
  const statements = [];
  try {
    pool.query = async (sql) => {
      statements.push(sql);
      if (statements.length === 1) return [[{ id: 42, branch: 'South' }]];
      if (statements.length === 2) return [[{ branch: 'North' }]];
      throw new Error('Invoice detail must not be queried for an unauthorized branch');
    };
    const res = responseRecorder();
    let forwardedError;
    await handler(
      { user: { id: 8, role: 'user', company_id: 5 }, companyId: 5, params: { identifier: 'INV-42' }, query: {} },
      res,
      (error) => { forwardedError = error; }
    );
    assert.equal(forwardedError.status, 403);
    assert.match(forwardedError.message, /Unauthorized branch access/);
    assert.equal(statements.length, 2);
  } finally {
    pool.query = originalQuery;
  }
});

test('authentication rejects deactivated accounts and refreshes current role from the database', async () => {
  const secret = resolveJwtSecret();
  const token = jwt.sign({ id: 19, role: 'admin', name: 'Old Name' }, secret);
  const res = responseRecorder();
  let nextCalled = false;
  await createAuthenticate(authTestDatabase({
      id: 19,
      name: 'Current Name',
      username: 'current-user',
      role: 'user',
      active: 0,
      approval_status: 'approved',
      company_id: 1,
    }))(
    { headers: { authorization: `Bearer ${token}` } },
    res,
    () => { nextCalled = true; }
  );
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /inactive/i);
  assert.equal(nextCalled, false);

  const refreshedRequest = { headers: { authorization: `Bearer ${token}` } };
  const refreshedResponse = responseRecorder();
  let refreshedError;
  await createAuthenticate(authTestDatabase({
      id: 19,
      name: 'Current Name',
      username: 'current-user',
      role: 'user',
      active: 1,
      approval_status: 'approved',
      company_id: 1,
    }))(
    refreshedRequest,
    refreshedResponse,
    (error) => { refreshedError = error; }
  );
  assert.equal(refreshedError, undefined);
  assert.equal(refreshedResponse.statusCode, 200);
  assert.equal(refreshedRequest.user.role, 'staff');
  assert.equal(refreshedRequest.user.name, 'Current Name');

  const deletedResponse = responseRecorder();
  await createAuthenticate({
    query: async (sql) => (sql.includes('FROM users') ? [[]] : authTestDatabase({}).query(sql)),
  })(
    { headers: { authorization: `Bearer ${token}` } },
    deletedResponse,
    () => assert.fail('Deleted account must not be authenticated')
  );
  assert.equal(deletedResponse.statusCode, 401);
  assert.match(deletedResponse.body.message, /no longer exists/);
});

test('inactive-account policy is consistent between login decision and authenticated requests', async () => {
  const token = jwt.sign({ id: 20, role: 'user' }, resolveJwtSecret());
  const inactiveAccount = {
    id: 20,
    name: 'Inactive User',
    username: 'inactive-user',
    role: 'user',
    active: 0,
    approval_status: 'approved',
    company_id: 1,
  };

  const enabledPolicy = { inactiveLoginBlocked: true };
  assert.match(loginBlockMessage(inactiveAccount, enabledPolicy), /account is inactive/i);
  const blockedResponse = responseRecorder();
  let blockedNextCalled = false;
  await createAuthenticate(authTestDatabase(inactiveAccount, enabledPolicy))(
    { headers: { authorization: `Bearer ${token}` } },
    blockedResponse,
    () => { blockedNextCalled = true; }
  );
  assert.equal(blockedResponse.statusCode, 401);
  assert.match(blockedResponse.body.message, /account is inactive/i);
  assert.equal(blockedNextCalled, false);

  const disabledPolicy = { inactiveLoginBlocked: false };
  assert.equal(loginBlockMessage(inactiveAccount, disabledPolicy), '');
  const allowedRequest = { headers: { authorization: `Bearer ${token}` } };
  const allowedResponse = responseRecorder();
  let allowedNextCalled = false;
  await createAuthenticate(authTestDatabase(inactiveAccount, disabledPolicy))(
    allowedRequest,
    allowedResponse,
    () => { allowedNextCalled = true; }
  );
  assert.equal(allowedNextCalled, true);
  assert.equal(allowedRequest.user.id, 20);
  assert.equal(allowedRequest.user.role, 'staff');
});

test('Super Admin uses platform routes while company administration remains company-scoped', () => {
  const response = responseRecorder();
  let continued = false;

  requireAdmin({ user: { role: 'superadmin' } }, response, () => { continued = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);

  continued = false;
  requireAdmin({ user: { role: 'owner', is_owner: 1 } }, response, () => { continued = true; });
  assert.equal(continued, true);

  continued = false;
  requireAdmin({
    method: 'PUT',
    path: '/settings/company',
    user: { role: 'staff', is_owner: 0, permissions: { preset: 'cashier', grants: ['workspace.access'] } },
  }, response, () => { continued = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);

  continued = false;
  requireSuperAdmin({ user: { role: 'admin' } }, response, () => { continued = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);

  response.statusCode = 200;
  requireSuperAdmin({ user: { role: 'superadmin' } }, response, () => { continued = true; });
  assert.equal(continued, true);
});

test('sales-by-staff endpoint returns 400 for invalid date ranges before querying data', async () => {
  const handler = routeHandler('/reports/sales-by-staff');
  const res = responseRecorder();
  let queryCalled = false;
  const originalQuery = pool.query;
  try {
    pool.query = async () => {
      queryCalled = true;
      return [[]];
    };
    await handler(
      { user: { id: 8, role: 'user' }, params: {}, query: { from: '2026-10-07', to: '2026-10-06' } },
      res,
      (error) => { throw error; }
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /on or before/);
    assert.equal(queryCalled, false);
  } finally {
    pool.query = originalQuery;
  }
});

test('access policy loads settings and enforces a bounded dynamic password length', async () => {
  const configured = await loadAccessPolicy({
    query: async () => [[{
      setting_value: JSON.stringify({
        policy: {
          access: {
            inactiveLoginBlocked: false,
            registrationRequiresApproval: true,
            passwordMinLength: 12,
          },
        },
      }),
    }]],
  });

  test('sales report date ranges reject malformed and reversed dates and default to this month', () => {
    assert.deepEqual(resolveReportDateRange('', '', new Date(2026, 9, 6)), {
      from: '2026-10-01',
      to: '2026-10-06',
    });
    assert.deepEqual(resolveReportDateRange('2026-10-01', '', new Date(2026, 9, 6)), {
      from: '2026-10-01',
      to: '2026-10-06',
    });
    assert.match(resolveReportDateRange('2026-02-30', '2026-03-01').error, /valid dates/);
    assert.match(resolveReportDateRange('2026/10/01', '2026-10-06').error, /YYYY-MM-DD/);
    assert.match(resolveReportDateRange('2026-10-07', '2026-10-06').error, /on or before/);
  });
  assert.deepEqual(configured, {
    inactiveLoginBlocked: false,
    registrationRequiresApproval: true,
    passwordMinLength: 12,
  });

  assert.deepEqual(await loadAccessPolicy({ query: async () => [[]] }), DEFAULT_ACCESS_POLICY);
  assert.equal((await loadAccessPolicy({
    query: async () => [[{ setting_value: { policy: { access: { passwordMinLength: 500 } } } }]],
  })).passwordMinLength, 128);
  assert.equal(passwordMeetsPolicy('123456789012', configured), true);
  assert.equal(passwordMeetsPolicy('short', configured), false);
  assert.deepEqual(registrationAccessState(configured), { active: 0, approvalStatus: 'pending' });
  assert.deepEqual(registrationAccessState(DEFAULT_ACCESS_POLICY), { active: 1, approvalStatus: 'approved' });
  assert.match(loginBlockMessage({ approval_status: 'pending', active: 0 }, configured), /waiting for administrator approval/);
  assert.match(loginBlockMessage(
    { approval_status: 'approved', active: 0, is_verified: 0 },
    { ...configured, inactiveLoginBlocked: true }
  ), /account is inactive/i);
  assert.equal(loginBlockMessage(
    { approval_status: 'approved', active: 1, is_verified: 0 },
    { ...configured, inactiveLoginBlocked: true }
  ), '');
  assert.match(loginBlockMessage(
    { approval_status: 'approved', active: 0 },
    { ...configured, inactiveLoginBlocked: true }
  ), /account is inactive/);
  assert.equal(loginBlockMessage({ approval_status: 'approved', active: 0 }, { ...configured, inactiveLoginBlocked: false }), '');
});

test('invoice payment ownership detects a mismatched customer', () => {
  assert.equal(invoiceCustomerMismatch({ customer_id: 8 }, 9), true);
  assert.equal(invoiceCustomerMismatch({ customer_id: 8 }, 8), false);
  assert.equal(invoiceCustomerMismatch({ customer_id: null }, 8), true);
  assert.equal(invoiceCustomerMismatch({ customer_id: 8 }, null), false);
});

test('branch filters scope assigned users, deny empty assignments and leave administrators unrestricted', () => {
  assert.deepEqual(branchFilter('invoice.branch', ['North', 'West']), {
    condition: ' AND invoice.branch IN (?)',
    params: [['North', 'West']],
  });
  assert.deepEqual(branchFilter('invoice.branch', []), {
    condition: ' AND 1 = 0',
    params: [],
  });
  assert.deepEqual(branchFilter('invoice.branch', null), { condition: '', params: [] });
});

test('stock adjustment fallback uses branch average, item average, then purchase cost', () => {
  const expression = movementCostExpression('st', 'item', 'branch_cost');
  assert.match(expression, /NULLIF\(st\.unit_cost, 0\)/);
  assert.match(expression, /NULLIF\(branch_cost\.avg_cost, 0\)/);
  assert.match(expression, /NULLIF\(item\.average_cost, 0\)/);
  assert.match(expression, /NULLIF\(item\.purchase_cost, 0\)/);
});

test('stock migration backfills opening batches and every zero-cost adjustment', async () => {
  const statements = [];
  await backfillZeroCostAdjustments({
    query: async (sql) => statements.push(sql),
  });
  assert.equal(statements.length, 2);
  assert.match(statements[0], /inventory_batches/);
  assert.match(statements[0], /reference LIKE 'OPENING-%'/);
  assert.match(statements[1], /LEFT JOIN item_branch_stock/);
  assert.match(statements[1], /movement\.type = 'Adjustment'/);
  assert.match(statements[1], /movement\.unit_cost IS NULL OR movement\.unit_cost = 0/);
});
