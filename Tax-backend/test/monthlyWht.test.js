const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateTax, parseBaseAmount, normalizeItems } = require('../src/controllers/monthlyWht.controller');

test('WHT tax is recalculated and rounded to cents', () => {
  assert.equal(calculateTax(100.05, 0.15), 15.01);
  assert.equal(calculateTax(0.05, 0.1), 0.01);
});

test('base amounts require a non-negative value with at most two decimals', () => {
  assert.equal(parseBaseAmount('1250.5'), 1250.5);
  assert.throws(() => parseBaseAmount(''), /Base amount is required/);
  assert.throws(() => parseBaseAmount('-1.00'), /non-negative/);
  assert.throws(() => parseBaseAmount('1.005'), /two decimal places/);
});

test('batch rows require a payment object and reject repeated IDs', () => {
  assert.throws(() => normalizeItems([{ base_amount: 100, tax_rate_percent: 15 }]), /select an object/);
  assert.throws(() => normalizeItems([
    { id: '12345678-1234-1234-1234-123456789abc', tax_object_code: 'RES_SERVICE_ROYALTY_15', base_amount: 10, tax_rate_percent: 15 },
    { id: '12345678-1234-1234-1234-123456789abc', tax_object_code: 'RES_SERVICE_ROYALTY_15', base_amount: 20, tax_rate_percent: 15 },
  ]), /invalid or duplicated/);
});

test('editable percentage values are converted to a validated decimal tax rate', () => {
  const item = normalizeItems([{ tax_object_code: 'RES_SERVICE_ROYALTY_15', base_amount: 100, tax_rate_percent: 12.5 }])[0];
  assert.equal(item.taxRate, 0.125);
  assert.throws(() => normalizeItems([{ tax_object_code: 'RES_SERVICE_ROYALTY_15', base_amount: 100, tax_rate_percent: 100.01 }]), /0 and 100 percent/);
});