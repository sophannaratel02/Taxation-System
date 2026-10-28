import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../src/services/api.js';

test('registration and login send email credentials without a username', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      async json() {
        return { token: 'test-token', user: { id: 1 } };
      },
    };
  };

  try {
    await api.register({
      name: 'New Workspace Owner',
      email: 'owner@example.test',
      password: 'secure-password',
    });
    await api.login('owner@example.test', 'secure-password');

    assert.deepEqual(requests.map(({ body }) => body), [
      { name: 'New Workspace Owner', email: 'owner@example.test', password: 'secure-password' },
      { email: 'owner@example.test', password: 'secure-password' },
    ]);
    assert.equal(requests[0].url, '/api/auth/register');
    assert.equal(requests[1].url, '/api/auth/login');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
