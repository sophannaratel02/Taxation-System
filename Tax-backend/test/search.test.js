const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../src/controllers/api.controller');
const { pool } = require('../src/db');

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

function routeHandler(path) {
  const layer = api.stack.find((entry) => entry.route?.path === path && entry.route.methods.get);
  assert.ok(layer, `GET ${path} is registered`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

test('item lookup searches each term across catalog and vendor details safely', async () => {
  const handler = routeHandler('/items');
  const originalQuery = pool.query;
  let statement;
  pool.query = async (sql, parameters) => {
    statement = { sql, parameters };
    return [[]];
  };

  try {
    const response = responseRecorder();
    await handler(
      { query: { search: 'bolt 12%_' }, user: { id: 1, role: 'owner' }, companyId: 7 },
      response,
      (error) => { throw error; }
    );

    assert.deepEqual(response.body, []);
    assert.match(statement.sql, /i\.category LIKE \? ESCAPE '!'/);
    assert.match(statement.sql, /v\.vat_tin LIKE \? ESCAPE '!'/);
    assert.equal(statement.parameters.length, 37);
    assert.ok(statement.parameters.includes('%12!%!_%'));
  } finally {
    pool.query = originalQuery;
  }
});

test('stock transaction search matches every term across movement context', async () => {
  const handler = routeHandler('/transactions');
  const originalQuery = pool.query;
  const statements = [];
  pool.query = async (sql, parameters) => {
    statements.push({ sql, parameters });
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 0 }]];
    return [[]];
  };

  try {
    const response = responseRecorder();
    await handler(
      {
        query: { search: 'adjustment branch-a' },
        user: { id: 1, role: 'owner' },
        companyId: 7,
      },
      response,
      (error) => { throw error; }
    );

    assert.equal(statements.length, 2);
    assert.match(statements[0].sql, /type LIKE \? ESCAPE '!'/);
    assert.match(statements[0].sql, /branch LIKE \? ESCAPE '!'/);
    assert.match(statements[0].sql, /DATE_FORMAT\(created_at/);
    assert.deepEqual(statements[0].parameters, [7, ...Array(8).fill('%adjustment%'), ...Array(8).fill('%branch-a%')]);
    assert.deepEqual(response.body, { data: [], total: 0, page: 1, totalPages: 0 });
  } finally {
    pool.query = originalQuery;
  }
});
