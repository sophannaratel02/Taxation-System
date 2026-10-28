const ACCOUNT_TYPES = new Set(['asset', 'liability', 'equity', 'revenue', 'expense']);
const CURRENCIES = new Set(['USD', 'KHR']);

function requestError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw requestError(400, `${label} must be a valid id`);
  return id;
}

function validateDate(value) {
  const date = String(value || '');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date) {
    throw requestError(400, 'A valid entry date in YYYY-MM-DD format is required');
  }
  return date;
}

function prepareAccount(body) {
  const accountCode = String(body.accountCode || '').trim();
  const accountName = String(body.accountName || '').trim();
  const accountType = String(body.accountType || '').trim().toLowerCase();
  const description = String(body.description || '').trim();
  const parentId = body.parentId === '' || body.parentId === undefined || body.parentId === null
    ? null
    : positiveId(body.parentId, 'Parent account');

  if (!accountCode || accountCode.length > 40) throw requestError(400, 'Account code is required and must be at most 40 characters');
  if (!accountName || accountName.length > 160) throw requestError(400, 'Account name is required and must be at most 160 characters');
  if (!ACCOUNT_TYPES.has(accountType)) throw requestError(400, 'Invalid account type');
  if (description.length > 500) throw requestError(400, 'Account description cannot exceed 500 characters');
  return { accountCode, accountName, accountType, parentId, description };
}

function prepareJournal(body, { requireBalanced = false } = {}) {
  const entryDate = validateDate(body.entryDate);
  const currency = String(body.currency || '').toUpperCase();
  const memo = String(body.memo || '').trim();
  if (!CURRENCIES.has(currency)) throw requestError(400, 'Currency must be USD or KHR');
  if (!memo || memo.length > 500) throw requestError(400, 'Journal memo is required and must be at most 500 characters');
  if (!Array.isArray(body.lines) || body.lines.length < 2 || body.lines.length > 200) {
    throw requestError(400, 'A journal entry must contain between 2 and 200 lines');
  }

  let debitUnits = 0;
  let creditUnits = 0;
  const lines = body.lines.map((line, index) => {
    const accountId = positiveId(line?.accountId, `Line ${index + 1} account`);
    const debit = Number(line?.debit ?? 0);
    const credit = Number(line?.credit ?? 0);
    const description = String(line?.description || '').trim();
    if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0) {
      throw requestError(400, `Line ${index + 1} amounts must be non-negative numbers`);
    }
    const debitUnitsForLine = Math.round(debit * 10000);
    const creditUnitsForLine = Math.round(credit * 10000);
    if (!Number.isSafeInteger(debitUnitsForLine) || !Number.isSafeInteger(creditUnitsForLine)
      || Math.abs(debit * 10000 - debitUnitsForLine) > 1e-7
      || Math.abs(credit * 10000 - creditUnitsForLine) > 1e-7) {
      throw requestError(400, `Line ${index + 1} amounts cannot have more than 4 decimal places`);
    }
    if ((debit > 0) === (credit > 0)) {
      throw requestError(400, `Line ${index + 1} must have either a debit or a credit amount`);
    }
    if (description.length > 255) throw requestError(400, `Line ${index + 1} description cannot exceed 255 characters`);
    debitUnits += debitUnitsForLine;
    creditUnits += creditUnitsForLine;
    if (!Number.isSafeInteger(debitUnits) || !Number.isSafeInteger(creditUnits)) {
      throw requestError(400, 'Journal totals exceed the supported precision');
    }
    return { accountId, debit, credit, description };
  });

  if (requireBalanced && debitUnits !== creditUnits) {
    throw requestError(400, 'Journal entry debits and credits must balance');
  }
  return { entryDate, currency, memo, lines, debitUnits, creditUnits };
}

module.exports = { prepareAccount, prepareJournal, positiveId, requestError, validateDate };
