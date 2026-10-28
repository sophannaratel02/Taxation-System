const assert = require('node:assert/strict');
const test = require('node:test');
const { buildFinancialStatements } = require('../src/services/financialStatements');

test('financial statements carry net current earnings into balance sheet equity', () => {
  const report = buildFinancialStatements([
    {
      id: 1, account_code: '1000', account_name: 'Cash', account_type: 'asset',
      period_debit: 0, period_credit: 0, year_debit: 0, year_credit: 0, as_of_debit: 96, as_of_credit: 0,
    },
    {
      id: 2, account_code: '2000', account_name: 'Payables', account_type: 'liability',
      period_debit: 0, period_credit: 0, year_debit: 0, year_credit: 0, as_of_debit: 0, as_of_credit: 20,
    },
    {
      id: 3, account_code: '3000', account_name: 'Capital', account_type: 'equity',
      period_debit: 0, period_credit: 0, year_debit: 0, year_credit: 0, as_of_debit: 0, as_of_credit: 70,
    },
    {
      id: 4, account_code: '4000', account_name: 'Sales', account_type: 'revenue',
      period_debit: 0, period_credit: 10, year_debit: 0, year_credit: 10, as_of_debit: 0, as_of_credit: 10,
    },
    {
      id: 5, account_code: '5000', account_name: 'Rent', account_type: 'expense',
      period_debit: 4, period_credit: 0, year_debit: 4, year_credit: 0, as_of_debit: 4, as_of_credit: 0,
    },
  ], { fromDate: '2026-01-01', toDate: '2026-03-31', asOf: '2026-03-31', currency: 'USD' });

  assert.equal(report.incomeStatement.totalRevenue, 10);
  assert.equal(report.incomeStatement.totalExpenses, 4);
  assert.equal(report.incomeStatement.netIncome, 6);
  assert.equal(report.balanceSheet.currentEarnings, 6);
  assert.equal(report.balanceSheet.totalAssets, 96);
  assert.equal(report.balanceSheet.totalLiabilitiesAndEquity, 96);
  assert.equal(report.balanceSheet.difference, 0);
});

test('a newly provisioned workspace produces zero-valued financial statements', () => {
  const report = buildFinancialStatements([
    { id: 1, account_code: '1000', account_name: 'Cash', account_type: 'asset' },
    { id: 2, account_code: '2000', account_name: 'Payables', account_type: 'liability' },
    { id: 3, account_code: '3000', account_name: 'Equity', account_type: 'equity' },
    { id: 4, account_code: '4000', account_name: 'Revenue', account_type: 'revenue' },
    { id: 5, account_code: '5000', account_name: 'Expenses', account_type: 'expense' },
  ], { fromDate: '2026-01-01', toDate: '2026-10-19', asOf: '2026-10-19', currency: 'USD' });

  assert.deepEqual(report.incomeStatement.revenue, []);
  assert.deepEqual(report.incomeStatement.expenses, []);
  assert.equal(report.incomeStatement.totalRevenue, 0);
  assert.equal(report.incomeStatement.totalExpenses, 0);
  assert.equal(report.incomeStatement.netIncome, 0);
  assert.deepEqual(report.balanceSheet.assets, []);
  assert.deepEqual(report.balanceSheet.liabilities, []);
  assert.deepEqual(report.balanceSheet.equity, []);
  assert.equal(report.balanceSheet.currentEarnings, 0);
  assert.equal(report.balanceSheet.totalAssets, 0);
  assert.equal(report.balanceSheet.totalLiabilitiesAndEquity, 0);
  assert.equal(report.balanceSheet.difference, 0);
});
