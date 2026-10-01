const assert = require('node:assert/strict');
const test = require('node:test');
const { calculatePrepayment } = require('../src/controllers/tax.controller');

test('February 2020 nil prepayment filing returns zero in Boxes 04-19', () => {
  const result = calculatePrepayment({
    period_month: 2,
    period_year: 2020,
    previous_top_credit_khr: 0,
    specific_tax_khr: 0,
    other_taxes_khr: 0,
    accommodation_tax_base_khr: 0,
    public_lighting_tax_base_khr: 0,
  }, []);

  assert.deepEqual([
    result.box_04_previous_credit_khr,
    result.box_05_calculation_base_khr,
    result.box_06_prepayment_khr,
    result.box_07_credit_carried_forward_khr,
    result.box_08_profit_tax_due_khr,
    result.box_09_12_specific_tax_khr,
    result.box_13_accommodation_base_khr,
    result.box_14_accommodation_tax_khr,
    result.box_15_public_lighting_base_khr,
    result.box_16_public_lighting_tax_khr,
    result.box_17_18_other_taxes_khr,
    result.box_19_total_tax_due_khr,
  ], Array(12).fill(0));
});

test('prior ToP credit is applied after the 1% prepayment is calculated', () => {
  const result = calculatePrepayment({
    previous_top_credit_khr: 12000,
    specific_tax_khr: 200,
    other_taxes_khr: 50,
    accommodation_tax_base_khr: 10000,
    public_lighting_tax_base_khr: 20000,
  }, [{
    non_taxable_sale_khr: 0,
    export_sale_khr: 0,
    taxable_person_value_khr: 1000000,
    local_sale_value_khr: 0,
  }]);

  assert.equal(result.box_05_calculation_base_khr, 1000000);
  assert.equal(result.box_06_prepayment_khr, 10000);
  assert.equal(result.box_07_credit_carried_forward_khr, 2000);
  assert.equal(result.box_08_profit_tax_due_khr, 0);
  assert.equal(result.box_14_accommodation_tax_khr, 200);
  assert.equal(result.box_16_public_lighting_tax_khr, 600);
  assert.equal(result.box_19_total_tax_due_khr, 1050);
});

test('profit tax due is the 1% prepayment less the prior credit', () => {
  const result = calculatePrepayment({ previous_top_credit_khr: 3000 }, [{
    taxable_person_value_khr: 1000000,
  }]);

  assert.equal(result.box_06_prepayment_khr, 10000);
  assert.equal(result.box_07_credit_carried_forward_khr, 0);
  assert.equal(result.box_08_profit_tax_due_khr, 7000);
  assert.equal(result.box_19_total_tax_due_khr, 7000);
});