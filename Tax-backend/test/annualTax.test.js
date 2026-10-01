const assert = require('node:assert/strict');
const test = require('node:test');
const { calculate, cleanValues, prepare } = require('../src/controllers/annualTax.controller');

test('charitable donation allowance is capped at five percent and addback is non-negative', () => {
  const values = cleanValues({ p5_revenue_goods: 1000000, p11_charitable_donation: 100000 });
  const result = calculate(values);

  assert.equal(result.maximum_deductible_donation, 55000);
  assert.equal(result.charitable_donation_addback, 45000);
});

test('interest adjustment applies the fifty-percent limitation', () => {
  const values = cleanValues({ p5_revenue_goods: 1000000, p6_interest_expense: 600000 });
  const result = calculate(values);

  assert.equal(result.allowable_interest, 500000);
  assert.equal(result.interest_adjustment, 100000);
});

test('loss carry-forward deduction cannot reduce taxable income below zero', () => {
  const values = cleanValues({ p5_revenue_goods: 100000, p12_loss_year_1: 150000 });
  const result = calculate(values);

  assert.equal(result.loss_carryforward_deduction, 100000);
  assert.equal(result.taxable_income, 0);
});

test('trading COGS flows from P8 into the income statement', () => {
  const values = cleanValues({
    p5_revenue_goods: 1000,
    p8_opening_merchandise: 50,
    p8_purchases: 200,
    p8_closing_merchandise: 60,
  });
  const result = calculate(values, { business_type: 'trading' });

  assert.equal(result.trading_cogs, 190);
  assert.equal(result.direct_costs, 190);
  assert.equal(result.gross_profit, 810);
});

test('negative monetary inputs are rejected', () => {
  assert.throws(() => cleanValues({ p5_revenue_goods: -1 }), /non-negative/);
});

test('invalid filing dates and tax rates are rejected', () => {
  const base = { company_name: 'Example Co', enterprise_tin: 'T-1', tax_year: 2026 };

  assert.throws(() => prepare({ ...base, period_start: '2026-02-30' }), /valid date/);
  assert.throws(() => prepare({ ...base, period_start: '2026-12-31', period_end: '2026-01-01' }), /on or after/);
  assert.throws(() => prepare({ ...base, values: { p10_tax_rate_percent: 101 } }), /between 0 and 100/);
});

test('unused interest carry-forward uses only remaining deduction capacity', () => {
  const values = cleanValues({ p5_revenue_goods: 1000, p12_interest_cf_year_1: 200 });
  const result = calculate(values);

  assert.equal(result.interest_carryforward_available, 200);
  assert.equal(result.interest_carryforward_deduction, 200);
  assert.equal(result.taxable_income, 800);
});

test('depreciation schedule computes closing NBV from closing cost and accumulated depreciation', () => {
  const values = cleanValues({
    p13_historical_cost: 1000,
    p13_additions: 200,
    p13_cost_disposals: 100,
    p13_opening_accumulated_depreciation: 300,
    p13_current_depreciation: 100,
    p13_accumulated_depreciation_disposals: 50,
  });

  assert.equal(calculate(values).depreciation_ending_nbv, 750);
});