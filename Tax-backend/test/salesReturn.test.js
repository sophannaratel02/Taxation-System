const assert = require('node:assert/strict');
const test = require('node:test');
const { prepareSalesReturnLines } = require('../src/services/salesReturn');

const invoiceLines = [
  {
    id: 10,
    item_id: 3,
    item_name: 'Water',
    qty: 2,
    qty_base: 24,
    qty_returned: 0,
    qty_base_returned: 0,
    cost_price: 1.25,
    cogs_unit_cost: 0.104167,
  },
];

test('returning a package converts the selling quantity to stock base units and uses sale-time cost', () => {
  const [line] = prepareSalesReturnLines([{ invoiceLineId: 10, quantity: 1 }], invoiceLines);

  assert.equal(line.quantity, 1);
  assert.equal(line.quantityBase, 12);
  assert.equal(line.unitCost, 0.104167);
});

test('partial returns are rejected when they cannot restore a whole base-stock quantity', () => {
  const saleLine = {
    ...invoiceLines[0],
    qty: 3,
    qty_base: 1,
    qty_returned: 0,
    qty_base_returned: 0,
  };
  assert.throws(
    () => prepareSalesReturnLines([{ invoiceLineId: 10, quantity: 1 }], [saleLine]),
    /whole stock quantity/
  );
  const [fullReturn] = prepareSalesReturnLines([{ invoiceLineId: 10, quantity: 3 }], [saleLine]);
  assert.equal(fullReturn.quantityBase, 1);
});

test('returns reject quantities beyond the remaining invoice quantity', () => {
  assert.throws(
    () => prepareSalesReturnLines([{ invoiceLineId: 10, quantity: 3 }], invoiceLines),
    /exceeds the remaining sold quantity/
  );
});

test('returns reject fractional base-stock conversion and invalid prior returns', () => {
  const fractionalUnitLine = {
    ...invoiceLines[0],
    qty: 2,
    qty_base: 1,
    qty_returned: 0,
    qty_base_returned: 0,
  };
  assert.throws(
    () => prepareSalesReturnLines([{ invoiceLineId: 10, quantity: 1 }], [fractionalUnitLine]),
    /whole stock quantity/
  );
  assert.throws(
    () => prepareSalesReturnLines([{ invoiceLineId: 10, quantity: 1 }], [
      { ...fractionalUnitLine, qty_returned: 2, qty_base_returned: 1 },
    ]),
    /exceeds the remaining sold quantity/
  );
});

test('returns reject zero, fractional, duplicate, and foreign invoice lines', () => {
  assert.throws(() => prepareSalesReturnLines([{ invoiceLineId: 10, quantity: 0 }], invoiceLines), /positive/);
  assert.throws(() => prepareSalesReturnLines([{ invoiceLineId: 10, quantity: 0.5 }], invoiceLines), /positive whole number/);
  assert.throws(
    () => prepareSalesReturnLines([
      { invoiceLineId: 10, quantity: 1 },
      { invoiceLineId: 10, quantity: 1 },
    ], invoiceLines),
    /unique invoice line/
  );
  assert.throws(() => prepareSalesReturnLines([{ invoiceLineId: 99, quantity: 1 }], invoiceLines), /does not belong/);
});
