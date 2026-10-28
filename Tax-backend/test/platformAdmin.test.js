const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../src/controllers/api.controller');
const { pool } = require('../src/db');
const { requireOwner, requireSuperAdmin } = require('../src/middleware/auth');

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

function route(path, method) {
  const layer = api.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} is registered`);
  return layer.route;
}

function routeHandler(path, method) {
  const registered = route(path, method);
  return registered.stack[registered.stack.length - 1].handle;
}

function databaseConnection(queryHandler, { onRollback = () => {} } = {}) {
  return {
    async beginTransaction() {},
    query: queryHandler,
    async commit() {},
    async rollback() { onRollback(); },
    release() {},
  };
}

test('platform user routes require Super Admin and company deletion requires the tenant owner', () => {
  const platformPatch = route('/superadmin/users/:id', 'patch');
  const platformDelete = route('/superadmin/users/:id', 'delete');
  const transferOptions = route('/superadmin/users/:id/ownership-transfer-options', 'get');
  const platformList = route('/superadmin/users', 'get');
  const companyDelete = route('/admin/users/:id', 'delete');

  assert.ok(platformPatch.stack.some((layer) => layer.handle === requireSuperAdmin));
  assert.ok(platformDelete.stack.some((layer) => layer.handle === requireSuperAdmin));
  assert.ok(transferOptions.stack.some((layer) => layer.handle === requireSuperAdmin));
  assert.ok(platformList.stack.some((layer) => layer.handle === requireSuperAdmin));
  assert.ok(companyDelete.stack.some((layer) => layer.handle === requireOwner));
  assert.equal(route('/admin/users/:id', 'delete').stack.some((layer) => layer.handle === requireSuperAdmin), false);
});

test('platform user list paginates and searches accounts across companies with audit logging', async () => {
  const handler = routeHandler('/superadmin/users', 'get');
  const originalQuery = pool.query;
  const statements = [];
  pool.query = async (sql, parameters = []) => {
    statements.push({ sql, parameters });
    if (sql.includes('COUNT(*) AS total_count')) return [[{ total_count: '15' }]];
    if (sql.includes('SELECT u.id, u.name, u.username')) {
      return [[{
        id: '22',
        name: 'Company Admin',
        username: 'company-admin',
        email: 'admin@example.test',
        role: 'staff',
        active: 1,
        status: 'ACTIVE',
        approval_status: 'approved',
        created_at: new Date('2026-02-03T00:00:00.000Z'),
        company_id: '7',
        is_owner: 0,
        permissions: { preset: 'manager', grants: ['workspace.access', 'accounting.read'] },
        owns_company: 1,
        company_name: 'Example Workspace',
      }]];
    }
    if (sql.includes('INSERT INTO platform_activity_logs')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const response = responseRecorder();
    await handler(
      { query: { page: '2', limit: '10', search: 'a%_!b' }, user: { id: 10, role: 'superadmin' } },
      response,
      (error) => { throw error; }
    );

    assert.deepEqual(response.body, {
      users: [{
        id: 22,
        name: 'Company Admin',
        username: 'company-admin',
        email: 'admin@example.test',
        role: 'staff',
        active: true,
        status: 'ACTIVE',
        approvalStatus: 'approved',
        createdAt: new Date('2026-02-03T00:00:00.000Z'),
        companyId: 7,
        companyName: 'Example Workspace',
        isOwner: true,
        permissions: { preset: 'manager', grants: ['workspace.access', 'accounting.read'] },
      }],
      totalCount: 15,
      page: 2,
      totalPages: 2,
    });
    const filteredQuery = statements[0];
    assert.match(filteredQuery.sql, /u\.username LIKE \? ESCAPE '!'/);
    assert.match(filteredQuery.sql, /c\.enterprise_name LIKE \? ESCAPE '!'/);
    assert.match(filteredQuery.sql, /c\.tin LIKE \? ESCAPE '!'/);
    assert.match(statements[1].sql, /owned\.owner_user_id = u\.id/);
    assert.deepEqual(filteredQuery.parameters, Array(15).fill('%a!%!_!!b%'));
    assert.match(statements[1].sql, /LIMIT \? OFFSET \?/);
    assert.deepEqual(statements[1].parameters, [...Array(15).fill('%a!%!_!!b%'), 10, 10]);
    assert.equal(statements[2].parameters[1], 'platform_users_viewed');
  } finally {
    pool.query = originalQuery;
  }
});

test('platform overview paginates and filters companies while retaining global summary and audit', async () => {
  const handler = routeHandler('/superadmin/overview', 'get');
  assert.ok(route('/superadmin/overview', 'get').stack.some((layer) => layer.handle === requireSuperAdmin));

  const originalQuery = pool.query;
  const statements = [];
  pool.query = async (sql, parameters = []) => {
    statements.push({ sql, parameters });
    if (sql.includes('COUNT(*) AS total_count')) return [[{ total_count: '41' }]];
    if (sql.includes('GROUP BY c.id')) {
      return [[{
        id: '7',
        enterprise_name: 'Example Workspace',
        created_at: new Date('2026-01-10T00:00:00.000Z'),
        user_count: '5',
        active_user_count: '3',
        owner_count: '2',
      }]];
    }
    if (sql.includes('AS total_companies')) {
      return [[{ total_companies: '41', total_users: '120', total_owners: '52' }]];
    }
    if (sql.includes('INSERT INTO platform_activity_logs')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const response = responseRecorder();
    let forwardedError;
    await handler(
      { query: { page: '2', limit: '10', search: 'Example' }, user: { id: 10, role: 'superadmin' } },
      response,
      (error) => { forwardedError = error; }
    );

    assert.equal(forwardedError, undefined);
    assert.deepEqual(response.body, {
      companies: [{
        id: 7,
        name: 'Example Workspace',
        createdAt: new Date('2026-01-10T00:00:00.000Z'),
        userCount: 5,
        activeUserCount: 3,
        ownerCount: 2,
      }],
      totalCount: 41,
      page: 2,
      totalPages: 5,
      summary: { totalCompanies: 41, totalUsers: 120, totalOwners: 52 },
    });
    assert.match(statements[0].sql, /enterprise_name LIKE \? ESCAPE '!'/);
    assert.deepEqual(statements[0].parameters, ['%Example%']);
    assert.match(statements[1].sql, /LIMIT \? OFFSET \?/);
    assert.deepEqual(statements[1].parameters, ['%Example%', 10, 10]);
    assert.match(statements[2].sql, /AS total_users/);
    assert.match(statements[3].sql, /INSERT INTO platform_activity_logs/);
    assert.equal(statements[3].parameters[1], 'platform_overview_viewed');
  } finally {
    pool.query = originalQuery;
  }
});

test('platform overview rejects invalid pagination before querying', async () => {
  const handler = routeHandler('/superadmin/overview', 'get');
  const originalQuery = pool.query;
  pool.query = async () => { throw new Error('Database should not be queried'); };
  try {
    const response = responseRecorder();
    await handler({ query: { page: '0' }, user: { id: 10, role: 'superadmin' } }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 400);
  } finally {
    pool.query = originalQuery;
  }
});

test('Super Admin cannot update, demote or deactivate the last active Super Admin', async (t) => {
  for (const changes of [{ name: 'Changed Name' }, { active: false }, { role: 'staff' }]) {
    await t.test(JSON.stringify(changes), async () => {
      const handler = routeHandler('/superadmin/users/:id', 'patch');
      const originalGetConnection = pool.getConnection;
      let rolledBack = false;
      const statements = [];
      pool.getConnection = async () => databaseConnection(async (sql) => {
        statements.push(sql);
        if (sql.includes('WHERE LOWER(role) = \'superadmin\' FOR UPDATE')) {
          return [[{ id: 11, active: 1, status: 'ACTIVE', approval_status: 'approved' }]];
        }
        if (sql.includes('FROM users WHERE id = ? FOR UPDATE')) {
          return [[{
            id: 11,
            name: 'System Admin',
            username: 'system-admin',
            email: 'system@example.test',
            role: 'superadmin',
            active: 1,
            status: 'ACTIVE',
            approval_status: 'approved',
            created_at: new Date(),
            company_id: 1,
            is_owner: 0,
          }]];
        }
        throw new Error(`Unexpected query: ${sql}`);
      }, { onRollback: () => { rolledBack = true; } });

      try {
        const response = responseRecorder();
        await handler(
          { params: { id: '11' }, body: changes, user: { id: 10, role: 'superadmin' } },
          response,
          (error) => { throw error; }
        );
        assert.equal(response.statusCode, 400);
        assert.match(response.body.message, /last active Super Admin/);
        assert.equal(rolledBack, true);
        assert.equal(statements.some((sql) => sql.startsWith('UPDATE users')), false);
      } finally {
        pool.getConnection = originalGetConnection;
      }
    });
  }
});

test('platform user updates audit the mutation', async () => {
  const handler = routeHandler('/superadmin/users/:id', 'patch');
  const originalGetConnection = pool.getConnection;
  const statements = [];
  pool.getConnection = async () => databaseConnection(async (sql, parameters) => {
    statements.push({ sql, parameters });
    if (sql.includes('WHERE LOWER(role) = \'superadmin\' FOR UPDATE')) {
      return [[{ id: 10, active: 1, status: 'ACTIVE', approval_status: 'approved' }]];
    }
    if (sql.includes('FROM users WHERE id = ? FOR UPDATE')) {
      return [[{
        id: 22,
        name: 'Company Admin',
        username: 'company-admin',
        email: 'admin@example.test',
        role: 'staff',
        active: 1,
        status: 'ACTIVE',
        approval_status: 'approved',
        created_at: new Date(),
        company_id: 7,
        is_owner: 0,
      }]];
    }
    if (sql.startsWith('UPDATE users SET')) return [{ affectedRows: 1 }];
    if (sql.includes('INSERT INTO platform_activity_logs')) return [{ affectedRows: 1 }];
    if (sql.includes('SELECT id, name, username, email, role, active, status')) {
      return [[{ id: 22, name: 'Updated Admin',       role: 'staff', company_id: 7 }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  try {
    const response = responseRecorder();
    await handler(
      { params: { id: '22' }, body: { name: 'Updated Admin' }, user: { id: 10, role: 'superadmin' } },
      response,
      (error) => { throw error; }
    );
    assert.equal(response.body.ok, true);
    const audit = statements.find(({ sql }) => sql.includes('INSERT INTO platform_activity_logs'));
    assert.ok(audit);
    assert.equal(audit.parameters[1], 'platform_user_updated');
    assert.deepEqual(JSON.parse(audit.parameters[4]), { companyId: 7, changes: ['name'] });
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test('platform user updates cannot create additional Super Admin accounts', async () => {
  const handler = routeHandler('/superadmin/users/:id', 'patch');
  const originalGetConnection = pool.getConnection;
  let rolledBack = false;
  pool.getConnection = async () => databaseConnection(async (sql) => {
    if (sql.includes('WHERE LOWER(role) = \'superadmin\' FOR UPDATE')) {
      return [[{ id: 10, active: 1, status: 'ACTIVE', approval_status: 'approved' }]];
    }
    if (sql.includes('FROM users WHERE id = ? FOR UPDATE')) {
      return [[{
        id: 22,
        name: 'Company User',
        username: 'company-user',
        email: 'user@example.test',
        role: 'staff',
        active: 1,
        status: 'ACTIVE',
        approval_status: 'approved',
        company_id: 7,
        is_owner: 0,
      }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  }, { onRollback: () => { rolledBack = true; } });

  try {
    const response = responseRecorder();
    await handler(
      { params: { id: '22' }, body: { role: 'superadmin' }, user: { id: 10, role: 'superadmin' } },
      response,
      (error) => { throw error; }
    );
    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /New Super Admin accounts cannot be created/);
    assert.equal(rolledBack, true);
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test('platform deletion audits a permitted cross-company user deletion', async () => {
  const handler = routeHandler('/superadmin/users/:id', 'delete');
  const originalGetConnection = pool.getConnection;
  const statements = [];
  pool.getConnection = async () => databaseConnection(async (sql, parameters) => {
    statements.push({ sql, parameters });
    if (sql.includes('WHERE LOWER(role) = \'superadmin\' FOR UPDATE')) {
      return [[{ id: 10, active: 1, status: 'ACTIVE', approval_status: 'approved' }]];
    }
    if (sql.includes('FROM users WHERE id = ? FOR UPDATE')) {
      return [[{
        id: 22,
        name: 'Company User',
        username: 'company-user',
        role: 'staff',
        company_id: 7,
        is_owner: 0,
        active: 1,
        status: 'ACTIVE',
        approval_status: 'approved',
      }]];
    }
    if (sql.includes('FROM companies WHERE owner_user_id = ?')) return [[]];
    if (sql.startsWith('DELETE FROM users')) return [{ affectedRows: 1 }];
    if (sql.includes('INSERT INTO platform_activity_logs')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });

  try {
    const response = responseRecorder();
    await handler(
      { params: { id: '22' }, user: { id: 10, role: 'superadmin' } },
      response,
      (error) => { throw error; }
    );

    assert.deepEqual(response.body, { ok: true, deleted: true, historicalRecordsPreserved: true });
    const audit = statements.find(({ sql }) => sql.includes('INSERT INTO platform_activity_logs'));
    assert.ok(audit);
    assert.equal(audit.parameters[1], 'platform_user_deleted');
    assert.deepEqual(JSON.parse(audit.parameters[4]), {
      companyId: 7,
      name: 'Company User',
      username: 'company-user',
      historicalRecordsPreserved: true,
    });
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test('ownership transfer options include only active approved users in the same company', async () => {
  const handler = routeHandler('/superadmin/users/:id/ownership-transfer-options', 'get');
  const originalQuery = pool.query;
  const statements = [];
  pool.query = async (sql, parameters = []) => {
    statements.push({ sql, parameters });
    if (sql.includes('SELECT id, company_id, is_owner FROM users')) {
      return [[{ id: 22, company_id: 7, is_owner: 1 }]];
    }
    if (sql.includes('FROM companies WHERE owner_user_id = ?')) {
      return [[{ id: 7, enterprise_name: 'Example Workspace' }]];
    }
    if (sql.includes("LOWER(role) = 'staff' AND is_owner = 0")) {
      return [[{ id: 23, name: 'Eligible User', username: 'eligible', company_id: 7 }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const response = responseRecorder();
    await handler({ params: { id: '22' } }, response, (error) => { throw error; });
    assert.deepEqual(response.body, {
      companies: [{ id: 7, name: 'Example Workspace' }],
      candidates: [{ id: 23, name: 'Eligible User', username: 'eligible', companyId: 7 }],
    });
    assert.deepEqual(statements[2].parameters, [7, 22]);
  } finally {
    pool.query = originalQuery;
  }
});

test('platform owner deletion transfers ownership before deleting the account', async () => {
  const handler = routeHandler('/superadmin/users/:id', 'delete');
  const originalGetConnection = pool.getConnection;
  const statements = [];
  pool.getConnection = async () => databaseConnection(async (sql, parameters = []) => {
    statements.push({ sql, parameters });
    if (sql.includes('WHERE LOWER(role) = \'superadmin\' FOR UPDATE')) {
      return [[{ id: 10, active: 1, status: 'ACTIVE', approval_status: 'approved' }]];
    }
    if (sql.includes('FROM users WHERE id = ? FOR UPDATE')) {
      return [[{
        id: 22,
        name: 'Company Owner',
        username: 'company-owner',
        role: 'owner',
        company_id: 7,
        is_owner: 1,
        active: 1,
        status: 'ACTIVE',
        approval_status: 'approved',
      }]];
    }
    if (sql.includes('FROM companies WHERE owner_user_id = ?')) {
      return [[{ id: 7, enterprise_name: 'Example Workspace' }]];
    }
    if (sql.includes('AND company_id = ? AND LOWER(role)')) {
      return [[{ id: 23, name: 'New Owner', username: 'new-owner' }]];
    }
    if (sql.startsWith('UPDATE companies SET owner_user_id')) return [{ affectedRows: 1 }];
    if (sql.startsWith('UPDATE users SET is_owner')) return [{ affectedRows: 1 }];
    if (sql.startsWith("UPDATE users SET role = 'owner'")) return [{ affectedRows: 1 }];
    if (sql.startsWith('DELETE FROM users')) return [{ affectedRows: 1 }];
    if (sql.includes('INSERT INTO platform_activity_logs')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });

  try {
    const response = responseRecorder();
    await handler(
      { params: { id: '22' }, body: { transferToUserId: 23 }, user: { id: 10, role: 'superadmin' } },
      response,
      (error) => { throw error; }
    );

    assert.deepEqual(response.body, {
      ok: true,
      deleted: true,
      historicalRecordsPreserved: true,
      ownershipTransferredTo: { userId: 23, name: 'New Owner', username: 'new-owner' },
    });
    assert.deepEqual(
      statements.filter(({ sql }) => sql.startsWith('UPDATE users SET is_owner')).map(({ parameters }) => parameters),
      [[22]]
    );
    assert.ok(statements.some(({ sql, parameters }) => (
      sql.startsWith('UPDATE companies SET owner_user_id')
      && parameters[0] === 23
      && parameters[1] === 7
      && parameters[2] === 22
    )));
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test('platform owner can be deleted without transferring company ownership', async () => {
  const handler = routeHandler('/superadmin/users/:id', 'delete');
  const originalGetConnection = pool.getConnection;
  const statements = [];
  pool.getConnection = async () => databaseConnection(async (sql, parameters = []) => {
    statements.push({ sql, parameters });
    if (sql.includes('WHERE LOWER(role) = \'superadmin\' FOR UPDATE')) {
      return [[{ id: 10, active: 1, status: 'ACTIVE', approval_status: 'approved' }]];
    }
    if (sql.includes('FROM users WHERE id = ? FOR UPDATE')) {
      return [[{
        id: 22,
        name: 'Company Owner',
        username: 'company-owner',
        role: 'owner',
        company_id: 7,
        is_owner: 1,
        active: 1,
        status: 'ACTIVE',
        approval_status: 'approved',
      }]];
    }
    if (sql.includes('FROM companies WHERE owner_user_id = ?')) {
      return [[{ id: 7, enterprise_name: 'Example Workspace' }]];
    }
    if (sql.startsWith('UPDATE companies SET owner_user_id = NULL')) return [{ affectedRows: 1 }];
    if (sql.startsWith('DELETE FROM users')) return [{ affectedRows: 1 }];
    if (sql.includes('INSERT INTO platform_activity_logs')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });

  try {
    const response = responseRecorder();
    await handler(
      { params: { id: '22' }, user: { id: 10, role: 'superadmin' } },
      response,
      (error) => { throw error; }
    );

    assert.deepEqual(response.body, { ok: true, deleted: true, historicalRecordsPreserved: true });
    const clearOwner = statements.findIndex(({ sql }) => sql.startsWith('UPDATE companies SET owner_user_id = NULL'));
    const deleteUser = statements.findIndex(({ sql }) => sql.startsWith('DELETE FROM users'));
    assert.ok(clearOwner >= 0);
    assert.ok(deleteUser > clearOwner);
    assert.deepEqual(statements[clearOwner].parameters, [22]);
    assert.equal(statements.some(({ sql }) => sql.includes('AND LOWER(role)') && sql.includes('FOR UPDATE')), false);
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test('platform deletion protects the last active Super Admin', async (t) => {
  for (const scenario of ['last-superadmin']) {
    await t.test(scenario, async () => {
      const handler = routeHandler('/superadmin/users/:id', 'delete');
      const originalGetConnection = pool.getConnection;
      let rolledBack = false;
      pool.getConnection = async () => databaseConnection(async (sql) => {
        if (sql.includes('WHERE LOWER(role) = \'superadmin\' FOR UPDATE')) {
          return [[{
            id: scenario === 'last-superadmin' ? 11 : 10,
            active: 1,
            status: 'ACTIVE',
            approval_status: 'approved',
          }]];
        }
        if (sql.includes('FROM users WHERE id = ? FOR UPDATE')) {
          return [[{
            id: 11,
            name: 'Target',
            username: 'target',
            role: scenario === 'owner' ? 'user' : 'superadmin',
            company_id: 7,
            is_owner: 0,
            active: 1,
            status: 'ACTIVE',
            approval_status: 'approved',
          }]];
        }
        if (sql.includes('FROM companies WHERE owner_user_id = ?')) {
          return [[scenario === 'owner' ? { id: 7 } : undefined].filter(Boolean)];
        }
        throw new Error(`Unexpected query: ${sql}`);
      }, { onRollback: () => { rolledBack = true; } });

      try {
        const response = responseRecorder();
        await handler(
          { params: { id: '11' }, user: { id: 10, role: 'superadmin' } },
          response,
          (error) => { throw error; }
        );
        assert.equal(response.statusCode, 400);
        assert.match(response.body.message, scenario === 'owner' ? /Select an eligible company user/ : /last active Super Admin/);
        assert.equal(rolledBack, true);
      } finally {
        pool.getConnection = originalGetConnection;
      }
    });
  }
});

test('company admin update and delete cannot access users from another company', async (t) => {
  for (const method of ['patch', 'delete']) {
    await t.test(method, async () => {
      const handler = routeHandler('/admin/users/:id', method);
      const originalQuery = pool.query;
      const originalGetConnection = pool.getConnection;
      let rolledBack = false;
      pool.query = async (sql, parameters) => {
        assert.match(sql, /WHERE id = \? AND company_id = \?/);
        assert.deepEqual(parameters, [99, 5]);
        return [[]];
      };
      pool.getConnection = async () => databaseConnection(async (sql, parameters) => {
        assert.match(sql, /WHERE id = \? AND company_id = \? FOR UPDATE/);
        assert.deepEqual(parameters, [99, 5]);
        return [[]];
      }, { onRollback: () => { rolledBack = true; } });

      try {
        const response = responseRecorder();
        const request = {
          params: { id: '99' },
          body: method === 'patch' ? { name: 'Another Tenant' } : {},
          user: { id: 12, role: 'owner', company_id: 5 },
          companyId: 5,
        };
        await handler(request, response, (error) => { throw error; });
        assert.equal(response.statusCode, 404);
        if (method === 'delete') assert.equal(rolledBack, true);
      } finally {
        pool.query = originalQuery;
        pool.getConnection = originalGetConnection;
      }
    });
  }
});

test('company admin cannot delete company owners or Super Admin accounts', async (t) => {
  for (const scenario of ['owner-flag', 'registered-owner', 'superadmin']) {
    await t.test(scenario, async () => {
      const handler = routeHandler('/admin/users/:id', 'delete');
      const originalGetConnection = pool.getConnection;
      let rolledBack = false;
      pool.getConnection = async () => databaseConnection(async (sql) => {
        if (sql.includes('FROM users')) {
          return [[{
            id: 99,
            name: 'Protected Account',
            username: 'protected',
            role: scenario === 'superadmin' ? 'superadmin' : 'staff',
            company_id: 5,
            is_owner: scenario === 'owner-flag' ? 1 : 0,
          }]];
        }
        if (sql.includes('FROM companies')) {
          return [[scenario === 'registered-owner' ? { id: 5 } : undefined].filter(Boolean)];
        }
        throw new Error(`Unexpected query: ${sql}`);
      }, { onRollback: () => { rolledBack = true; } });

      try {
        const response = responseRecorder();
        await handler(
          { params: { id: '99' }, user: { id: 12, role: 'owner' }, companyId: 5 },
          response,
          (error) => { throw error; }
        );
        assert.equal(response.statusCode, 400);
        assert.match(response.body.message, scenario === 'superadmin' ? /Super Admin account/ : /owner accounts/);
        assert.equal(rolledBack, true);
      } finally {
        pool.getConnection = originalGetConnection;
      }
    });
  }
});
