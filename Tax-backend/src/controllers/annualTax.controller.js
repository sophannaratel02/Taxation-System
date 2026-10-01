const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const inputKeys = [
  'p2_share_count', 'p2_paid_capital', 'p2_registered_capital',
  'p3_intangible_assets', 'p3_property_plant_equipment', 'p3_long_term_investments', 'p3_other_non_current_assets',
  'p3_inventory', 'p3_accounts_receivable', 'p3_short_term_investments', 'p3_cash', 'p3_other_current_assets',
  'p4_share_capital', 'p4_retained_earnings', 'p4_current_year_profit', 'p4_other_equity',
  'p4_long_term_borrowings', 'p4_other_non_current_liabilities', 'p4_accounts_payable', 'p4_tax_payable', 'p4_other_current_liabilities',
  'p5_revenue_goods', 'p5_revenue_services', 'p5_revenue_rent', 'p5_revenue_commissions', 'p5_revenue_other',
  'p5_cogs_materials', 'p5_cogs_merchandise', 'p5_cogs_labor', 'p5_cogs_other',
  'p5_interest_income', 'p5_dividend_income', 'p5_rental_income', 'p5_other_income',
  'p5_staff_costs', 'p5_rent', 'p5_utilities', 'p5_transport', 'p5_marketing', 'p5_other_operating_costs',
  'p6_interest_expense', 'p6_depreciation_expense', 'p6_other_expenses', 'p6_income_tax_expense',
  'p7_opening_raw_materials', 'p7_purchases_raw_materials', 'p7_closing_raw_materials', 'p7_direct_labor', 'p7_factory_overheads',
  'p7_opening_wip', 'p7_closing_wip', 'p7_opening_finished_goods', 'p7_closing_finished_goods',
  'p8_opening_merchandise', 'p8_purchases', 'p8_closing_merchandise',
  'p9_additions', 'p9_other_adjustments', 'p9_deductions', 'p9_exempt_income',
  'p10_additional_deductions', 'p10_tax_rate_percent', 'p10_foreign_tax_credit',
  'p10_advance_dividend_tax', 'p10_minimum_tax', 'p10_prepayments',
  'p11_charitable_donation', 'p11_interest_income',
  'p12_loss_year_1', 'p12_loss_year_2', 'p12_loss_year_3', 'p12_loss_year_4', 'p12_loss_year_5',
  'p12_interest_cf_year_1', 'p12_interest_cf_year_2', 'p12_interest_cf_year_3', 'p12_interest_cf_year_4', 'p12_interest_cf_year_5',
  'p13_historical_cost', 'p13_additions', 'p13_cost_disposals', 'p13_opening_accumulated_depreciation', 'p13_current_depreciation', 'p13_accumulated_depreciation_disposals',
  'p14_qualifying_asset_cost', 'p15_sale_proceeds', 'p15_tax_written_down_value',
  'p16_opening_provisions', 'p16_additions', 'p16_reversals',
  'p18_opening_related_balances', 'p18_increases', 'p18_decreases', 'p20_branch_revenue', 'p20_branch_expenses',
  'p21_profit_distributed', 'p21_dividend_tax_rate_percent',
];

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ message: 'An annual TOI return already exists for this TIN and tax year.' });
        return;
      }
      if (!error.status) console.error('Annual TOI request failed:', error);
      res.status(error.status || 500).json({ message: error.status ? error.message : 'Annual TOI request failed.' });
    }
  };
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function cleanValues(values = {}) {
  const cleaned = {};
  for (const key of inputKeys) {
    const value = values[key] === '' || values[key] === undefined || values[key] === null ? 0 : Number(values[key]);
    if (!Number.isFinite(value) || value < 0) throw new RequestError(400, `${key.replaceAll('_', ' ')} must be a non-negative number.`);
    cleaned[key] = value;
  }
  return cleaned;
}

function validDate(value, label) {
  if (!value) return null;
  const date = String(value);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new RequestError(400, `${label} must be a valid date.`);
  }
  return date;
}

function calculate(values, details = {}) {
  const sum = (...keys) => keys.reduce((total, key) => total + numeric(values[key]), 0);
  const round = (value) => Math.round(value + Number.EPSILON);

  const assets = {
    non_current: sum('p3_intangible_assets', 'p3_property_plant_equipment', 'p3_long_term_investments', 'p3_other_non_current_assets'),
    current: sum('p3_inventory', 'p3_accounts_receivable', 'p3_short_term_investments', 'p3_cash', 'p3_other_current_assets'),
  };
  assets.total = assets.non_current + assets.current;
  const equity = sum('p4_share_capital', 'p4_retained_earnings', 'p4_current_year_profit', 'p4_other_equity');
  const liabilities = sum('p4_long_term_borrowings', 'p4_other_non_current_liabilities', 'p4_accounts_payable', 'p4_tax_payable', 'p4_other_current_liabilities');

  const revenue = sum('p5_revenue_goods', 'p5_revenue_services', 'p5_revenue_rent', 'p5_revenue_commissions', 'p5_revenue_other');
  const manufacturingCosts = Math.max(0,
    sum('p7_opening_raw_materials', 'p7_purchases_raw_materials') - numeric(values.p7_closing_raw_materials)
    + sum('p7_direct_labor', 'p7_factory_overheads', 'p7_opening_wip', 'p7_opening_finished_goods')
    - sum('p7_closing_wip', 'p7_closing_finished_goods'));
  const tradingCosts = Math.max(0, sum('p8_opening_merchandise', 'p8_purchases') - numeric(values.p8_closing_merchandise));
  const directCosts = details.business_type === 'manufacturing'
    ? manufacturingCosts
    : details.business_type === 'trading'
      ? tradingCosts
      : sum('p5_cogs_materials', 'p5_cogs_merchandise', 'p5_cogs_labor', 'p5_cogs_other');
  const otherIncome = sum('p5_interest_income', 'p5_dividend_income', 'p5_rental_income', 'p5_other_income');
  const operatingCosts = sum('p5_staff_costs', 'p5_rent', 'p5_utilities', 'p5_transport', 'p5_marketing', 'p5_other_operating_costs');
  const grossProfit = revenue - directCosts;
  const operatingProfit = grossProfit + otherIncome - operatingCosts;
  const accountingProfit = operatingProfit - sum('p6_interest_expense', 'p6_depreciation_expense', 'p6_other_expenses');

  const donation = numeric(values.p11_charitable_donation);
  const adjustedProfit = accountingProfit + numeric(values.p9_additions) + numeric(values.p9_other_adjustments)
    - numeric(values.p9_deductions) - numeric(values.p9_exempt_income) - numeric(values.p10_additional_deductions);
  const donationCapBase = Math.max(0, adjustedProfit + donation);
  const donationAllowance = Math.min(donation, round(donationCapBase * 0.05));
  const donationAddback = Math.max(0, Math.abs(donation) - donationAllowance);
  const interestExpense = numeric(values.p6_interest_expense);
  const interestIncome = numeric(values.p11_interest_income || values.p5_interest_income);
  const interestCapBase = Math.max(0, adjustedProfit + donationAddback + interestExpense - interestIncome);
  const allowableInterest = Math.max(0, round(interestCapBase * 0.5) + interestIncome);
  const interestCarryforwardAvailable = sum('p12_interest_cf_year_1', 'p12_interest_cf_year_2', 'p12_interest_cf_year_3', 'p12_interest_cf_year_4', 'p12_interest_cf_year_5');
  const currentInterestAllowed = Math.min(interestExpense, allowableInterest);
  const interestCarryforwardDeduction = Math.min(interestCarryforwardAvailable, Math.max(0, allowableInterest - currentInterestAllowed));
  const interestAdjustment = Math.max(0, interestExpense - allowableInterest) - interestCarryforwardDeduction;
  const taxableBeforeLosses = Math.max(0, adjustedProfit + donationAddback + interestAdjustment);
  const losses = sum('p12_loss_year_1', 'p12_loss_year_2', 'p12_loss_year_3', 'p12_loss_year_4', 'p12_loss_year_5');
  const lossDeduction = Math.min(losses, taxableBeforeLosses);
  const taxableIncome = Math.max(0, taxableBeforeLosses - lossDeduction);
  const taxRate = Math.max(0, Math.min(100, numeric(values.p10_tax_rate_percent))) / 100;
  const dividendExcess = Math.max(0, numeric(values.p21_profit_distributed) - taxableIncome);
  const dividendTax = dividendExcess * Math.max(0, Math.min(100, numeric(values.p21_dividend_tax_rate_percent))) / 100;
  const grossTax = taxableIncome * taxRate + dividendTax;
  const taxAfterForeignCredit = Math.max(0, grossTax - numeric(values.p10_foreign_tax_credit));
  const dividendCredit = Math.min(taxAfterForeignCredit, numeric(values.p10_advance_dividend_tax));
  const finalTax = Math.max(0, taxAfterForeignCredit - dividendCredit);
  const prepayments = numeric(values.p10_prepayments);
  const payableBeforeMinimum = Math.max(0, finalTax - prepayments);
  const minimumTaxPayable = Math.max(0, Math.max(finalTax, numeric(values.p10_minimum_tax)) - prepayments);

  return {
    assets,
    equity,
    liabilities,
    balance_check: assets.total - equity - liabilities,
    revenue,
    direct_costs: directCosts,
    manufacturing_cogs: manufacturingCosts,
    trading_cogs: tradingCosts,
    gross_profit: grossProfit,
    other_income: otherIncome,
    operating_costs: operatingCosts,
    operating_profit: operatingProfit,
    accounting_profit_before_tax: accountingProfit,
    accounting_profit_after_tax: accountingProfit - numeric(values.p6_income_tax_expense),
    adjusted_net_profit: adjustedProfit,
    donation_cap_base: donationCapBase,
    maximum_deductible_donation: donationAllowance,
    charitable_donation_addback: donationAddback,
    allowable_interest: allowableInterest,
    interest_adjustment: interestAdjustment,
    interest_carryforward_available: interestCarryforwardAvailable,
    interest_carryforward_deduction: interestCarryforwardDeduction,
    loss_carryforward_available: losses,
    loss_carryforward_deduction: lossDeduction,
    taxable_income: taxableIncome,
    taxable_income_tax: taxableIncome * taxRate,
    excess_dividend_distribution: dividendExcess,
    excess_dividend_tax: dividendTax,
    gross_income_tax: grossTax,
    foreign_tax_credit: numeric(values.p10_foreign_tax_credit),
    advance_dividend_tax_credit: dividendCredit,
    final_income_tax: finalTax,
    prepayments,
    tax_payable_standard: payableBeforeMinimum,
    minimum_tax_payable: minimumTaxPayable,
    depreciation_ending_nbv: Math.max(0,
      Math.max(0, numeric(values.p13_historical_cost) + numeric(values.p13_additions) - numeric(values.p13_cost_disposals))
      - Math.max(0, numeric(values.p13_opening_accumulated_depreciation) + numeric(values.p13_current_depreciation) - numeric(values.p13_accumulated_depreciation_disposals))),
    special_depreciation_allowance: Math.max(0, numeric(values.p14_qualifying_asset_cost) - numeric(values.p14_disposals)) * 0.4,
    asset_disposal_tax_gain_loss: numeric(values.p15_sale_proceeds) - numeric(values.p15_tax_written_down_value),
    provision_closing_balance: numeric(values.p16_opening_provisions) + numeric(values.p16_additions) - numeric(values.p16_reversals),
    related_party_closing_balance: numeric(values.p18_opening_related_balances) + numeric(values.p18_increases) - numeric(values.p18_decreases),
  };
}

function parseReturn(row) {
  if (typeof row.values_json === 'string') row.values_json = JSON.parse(row.values_json);
  if (typeof row.details_json === 'string') row.details_json = JSON.parse(row.details_json);
  row.details_json = row.details_json || {};
  if (typeof row.calculations_json === 'string') row.calculations_json = JSON.parse(row.calculations_json);
  return { ...row, values: row.values_json, details: row.details_json, calculations: row.calculations_json };
}

async function getReturn(id) {
  const [rows] = await pool.execute('SELECT * FROM annual_toi_returns WHERE id = ?', [id]);
  if (!rows.length) throw new RequestError(404, 'Annual TOI return not found.');
  return parseReturn(rows[0]);
}

function prepare(body) {
  const companyName = String(body.company_name || '').trim();
  const tin = String(body.enterprise_tin || '').trim();
  const year = Math.trunc(numeric(body.tax_year));
  if (!companyName || !tin) throw new RequestError(400, 'Company name and enterprise TIN are required.');
  if (year < 2000 || year > 2200) throw new RequestError(400, 'Enter a valid tax year.');
  if (!['draft', 'filed'].includes(body.status || 'draft')) throw new RequestError(400, 'Invalid return status.');
  const values = cleanValues(body.values);
  if (values.p10_tax_rate_percent > 100 || values.p21_dividend_tax_rate_percent > 100) throw new RequestError(400, 'Tax rates must be between 0 and 100 percent.');
  const periodStart = validDate(body.period_start, 'Period start');
  const periodEnd = validDate(body.period_end, 'Period end');
  if (periodStart && periodEnd && periodStart > periodEnd) throw new RequestError(400, 'Period end must be on or after period start.');
  const details = {};
  for (const key of ['p17_related_entities', 'p19_branches']) {
    const value = String(body.details?.[key] || '');
    if (value.length > 12000) throw new RequestError(400, `${key.replaceAll('_', ' ')} must be 12,000 characters or fewer.`);
    details[key] = value;
  }
  details.business_type = ['manufacturing', 'trading', 'other'].includes(body.details?.business_type) ? body.details.business_type : 'other';
  details.minimum_tax_applies = Boolean(body.details?.minimum_tax_applies);
  return {
    companyName,
    tin,
    year,
    periodStart,
    periodEnd,
    values,
    details,
    calculations: calculate(values, details),
    status: body.status || 'draft',
  };
}

router.use(authenticate);

router.get('/', route(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM annual_toi_returns ORDER BY tax_year DESC, company_name');
  res.json(rows.map(parseReturn));
}));

router.post('/', route(async (req, res) => {
  const data = prepare(req.body);
  const [result] = await pool.execute(
    'INSERT INTO annual_toi_returns (company_name, enterprise_tin, tax_year, period_start, period_end, values_json, details_json, calculations_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [data.companyName, data.tin, data.year, data.periodStart, data.periodEnd, JSON.stringify(data.values), JSON.stringify(data.details), JSON.stringify(data.calculations), data.status]
  );
  res.status(201).json(await getReturn(result.insertId));
}));

router.get('/:returnId', route(async (req, res) => {
  res.json(await getReturn(req.params.returnId));
}));

router.put('/:returnId', route(async (req, res) => {
  const current = await getReturn(req.params.returnId);
  if (current.status === 'filed') throw new RequestError(409, 'A filed annual return cannot be edited.');
  const data = prepare(req.body);
  await pool.execute(
    'UPDATE annual_toi_returns SET company_name = ?, enterprise_tin = ?, tax_year = ?, period_start = ?, period_end = ?, values_json = ?, details_json = ?, calculations_json = ?, status = ? WHERE id = ?',
    [data.companyName, data.tin, data.year, data.periodStart, data.periodEnd, JSON.stringify(data.values), JSON.stringify(data.details), JSON.stringify(data.calculations), data.status, req.params.returnId]
  );
  res.json(await getReturn(req.params.returnId));
}));

module.exports = router;
module.exports.calculate = calculate;
module.exports.cleanValues = cleanValues;
module.exports.prepare = prepare;