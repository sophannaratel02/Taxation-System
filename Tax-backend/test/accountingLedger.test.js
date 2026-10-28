const assert = require('node:assert/strict');
const test = require('node:test');
const accountingController = require('../src/controllers/accounting.controller');
const { authenticate, requireAdminForWrites } = require('../src/middleware/auth');
const { prepareAccount, prepareJournal, validateDate } = require('../src/services/accountingLedger');

test('accounting reads require authentication and writes require administrator authorization', () => {
  const middleware = accountingController.stack
    .filter((layer) => !layer.route)
    .map((layer) => layer.handle);
  assert.ok(middleware.includes(authenticate));
  assert.ok(middleware.includes(requireAdminForWrites));
  for (const path of ['/accounts', '/journal-entries', '/trial-balance', '/financial-statements']) {
    assert.ok(accountingController.stack.some((layer) => layer.route?.path === path));
  }
});

test('chart accounts validate type, text, and optional parent id', () => {
  assert.deepEqual(prepareAccount({
    accountCode: '1000',
    accountName: 'Cash',
    accountType: 'asset',
    parentId: '2',
    description: 'Cash on hand',
  }), {
    accountCode: '1000',
    accountName: 'Cash',
    accountType: 'asset',
    parentId: 2,
    description: 'Cash on hand',
  });
  assert.throws(() => prepareAccount({
    accountCode: '1000',
    accountName: 'Cash',
    accountType: 'invalid',
  }), /Invalid account type/);
  assert.throws(() => prepareAccount({
    accountCode: '1000',
    accountName: 'Cash',
    accountType: 'asset',
    parentId: '0',
  }), /Parent account must be a valid id/);
});

test('journal lines accept four-decimal values and total using ten-thousandths', () => {
  const journal = prepareJournal({
    entryDate: '2026-10-07',
    currency: 'USD',
    memo: 'Opening cash',
    lines: [
      { accountId: 1, debit: 0.29, credit: 0 },
      { accountId: 2, debit: 0, credit: 0.29 },
    ],
  });
  assert.equal(journal.debitUnits, 2900);
  assert.equal(journal.creditUnits, 2900);
  const fractional = prepareJournal({
    entryDate: '2026-10-07',
    currency: 'USD',
    memo: 'Four decimal places',
    lines: [
      { accountId: 1, debit: 0.0001, credit: 0 },
      { accountId: 2, debit: 0, credit: 0.0001 },
    ],
  }, { requireBalanced: true });
  assert.equal(fractional.debitUnits, 1);
});

test('journal validation rejects unbalanced, invalid, and over-precision lines', () => {
  const base = {
    entryDate: '2026-10-07',
    currency: 'KHR',
    memo: 'Test entry',
    lines: [
      { accountId: 1, debit: 1, credit: 0 },
      { accountId: 2, debit: 0, credit: 1 },
    ],
  };
  assert.throws(() => prepareJournal({ ...base, currency: 'EUR' }), /Currency must be USD or KHR/);
  assert.throws(() => prepareJournal({
    ...base,
    lines: [{ accountId: 1, debit: 1, credit: 1 }, base.lines[1]],
  }), /either a debit or a credit/);
  assert.throws(() => prepareJournal({
    ...base,
    lines: [{ accountId: 1, debit: 1.00001, credit: 0 }, base.lines[1]],
  }), /4 decimal places/);
  assert.throws(() => prepareJournal({
    ...base,
    lines: [{ accountId: 1, debit: 3, credit: 0 }, base.lines[1]],
  }, { requireBalanced: true }), /must balance/);
});

test('accounting dates must be real ISO calendar dates', () => {
  assert.equal(validateDate('2026-10-07'), '2026-10-07');
  assert.throws(() => validateDate('2026-02-30'), /valid entry date/);
  assert.throws(() => validateDate('07-10-2026'), /valid entry date/);
});
