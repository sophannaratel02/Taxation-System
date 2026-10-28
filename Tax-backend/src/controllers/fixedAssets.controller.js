const crypto = require('crypto');
const express = require('express');
const { pool } = require('../db');
const { authenticate, requireAdminForWrites } = require('../middleware/auth');
const { positiveId, requestError, validateDate } = require('../services/accountingLedger');
const {
  calculateMonthlyDepreciation,
  isMonthEnd,
  prepareAsset,
  prepareAssetClass,
} = require('../services/fixedAssets');

const router = express.Router();
router.use(authenticate, requireAdminForWrites);

function sendError(next, error) {
  if (error.code === 'ER_DUP_ENTRY') {
    error.status = 409;
    error.message = 'The asset code, class code, or journal entry number already exists';
  }
  next(error);
}

function monthEnd(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function nextMonthEnd(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return monthEnd(parsed.getUTCFullYear(), parsed.getUTCMonth() + 2);
}

function dateString(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

async function validateAssetReferences(database, asset, companyId) {
  const [classes] = await database.query(
    'SELECT id, depreciation_method, annual_rate FROM fixed_asset_classes WHERE id = ? AND company_id = ? AND active = 1',
    [asset.classId, companyId]
  );
  if (!classes.length) throw requestError(400, 'Asset class does not exist or is inactive');

  const accountIds = [
    asset.assetAccountId,
    asset.depreciationAccountId,
    asset.accumulatedDepreciationAccountId,
  ];
  if (new Set(accountIds).size !== accountIds.length) {
    throw requestError(400, 'Asset, depreciation expense, and accumulated depreciation accounts must be different');
  }
  const [accounts] = await database.query(
    `SELECT id, account_type, active FROM chart_of_accounts WHERE company_id = ? AND id IN (${accountIds.map(() => '?').join(',')})`,
    [companyId, ...accountIds]
  );
  const types = new Map(accounts.map((account) => [Number(account.id), account]));
  const expectedTypes = [
    [asset.assetAccountId, 'asset', 'Asset account'],
    [asset.depreciationAccountId, 'expense', 'Depreciation expense account'],
    [asset.accumulatedDepreciationAccountId, 'asset', 'Accumulated depreciation account'],
  ];
  for (const [id, type, label] of expectedTypes) {
    const account = types.get(id);
    if (!account || !account.active || account.account_type !== type) {
      throw requestError(400, `${label} must be an active ${type} account`);
    }
  }
  if (asset.vendorId) {
    const [vendors] = await database.query('SELECT id FROM vendors WHERE id = ? AND company_id = ? AND active = 1', [asset.vendorId, companyId]);
    if (!vendors.length) throw requestError(400, 'Vendor does not exist or is inactive');
  }
  return classes[0];
}

router.get('/asset-classes', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM fixed_asset_classes WHERE company_id = ? ORDER BY class_name', [req.companyId]);
    res.json(rows);
  } catch (error) {
    sendError(next, error);
  }
});

router.post('/asset-classes', async (req, res, next) => {
  try {
    const assetClass = prepareAssetClass(req.body || {});
    const [result] = await pool.query(
      `INSERT INTO fixed_asset_classes
        (company_id, class_code, class_name, description, depreciation_method, annual_rate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.companyId,
        assetClass.classCode,
        assetClass.className,
        assetClass.description,
        assetClass.depreciationMethod,
        assetClass.annualRate,
      ]
    );
    const [rows] = await pool.query(
      'SELECT * FROM fixed_asset_classes WHERE id = ? AND company_id = ?',
      [result.insertId, req.companyId]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(next, error);
  }
});

router.put('/asset-classes/:id', async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, 'Asset class');
    const className = String(req.body.className || '').trim();
    const description = String(req.body.description || '').trim();
    const method = String(req.body.depreciationMethod || '');
    const rate = Number(req.body.annualRate);
    const active = req.body.active === false || req.body.active === 0 ? 0 : 1;
    if (!className || className.length > 160) throw requestError(400, 'Class name is required and must be at most 160 characters');
    if (description.length > 500) throw requestError(400, 'Class description cannot exceed 500 characters');
    if (!['straight_line', 'declining'].includes(method)) throw requestError(400, 'Invalid depreciation method');
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw requestError(400, 'Annual rate must be greater than 0 and at most 1');
    const [result] = await pool.query(
      `UPDATE fixed_asset_classes
       SET class_name = ?, description = ?, depreciation_method = ?, annual_rate = ?, active = ?
       WHERE id = ? AND company_id = ?`,
      [className, description || null, method, rate, active, id, req.companyId]
    );
    if (!result.affectedRows) throw requestError(404, 'Asset class not found');
    const [rows] = await pool.query('SELECT * FROM fixed_asset_classes WHERE id = ? AND company_id = ?', [id, req.companyId]);
    res.json(rows[0]);
  } catch (error) {
    sendError(next, error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    if (status && !['active', 'sold', 'disposed'].includes(status)) throw requestError(400, 'Invalid asset status filter');
    const [rows] = await pool.query(
      `SELECT fa.*, DATE_FORMAT(fa.acquisition_date, '%Y-%m-%d') AS acquisition_date,
         DATE_FORMAT(fa.deployment_date, '%Y-%m-%d') AS deployment_date,
         DATE_FORMAT(fa.disposal_date, '%Y-%m-%d') AS disposal_date,
         cls.class_code, cls.class_name, v.name AS vendor_name,
         aa.account_code AS asset_account_code, aa.account_name AS asset_account_name,
         da.account_code AS depreciation_account_code, da.account_name AS depreciation_account_name,
         ada.account_code AS accumulated_depreciation_account_code,
         ada.account_name AS accumulated_depreciation_account_name
       FROM fixed_assets fa
       JOIN fixed_asset_classes cls ON cls.id = fa.class_id
       LEFT JOIN vendors v ON v.id = fa.vendor_id
       JOIN chart_of_accounts aa ON aa.id = fa.asset_account_id
       JOIN chart_of_accounts da ON da.id = fa.depreciation_account_id
       JOIN chart_of_accounts ada ON ada.id = fa.accumulated_depreciation_account_id
       WHERE fa.company_id = ? AND cls.company_id = fa.company_id
         AND (v.id IS NULL OR v.company_id = fa.company_id)
         AND aa.company_id = fa.company_id AND da.company_id = fa.company_id
         AND ada.company_id = fa.company_id AND (? IS NULL OR fa.status = ?)
       ORDER BY fa.asset_number DESC`,
      [req.companyId, status, status]
    );
    res.json(rows);
  } catch (error) {
    sendError(next, error);
  }
});

router.post('/', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const asset = prepareAsset(req.body);
    await connection.beginTransaction();
    const assetClass = await validateAssetReferences(connection, asset, req.companyId);
    const assetNumber = `FA-${new Date().getUTCFullYear()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const [result] = await connection.query(
      `INSERT INTO fixed_assets
        (asset_number, asset_code, asset_name, description, class_id, manufacturer_number,
         invoice_number, location, custodian, vendor_id, asset_account_id, depreciation_account_id,
         accumulated_depreciation_account_id, currency, acquisition_date, acquisition_value,
         deployment_date, depreciation_method, annual_rate, residual_value, accumulated_depreciation,
         created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assetNumber, asset.assetCode, asset.assetName, asset.description, asset.classId,
        asset.manufacturerNumber, asset.invoiceNumber, asset.location, asset.custodian,
        asset.vendorId, asset.assetAccountId, asset.depreciationAccountId,
        asset.accumulatedDepreciationAccountId, asset.currency, asset.acquisitionDate,
        asset.acquisitionValue, asset.deploymentDate, assetClass.depreciation_method,
        assetClass.annual_rate, asset.residualValue, asset.accumulatedDepreciation, req.user.id,
      ]
    );
    await connection.commit();
    res.status(201).json({ id: result.insertId, assetNumber, ...asset, depreciationMethod: assetClass.depreciation_method, annualRate: assetClass.annual_rate });
  } catch (error) {
    await connection.rollback();
    sendError(next, error);
  } finally {
    connection.release();
  }
});

router.post('/run-depreciation', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const periodEnd = validateDate(req.body.periodEnd);
    if (!isMonthEnd(periodEnd)) throw requestError(400, 'Depreciation period must be the last calendar day of a month');
    const today = new Date().toISOString().slice(0, 10);
    if (periodEnd > today) throw requestError(400, 'Cannot post depreciation for a future accounting period');

    await connection.beginTransaction();
    const [assets] = await connection.query(
      `SELECT * FROM fixed_assets WHERE company_id = ? AND status = 'active' AND deployment_date <= ?
       ORDER BY id FOR UPDATE`,
      [req.companyId, periodEnd]
    );
    const posted = [];
    const skipped = [];
    for (const asset of assets) {
      const [latestRows] = await connection.query(
        'SELECT MAX(period_end) AS last_period FROM fixed_asset_depreciation WHERE asset_id = ? AND company_id = ?',
        [asset.id, req.companyId]
      );
      const lastPeriod = latestRows[0].last_period ? dateString(latestRows[0].last_period) : null;
      const deploymentDate = new Date(`${dateString(asset.deployment_date)}T00:00:00.000Z`);
      const firstPeriod = monthEnd(deploymentDate.getUTCFullYear(), deploymentDate.getUTCMonth() + 1);
      const expectedPeriod = lastPeriod ? nextMonthEnd(lastPeriod) : firstPeriod;
      if (periodEnd !== expectedPeriod) {
        skipped.push({ assetId: asset.id, reason: `Next required depreciation period is ${expectedPeriod}` });
        continue;
      }

      const bookValueBefore = Number(asset.acquisition_value) - Number(asset.accumulated_depreciation);
      const [accountRows] = await connection.query(
        `SELECT id, account_type, active FROM chart_of_accounts
         WHERE company_id = ? AND id IN (?, ?, ?)`,
        [req.companyId, asset.asset_account_id, asset.depreciation_account_id, asset.accumulated_depreciation_account_id]
      );
      const accountMap = new Map(accountRows.map((account) => [Number(account.id), account]));
      if (!accountMap.get(Number(asset.asset_account_id))?.active
        || accountMap.get(Number(asset.asset_account_id))?.account_type !== 'asset'
        || !accountMap.get(Number(asset.depreciation_account_id))?.active
        || accountMap.get(Number(asset.depreciation_account_id))?.account_type !== 'expense'
        || !accountMap.get(Number(asset.accumulated_depreciation_account_id))?.active
        || accountMap.get(Number(asset.accumulated_depreciation_account_id))?.account_type !== 'asset') {
        throw requestError(409, `Asset ${asset.asset_number} has an inactive or incorrectly typed ledger account`);
      }
      const amount = calculateMonthlyDepreciation({
        method: asset.depreciation_method,
        annualRate: asset.annual_rate,
        acquisitionValue: asset.acquisition_value,
        residualValue: asset.residual_value,
        accumulatedDepreciation: asset.accumulated_depreciation,
      });
      if (amount <= 0) {
        skipped.push({ assetId: asset.id, reason: 'Asset is fully depreciated to its residual value' });
        continue;
      }

      const entryNumber = `FA-${asset.id}-${periodEnd.replaceAll('-', '')}`;
      const memo = `Depreciation ${asset.asset_number} for ${periodEnd.slice(0, 7)}`;
      const [entryResult] = await connection.query(
        `INSERT INTO journal_entries
          (entry_number, entry_date, currency, memo, status, created_by, posted_by, posted_at)
         VALUES (?, ?, ?, ?, 'posted', ?, ?, CURRENT_TIMESTAMP)`,
        [entryNumber, periodEnd, asset.currency, memo, req.user.id, req.user.id]
      );
      await connection.query(
        `INSERT INTO journal_entry_lines
          (journal_entry_id, account_id, description, debit, credit)
         VALUES (?, ?, ?, ?, 0), (?, ?, ?, 0, ?)`,
        [
          entryResult.insertId, asset.depreciation_account_id, memo, amount,
          entryResult.insertId, asset.accumulated_depreciation_account_id, memo, amount,
        ]
      );
      const accumulatedAfter = Math.round((Number(asset.accumulated_depreciation) + amount) * 10000) / 10000;
      const bookValueAfter = Math.round((Number(asset.acquisition_value) - accumulatedAfter) * 10000) / 10000;
      await connection.query(
        `INSERT INTO fixed_asset_depreciation
          (asset_id, period_end, months_depreciated, depreciation_amount, accumulated_before,
           accumulated_after, book_value_before, book_value_after, journal_entry_id, created_by)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        [
          asset.id, periodEnd, amount, asset.accumulated_depreciation, accumulatedAfter,
          bookValueBefore, bookValueAfter, entryResult.insertId, req.user.id,
        ]
      );
      await connection.query(
        'UPDATE fixed_assets SET accumulated_depreciation = ? WHERE id = ? AND company_id = ?',
        [accumulatedAfter, asset.id, req.companyId]
      );
      posted.push({ assetId: asset.id, entryNumber, amount, currency: asset.currency, bookValueAfter });
    }
    await connection.commit();
    res.json({ periodEnd, posted, skipped });
  } catch (error) {
    await connection.rollback();
    sendError(next, error);
  } finally {
    connection.release();
  }
});

router.get('/depreciation', async (req, res, next) => {
  try {
    const fromDate = req.query.from ? validateDate(req.query.from) : null;
    const toDate = req.query.to ? validateDate(req.query.to) : null;
    if (fromDate && toDate && fromDate > toDate) throw requestError(400, 'Start date cannot be after end date');
    const [rows] = await pool.query(
      `SELECT d.*, DATE_FORMAT(d.period_end, '%Y-%m-%d') AS period_end,
         fa.asset_number, fa.asset_code, fa.asset_name, fa.currency, je.entry_number
       FROM fixed_asset_depreciation d
       JOIN fixed_assets fa ON fa.id = d.asset_id AND fa.company_id = d.company_id
       LEFT JOIN journal_entries je ON je.id = d.journal_entry_id AND je.company_id = d.company_id
       WHERE d.company_id = ? AND (? IS NULL OR d.period_end >= ?) AND (? IS NULL OR d.period_end <= ?)
       ORDER BY d.period_end DESC, fa.asset_number`,
      [req.companyId, fromDate, fromDate, toDate, toDate]
    );
    res.json(rows);
  } catch (error) {
    sendError(next, error);
  }
});

router.post('/:id/dispose', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const id = positiveId(req.params.id, 'Asset');
    const disposalDate = validateDate(req.body.disposalDate);
    if (disposalDate > new Date().toISOString().slice(0, 10)) {
      throw requestError(400, 'Disposal date cannot be in the future');
    }
    const disposalValue = Number(req.body.disposalValue);
    const settlementAccountId = positiveId(req.body.settlementAccountId, 'Cash or bank settlement account');
    const disposalUnits = Math.round(disposalValue * 10000);
    if (!Number.isFinite(disposalValue) || disposalValue < 0 || !Number.isSafeInteger(disposalUnits)
      || Math.abs(disposalValue * 10000 - disposalUnits) > 1e-7) {
      throw requestError(400, 'Disposal proceeds must be a non-negative amount with at most 4 decimal places');
    }

    await connection.beginTransaction();
    const [assets] = await connection.query('SELECT * FROM fixed_assets WHERE id = ? AND company_id = ? FOR UPDATE', [id, req.companyId]);
    if (!assets.length) throw requestError(404, 'Asset not found');
    const asset = assets[0];
    if (asset.status !== 'active') throw requestError(409, 'Only active assets can be disposed');
    if (disposalDate < dateString(asset.acquisition_date)) {
      throw requestError(400, 'Disposal date cannot be before acquisition');
    }
    const [depreciationPeriods] = await connection.query(
      'SELECT MAX(period_end) AS last_period FROM fixed_asset_depreciation WHERE asset_id = ? AND company_id = ?',
      [id, req.companyId]
    );
    if (depreciationPeriods[0].last_period && disposalDate < dateString(depreciationPeriods[0].last_period)) {
      throw requestError(409, 'Disposal date cannot be before the latest posted depreciation period');
    }
    if (!['sold', 'disposed'].includes(req.body.disposalType || 'disposed')) {
      throw requestError(400, 'Disposal type must be sold or disposed');
    }
    const [accounts] = await connection.query(
      `SELECT id, account_type, active FROM chart_of_accounts
       WHERE company_id = ? AND id IN (?, ?, ?, ?)`,
      [
        req.companyId,
        asset.asset_account_id,
        asset.accumulated_depreciation_account_id,
        asset.depreciation_account_id,
        settlementAccountId,
      ]
    );
    const accountMap = new Map(accounts.map((account) => [Number(account.id), account]));
    if ([asset.asset_account_id, asset.accumulated_depreciation_account_id, asset.depreciation_account_id, settlementAccountId]
      .some((accountId) => !accountMap.get(Number(accountId))?.active)) {
      throw requestError(400, 'Disposal journal requires active asset, accumulated depreciation, expense, and settlement accounts');
    }
    if (Number(settlementAccountId) === Number(asset.asset_account_id)
      || Number(settlementAccountId) === Number(asset.accumulated_depreciation_account_id)) {
      throw requestError(400, 'Settlement account must be different from the asset accounts');
    }
    if (accountMap.get(Number(asset.asset_account_id)).account_type !== 'asset'
      || accountMap.get(Number(asset.accumulated_depreciation_account_id)).account_type !== 'asset'
      || accountMap.get(Number(asset.depreciation_account_id)).account_type !== 'expense') {
      throw requestError(400, 'The asset accounts no longer have the required account types');
    }
    const settlement = accountMap.get(settlementAccountId);
    if (!['asset'].includes(settlement.account_type)) throw requestError(400, 'Settlement account must be an asset account');

    const bookValue = Number(asset.acquisition_value) - Number(asset.accumulated_depreciation);
    const difference = Math.round((disposalValue - bookValue) * 10000) / 10000;
    const entryNumber = `FAD-${asset.id}-${disposalDate.replaceAll('-', '')}`;
    const memo = `Disposal ${asset.asset_number}`;
    const [entryResult] = await connection.query(
      `INSERT INTO journal_entries
        (entry_number, entry_date, currency, memo, status, created_by, posted_by, posted_at)
       VALUES (?, ?, ?, ?, 'posted', ?, ?, CURRENT_TIMESTAMP)`,
      [entryNumber, disposalDate, asset.currency, memo, req.user.id, req.user.id]
    );
    const lines = [
      [asset.accumulated_depreciation_account_id, `Remove accumulated depreciation: ${asset.asset_number}`, Number(asset.accumulated_depreciation), 0],
      [settlementAccountId, `Disposal proceeds: ${asset.asset_number}`, disposalValue, 0],
      [asset.asset_account_id, `Remove asset cost: ${asset.asset_number}`, 0, Number(asset.acquisition_value)],
    ];
    if (difference < 0) {
      const lossAccountId = positiveId(req.body.lossAccountId, 'Loss on disposal account');
      const [lossRows] = await connection.query(
        'SELECT id FROM chart_of_accounts WHERE id = ? AND company_id = ? AND account_type = ? AND active = 1',
        [lossAccountId, req.companyId, 'expense']
      );
      if (!lossRows.length) throw requestError(400, 'Loss account must be an active expense account');
      lines.push([lossAccountId, `Loss on disposal: ${asset.asset_number}`, Math.abs(difference), 0]);
    } else if (difference > 0) {
      const gainAccountId = positiveId(req.body.gainAccountId, 'Gain on disposal account');
      const [gainRows] = await connection.query(
        'SELECT id FROM chart_of_accounts WHERE id = ? AND company_id = ? AND account_type = ? AND active = 1',
        [gainAccountId, req.companyId, 'revenue']
      );
      if (!gainRows.length) throw requestError(400, 'Gain account must be an active revenue account');
      lines.push([gainAccountId, `Gain on disposal: ${asset.asset_number}`, 0, difference]);
    }
    for (const [accountId, description, debit, credit] of lines) {
      if (debit === 0 && credit === 0) continue;
      await connection.query(
        `INSERT INTO journal_entry_lines
          (journal_entry_id, account_id, description, debit, credit)
         VALUES (?, ?, ?, ?, ?)`,
        [entryResult.insertId, accountId, description, debit, credit]
      );
    }
    await connection.query(
      `UPDATE fixed_assets
       SET status = ?, disposal_date = ?, disposal_value = ?, disposal_journal_entry_id = ?
       WHERE id = ? AND company_id = ?`,
      [req.body.disposalType === 'sold' ? 'sold' : 'disposed', disposalDate, disposalValue, entryResult.insertId, id, req.companyId]
    );
    await connection.commit();
    res.json({ id, status: req.body.disposalType === 'sold' ? 'sold' : 'disposed', entryNumber, disposalValue, bookValue, gainOrLoss: difference });
  } catch (error) {
    await connection.rollback();
    sendError(next, error);
  } finally {
    connection.release();
  }
});

module.exports = router;
