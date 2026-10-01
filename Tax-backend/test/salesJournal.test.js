const assert = require('node:assert/strict');
const test = require('node:test');
const { prepareRecord } = require('../src/controllers/tax.controller');

const period = { period_month: 8, period_year: 2026, nbc_exchange_rate: 4100 };
const required = { customer_name: 'Buyer' };

test('sales entry stores each sale category and recalculates local VAT', () => {
  const saved = prepareRecord('sales', {
    ...required,
    quantity: 1.234,
    non_taxable_sale_usd: 10.5,
    export_sale_usd: 20,
    taxable_person_value_usd: 50,
    taxable_person_vat_usd: 999,
    local_sale_value_usd: 100,
    local_sale_vat_usd: 999,
    vat_amount_khr: 1,
  }, period);

  assert.equal(saved.quantity, 1.234);
  assert.equal(saved.non_taxable_sale_usd, 10.5);
  assert.equal(saved.non_taxable_sale_khr, 43050);
  assert.equal(saved.export_sale_usd, 20);
  assert.equal(saved.export_sale_khr, 82000);
  assert.equal(saved.taxable_person_value_khr, 205000);
  assert.equal(saved.taxable_person_vat_usd, 5);
  assert.equal(saved.taxable_person_vat_khr, 20500);
  assert.equal(saved.local_sale_value_khr, 410000);
  assert.equal(saved.local_sale_vat_usd, 10);
  assert.equal(saved.local_sale_vat_khr, 41000);
  assert.equal(saved.taxable_amount_usd, 180.5);
  assert.equal(saved.taxable_amount_khr, 740050);
  assert.equal(saved.vat_amount_khr, 61500);
  assert.equal(saved.sale_categories_migrated, 1);
});

test('sales entry rejects negative category amounts', () => {
  assert.throws(() => prepareRecord('sales', {
    ...required,
    local_sale_value_usd: -1,
  }, period), /non-negative amount/);
});

test('purchase VAT defaults to the purchase amount when taxable value is empty', () => {
  const saved = prepareRecord('purchases', {
    supplier_name: 'Supplier',
    expense_type: 'local',
    amount_khr: 100000,
    taxable_value_khr: 0,
    vat_rate: 0.1,
  }, period);

  assert.equal(saved.taxable_value_khr, 100000);
  assert.equal(saved.vat_amount_khr, 10000);
});

test('salary TOS is calculated from the converted basic salary and tax rate', () => {
  const saved = prepareRecord('salaries', {
    employee_name: 'Employee',
    basic_salary_usd: 1000,
    tax_rate: 10,
    tos_amount_khr: 1,
  }, period);

  assert.equal(saved.basic_salary_khr, 4100000);
  assert.equal(saved.tos_amount_khr, 350000);
  assert.equal(saved.net_salary_khr, 3750000);
});

test('salary TOS cannot fall below zero after the 60000 KHR deduction', () => {
  const saved = prepareRecord('salaries', {
    employee_name: 'Employee',
    basic_salary_usd: 10,
    tax_rate: 10,
    tos_amount_khr: 999999,
  }, period);

  assert.equal(saved.tos_amount_khr, 0);
});
