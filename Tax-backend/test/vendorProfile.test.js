const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../src/controllers/api.controller');
const { pool } = require('../src/db');

const completeProfile = {
  name: '  Example Supplies Ltd. ',
  contactName: '  Dara Sok ',
  vatTin: ' TIN-12345 ',
  address: ' Phnom Penh, Cambodia ',
  phone: '+855 12 345 678',
  alternatePhone: '+855 23 456 789',
  email: ' SALES@EXAMPLE.TEST ',
  creditLimit: 250,
  note: ' Weekly delivery ',
};

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

test('vendor profile trims and normalizes all contact fields', () => {
  assert.deepEqual(api.prepareVendorProfile(completeProfile), {
    name: 'Example Supplies Ltd.',
    contactName: 'Dara Sok',
    vatTin: 'TIN-12345',
    address: 'Phnom Penh, Cambodia',
    phone: '+855 12 345 678',
    alternatePhone: '+855 23 456 789',
    email: 'sales@example.test',
    creditLimit: 250,
    note: 'Weekly delivery',
  });
});

test('vendor profile requires complete contact details and a valid email', () => {
  for (const field of ['name', 'contactName', 'vatTin', 'address', 'phone', 'email']) {
    assert.throws(
      () => api.prepareVendorProfile({ ...completeProfile, [field]: ' ' }),
      /required|valid vendor email/
    );
  }
  assert.throws(
    () => api.prepareVendorProfile({ ...completeProfile, email: 'invalid-email' }),
    /valid vendor email/
  );
});

test('vendor profile allows an omitted alternate phone number', () => {
  assert.equal(
    api.prepareVendorProfile({ ...completeProfile, alternatePhone: ' ' }).alternatePhone,
    ''
  );
});

test('vendor profile defaults fields omitted from Add Vendor', () => {
  const profile = api.prepareVendorProfile({
    name: 'New Vendor',
    contactName: 'Dara Sok',
    vatTin: 'TIN-12345',
    address: 'Phnom Penh, Cambodia',
    phone: '+855 12 345 678',
    email: 'sales@example.test',
  });

  assert.equal(profile.alternatePhone, '');
  assert.equal(profile.creditLimit, 0);
  assert.equal(profile.note, '');
});

test('vendor profile updates can retain incomplete legacy contact details', () => {
  const profile = api.prepareVendorProfile({
    name: 'Legacy Supplier',
    contactName: '',
    vatTin: '',
    address: '',
    phone: '',
    email: '',
  }, { requireComplete: false });

  assert.equal(profile.name, 'Legacy Supplier');
  assert.equal(profile.email, '');
  assert.throws(
    () => api.prepareVendorProfile({
      name: 'Legacy Supplier',
      email: 'not-an-email',
    }, { requireComplete: false }),
    /valid vendor email/
  );
});

test('vendor profile enforces database field lengths', () => {
  assert.throws(
    () => api.prepareVendorProfile({ ...completeProfile, name: 'x'.repeat(161) }),
    /Company name cannot exceed 160/
  );
  assert.throws(
    () => api.prepareVendorProfile({ ...completeProfile, address: 'x'.repeat(5001) }),
    /Address cannot exceed 5000/
  );
});

test('vendor creation persists and returns the complete company profile', async () => {
  const handler = endpoint('/vendors', 'post');
  const originalQuery = pool.query;
  const calls = [];
  const vendorRow = {
    id: 42,
    name: 'Example Supplies Ltd.',
    contact_name: 'Dara Sok',
    vat_tin: 'TIN-12345',
    address: 'Phnom Penh, Cambodia',
    phone: '+855 12 345 678',
    alternate_phone: '+855 23 456 789',
    email: 'sales@example.test',
    credit_limit: '250.00',
    balance: '0.00',
    note: 'Weekly delivery',
  };

  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return calls.length === 1
      ? [{ insertId: 42 }]
      : [[vendorRow]];
  };

  const res = responseRecorder();
  let nextError;
  try {
    await handler({ body: completeProfile, companyId: 5 }, res, (error) => { nextError = error; });
  } finally {
    pool.query = originalQuery;
  }

  assert.ifError(nextError);
  assert.equal(res.statusCode, 201);
  assert.match(calls[0].sql, /contact_name, vat_tin, address, phone, alternate_phone, email/);
  assert.deepEqual(calls[0].params, [
    'Example Supplies Ltd.',
    'Dara Sok',
    'TIN-12345',
    'Phnom Penh, Cambodia',
    '+855 12 345 678',
    '+855 23 456 789',
    'sales@example.test',
    250,
    'Weekly delivery',
  ]);
  assert.deepEqual(calls[1].params, [42, 5]);
  assert.deepEqual({
    name: res.body.name,
    contactName: res.body.contactName,
    vatTin: res.body.vatTin,
    address: res.body.address,
    phone: res.body.phone,
    alternatePhone: res.body.alternatePhone,
    email: res.body.email,
    creditLimit: res.body.creditLimit,
    note: res.body.note,
  }, {
    name: 'Example Supplies Ltd.',
    contactName: 'Dara Sok',
    vatTin: 'TIN-12345',
    address: 'Phnom Penh, Cambodia',
    phone: '+855 12 345 678',
    alternatePhone: '+855 23 456 789',
    email: 'sales@example.test',
    creditLimit: 250,
    note: 'Weekly delivery',
  });
});

test('vendor creation saves defaults when Add Vendor omits optional fields', async () => {
  const handler = endpoint('/vendors', 'post');
  const originalQuery = pool.query;
  const calls = [];
  const body = {
    name: 'New Vendor',
    contactName: 'Dara Sok',
    vatTin: 'TIN-12345',
    address: 'Phnom Penh, Cambodia',
    phone: '+855 12 345 678',
    email: 'sales@example.test',
  };

  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return calls.length === 1
      ? [{ insertId: 43 }]
      : [[{
        id: 43,
        name: body.name,
        contact_name: body.contactName,
        vat_tin: body.vatTin,
        address: body.address,
        phone: body.phone,
        email: body.email,
        credit_limit: '0.00',
        balance: '0.00',
      }]];
  };

  const res = responseRecorder();
  let nextError;
  try {
    await handler({ body, companyId: 5 }, res, (error) => { nextError = error; });
  } finally {
    pool.query = originalQuery;
  }

  assert.ifError(nextError);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls[0].params, [
    'New Vendor',
    'Dara Sok',
    'TIN-12345',
    'Phnom Penh, Cambodia',
    '+855 12 345 678',
    null,
    'sales@example.test',
    0,
    '',
  ]);
  assert.deepEqual(calls[1].params, [43, 5]);
  assert.equal(res.body.alternatePhone, '');
  assert.equal(res.body.creditLimit, 0);
  assert.equal(res.body.note, '');
});

test('vendor update persists and returns every editable profile field', async () => {
  const handler = endpoint('/vendors/:id', 'put');
  const originalQuery = pool.query;
  const calls = [];
  const vendorRow = {
    id: 42,
    name: 'Example Supplies Ltd.',
    contact_name: 'Dara Sok',
    vat_tin: 'TIN-12345',
    address: 'Phnom Penh, Cambodia',
    phone: '+855 12 345 678',
    alternate_phone: '+855 23 456 789',
    email: 'sales@example.test',
    credit_limit: '250.00',
    balance: '0.00',
    note: 'Weekly delivery',
  };

  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (calls.length === 1) return [{ affectedRows: 0 }];
    if (calls.length === 2) return [[{ id: 42 }]];
    return [[vendorRow]];
  };

  const res = responseRecorder();
  let nextError;
  try {
    await handler({ params: { id: '42' }, body: completeProfile, companyId: 5 }, res, (error) => { nextError = error; });
  } finally {
    pool.query = originalQuery;
  }

  assert.ifError(nextError);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /SET name = \?, contact_name = \?, vat_tin = \?, address = \?, phone = \?, alternate_phone = \?, email = \?, credit_limit = \?, note = \?/);
  assert.match(calls[1].sql, /SELECT id FROM vendors WHERE id = \? AND company_id = \? AND active = 1/);
  assert.deepEqual(calls[0].params, [
    'Example Supplies Ltd.',
    'Dara Sok',
    'TIN-12345',
    'Phnom Penh, Cambodia',
    '+855 12 345 678',
    '+855 23 456 789',
    'sales@example.test',
    250,
    'Weekly delivery',
    42,
    5,
  ]);
  assert.deepEqual({
    contactName: res.body.contactName,
    vatTin: res.body.vatTin,
    address: res.body.address,
    phone: res.body.phone,
    alternatePhone: res.body.alternatePhone,
    email: res.body.email,
    creditLimit: res.body.creditLimit,
    note: res.body.note,
  }, {
    contactName: 'Dara Sok',
    vatTin: 'TIN-12345',
    address: 'Phnom Penh, Cambodia',
    phone: '+855 12 345 678',
    alternatePhone: '+855 23 456 789',
    email: 'sales@example.test',
    creditLimit: 250,
    note: 'Weekly delivery',
  });
});

test('vendor update accepts a legacy record with missing contact fields', async () => {
  const handler = endpoint('/vendors/:id', 'put');
  const originalQuery = pool.query;
  const savedRow = {
    id: 7,
    name: 'Legacy Supplier',
    contact_name: null,
    vat_tin: null,
    address: null,
    phone: null,
    alternate_phone: null,
    email: null,
    credit_limit: '0.00',
    balance: '0.00',
    note: null,
  };
  let calls = 0;
  pool.query = async () => {
    calls += 1;
    return calls === 1 ? [{ affectedRows: 1 }] : [[savedRow]];
  };

  const res = responseRecorder();
  let nextError;
  try {
    await handler({
      params: { id: '7' },
      body: { name: 'Legacy Supplier' },
      companyId: 5,
    }, res, (error) => { nextError = error; });
  } finally {
    pool.query = originalQuery;
  }

  assert.ifError(nextError);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.name, 'Legacy Supplier');
  assert.equal(res.body.contactName, '');
  assert.equal(res.body.email, '');
});

test('vendor deletion archives the record and records the action', async () => {
  const handler = endpoint('/vendors/:id', 'delete');
  const originalQuery = pool.query;
  const calls = [];

  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return calls.length === 1 ? [{ affectedRows: 1 }] : [{}];
  };

  const res = responseRecorder();
  let nextError;
  try {
    await handler({ params: { id: '42' }, user: { id: 7 }, companyId: 5 }, res, (error) => { nextError = error; });
  } finally {
    pool.query = originalQuery;
  }

  assert.ifError(nextError);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.match(calls[0].sql, /UPDATE vendors SET active = 0 WHERE id = \? AND company_id = \? AND active = 1/);
  assert.deepEqual(calls[0].params, [42, 5]);
  assert.match(calls[1].sql, /INSERT INTO activity_logs/);
});
