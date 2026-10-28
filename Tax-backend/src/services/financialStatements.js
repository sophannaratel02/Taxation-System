function round4(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
}

function normalBalance(accountType, debit, credit) {
  return ['asset', 'expense'].includes(accountType)
    ? round4(debit - credit)
    : round4(credit - debit);
}

function buildFinancialStatements(rows, { fromDate, toDate, asOf, currency }) {
  const accounts = rows.map((row) => {
    const periodDebit = Number(row.period_debit || 0);
    const periodCredit = Number(row.period_credit || 0);
    const asOfDebit = Number(row.as_of_debit || 0);
    const asOfCredit = Number(row.as_of_credit || 0);
    const yearDebit = Number(row.year_debit || 0);
    const yearCredit = Number(row.year_credit || 0);
    return {
      ...row,
      period_debit: periodDebit,
      period_credit: periodCredit,
      period_balance: normalBalance(row.account_type, periodDebit, periodCredit),
      as_of_balance: normalBalance(row.account_type, asOfDebit, asOfCredit),
      year_balance: normalBalance(row.account_type, yearDebit, yearCredit),
    };
  });
  const nonZero = (list, field) => list.filter((account) => Math.abs(account[field]) >= 0.00005);
  const revenue = nonZero(accounts.filter((account) => account.account_type === 'revenue'), 'period_balance');
  const expenses = nonZero(accounts.filter((account) => account.account_type === 'expense'), 'period_balance');
  const assets = nonZero(accounts.filter((account) => account.account_type === 'asset'), 'as_of_balance');
  const liabilities = nonZero(accounts.filter((account) => account.account_type === 'liability'), 'as_of_balance');
  const equity = nonZero(accounts.filter((account) => account.account_type === 'equity'), 'as_of_balance');
  const totalRevenue = round4(revenue.reduce((sum, account) => sum + account.period_balance, 0));
  const totalExpenses = round4(expenses.reduce((sum, account) => sum + account.period_balance, 0));
  const currentEarnings = round4(accounts
    .reduce((sum, account) => {
      if (account.account_type === 'revenue') return sum + account.year_balance;
      if (account.account_type === 'expense') return sum - account.year_balance;
      return sum;
    }, 0));
  const totalAssets = round4(assets.reduce((sum, account) => sum + account.as_of_balance, 0));
  const totalLiabilities = round4(liabilities.reduce((sum, account) => sum + account.as_of_balance, 0));
  const totalEquity = round4(equity.reduce((sum, account) => sum + account.as_of_balance, 0) + currentEarnings);

  return {
    currency,
    fromDate,
    toDate,
    asOf,
    incomeStatement: {
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netIncome: round4(totalRevenue - totalExpenses),
    },
    balanceSheet: {
      assets,
      liabilities,
      equity,
      currentEarnings,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: round4(totalLiabilities + totalEquity),
      difference: round4(totalAssets - totalLiabilities - totalEquity),
    },
  };
}

module.exports = { buildFinancialStatements };
