const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertRegisterOpen,
  isOpenRegisterConflict,
  resolveSaleLine,
  validateCashTender,
} = require('../src/services/posSale');

const item = {
  name_en: 'Water',
  base_unit: 'Bottle',
  retail_price: 0.5,
  units: [
    { name: 'Bottle', ratio: 1, retailPrice: 0.5 },
    { name: 'Case', ratio: 12, retailPrice: 5.5 },
  ],
};

test('sales require an open register for the selected branch', () => {
  assert.doesNotThrow(() => assertRegisterOpen({ id: 1 }));
  assert.throws(
    () => assertRegisterOpen(null),
    (error) => error.status === 409 && /Open a register/.test(error.message)
  );
});

test('database duplicate-key errors identify register-open conflicts', () => {
  assert.equal(isOpenRegisterConflict({
    code: 'ER_DUP_ENTRY',
    sqlMessage: "Duplicate entry 'North' for key 'uq_cash_registers_open_branch'",
  }), true);
  assert.equal(isOpenRegisterConflict({
    code: 'ER_DUP_ENTRY',
    sqlMessage: "Duplicate entry 'abc' for key 'some_other_index'",
  }), false);
  assert.equal(isOpenRegisterConflict(new Error('database unavailable')), false);
});

test('sale pricing comes from the catalog and converts package quantities to stock units', () => {
  const line = resolveSaleLine({ unit: 'Case', qty: 2, discount: 0.5, unitPrice: 0.01 }, item);

  assert.equal(line.unitPrice, 5.5);
  assert.equal(line.stockDeductionQty, 24);
  assert.equal(line.lineNet, 10.5);
});

test('zero catalog price falls back to branch AVCO plus the fixed markup amount', () => {
  const zeroPricedItem = {
    ...item,
    retail_price: 0,
    average_cost: 3,
    markup_amount: 0.854,
    units: [{ name: 'Bottle', ratio: 1, retailPrice: 0 }],
  };

  const line = resolveSaleLine({ unit: 'Bottle', qty: 1 }, zeroPricedItem, { averageCost: 4.27 });

  assert.equal(line.unitPrice, 5.124);
});

test('fixed markup amount scales with the selected package unit', () => {
  const zeroPricedItem = {
    ...item,
    retail_price: 0,
    average_cost: 3,
    markup_amount: 0.5,
    units: [{ name: 'Case', ratio: 12, retailPrice: 0 }],
  };

  const line = resolveSaleLine({ unit: 'Case', qty: 1 }, zeroPricedItem, { averageCost: 4.27 });

  assert.equal(line.unitPrice, 57.24);
});

test('fixed markup amount still applies when the item cost is zero', () => {
  const zeroCostItem = {
    ...item,
    retail_price: 0,
    average_cost: 0,
    purchase_cost: 0,
    markup_amount: 0.75,
    units: [{ name: 'Bottle', ratio: 1, retailPrice: 0 }],
  };

  const line = resolveSaleLine({ unit: 'Bottle', qty: 1 }, zeroCostItem);

  assert.equal(line.unitPrice, 0.75);
});

test('positive catalog price remains authoritative over the AVCO fallback', () => {
  const line = resolveSaleLine({ unit: 'Bottle', qty: 1 }, item, { averageCost: 4.27 });

  assert.equal(line.unitPrice, 0.5);
});

test('sale lines reject an unknown unit, invalid quantity, and a discount above the line amount', () => {
  assert.throws(() => resolveSaleLine({ unit: 'Pallet', qty: 1 }, item), /Invalid unit/);
  assert.throws(() => resolveSaleLine({ qty: 0.5 }, item), /whole number/);
  assert.throws(() => resolveSaleLine({ qty: 0.0001 }, item), /Invalid quantity/);
  assert.throws(() => resolveSaleLine({ qty: 1, discount: 0.51 }, item), /Discount cannot exceed/);
});

test('cash tender validates USD and KHR and rounds the converted tender to cents', () => {
  assert.deepEqual(validateCashTender(1.25, 5000, 4000), {
    receivedUSD: 1.25,
    receivedKHR: 5000,
    tenderedUSD: 2.5,
  });
});

test('cash tender rejects negative, over-precision, and fractional KHR amounts', () => {
  assert.throws(() => validateCashTender(-1, 0, 4000), /USD tender/);
  assert.throws(() => validateCashTender(1.001, 0, 4000), /USD tender/);
  assert.throws(() => validateCashTender(0, 100.5, 4000), /KHR tender/);
});
