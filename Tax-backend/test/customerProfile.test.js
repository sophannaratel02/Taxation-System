const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../src/controllers/api.controller');
const { pool } = require('../src/db');
const { authenticate, requireAdmin } = require('../src/middleware/auth');
const { mapCustomer, prepareCustomerProfile } = require('../src/services/customerProfile');

function endpoint(path, method) {
  const route = api.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods[method]
  )?.route;
  assert.ok(route, `${method.toUpperCase()} ${path} is registered`);
  return route.stack.at(-1).handle;
}

function responseRecorder() {
  return {
    statusCode: 200,
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

test('customer profile normalizes and retains address, representative, and email', () => {
  const profile = prepareCustomerProfile({
    name: 'Example Customer',
    address: '  Phnom Penh  ',
    representative: '  Dara Sok  ',
    email: ' SALES@EXAMPLE.TEST ',
    phone: '+855 12 345 678',
  });

  assert.equal(profile.name, 'Example Customer');
  assert.equal(profile.address, 'Phnom Penh');
  assert.equal(profile.representative, 'Dara Sok');
  assert.equal(profile.email, 'sales@example.test');
});

test('customer profile rejects invalid email and oversized fields', () => {
  const payload = { name: 'Example Customer' };
  assert.throws(() => prepareCustomerProfile({ ...payload, name: ' ' }), /Company name is required/);
  assert.throws(() => prepareCustomerProfile({ ...payload, email: 'not-an-email' }), /valid customer email address/);
  assert.throws(() => prepareCustomerProfile({ ...payload, representative: 'x'.repeat(181) }), /Representative cannot exceed 180/);
  assert.throws(() => prepareCustomerProfile({ ...payload, address: 'x'.repeat(5001) }), /Address cannot exceed 5000/);
});

test('customer API mapper exposes new profile fields and legacy rows as empty strings', () => {
  const mapped = mapCustomer({
    id: 7,
    name: 'Example Customer',
    phone: null,
    address: 'Phnom Penh',
    representative: 'Dara Sok',
    email: 'sales@example.test',
    vat_tin: null,
    deposit: '0.00',
    reward_points: 0,
    balance: '0.00',
    credit_limit: '100.00',
  });

  assert.equal(mapped.address, 'Phnom Penh');
  assert.equal(mapped.representative, 'Dara Sok');
  assert.equal(mapped.email, 'sales@example.test');
  assert.equal(mapped.phone, '');
});

test('authenticated staff can create customers while edits and deletes remain admin-only', () => {
  const getRoute = (path, method) => api.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods[method]
  )?.route;
  const create = getRoute('/customers', 'post');
  const update = getRoute('/customers/:id', 'put');
  const remove = getRoute('/customers/:id', 'delete');

  assert.ok(create);
  assert.ok(create.stack.some((handler) => handler.handle === authenticate));
  assert.ok(!create.stack.some((handler) => handler.handle === requireAdmin));
  assert.ok(update.stack.some((handler) => handler.handle === requireAdmin));
  assert.ok(remove.stack.some((handler) => handler.handle === requireAdmin));
});

test('customer creation persists and returns every customer profile field', async () => {
  const handler = endpoint('/customers', 'post');
  const originalQuery = pool.query;
  const calls = [];
  const customerRow = {
    id: 42,
    name: 'Example Company',
    phone: '+855 12 345 678',
    address: 'Phnom Penh',
    representative: 'Dara Sok',
    email: 'sales@example.test',
    vat_tin: 'TIN-42',
    deposit: '25.00',
    reward_points: 0,
    balance: '0.00',
    credit_limit: '100.00',
  };

  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return calls.length === 1
      ? [{ insertId: 42 }]
      : [[customerRow]];
  };

  const res = responseRecorder();
  let nextError;
  try {
    await handler({
      body: {
        name: 'Example Company',
        phone: '+855 12 345 678',
        address: 'Phnom Penh',
        representative: 'Dara Sok',
        email: 'SALES@example.test',
        vatTin: 'TIN-42',
        deposit: 25,
        creditLimit: 100,
      },
    }, res, (error) => { nextError = error; });
  } finally {
    pool.query = originalQuery;
  }

  assert.ifError(nextError);
  assert.equal(res.statusCode, 201);
  assert.equal(calls[0].params[0], 'Example Company');
  assert.equal(calls[0].params[2], 'Phnom Penh');
  assert.equal(calls[0].params[3], 'Dara Sok');
  assert.equal(calls[0].params[4], 'sales@example.test');
  assert.equal(res.body.address, 'Phnom Penh');
  assert.equal(res.body.representative, 'Dara Sok');
  assert.equal(res.body.email, 'sales@example.test');
  assert.equal(res.body.vatTin, 'TIN-42');
  assert.equal(res.body.deposit, 25);
  assert.equal(res.body.creditLimit, 100);
});

test('saving unchanged customer data still returns the stored customer', async () => {
  const handler = endpoint('/customers/:id', 'put');
  const originalQuery = pool.query;
  let callCount = 0;
  const customerRow = {
    id: 42,
    name: 'Example Company',
    phone: '',
    address: '',
    representative: '',
    email: '',
    vat_tin: '',
    deposit: '0.00',
    reward_points: 0,
    balance: '0.00',
    credit_limit: '0.00',
  };

  pool.query = async () => {
    callCount += 1;
    if (callCount === 1) return [{ affectedRows: 0 }];
    if (callCount === 2) return [[{ id: 42 }]];
    return [[customerRow]];
  };

  const res = responseRecorder();
  let nextError;
  try {
    await handler({
      params: { id: '42' },
      body: { name: 'Example Company' },
    }, res, (error) => { nextError = error; });
  } finally {
    pool.query = originalQuery;
  }

  assert.ifError(nextError);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, 42);
  assert.equal(res.body.name, 'Example Company');
});
