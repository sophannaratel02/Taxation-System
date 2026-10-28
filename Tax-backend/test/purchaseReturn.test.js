const assert = require('node:assert/strict');
const test = require('node:test');
const { preparePurchaseReturnLines } = require('../src/services/purchaseReturn');

const purchaseOrderLines = [
  {
    id: 20,
    item_id: 7,
    product_name: 'Coffee',
    qty: 5,
    qty_returned: 1,
  },
];

test('supplier returns accept partial quantities up to the received remainder', () => {
  const [line] = preparePurchaseReturnLines(
    [{ purchaseOrderItemId: 20, quantity: 1 }],
    purchaseOrderLines
  );

  assert.equal(line.quantity, 1);
  assert.equal(line.line.item_id, 7);
});

test('supplier returns reject quantities above the remaining received quantity', () => {
  assert.throws(
    () => preparePurchaseReturnLines([{ purchaseOrderItemId: 20, quantity: 5 }], purchaseOrderLines),
    /exceeds the remaining received quantity/
  );
});

test('supplier returns reject fractional quantities, duplicate lines and foreign order lines', () => {
  assert.throws(
    () => preparePurchaseReturnLines([{ purchaseOrderItemId: 20, quantity: 0.5 }], purchaseOrderLines),
    /positive whole number/
  );
  assert.throws(
    () => preparePurchaseReturnLines([
      { purchaseOrderItemId: 20, quantity: 1 },
      { purchaseOrderItemId: 20, quantity: 1 },
    ], purchaseOrderLines),
    /unique purchase order line/
  );
  assert.throws(
    () => preparePurchaseReturnLines([{ purchaseOrderItemId: 99, quantity: 1 }], purchaseOrderLines),
    /does not belong to this purchase order/
  );
  assert.throws(
    () => preparePurchaseReturnLines([{ purchaseOrderItemId: 20, quantity: 1 }], [
      { ...purchaseOrderLines[0], item_id: null },
    ]),
    /not linked to inventory/
  );
});
