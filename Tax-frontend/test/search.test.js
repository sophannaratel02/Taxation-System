import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesSearch } from '../src/utils/search.js';

test('matchesSearch finds each search term across nested record fields', () => {
  assert.equal(matchesSearch('Sokha 1042', {
    name: 'Sokha Trading',
    contact: { phone: '01042' },
    permissions: ['inventory.read'],
  }), true);
  assert.equal(matchesSearch('Sokha missing', { name: 'Sokha Trading' }), false);
});

test('matchesSearch normalizes case and Latin diacritics and accepts blank queries', () => {
  assert.equal(matchesSearch('cafe', { name: 'Café' }), true);
  assert.equal(matchesSearch('  ', { name: 'Anything' }), true);
});
