const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../src/controllers/api.controller');

const validOrder = {
  vendorId: 1,
  vendorName: 'Supplier',
  orderDate: '2026-10-01',
  items: [{
    itemId: 1,
    productName: 'Inventory item',
    qty: 1.25,
    unitPrice: 2.5,
    deliveryPrice: 1,
    deliveryDate: '2026-10-05',
  }],
};

test('purchase order accepts valid three-decimal stock quantities', () => {
  assert.equal(api.validatePurchaseOrder(validOrder), null);
  assert.equal(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], qty: 0.125 }],
  }), null);
});

test('purchase order rejects non-finite and over-precision quantities', () => {
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], qty: Number.NaN }],
  }), /Quantity must be greater than 0/);
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], qty: 0.0001 }],
  }), /no more than 3 decimals/);
});

test('purchase order rejects impossible calendar dates', () => {
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], deliveryDate: '2026-02-30' }],
  }), /valid delivery date/);
});