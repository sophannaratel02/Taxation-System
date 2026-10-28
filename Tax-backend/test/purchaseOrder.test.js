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
    qty: 1,
    unitPrice: 2.5,
    deliveryPrice: 1,
    deliveryDate: '2026-10-05',
  }],
};

test('purchase order accepts positive whole stock quantities', () => {
  assert.equal(api.validatePurchaseOrder(validOrder), null);
  assert.equal(api.validatePurchaseOrder({
    ...validOrder,
    vendorName: undefined,
    items: [{ ...validOrder.items[0], qty: 2 }],
  }), null);
});

test('purchase order rejects non-finite, zero and fractional quantities', () => {
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], qty: Number.NaN }],
  }), /Quantity must be a positive whole number/);
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], qty: 0 }],
  }), /Quantity must be a positive whole number/);
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], qty: 0.5 }],
  }), /Quantity must be a positive whole number/);
});

test('purchase order rejects impossible calendar dates', () => {
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], deliveryDate: '2026-02-30' }],
  }), /valid delivery date/);
});

test('purchase order overhead accepts cents but rejects sub-cent amounts', () => {
  assert.equal(api.validatePurchaseOrder({
    ...validOrder,
    handlingCost: 1.25,
    documentationCost: 0.5,
  }), null);
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    handlingCost: 1.251,
  }), /cannot exceed two decimal places/);
});

test('purchase order merchandise unit cost is limited to four decimal places', () => {
  assert.equal(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], unitPrice: 0.1234 }],
  }), null);
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], unitPrice: 0.12345 }],
  }), /cannot exceed four decimal places/);
});

test('purchase order delivery fees match the two-decimal database precision', () => {
  assert.equal(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], deliveryPrice: 1.25 }],
  }), null);
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], deliveryPrice: 1.251 }],
  }), /Delivery price cannot exceed two decimal places/);
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], deliveryDate: '' }],
  }), /valid delivery date/);
  assert.match(api.validatePurchaseOrder({
    ...validOrder,
    items: [{ ...validOrder.items[0], deliveryPrice: undefined }],
  }), /Delivery price must be a non-negative number/);
});

test('item inputs match database decimal precision', () => {
  assert.equal(api.validateItemAmounts({
    retailPrice: 0.7632,
    purchaseCost: 0.635968,
    reorderQty: 1,
    markupAmount: 0.125,
  }), null);
  assert.match(api.validateItemAmounts({
    retailPrice: 0.76321,
    purchaseCost: 0.635968,
    reorderQty: 1,
    markupAmount: 0,
  }), /Selling price supports 4 decimals/);
  assert.match(api.validateItemAmounts({
    retailPrice: 0.75,
    purchaseCost: 0.1234567,
    reorderQty: 1,
    markupAmount: 0,
  }), /Selling price supports 4 decimals/);
  assert.match(api.validateItemAmounts({
    retailPrice: 0.75,
    purchaseCost: 0.123456,
    reorderQty: 1,
    markupAmount: 0.12345,
  }), /markup supports 4 decimals/);
  assert.match(api.validateItemAmounts({
    retailPrice: 0.75,
    purchaseCost: 0.25,
    reorderQty: 0.125,
    markupAmount: 0,
  }), /reorder quantity must be a whole number/i);
});

test('item unit prices and conversion ratios are validated and base-unit prices stay synchronized', () => {
  const units = api.normalizeItemUnits([
    { name: 'Case', ratio: 12, retailPrice: 24 },
    { name: 'Bottle', ratio: 1, retailPrice: 0 },
  ], 'Bottle', 2.25);

  assert.deepEqual(units, [
    { name: 'Bottle', ratio: 1, retailPrice: 2.25 },
    { name: 'Case', ratio: 12, retailPrice: 24 },
  ]);
  assert.equal(api.validateItemUnits(units), null);
  assert.match(api.validateItemUnits([
    { name: 'Bottle', ratio: 1, retailPrice: 2.25 },
    { name: 'Case', ratio: 0.5, retailPrice: 24 },
  ]), /positive whole numbers/);
  assert.match(api.validateItemUnits([
    { name: 'Bottle', ratio: 1, retailPrice: 2.25 },
    { name: 'Bottle', ratio: 2, retailPrice: 4.5 },
  ]), /unique/);
  assert.match(api.validateItemUnits([
    { name: 'Bottle', ratio: 1, retailPrice: 2.25001 },
  ]), /up to 4 decimals/);
});