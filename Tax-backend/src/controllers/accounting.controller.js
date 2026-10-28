const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { authenticate, requireAdminForWrites } = require('../middleware/auth');
const { prepareAccount, prepareJournal, positiveId, requestError, validateDate } = require('../services/accountingLedger');
const { buildFinancialStatements } = require('../services/financialStatements');

const router = express.Router();
router.use(authenticate, requireAdminForWrites);

function forwardError(next, error) {
  next(error);
}

async function insertLines(connection, journalId, lines) {
  for (const line of lines) {
    await connection.query(
      'INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)',
      [journalId, line.accountId, line.description, line.debit, line.credit]
    );
  }
}

async function validateParent(database, parentId, accountType, companyId, accountId = null) {
  const visited = new Set();
  let currentId = parentId;
  while (currentId) {
    if (Number(currentId) === Number(accountId)) throw requestError(400, 'Account hierarchy cannot contain a cycle');
    if (visited.has(Number(currentId))) throw requestError(409, 'Existing account hierarchy contains a cycle');
    visited.add(Number(currentId));
    const [rows] = await database.query(
      'SELECT id, parent_id, account_type FROM chart_of_accounts WHERE id = ? AND company_id = ? AND active = 1',
      [currentId, companyId]
    );
    if (!rows.length) throw requestError(400, 'Parent account does not exist or is inactive');
    if (rows[0].account_type !== accountType) throw requestError(400, 'Parent and child accounts must use the same account type');
    currentId = rows[0].parent_id;
  }
}

async function getJournalWithLines(database, id, companyId) {
  const [entries] = await database.query(
    `SELECT id, entry_number, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date,
       currency, memo, status, created_by, posted_by, created_at, posted_at
     FROM journal_entries WHERE id = ? AND company_id = ?`,
    [id, companyId]
  );
  if (!entries.length) return null;
  const [lines] = await database.query(
    `SELECT l.*, a.account_code, a.account_name
     FROM journal_entry_lines l
     JOIN chart_of_accounts a ON a.id = l.account_id AND a.company_id = l.company_id
     WHERE l.journal_entry_id = ? AND l.company_id = ?
     ORDER BY l.id`,
    [id, companyId]
  );
  return { ...entries[0], lines };
}

router.get('/accounts', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT account.*, parent.account_code AS parent_code, parent.account_name AS parent_name
       FROM chart_of_accounts account
       LEFT JOIN chart_of_accounts parent ON parent.id = account.parent_id AND parent.company_id = account.company_id
       WHERE account.company_id = ?
       ORDER BY account.account_code`,
      [req.companyId]
    );
    res.json(rows);
  } catch (error) {
    forwardError(next, error);
  }
});

router.post('/accounts', async (req, res, next) => {
  try {
    const account = prepareAccount(req.body);
    if (account.parentId) await validateParent(pool, account.parentId, account.accountType, req.companyId);
    const [result] = await pool.query(
      `INSERT INTO chart_of_accounts (account_code, account_name, account_type, parent_id, description)
       VALUES (?, ?, ?, ?, ?)`,
      [account.accountCode, account.accountName, account.accountType, account.parentId, account.description]
    );
    const [rows] = await pool.query('SELECT * FROM chart_of_accounts WHERE id = ? AND company_id = ?', [result.insertId, req.companyId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') error.status = 409;
    forwardError(next, error);
  }
});

router.put('/accounts/:id', async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, 'Account');
    const account = prepareAccount(req.body);
    const [existingRows] = await pool.query('SELECT account_code, account_type FROM chart_of_accounts WHERE id = ? AND company_id = ?', [id, req.companyId]);
    if (!existingRows.length) throw requestError(404, 'Account not found');
    if (account.parentId) await validateParent(pool, account.parentId, account.accountType, req.companyId, id);
    if (existingRows[0].account_code !== account.accountCode || existingRows[0].account_type !== account.accountType) {
      const [references] = await pool.query(
        'SELECT COUNT(*) AS count FROM journal_entry_lines WHERE account_id = ? AND company_id = ?',
        [id, req.companyId]
      );
      if (Number(references[0].count) > 0) {
        throw requestError(409, 'Account code and type cannot change after the account is used in a journal');
      }
    }
    await pool.query(
      `UPDATE chart_of_accounts
       SET account_code = ?, account_name = ?, account_type = ?, parent_id = ?, description = ?
       WHERE id = ? AND company_id = ?`,
      [account.accountCode, account.accountName, account.accountType, account.parentId, account.description, id, req.companyId]
    );
    const [rows] = await pool.query('SELECT * FROM chart_of_accounts WHERE id = ? AND company_id = ?', [id, req.companyId]);
    res.json(rows[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      error.status = 409;
      error.message = 'Account code already exists';
    }
    forwardError(next, error);
  }
});

router.delete('/accounts/:id', async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, 'Account');
    const [result] = await pool.query('UPDATE chart_of_accounts SET active = 0 WHERE id = ? AND company_id = ? AND active = 1', [id, req.companyId]);
    if (!result.affectedRows) throw requestError(404, 'Active account not found');
    res.status(204).end();
  } catch (error) {
    forwardError(next, error);
  }
});

router.post('/accounts/:id/activate', async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, 'Account');
    const [result] = await pool.query('UPDATE chart_of_accounts SET active = 1 WHERE id = ? AND company_id = ? AND active = 0', [id, req.companyId]);
    if (!result.affectedRows) throw requestError(404, 'Inactive account not found');
    const [rows] = await pool.query('SELECT * FROM chart_of_accounts WHERE id = ? AND company_id = ?', [id, req.companyId]);
    res.json(rows[0]);
  } catch (error) {
    forwardError(next, error);
  }
});

router.get('/journal-entries', async (req, res, next) => {
  try {
    const conditions = ['company_id = ?'];
    const params = [req.companyId];
    if (req.query.from) {
      conditions.push('entry_date >= ?');
      params.push(validateDate(req.query.from));
    }
    if (req.query.to) {
      conditions.push('entry_date <= ?');
      params.push(validateDate(req.query.to));
    }
    if (req.query.status) {
      if (!['draft', 'posted'].includes(req.query.status)) throw requestError(400, 'Invalid journal status');
      conditions.push('status = ?');
      params.push(req.query.status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [entries] = await pool.query(
      `SELECT id, entry_number, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date,
         currency, memo, status, created_by, posted_by, created_at, posted_at
       FROM journal_entries ${where} ORDER BY entry_date DESC, id DESC LIMIT 500`,
      params
    );
    if (!entries.length) return res.json([]);
    const ids = entries.map((entry) => entry.id);
    const [lines] = await pool.query(
      `SELECT l.*, a.account_code, a.account_name
       FROM journal_entry_lines l
       JOIN chart_of_accounts a ON a.id = l.account_id AND a.company_id = l.company_id
       WHERE l.company_id = ? AND l.journal_entry_id IN (?)
       ORDER BY l.journal_entry_id, l.id`,
      [req.companyId, ids]
    );
    const linesByEntry = new Map();
    for (const line of lines) {
      if (!linesByEntry.has(Number(line.journal_entry_id))) linesByEntry.set(Number(line.journal_entry_id), []);
      linesByEntry.get(Number(line.journal_entry_id)).push(line);
    }
    res.json(entries.map((entry) => ({ ...entry, lines: linesByEntry.get(Number(entry.id)) || [] })));
  } catch (error) {
    forwardError(next, error);
  }
});

router.post('/journal-entries', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const entry = prepareJournal(req.body);
    await connection.beginTransaction();
    const [accounts] = await connection.query(
      'SELECT id FROM chart_of_accounts WHERE company_id = ? AND active = 1 AND id IN (?) FOR UPDATE',
      [req.companyId, entry.lines.map((line) => line.accountId)]
    );
    if (accounts.length !== new Set(entry.lines.map((line) => line.accountId)).size) {
      throw requestError(400, 'Every journal line must use an active account');
    }
    const [result] = await connection.query(
      `INSERT INTO journal_entries (entry_number, entry_date, currency, memo, status, created_by)
       VALUES (?, ?, ?, ?, 'draft', ?)`,
      [`D-${crypto.randomUUID()}`, entry.entryDate, entry.currency, entry.memo, req.user.id]
    );
    const entryNumber = `JE-${entry.entryDate.slice(0, 4)}-${String(result.insertId).padStart(6, '0')}`;
    await connection.query('UPDATE journal_entries SET entry_number = ? WHERE id = ? AND company_id = ?', [entryNumber, result.insertId, req.companyId]);
    await insertLines(connection, result.insertId, entry.lines);
    const response = await getJournalWithLines(connection, result.insertId, req.companyId);
    await connection.commit();
    res.status(201).json(response);
  } catch (error) {
    await connection.rollback();
    forwardError(next, error);
  } finally {
    connection.release();
  }
});

router.put('/journal-entries/:id', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const id = positiveId(req.params.id, 'Journal entry');
    const entry = prepareJournal(req.body);
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT status FROM journal_entries WHERE id = ? AND company_id = ? FOR UPDATE', [id, req.companyId]);
    if (!existing.length) throw requestError(404, 'Journal entry not found');
    if (existing[0].status !== 'draft') throw requestError(409, 'Posted journal entries cannot be edited');
    const [accounts] = await connection.query(
      'SELECT id FROM chart_of_accounts WHERE company_id = ? AND active = 1 AND id IN (?) FOR UPDATE',
      [req.companyId, entry.lines.map((line) => line.accountId)]
    );
    if (accounts.length !== new Set(entry.lines.map((line) => line.accountId)).size) {
      throw requestError(400, 'Every journal line must use an active account');
    }
    await connection.query(
      'UPDATE journal_entries SET entry_date = ?, currency = ?, memo = ? WHERE id = ? AND company_id = ?',
      [entry.entryDate, entry.currency, entry.memo, id, req.companyId]
    );
    await connection.query('DELETE FROM journal_entry_lines WHERE journal_entry_id = ? AND company_id = ?', [id, req.companyId]);
    await insertLines(connection, id, entry.lines);
    const response = await getJournalWithLines(connection, id, req.companyId);
    await connection.commit();
    res.json(response);
  } catch (error) {
    await connection.rollback();
    forwardError(next, error);
  } finally {
    connection.release();
  }
});

router.post('/journal-entries/:id/post', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const id = positiveId(req.params.id, 'Journal entry');
    await connection.beginTransaction();
    const [entries] = await connection.query('SELECT status FROM journal_entries WHERE id = ? AND company_id = ? FOR UPDATE', [id, req.companyId]);
    if (!entries.length) throw requestError(404, 'Journal entry not found');
    if (entries[0].status !== 'draft') throw requestError(409, 'Journal entry is already posted');
    const [inactiveAccounts] = await connection.query(
      `SELECT COUNT(DISTINCT l.account_id) AS count
       FROM journal_entry_lines l
       JOIN chart_of_accounts a ON a.id = l.account_id AND a.company_id = l.company_id
       WHERE l.company_id = ? AND l.journal_entry_id = ? AND a.active = 0`,
      [req.companyId, id]
    );
    if (Number(inactiveAccounts[0].count) > 0) {
      throw requestError(409, 'Reactivate every account on this journal before posting it');
    }
    const [totals] = await connection.query(
      `SELECT COUNT(*) AS line_count,
         COALESCE(SUM(debit), 0) AS debits,
         COALESCE(SUM(credit), 0) AS credits,
         COALESCE(SUM(debit), 0) = COALESCE(SUM(credit), 0) AS is_balanced
       FROM journal_entry_lines WHERE company_id = ? AND journal_entry_id = ?`,
      [req.companyId, id]
    );
    if (Number(totals[0].line_count) < 2 || !Number(totals[0].is_balanced)) {
      throw requestError(400, 'Journal entry must have at least two lines and equal debit and credit totals');
    }
    await connection.query(
      "UPDATE journal_entries SET status = 'posted', posted_by = ?, posted_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?",
      [req.user.id, id, req.companyId]
    );
    await connection.commit();
    res.json({ id, status: 'posted' });
  } catch (error) {
    await connection.rollback();
    forwardError(next, error);
  } finally {
    connection.release();
  }
});

router.delete('/journal-entries/:id', async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, 'Journal entry');
    const [result] = await pool.query("DELETE FROM journal_entries WHERE id = ? AND company_id = ? AND status = 'draft'", [id, req.companyId]);
    if (!result.affectedRows) throw requestError(409, 'Only draft journal entries can be deleted');
    res.status(204).end();
  } catch (error) {
    forwardError(next, error);
  }
});

router.get('/trial-balance', async (req, res, next) => {
  try {
    const asOf = validateDate(req.query.asOf || new Date().toISOString().slice(0, 10));
    const currency = String(req.query.currency || '').toUpperCase();
    if (!['USD', 'KHR'].includes(currency)) throw requestError(400, 'Currency must be USD or KHR');
    const [rows] = await pool.query(
      `SELECT a.id, a.account_code, a.account_name, a.account_type,
         COALESCE(SUM(CASE WHEN j.id IS NULL THEN 0 ELSE l.debit END), 0) AS debit,
         COALESCE(SUM(CASE WHEN j.id IS NULL THEN 0 ELSE l.credit END), 0) AS credit
       FROM chart_of_accounts a
       LEFT JOIN journal_entry_lines l ON l.account_id = a.id AND l.company_id = a.company_id
       LEFT JOIN journal_entries j
         ON j.id = l.journal_entry_id
         AND j.company_id = a.company_id
         AND j.status = 'posted'
         AND j.currency = ?
         AND j.entry_date <= ?
       WHERE a.company_id = ?
       GROUP BY a.id, a.account_code, a.account_name, a.account_type
       ORDER BY a.account_code`,
      [currency, asOf, req.companyId]
    );
    const balances = rows.map((row) => {
      const debit = Number(row.debit);
      const credit = Number(row.credit);
      return { ...row, debit, credit };
    });
    const debitTotal = balances.reduce((sum, row) => sum + row.debit, 0);
    const creditTotal = balances.reduce((sum, row) => sum + row.credit, 0);
    res.json({ asOf, currency, accounts: balances, debitTotal, creditTotal });
  } catch (error) {
    forwardError(next, error);
  }
});

router.get('/financial-statements', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const asOf = validateDate(req.query.asOf || today);
    const defaultFrom = `${asOf.slice(0, 4)}-01-01`;
    const fromDate = validateDate(req.query.from || defaultFrom);
    const toDate = validateDate(req.query.to || asOf);
    const currency = String(req.query.currency || '').toUpperCase();
    if (!['USD', 'KHR'].includes(currency)) throw requestError(400, 'Currency must be USD or KHR');
    if (fromDate > toDate) throw requestError(400, 'Start date cannot be after end date');
    if (toDate > asOf) throw requestError(400, 'Income statement end date cannot be after the balance sheet date');
    const yearStart = `${asOf.slice(0, 4)}-01-01`;
    const [rows] = await pool.query(
      `SELECT a.id, a.account_code, a.account_name, a.account_type,
         COALESCE(SUM(CASE WHEN j.entry_date BETWEEN ? AND ? THEN l.debit ELSE 0 END), 0) AS period_debit,
         COALESCE(SUM(CASE WHEN j.entry_date BETWEEN ? AND ? THEN l.credit ELSE 0 END), 0) AS period_credit,
         COALESCE(SUM(CASE WHEN j.entry_date BETWEEN ? AND ? THEN l.debit ELSE 0 END), 0) AS year_debit,
         COALESCE(SUM(CASE WHEN j.entry_date BETWEEN ? AND ? THEN l.credit ELSE 0 END), 0) AS year_credit,
         COALESCE(SUM(CASE WHEN j.entry_date <= ? THEN l.debit ELSE 0 END), 0) AS as_of_debit,
         COALESCE(SUM(CASE WHEN j.entry_date <= ? THEN l.credit ELSE 0 END), 0) AS as_of_credit
       FROM chart_of_accounts a
       LEFT JOIN journal_entry_lines l ON l.account_id = a.id AND l.company_id = a.company_id
       LEFT JOIN journal_entries j
         ON j.id = l.journal_entry_id
         AND j.company_id = a.company_id
         AND j.status = 'posted'
         AND j.currency = ?
         AND j.entry_date <= ?
       WHERE a.company_id = ?
       GROUP BY a.id, a.account_code, a.account_name, a.account_type
       ORDER BY a.account_code`,
      [
        fromDate, toDate, fromDate, toDate, yearStart, asOf, yearStart, asOf,
        asOf, asOf, currency, asOf, req.companyId,
      ]
    );
    res.json(buildFinancialStatements(rows, { fromDate, toDate, asOf, currency }));
  } catch (error) {
    forwardError(next, error);
  }
});

module.exports = router;
