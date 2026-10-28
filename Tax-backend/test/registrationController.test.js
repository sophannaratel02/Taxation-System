const assert = require('node:assert/strict');
const express = require('express');
const test = require('node:test');
const { createRegistrationRouter } = require('../src/controllers/registration.controller');

function passthrough(_req, _res, next) {
  next();
}

function createLimiters() {
  return {
    registerIp: passthrough,
    verifyEmailIp: passthrough,
    resendVerificationIp: passthrough,
    resendVerificationIdentifier: passthrough,
  };
}

function createRegistrationHarness({ mailer, provisioner, accessPolicy } = {}) {
  const state = { committed: false, rolledBack: false, released: false, events: [], queries: [] };
  const connection = {
    async beginTransaction() {
      state.events.push('begin');
    },
    async query(sql, parameters = []) {
      state.queries.push({ sql, parameters });
      if (sql.startsWith('SELECT username, email')) return [[], []];
      if (sql.startsWith('INSERT INTO companies')) return [{ insertId: 41 }, []];
      if (sql.startsWith('INSERT INTO users')) return [{ insertId: 52 }, []];
      return [{ affectedRows: 1 }, []];
    },
    async commit() {
      state.committed = true;
      state.events.push('commit');
    },
    async rollback() {
      state.rolledBack = true;
      state.events.push('rollback');
    },
    release() {
      state.released = true;
    },
  };
  const database = {
    async getConnection() {
      return connection;
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/auth', createRegistrationRouter({
    database,
    emailTransporter: mailer,
    senderAddress: 'no-reply@example.test',
    accessPolicyLoader: async () => accessPolicy || ({ passwordMinLength: 8, registrationRequiresApproval: false }),
    companyProvisioner: provisioner || (async () => {}),
    passwordHasher: async () => 'hashed-password',
    limiters: createLimiters(),
  }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  return { app, state };
}

async function postRegistration(app) {
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Workspace Owner',
        email: 'owner@example.test',
        password: 'secure-password',
      }),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('registration creates a sign-in-ready account without requiring email verification', async () => {
  const harness = createRegistrationHarness({
    mailer: null,
    accessPolicy: { passwordMinLength: 8, registrationRequiresApproval: false },
  });
  const response = await postRegistration(harness.app);

  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'ACTIVE');
  assert.equal(response.body.approvalStatus, 'approved');
  assert.match(response.body.message, /sign in/i);
  assert.deepEqual(harness.state.events, ['begin', 'commit']);
  assert.equal(harness.state.rolledBack, false);
  assert.equal(harness.state.released, true);
  assert.equal(harness.state.queries.some(({ sql }) => /verification_token|token_expires_at/i.test(sql)), false);
  const userInsert = harness.state.queries.find(({ sql }) => sql.startsWith('INSERT INTO users'));
  assert.match(userInsert.sql, /'owner', \?, 1, 1, 'ACTIVE'/);
  assert.match(userInsert.parameters[8], /^account-[0-9a-f-]{36}$/);
  assert.equal(userInsert.parameters[9], 'owner@example.test');
  assert.equal(userInsert.parameters.at(-2), 1);
  assert.equal(userInsert.parameters.at(-1), 'approved');
  assert.equal(userInsert.sql.includes("'admin'"), false);
});

test('registration does not bypass required administrator approval', async () => {
  const harness = createRegistrationHarness({
    mailer: null,
    accessPolicy: { passwordMinLength: 8, registrationRequiresApproval: true },
  });
  const response = await postRegistration(harness.app);

  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'ACTIVE');
  assert.equal(response.body.approvalStatus, 'pending');
  assert.match(response.body.message, /administrator approval/i);
  const userInsert = harness.state.queries.find(({ sql }) => sql.startsWith('INSERT INTO users'));
  assert.equal(userInsert.parameters.at(-2), 0);
  assert.equal(userInsert.parameters.at(-1), 'pending');
});

test('registration remains successful without SMTP configuration', async () => {
  const harness = createRegistrationHarness({
    mailer: null,
  });
  const response = await postRegistration(harness.app);

  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'ACTIVE');
  assert.deepEqual(harness.state.events, ['begin', 'commit']);
});

test('registration rolls back workspace provisioning failures', async () => {
  const harness = createRegistrationHarness({
    mailer: null,
    provisioner: async () => {
      throw new Error('Could not seed starter chart');
    },
  });
  const response = await postRegistration(harness.app);
  assert.equal(response.status, 500);
  assert.equal(response.status, 500);
  assert.deepEqual(harness.state.events, ['begin', 'rollback']);
  assert.equal(harness.state.released, true);
});
