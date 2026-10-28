import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { api } from '../src/services/api.js';

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalCustomEvent = Object.getOwnPropertyDescriptor(globalThis, 'CustomEvent');

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, descriptor] of [
    ['window', originalWindow],
    ['localStorage', originalLocalStorage],
    ['CustomEvent', originalCustomEvent],
  ]) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

test('download requests clear expired credentials and report the standard API error', async () => {
  const removed = [];
  const dispatched = [];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => 'expired-token',
      removeItem: (key) => removed.push(key),
    },
  });
  Object.defineProperty(globalThis, 'CustomEvent', {
    configurable: true,
    value: class CustomEvent {
      constructor(type) { this.type = type; }
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { dispatchEvent: (event) => dispatched.push(event.type) },
  });
  globalThis.fetch = async () => ({
    status: 401,
    ok: false,
    json: async () => ({ message: 'Session expired' }),
  });

  await assert.rejects(api.downloadFile(7), (error) => {
    assert.equal(error.message, 'Session expired');
    assert.equal(error.status, 401);
    assert.deepEqual(error.data, { message: 'Session expired' });
    return true;
  });
  assert.deepEqual(removed, ['tax_token', 'tax_user']);
  assert.deepEqual(dispatched, ['auth:unauthorized']);
});

test('download requests normalize network failures like other API requests', async () => {
  const cause = new Error('connection refused');
  globalThis.fetch = async () => { throw cause; };

  await assert.rejects(api.downloadFile(8), (error) => {
    assert.match(error.message, /Cannot connect to the API/);
    assert.equal(error.cause, cause);
    return true;
  });
});

test('JSON requests and downloads expose consistent HTTP error details', async () => {
  globalThis.fetch = async () => ({
    status: 503,
    ok: false,
    json: async () => { throw new SyntaxError('invalid JSON'); },
  });

  await assert.rejects(api.settings(), (error) => {
    assert.equal(error.message, 'Request failed with status 503');
    assert.equal(error.status, 503);
    assert.equal(error.data, null);
    return true;
  });
});
