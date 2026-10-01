const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateVatReturn } = require('../src/controllers/tax.controller');

test('VAT return reports prior credit and carries it forward when no output VAT is due', () => {
  const result = calculateVatReturn(
    { previous_vat_credit_khr: 105718 },
    [{ expense_type: 'non_taxable', amount_khr: 1668700, vat_amount_khr: 0 }],
    [],
  );

  assert.deepEqual(result.vat, {
    box_05_previous_credit_khr: 105718,
    box_06_non_taxable_purchases_khr: 1668700,
    box_07_local_purchases_khr: 0,
    box_08_local_input_vat_khr: 0,
    box_09_import_purchases_khr: 0,
    box_10_import_input_vat_khr: 0,
    box_11_total_input_vat_khr: 105718,
    box_12_non_taxable_sales_khr: 0,
    box_13_export_sales_khr: 0,
    box_14_standard_sales_khr: 0,
    box_15_output_vat_khr: 0,
    box_16_total_output_vat_khr: 0,
    box_16_tax_payable_khr: 0,
    box_17_tax_due_khr: 0,
    box_18_credit_carried_forward_khr: 105718,
  });
  assert.equal(result.vatDue, 0);
  assert.equal(result.vatCredit, 105718);
});

test('VAT is recalculated at 10% from purchase and sales bases', () => {
  const result = calculateVatReturn(
    { previous_vat_credit_khr: 1000 },
    [
      { expense_type: 'local', taxable_value_khr: 10005, vat_amount_khr: 0 },
      { expense_type: 'import', taxable_value_khr: 20005, vat_amount_khr: 999999 },
    ],
    [{ taxable_person_value_khr: 30005, local_sale_value_khr: 0, taxable_person_vat_khr: 1 }],
  );

  assert.equal(result.vat.box_08_local_input_vat_khr, 1001);
  assert.equal(result.vat.box_10_import_input_vat_khr, 2001);
  assert.equal(result.vat.box_11_total_input_vat_khr, 4002);
  assert.equal(result.vat.box_15_output_vat_khr, 3001);
  assert.equal(result.vat.box_16_tax_payable_khr, 0);
  assert.equal(result.vat.box_18_credit_carried_forward_khr, 1001);
});