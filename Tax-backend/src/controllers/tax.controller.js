const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const recordTypes = {
  purchases: {
    table: 'purchase_records',
    required: ['supplier_name'],
    columns: ['invoice_date', 'invoice_no', 'supplier_name', 'supplier_tin', 'description', 'quantity', 'expense_type', 'amount_usd', 'amount_khr', 'taxable_value_khr', 'vat_rate', 'vat_amount_khr'],
  },
  sales: {
    table: 'sale_records',
    required: ['customer_name'],
    columns: [
      'invoice_date', 'invoice_no', 'customer_name', 'customer_tin', 'description', 'quantity', 'sale_type',
      'taxable_amount_usd', 'taxable_amount_khr', 'vat_rate', 'vat_amount_khr',
      'non_taxable_sale_usd', 'non_taxable_sale_khr', 'export_sale_usd', 'export_sale_khr',
      'taxable_person_value_usd', 'taxable_person_value_khr', 'taxable_person_vat_usd', 'taxable_person_vat_khr',
      'local_sale_value_usd', 'local_sale_value_khr', 'local_sale_vat_usd', 'local_sale_vat_khr', 'sale_categories_migrated',
    ],
  },
  salaries: {
    table: 'salary_records',
    required: ['employee_name'],
    columns: ['employee_name', 'is_resident', 'basic_salary_usd', 'basic_salary_khr', 'bonus_khr', 'num_spouses', 'num_children', 'deduction_amount_khr', 'taxable_base_khr', 'tax_rate', 'tos_amount_khr', 'fringe_benefit_usd', 'fringe_benefit_tax_khr', 'net_salary_khr'],
  },
  wht: {
    table: 'wht_records',
    required: ['category'],
    columns: ['wht_type', 'category', 'base_amount_khr', 'wht_rate', 'wht_amount_khr', 'remarks'],
  },
};

const periodColumns = [
  'company_name', 'vat_tin', 'period_month', 'period_year', 'nbc_exchange_rate',
  'previous_top_credit_khr', 'specific_tax_khr',
  'accommodation_tax_base_khr', 'public_lighting_tax_base_khr', 'other_taxes_khr', 'status',
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
        res.status(409).json({ message: 'A tax period already exists for this company and month.' });
        return;
      }
      if (!error.status) console.error('Tax API request failed:', error);
      res.status(error.status || 500).json({ message: error.status ? error.message : 'Tax request failed.' });
    }
  };
}

function amount(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nonNegativeAmount(value, label) {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RequestError(400, `${label} must be a non-negative amount.`);
  return round(number);
}

function normalizeRate(value, fallbackPercent) {
  const input = amount(value, fallbackPercent);
  return Math.max(0, Math.min(1, input > 1 ? input / 100 : input));
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new RequestError(400, `${label} is required.`);
  return text;
}

function getRecordConfig(kind) {
  const config = recordTypes[kind];
  if (!config) throw new RequestError(404, 'Unknown tax journal.');
  return config;
}

async function getPeriod(id) {
  const [rows] = await pool.execute('SELECT * FROM tax_periods WHERE id = ?', [id]);
  if (!rows.length) throw new RequestError(404, 'Tax period not found.');
  return rows[0];
}

async function ensureDraft(id) {
  const period = await getPeriod(id);
  if (period.status !== 'draft') throw new RequestError(409, 'Only draft tax periods can be edited.');
  return period;
}

function prepareRecord(kind, body, period) {
  const config = getRecordConfig(kind);
  for (const key of config.required) requireText(body[key], key.replaceAll('_', ' '));
  const data = {};
  const defaultInvoiceDate = `${period.period_year}-${String(period.period_month).padStart(2, '0')}-01`;

  for (const column of config.columns) {
    if ([
      'vat_amount_khr', 'deduction_amount_khr', 'taxable_base_khr', 'tax_rate', 'tos_amount_khr',
      'fringe_benefit_tax_khr', 'net_salary_khr', 'wht_rate', 'wht_amount_khr', 'sale_categories_migrated',
      'non_taxable_sale_khr', 'export_sale_khr', 'taxable_person_value_khr', 'taxable_person_vat_usd',
      'taxable_person_vat_khr', 'local_sale_value_khr', 'local_sale_vat_usd', 'local_sale_vat_khr',
    ].includes(column)) continue;
    if (body[column] !== undefined) data[column] = body[column];
    else if (['invoice_no', 'supplier_tin', 'customer_tin', 'description', 'remarks'].includes(column)) data[column] = '';
  }

  if (kind === 'purchases') {
    const expenseType = String(body.expense_type || 'local');
    if (!['non_taxable', 'import', 'local'].includes(expenseType)) throw new RequestError(400, 'Invalid purchase type.');
    const usd = Math.max(0, amount(body.amount_usd));
    const khr = usd > 0 ? round(usd * amount(period.nbc_exchange_rate)) : Math.max(0, amount(body.amount_khr));
    const taxable = expenseType === 'non_taxable' ? 0 : Math.max(0, amount(body.taxable_value_khr) || khr);
    const rate = expenseType === 'non_taxable' ? 0 : normalizeRate(body.vat_rate, 10);
    Object.assign(data, { invoice_date: body.invoice_date || defaultInvoiceDate, quantity: Math.max(0, amount(body.quantity, 1)), expense_type: expenseType, amount_usd: usd, amount_khr: khr, taxable_value_khr: taxable, vat_rate: rate, vat_amount_khr: round(taxable * rate) });
  } else if (kind === 'sales') {
    const saleType = String(body.sale_type || 'local_consumer_10');
    if (!['non_taxable', 'export_0', 'taxable_person_10', 'local_consumer_10'].includes(saleType)) throw new RequestError(400, 'Invalid sale type.');
    const exchangeRate = amount(period.nbc_exchange_rate);
    const quantity = Number(body.quantity ?? 1);
    if (!Number.isFinite(quantity) || quantity < 0) throw new RequestError(400, 'Quantity must be a non-negative amount.');
    const categoryKeys = ['non_taxable_sale_usd', 'export_sale_usd', 'taxable_person_value_usd', 'local_sale_value_usd'];
    const hasCategoryInputs = categoryKeys.some((key) => body[key] !== undefined);
    let buckets;

    if (hasCategoryInputs) {
      const values = Object.fromEntries(categoryKeys.map((key) => [key, nonNegativeAmount(body[key], key.replaceAll('_', ' '))]));
      buckets = {
        nonTaxableUsd: values.non_taxable_sale_usd,
        exportUsd: values.export_sale_usd,
        taxablePersonUsd: values.taxable_person_value_usd,
        localSaleUsd: values.local_sale_value_usd,
      };
    } else {
      const usd = nonNegativeAmount(body.taxable_amount_usd, 'Taxable amount');
      const khr = usd > 0 ? Math.round(usd * exchangeRate) : nonNegativeAmount(body.taxable_amount_khr, 'Taxable amount in KHR');
      const legacyUsd = usd > 0 ? usd : (exchangeRate > 0 ? round(khr / exchangeRate) : 0);
      buckets = { nonTaxableUsd: 0, exportUsd: 0, taxablePersonUsd: 0, localSaleUsd: 0 };
      if (saleType === 'non_taxable') buckets.nonTaxableUsd = legacyUsd;
      else if (saleType === 'export_0') buckets.exportUsd = legacyUsd;
      else if (saleType === 'taxable_person_10') buckets.taxablePersonUsd = legacyUsd;
      else buckets.localSaleUsd = legacyUsd;
    }

    const convert = (value) => Math.round(value * exchangeRate);
    const nonTaxableKhr = convert(buckets.nonTaxableUsd);
    const exportKhr = convert(buckets.exportUsd);
    const taxablePersonKhr = convert(buckets.taxablePersonUsd);
    const localSaleKhr = convert(buckets.localSaleUsd);
    const taxablePersonVatUsd = round(buckets.taxablePersonUsd * 0.1);
    const localSaleVatUsd = round(buckets.localSaleUsd * 0.1);
    const taxablePersonVatKhr = convert(taxablePersonVatUsd);
    const localSaleVatKhr = convert(localSaleVatUsd);
    const totalUsd = round(buckets.nonTaxableUsd + buckets.exportUsd + buckets.taxablePersonUsd + buckets.localSaleUsd);
    const totalKhr = nonTaxableKhr + exportKhr + taxablePersonKhr + localSaleKhr;
    const totalVatKhr = taxablePersonVatKhr + localSaleVatKhr;
    const standardRate = buckets.taxablePersonUsd > 0 || buckets.localSaleUsd > 0 ? 0.1 : 0;
    const resolvedSaleType = hasCategoryInputs
      ? (buckets.nonTaxableUsd > 0 && totalUsd === buckets.nonTaxableUsd ? 'non_taxable'
        : buckets.exportUsd > 0 && totalUsd === buckets.exportUsd ? 'export_0'
          : buckets.taxablePersonUsd > 0 && totalUsd === buckets.taxablePersonUsd ? 'taxable_person_10'
            : 'local_consumer_10')
      : saleType;

    Object.assign(data, {
      invoice_date: body.invoice_date || defaultInvoiceDate,
      quantity,
      sale_type: resolvedSaleType,
      taxable_amount_usd: totalUsd,
      taxable_amount_khr: totalKhr,
      vat_rate: standardRate,
      vat_amount_khr: totalVatKhr,
      non_taxable_sale_usd: buckets.nonTaxableUsd,
      non_taxable_sale_khr: nonTaxableKhr,
      export_sale_usd: buckets.exportUsd,
      export_sale_khr: exportKhr,
      taxable_person_value_usd: buckets.taxablePersonUsd,
      taxable_person_value_khr: taxablePersonKhr,
      taxable_person_vat_usd: taxablePersonVatUsd,
      taxable_person_vat_khr: taxablePersonVatKhr,
      local_sale_value_usd: buckets.localSaleUsd,
      local_sale_value_khr: localSaleKhr,
      local_sale_vat_usd: localSaleVatUsd,
      local_sale_vat_khr: localSaleVatKhr,
      sale_categories_migrated: 1,
    });
  } else if (kind === 'salaries') {
    const resident = body.is_resident === undefined ? true : Boolean(body.is_resident);
    const usd = Math.max(0, amount(body.basic_salary_usd));
    const basicKhr = usd > 0 ? round(usd * amount(period.nbc_exchange_rate)) : Math.max(0, amount(body.basic_salary_khr));
    const spouses = Math.max(0, Math.min(1, Math.trunc(amount(body.num_spouses))));
    const children = Math.max(0, Math.trunc(amount(body.num_children)));
    const deduction = resident ? (spouses + children) * 150000 : 0;
    const bonus = Math.max(0, amount(body.bonus_khr));
    const taxable = Math.max(0, basicKhr + bonus - deduction);
    const rateInput = body.tax_rate === undefined || body.tax_rate === '' ? 0 : Number(body.tax_rate);
    if (!Number.isFinite(rateInput) || rateInput < 0 || rateInput > 100) throw new RequestError(400, 'Tax rate must be between 0 and 100 percent.');
    const rate = rateInput / 100;
    const tos = Math.max(0, round(basicKhr * rate - 60000));
    const fringeUsd = Math.max(0, amount(body.fringe_benefit_usd));
    const fringeTax = round(fringeUsd * amount(period.nbc_exchange_rate) * 0.2);
    Object.assign(data, {
      is_resident: resident ? 1 : 0,
      basic_salary_usd: usd,
      basic_salary_khr: basicKhr,
      bonus_khr: bonus,
      num_spouses: spouses,
      num_children: children,
      deduction_amount_khr: deduction,
      taxable_base_khr: taxable,
      tax_rate: rate,
      tos_amount_khr: round(tos),
      fringe_benefit_usd: fringeUsd,
      fringe_benefit_tax_khr: fringeTax,
      net_salary_khr: round(basicKhr + bonus - tos),
    });
  } else {
    const rates = { service_15: 0.15, rental_10: 0.10, interest_non_bank_15: 0.15, fixed_deposit_6: 0.06, savings_4: 0.04, non_resident_14: 0.14 };
    const category = String(body.category || '');
    if (!(category in rates)) throw new RequestError(400, 'Invalid withholding tax category.');
    const whtType = category === 'non_resident_14' ? 'non_resident' : String(body.wht_type || 'resident');
    if (!['resident', 'non_resident'].includes(whtType)) throw new RequestError(400, 'Invalid withholding tax type.');
    const base = Math.max(0, amount(body.base_amount_khr));
    const rate = rates[category];
    Object.assign(data, { category, wht_type: whtType, base_amount_khr: base, wht_rate: rate, wht_amount_khr: round(base * rate) });
  }

  return Object.fromEntries(config.columns.map((column) => [column, data[column] ?? null]));
}

function calculateVatReturn(period, purchases, sales) {
  const total = (rows, predicate, field) => round(rows.filter(predicate).reduce((sum, row) => sum + amount(row[field]), 0));
  const purchaseType = (type) => (row) => row.expense_type === type;
  const previousCredit = Math.max(0, round(amount(period.previous_vat_credit_khr)));
  const localPurchases = Math.max(0, total(purchases, purchaseType('local'), 'taxable_value_khr'));
  const importPurchases = Math.max(0, total(purchases, purchaseType('import'), 'taxable_value_khr'));
  const localInputVat = Math.round(localPurchases * 0.1);
  const importInputVat = Math.round(importPurchases * 0.1);
  const standardSales = round(total(sales, () => true, 'taxable_person_value_khr') + total(sales, () => true, 'local_sale_value_khr'));
  const outputVat = Math.round(Math.max(0, standardSales) * 0.1);
  const totalInputVat = round(previousCredit + localInputVat + importInputVat);
  const vatDue = Math.max(0, round(outputVat - totalInputVat));
  const vatCredit = Math.max(0, round(totalInputVat - outputVat));

  return {
    vatDue,
    vatCredit,
    vat: {
      box_05_previous_credit_khr: previousCredit,
      box_06_non_taxable_purchases_khr: total(purchases, purchaseType('non_taxable'), 'amount_khr'),
      box_07_local_purchases_khr: localPurchases,
      box_08_local_input_vat_khr: localInputVat,
      box_09_import_purchases_khr: importPurchases,
      box_10_import_input_vat_khr: importInputVat,
      box_11_total_input_vat_khr: totalInputVat,
      box_12_non_taxable_sales_khr: total(sales, () => true, 'non_taxable_sale_khr'),
      box_13_export_sales_khr: total(sales, () => true, 'export_sale_khr'),
      box_14_standard_sales_khr: standardSales,
      box_15_output_vat_khr: outputVat,
      box_16_total_output_vat_khr: outputVat,
      box_16_tax_payable_khr: vatDue,
      box_17_tax_due_khr: vatDue,
      box_18_credit_carried_forward_khr: vatCredit,
    },
  };
}
  async function getPreviousVatCredit(period) {
    const month = Number(period.period_month);
    const year = Number(period.period_year);
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;
    const [periods] = await pool.execute(
      'SELECT * FROM tax_periods WHERE company_name = ? AND period_year = ? AND period_month = ? LIMIT 1',
      [period.company_name, previousYear, previousMonth]
    );
    if (!periods.length) return Math.max(0, round(amount(period.previous_vat_credit_khr)));

    const previousPeriod = periods[0];
    const [[purchases], [sales]] = await Promise.all([
      pool.execute('SELECT * FROM purchase_records WHERE tax_period_id = ?', [previousPeriod.id]),
      pool.execute('SELECT * FROM sale_records WHERE tax_period_id = ?', [previousPeriod.id]),
    ]);
    return calculateVatReturn(previousPeriod, purchases, sales).vatCredit;
  }


function calculatePrepayment(period, sales) {
  const total = (field) => round(sales.reduce((sum, row) => sum + amount(row[field]), 0));
  const turnover = round(total('non_taxable_sale_khr')
    + total('export_sale_khr')
    + total('taxable_person_value_khr')
    + total('local_sale_value_khr'));
  const previousCredit = round(amount(period.previous_top_credit_khr));
  const prepayment = round(turnover * 0.01);
  const creditCarriedForward = Math.max(0, round(previousCredit - prepayment));
  const profitTaxDue = Math.max(0, round(prepayment - previousCredit));
  const specificTax = round(amount(period.specific_tax_khr));
  const accommodationBase = round(amount(period.accommodation_tax_base_khr));
  const accommodationTax = round(accommodationBase * 0.02);
  const publicLightingBase = round(amount(period.public_lighting_tax_base_khr));
  const publicLightingTax = round(publicLightingBase * 0.03);
  const otherTaxes = round(amount(period.other_taxes_khr));
  const totalDue = round(profitTaxDue + specificTax + accommodationTax + publicLightingTax + otherTaxes);

  return {
    turnover_khr: turnover,
    profit_tax_1_percent_khr: prepayment,
    previous_credit_khr: previousCredit,
    credit_carried_forward_khr: creditCarriedForward,
    profit_tax_due_khr: profitTaxDue,
    specific_tax_khr: specificTax,
    accommodation_tax_base_khr: accommodationBase,
    accommodation_tax_khr: accommodationTax,
    public_lighting_tax_base_khr: publicLightingBase,
    public_lighting_tax_khr: publicLightingTax,
    other_taxes_khr: otherTaxes,
    total_khr: totalDue,
    box_04_previous_credit_khr: previousCredit,
    box_05_calculation_base_khr: turnover,
    box_06_prepayment_khr: prepayment,
    box_07_credit_carried_forward_khr: creditCarriedForward,
    box_08_profit_tax_due_khr: profitTaxDue,
    box_09_12_specific_tax_khr: specificTax,
    box_13_accommodation_base_khr: accommodationBase,
    box_14_accommodation_tax_khr: accommodationTax,
    box_15_public_lighting_base_khr: publicLightingBase,
    box_16_public_lighting_tax_khr: publicLightingTax,
    box_17_18_other_taxes_khr: otherTaxes,
    box_19_total_tax_due_khr: totalDue,
  };
}

async function getSummary(period) {
  const id = period.id;
  const [[purchases], [sales], [salaries], [wht], [whtItems]] = await Promise.all([
    pool.execute('SELECT * FROM purchase_records WHERE tax_period_id = ?', [id]),
    pool.execute('SELECT * FROM sale_records WHERE tax_period_id = ?', [id]),
    pool.execute('SELECT * FROM salary_records WHERE tax_period_id = ?', [id]),
    pool.execute(`SELECT legacy.* FROM wht_records AS legacy
      WHERE legacy.tax_period_id = ? AND NOT EXISTS (
        SELECT 1 FROM wht_legacy_imports AS imported WHERE imported.legacy_wht_record_id = legacy.id
      )`, [id]),
    pool.execute('SELECT withholding_tax AS wht_amount_khr FROM wht_return_items WHERE return_id = ?', [id]),
  ]);
  const total = (rows, predicate, field) => round(rows.filter(predicate).reduce((sum, row) => sum + amount(row[field]), 0));
  const previousVatCredit = await getPreviousVatCredit(period);
  await pool.execute('UPDATE tax_periods SET previous_vat_credit_khr = ? WHERE id = ?', [previousVatCredit, id]);
  const vatPeriod = { ...period, previous_vat_credit_khr: previousVatCredit };
  const { vat, vatDue, vatCredit } = calculateVatReturn(vatPeriod, purchases, sales);
  const prepayment = calculatePrepayment(period, sales);
  const whtTotal = round(total(wht, () => true, 'wht_amount_khr') + total(whtItems, () => true, 'wht_amount_khr'));
  const salaryTos = total(salaries, () => true, 'tos_amount_khr');
  const fringeBenefitTax = total(salaries, () => true, 'fringe_benefit_tax_khr');
  const tosTotal = round(salaryTos + fringeBenefitTax);
  const totalTaxDue = round(prepayment.total_khr + whtTotal + tosTotal + vatDue);
  const vatColumns = Object.keys(vat);
  await pool.execute(
    `INSERT INTO vat_returns (tax_period_id, ${vatColumns.join(', ')}) VALUES (?, ${vatColumns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${vatColumns.map((column) => `${column} = VALUES(${column})`).join(', ')}`,
    [id, ...vatColumns.map((column) => vat[column])]
  );

  return {
    period: vatPeriod,
    vat,
    prepayment,
    totals: {
      purchases_khr: total(purchases, () => true, 'amount_khr'),
      sales_khr: prepayment.turnover_khr,
      wht_khr: whtTotal,
      tos_khr: tosTotal,
      salary_tos_khr: salaryTos,
      fringe_benefit_tax_khr: fringeBenefitTax,
      vat_due_khr: vatDue,
      vat_credit_khr: vatCredit,
      total_tax_due_khr: totalTaxDue,
    },
  };
}

router.use(authenticate);

router.get('/', route(async (req, res) => {
  const [periods] = await pool.execute('SELECT * FROM tax_periods ORDER BY period_year DESC, period_month DESC');
  res.json(periods);
}));

router.post('/', route(async (req, res) => {
  const month = Math.trunc(amount(req.body.period_month));
  const year = Math.trunc(amount(req.body.period_year));
  if (month < 1 || month > 12 || year < 2000 || year > 2200) throw new RequestError(400, 'Enter a valid tax month and year.');
  const companyName = requireText(req.body.company_name || 'Axis Investment Consulting', 'Company name');
  const vatTin = requireText(req.body.vat_tin || 'K002-107004771', 'VAT TIN');
  const rate = amount(req.body.nbc_exchange_rate, 4070);
  if (rate <= 0) throw new RequestError(400, 'Exchange rate must be greater than zero.');
  const [result] = await pool.execute(
    'INSERT INTO tax_periods (company_name, vat_tin, period_month, period_year, nbc_exchange_rate) VALUES (?, ?, ?, ?, ?)',
    [companyName, vatTin, month, year, rate]
  );
  res.status(201).json(await getPeriod(result.insertId));
}));

router.get('/:periodId/summary', route(async (req, res) => {
  res.json(await getSummary(await getPeriod(req.params.periodId)));
}));

router.put('/:periodId', route(async (req, res) => {
  const period = await getPeriod(req.params.periodId);
  const data = Object.fromEntries(periodColumns.filter((column) => req.body[column] !== undefined).map((column) => [column, req.body[column]]));
  if (!Object.keys(data).length) throw new RequestError(400, 'No period fields were provided.');
  if (period.status !== 'draft' && Object.keys(data).some((column) => column !== 'status')) throw new RequestError(409, 'Only draft tax periods can be edited.');
  if (data.period_month !== undefined && (amount(data.period_month) < 1 || amount(data.period_month) > 12)) throw new RequestError(400, 'Enter a valid tax month.');
  if (data.period_year !== undefined && (amount(data.period_year) < 2000 || amount(data.period_year) > 2200)) throw new RequestError(400, 'Enter a valid tax year.');
  if (data.nbc_exchange_rate !== undefined && amount(data.nbc_exchange_rate) <= 0) throw new RequestError(400, 'Exchange rate must be greater than zero.');
  for (const column of ['previous_vat_credit_khr', 'previous_top_credit_khr', 'specific_tax_khr', 'other_taxes_khr', 'accommodation_tax_base_khr', 'public_lighting_tax_base_khr']) {
    if (data[column] !== undefined) data[column] = nonNegativeAmount(data[column], column.replaceAll('_', ' '));
  }
  if (data.status !== undefined && !['draft', 'filed', 'locked'].includes(data.status)) throw new RequestError(400, 'Invalid period status.');
  if (period.status === 'locked' && data.status !== 'locked') throw new RequestError(409, 'A locked period cannot be reopened.');
  if (period.status === 'filed' && data.status === 'draft') throw new RequestError(409, 'A filed period cannot be returned to draft.');
  const assignments = Object.keys(data).map((column) => `${column} = ?`).join(', ');
  await pool.execute(`UPDATE tax_periods SET ${assignments} WHERE id = ?`, [...Object.values(data), req.params.periodId]);
  const updatedPeriod = await getPeriod(req.params.periodId);
  const previousRate = amount(period.nbc_exchange_rate);
  const nextRate = amount(updatedPeriod.nbc_exchange_rate);
  if (previousRate !== nextRate) {
    const [purchases] = await pool.execute('SELECT * FROM purchase_records WHERE tax_period_id = ? AND amount_usd > 0', [req.params.periodId]);
    for (const row of purchases) {
      const nextAmount = round(amount(row.amount_usd) * nextRate);
      const taxable = row.expense_type === 'non_taxable' ? 0 : (amount(row.amount_khr) > 0 ? round(amount(row.taxable_value_khr) * nextAmount / amount(row.amount_khr)) : nextAmount);
      await pool.execute('UPDATE purchase_records SET amount_khr = ?, taxable_value_khr = ?, vat_amount_khr = ? WHERE id = ?', [nextAmount, taxable, round(taxable * amount(row.vat_rate)), row.id]);
    }
    const [sales] = await pool.execute('SELECT * FROM sale_records WHERE tax_period_id = ?', [req.params.periodId]);
    for (const row of sales) {
      const nonTaxableKhr = Math.round(amount(row.non_taxable_sale_usd) * nextRate);
      const exportKhr = Math.round(amount(row.export_sale_usd) * nextRate);
      const taxablePersonKhr = Math.round(amount(row.taxable_person_value_usd) * nextRate);
      const taxablePersonVatKhr = Math.round(amount(row.taxable_person_vat_usd) * nextRate);
      const localSaleKhr = Math.round(amount(row.local_sale_value_usd) * nextRate);
      const localSaleVatKhr = Math.round(amount(row.local_sale_vat_usd) * nextRate);
      const nextAmount = nonTaxableKhr + exportKhr + taxablePersonKhr + localSaleKhr;
      const nextVat = taxablePersonVatKhr + localSaleVatKhr;
      await pool.execute(
        `UPDATE sale_records SET
          taxable_amount_khr = ?, vat_amount_khr = ?,
          non_taxable_sale_khr = ?, export_sale_khr = ?,
          taxable_person_value_khr = ?, taxable_person_vat_khr = ?,
          local_sale_value_khr = ?, local_sale_vat_khr = ?
         WHERE id = ?`,
        [nextAmount, nextVat, nonTaxableKhr, exportKhr, taxablePersonKhr, taxablePersonVatKhr, localSaleKhr, localSaleVatKhr, row.id]
      );
    }
    const [salaries] = await pool.execute('SELECT * FROM salary_records WHERE tax_period_id = ?', [req.params.periodId]);
    const salaryConfig = getRecordConfig('salaries');
    for (const row of salaries) {
      const recalculated = prepareRecord('salaries', { ...row, tax_rate: amount(row.tax_rate) * 100 }, updatedPeriod);
      const columns = Object.keys(recalculated);
      await pool.execute(`UPDATE ${salaryConfig.table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [...Object.values(recalculated), row.id]);
    }
  }
  res.json(updatedPeriod);
}));

router.get('/:periodId/:kind', route(async (req, res) => {
  await getPeriod(req.params.periodId);
  const config = getRecordConfig(req.params.kind);
  const [rows] = await pool.execute(`SELECT * FROM ${config.table} WHERE tax_period_id = ? ORDER BY id DESC`, [req.params.periodId]);
  res.json(rows);
}));

router.post('/:periodId/:kind', route(async (req, res) => {
  const period = await ensureDraft(req.params.periodId);
  const config = getRecordConfig(req.params.kind);
  const data = prepareRecord(req.params.kind, req.body, period);
  const columns = Object.keys(data);
  const [result] = await pool.execute(
    `INSERT INTO ${config.table} (tax_period_id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
    [req.params.periodId, ...Object.values(data)]
  );
  const [rows] = await pool.execute(`SELECT * FROM ${config.table} WHERE id = ?`, [result.insertId]);
  res.status(201).json(rows[0]);
}));

router.put('/:periodId/:kind/:recordId', route(async (req, res) => {
  const period = await ensureDraft(req.params.periodId);
  const config = getRecordConfig(req.params.kind);
  const data = prepareRecord(req.params.kind, req.body, period);
  const columns = Object.keys(data);
  await pool.execute(
    `UPDATE ${config.table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ? AND tax_period_id = ?`,
    [...Object.values(data), req.params.recordId, req.params.periodId]
  );
  const [rows] = await pool.execute(`SELECT * FROM ${config.table} WHERE id = ? AND tax_period_id = ?`, [req.params.recordId, req.params.periodId]);
  if (!rows.length) throw new RequestError(404, 'Tax record not found.');
  res.json(rows[0]);
}));

router.delete('/:periodId/:kind/:recordId', route(async (req, res) => {
  await ensureDraft(req.params.periodId);
  const config = getRecordConfig(req.params.kind);
  const [result] = await pool.execute(`DELETE FROM ${config.table} WHERE id = ? AND tax_period_id = ?`, [req.params.recordId, req.params.periodId]);
  if (!result.affectedRows) throw new RequestError(404, 'Tax record not found.');
  res.status(204).end();
}));

module.exports = router;
module.exports.prepareRecord = prepareRecord;
module.exports.calculateVatReturn = calculateVatReturn;
module.exports.calculatePrepayment = calculatePrepayment;