const express = require('express');
const { pool } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

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
  'p14_qualifying_asset_cost', 'p14_disposals', 'p15_sale_proceeds', 'p15_tax_written_down_value',
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

function roundKhr(value) {
  return Math.round(Number(value) || 0);
}

function cleanValues(values = {}) {
  const cleaned = {};
  for (const key of inputKeys) {
    const raw = values[key];
    const val = raw === '' || raw === undefined || raw === null ? 0 : Number(raw);
    if (!Number.isFinite(val) || val < 0) {
      throw new RequestError(400, `${key.replaceAll('_', ' ')} must be a non-negative number.`);
    }
    cleaned[key] = val;
  }
  return cleaned;
}

function validDate(value, label) {
  if (!value) return null;
  const dateStr = String(value).trim();
  const parsed = new Date(`${dateStr}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateStr) {
    throw new RequestError(400, `${label} must be a valid date in YYYY-MM-DD format.`);
  }
  return dateStr;
}

function calculate(values, details = {}) {
  const n = (key) => Math.max(0, numeric(values[key]));
  const sum = (...keys) => keys.reduce((total, key) => total + n(key), 0);

  // Balance Sheet
  const assetsNonCurrent = sum(
    'p3_intangible_assets', 'p3_property_plant_equipment',
    'p3_long_term_investments', 'p3_other_non_current_assets'
  );
  const assetsCurrent = sum(
    'p3_inventory', 'p3_accounts_receivable',
    'p3_short_term_investments', 'p3_cash', 'p3_other_current_assets'
  );
  const assetsTotal = assetsNonCurrent + assetsCurrent;

  const equity = sum(
    'p4_share_capital', 'p4_retained_earnings',
    'p4_current_year_profit', 'p4_other_equity'
  );
  const liabilities = sum(
    'p4_long_term_borrowings', 'p4_other_non_current_liabilities',
    'p4_accounts_payable', 'p4_tax_payable', 'p4_other_current_liabilities'
  );

  // Profit & Loss
  const revenue = sum(
    'p5_revenue_goods', 'p5_revenue_services',
    'p5_revenue_rent', 'p5_revenue_commissions', 'p5_revenue_other'
  );

  const rawConsumed = sum('p7_opening_raw_materials', 'p7_purchases_raw_materials') - n('p7_closing_raw_materials');
  const manufacturingCosts = Math.max(
    0,
    rawConsumed +
      sum('p7_direct_labor', 'p7_factory_overheads', 'p7_opening_wip', 'p7_opening_finished_goods') -
      sum('p7_closing_wip', 'p7_closing_finished_goods')
  );

  const tradingCosts = Math.max(0, sum('p8_opening_merchandise', 'p8_purchases') - n('p8_closing_merchandise'));

  let directCosts = sum('p5_cogs_materials', 'p5_cogs_merchandise', 'p5_cogs_labor', 'p5_cogs_other');
  if (details.business_type === 'manufacturing') directCosts = manufacturingCosts;
  else if (details.business_type === 'trading') directCosts = tradingCosts;

  const otherIncome = sum('p5_interest_income', 'p5_dividend_income', 'p5_rental_income', 'p5_other_income');
  const operatingCosts = sum(
    'p5_staff_costs', 'p5_rent', 'p5_utilities',
    'p5_transport', 'p5_marketing', 'p5_other_operating_costs'
  );

  const grossProfit = revenue - directCosts;
  const operatingProfit = grossProfit + otherIncome - operatingCosts;
  const accountingProfit = operatingProfit - sum('p6_interest_expense', 'p6_depreciation_expense', 'p6_other_expenses');

  // Tax Reconciliation
  const donation = n('p11_charitable_donation');
  const adjustedProfit =
    accountingProfit +
    n('p9_additions') +
    n('p9_other_adjustments') -
    n('p9_deductions') -
    n('p9_exempt_income') -
    n('p10_additional_deductions');

  // 5% Charitable Deduction Limitation
  const donationCapBase = Math.max(0, adjustedProfit + donation);
  const donationAllowance = Math.min(donation, roundKhr(donationCapBase * 0.05));
  const donationAddback = Math.max(0, donation - donationAllowance);

  // Interest Expense 50% Rule
  const interestExpense = n('p6_interest_expense');
  const interestIncome = n('p11_interest_income') || n('p5_interest_income');
  const interestCapBase = Math.max(0, adjustedProfit + donationAddback + interestExpense - interestIncome);
  const allowableInterest = Math.max(0, roundKhr(interestCapBase * 0.5) + interestIncome);

  const interestCarryforwardAvailable = sum(
    'p12_interest_cf_year_1', 'p12_interest_cf_year_2',
    'p12_interest_cf_year_3', 'p12_interest_cf_year_4', 'p12_interest_cf_year_5'
  );
  const currentInterestAllowed = Math.min(interestExpense, allowableInterest);
  const remainingInterestRoom = Math.max(0, allowableInterest - currentInterestAllowed);
  const interestCarryforwardDeduction = Math.min(interestCarryforwardAvailable, remainingInterestRoom);
  const interestAdjustment = Math.max(0, interestExpense - allowableInterest) - interestCarryforwardDeduction;

  // Taxable Income & Losses
  const taxableBeforeLosses = Math.max(0, adjustedProfit + donationAddback + interestAdjustment);
  const lossesAvailable = sum(
    'p12_loss_year_1', 'p12_loss_year_2',
    'p12_loss_year_3', 'p12_loss_year_4', 'p12_loss_year_5'
  );
  const lossDeduction = Math.min(lossesAvailable, taxableBeforeLosses);
  const taxableIncome = Math.max(0, taxableBeforeLosses - lossDeduction);

  // Tax on Income Calculations
  const taxRate = Math.max(0, Math.min(100, n('p10_tax_rate_percent'))) / 100;
  const incomeTax = roundKhr(taxableIncome * taxRate);

  const dividendExcess = Math.max(0, n('p21_profit_distributed') - taxableIncome);
  const dividendTaxRate = Math.max(0, Math.min(100, n('p21_dividend_tax_rate_percent'))) / 100;
  const dividendTax = roundKhr(dividendExcess * dividendTaxRate);

  const grossTax = incomeTax + dividendTax;
  const foreignTaxCredit = Math.min(grossTax, n('p10_foreign_tax_credit'));
  const taxAfterForeignCredit = Math.max(0, grossTax - foreignTaxCredit);

  const dividendCredit = Math.min(taxAfterForeignCredit, n('p10_advance_dividend_tax'));
  const finalTax = Math.max(0, taxAfterForeignCredit - dividendCredit);

  const prepayments = n('p10_prepayments');
  const minimumTax = n('p10_minimum_tax');

  return {
    assets: { non_current: assetsNonCurrent, current: assetsCurrent, total: assetsTotal },
    equity,
    liabilities,
    balance_check: assetsTotal - equity - liabilities,
    revenue,
    direct_costs: directCosts,
    manufacturing_cogs: manufacturingCosts,
    trading_cogs: tradingCosts,
    gross_profit: grossProfit,
    other_income: otherIncome,
    operating_costs: operatingCosts,
    operating_profit: operatingProfit,
    accounting_profit_before_tax: accountingProfit,
    accounting_profit_after_tax: accountingProfit - n('p6_income_tax_expense'),
    adjusted_net_profit: adjustedProfit,
    donation_cap_base: donationCapBase,
    maximum_deductible_donation: donationAllowance,
    charitable_donation_addback: donationAddback,
    allowable_interest: allowableInterest,
    interest_adjustment: interestAdjustment,
    interest_carryforward_available: interestCarryforwardAvailable,
    interest_carryforward_deduction: interestCarryforwardDeduction,
    loss_carryforward_available: lossesAvailable,
    loss_carryforward_deduction: lossDeduction,
    taxable_income: taxableIncome,
    taxable_income_tax: incomeTax,
    excess_dividend_distribution: dividendExcess,
    excess_dividend_tax: dividendTax,
    gross_income_tax: grossTax,
    foreign_tax_credit: foreignTaxCredit,
    advance_dividend_tax_credit: dividendCredit,
    final_income_tax: finalTax,
    prepayments,
    tax_payable_standard: Math.max(0, finalTax - prepayments),
    minimum_tax_payable: Math.max(0, Math.max(finalTax, minimumTax) - prepayments),
    depreciation_ending_nbv: Math.max(
      0,
      Math.max(0, n('p13_historical_cost') + n('p13_additions') - n('p13_cost_disposals')) -
        Math.max(0, n('p13_opening_accumulated_depreciation') + n('p13_current_depreciation') - n('p13_accumulated_depreciation_disposals'))
    ),
    special_depreciation_allowance: roundKhr(Math.max(0, n('p14_qualifying_asset_cost') - n('p14_disposals')) * 0.4),
    asset_disposal_tax_gain_loss: n('p15_sale_proceeds') - n('p15_tax_written_down_value'),
    provision_closing_balance: n('p16_opening_provisions') + n('p16_additions') - n('p16_reversals'),
    related_party_closing_balance: n('p18_opening_related_balances') + n('p18_increases') - n('p18_decreases'),
  };
}

function safeJson(val, fallback = {}) {
  if (typeof val === 'object' && val !== null) return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function parseReturn(row) {
  const values = safeJson(row.values_json, {});
  const details = safeJson(row.details_json, {});
  const calculations = safeJson(row.calculations_json, {});
  return { ...row, values, details, calculations };
}

async function getReturn(id, companyId) {
  const [rows] = await pool.execute(
    'SELECT * FROM annual_toi_returns WHERE id = ? AND company_id = ?',
    [id, companyId]
  );
  if (!rows.length) throw new RequestError(404, 'Annual TOI return not found.');
  return parseReturn(rows[0]);
}

function prepare(body) {
  const companyName = String(body.company_name || '').trim();
  const tin = String(body.enterprise_tin || '').trim();
  const year = Math.trunc(numeric(body.tax_year));

  if (!companyName || !tin) throw new RequestError(400, 'Company name and enterprise TIN are required.');
  if (year < 2000 || year > 2200) throw new RequestError(400, 'Enter a valid tax year (2000–2200).');
  if (!['draft', 'filed'].includes(body.status || 'draft')) throw new RequestError(400, 'Invalid return status.');

  const values = cleanValues(body.values);
  if (values.p10_tax_rate_percent > 100 || values.p21_dividend_tax_rate_percent > 100) {
    throw new RequestError(400, 'Tax rates must be between 0 and 100 percent.');
  }

  const periodStart = validDate(body.period_start, 'Period start');
  const periodEnd = validDate(body.period_end, 'Period end');
  if (periodStart && periodEnd && periodStart > periodEnd) {
    throw new RequestError(400, 'Period end must be on or after period start.');
  }

  const details = {};
  for (const key of ['p17_related_entities', 'p19_branches']) {
    const value = String(body.details?.[key] || '');
    if (value.length > 12000) {
      throw new RequestError(400, `${key.replaceAll('_', ' ')} must be 12,000 characters or fewer.`);
    }
    details[key] = value;
  }

  details.business_type = ['manufacturing', 'trading', 'other'].includes(body.details?.business_type)
    ? body.details.business_type
    : 'other';
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

function canTransitionStatus(currentStatus, nextStatus) {
  return currentStatus === 'draft' && ['draft', 'filed'].includes(nextStatus);
}

// ---------------- Route Handlers ----------------

router.use(authenticate, requireAdmin);

router.get('/', route(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM annual_toi_returns WHERE company_id = ? ORDER BY tax_year DESC, company_name',
    [req.companyId]
  );
  res.json(rows.map(parseReturn));
}));

router.post('/', route(async (req, res) => {
  const data = prepare(req.body);

  const [result] = await pool.execute(
    `INSERT INTO annual_toi_returns 
      (company_id, company_name, enterprise_tin, tax_year, period_start, period_end, values_json, details_json, calculations_json, status) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.companyId,
      data.companyName,
      data.tin,
      data.year,
      data.periodStart,
      data.periodEnd,
      JSON.stringify(data.values),
      JSON.stringify(data.details),
      JSON.stringify(data.calculations),
      data.status,
    ]
  );

  res.status(201).json(await getReturn(result.insertId, req.companyId));
}));

router.get('/:returnId', route(async (req, res) => {
  res.json(await getReturn(req.params.returnId, req.companyId));
}));

router.put('/:returnId', route(async (req, res) => {
  const current = await getReturn(req.params.returnId, req.companyId);
  if (current.status === 'filed') {
    throw new RequestError(409, 'A filed annual return is finalized and cannot be edited.');
  }

  const data = prepare(req.body);
  if (!canTransitionStatus(current.status, data.status)) {
    throw new RequestError(409, `Annual tax return cannot transition from ${current.status} to ${data.status}.`);
  }

  await pool.execute(
    `UPDATE annual_toi_returns 
     SET company_name = ?, enterprise_tin = ?, tax_year = ?, period_start = ?, period_end = ?, 
         values_json = ?, details_json = ?, calculations_json = ?, status = ? 
     WHERE id = ? AND company_id = ?`,
    [
      data.companyName,
      data.tin,
      data.year,
      data.periodStart,
      data.periodEnd,
      JSON.stringify(data.values),
      JSON.stringify(data.details),
      JSON.stringify(data.calculations),
      data.status,
      req.params.returnId,
      req.companyId,
    ]
  );

  res.json(await getReturn(req.params.returnId, req.companyId));
}));

module.exports = router;
module.exports.calculate = calculate;
module.exports.canTransitionStatus = canTransitionStatus;
module.exports.cleanValues = cleanValues;
module.exports.prepare = prepare;