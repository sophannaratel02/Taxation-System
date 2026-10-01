const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

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
      if (!error.status) console.error('Monthly WHT request failed:', error);
      res.status(error.status || 500).json({ message: error.status ? error.message : 'Monthly WHT request failed.' });
    }
  };
}

function parseReturnId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new RequestError(400, 'A valid monthly tax return ID is required.');
  return id;
}

function parseBaseAmount(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) {
    throw new RequestError(400, 'Base amount is required and must be non-negative with no more than two decimal places.');
  }
  const amount = Number(text);
  if (!Number.isFinite(amount)) throw new RequestError(400, 'Base amount must be a valid number.');
  return amount;
}

function calculateTax(baseAmount, taxRate) {
  return Math.round(baseAmount * taxRate * 100) / 100;
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length > 500) throw new RequestError(400, 'Provide no more than 500 WHT line items.');
  const seenIds = new Set();
  return items.map((item) => {
    const taxObjectCode = String(item.tax_object_code || '').trim();
    if (!taxObjectCode) throw new RequestError(400, 'Every WHT line must select an object of payment.');
    const rateText = String(item.tax_rate_percent ?? '').trim();
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(rateText) || Number(rateText) > 100) {
      throw new RequestError(400, 'Tax rate is required and must be between 0 and 100 percent.');
    }
    let id = item.id || null;
    if (id) {
      id = String(id);
      if (!/^[0-9a-f-]{36}$/i.test(id) || seenIds.has(id)) throw new RequestError(400, 'A WHT line ID is invalid or duplicated.');
      seenIds.add(id);
    }
    const remarks = String(item.remarks || '');
    if (remarks.length > 5000) throw new RequestError(400, 'Remarks must be 5,000 characters or fewer.');
    const taxRate = Number((Number(rateText) / 100).toFixed(4));
    return { id, taxObjectCode, baseAmount: parseBaseAmount(item.base_amount), taxRate, remarks };
  });
}

async function fetchReturnItems(connection, returnId) {
  const [items] = await connection.execute(
    `SELECT item.id, item.return_id, item.tax_object_code, object.description AS object_description,
            object.category, item.base_amount, item.tax_rate, item.withholding_tax, item.remarks,
            item.legacy_wht_record_id
       FROM wht_return_items AS item
       JOIN wht_tax_objects AS object ON object.object_code = item.tax_object_code
      WHERE item.return_id = ?
      ORDER BY item.created_at, item.id`,
    [returnId]
  );
  return items;
}

router.use(authenticate);

router.get('/monthly/wht-items', route(async (req, res) => {
  const returnId = parseReturnId(req.query.return_id);
  const [[periodRows], [objects]] = await Promise.all([
    pool.execute('SELECT id FROM tax_periods WHERE id = ?', [returnId]),
    pool.execute('SELECT object_code, description, category, default_tax_rate FROM wht_tax_objects ORDER BY category, object_code'),
  ]);
  if (!periodRows.length) throw new RequestError(404, 'Monthly tax return not found.');
  const [items] = await pool.execute(
    `SELECT item.id, item.return_id, item.tax_object_code, object.description AS object_description,
            object.category, item.base_amount, item.tax_rate, item.withholding_tax, item.remarks,
            item.legacy_wht_record_id
       FROM wht_return_items AS item
       JOIN wht_tax_objects AS object ON object.object_code = item.tax_object_code
      WHERE item.return_id = ?
      ORDER BY item.created_at, item.id`,
    [returnId]
  );
  const cents = (field) => items.reduce((sum, item) => sum + Math.round(Number(item[field] || 0) * 100), 0);
  res.json({
    return_id: returnId,
    objects,
    items,
    totals: { base_amount: cents('base_amount') / 100, withholding_tax: cents('withholding_tax') / 100 },
  });
}));

router.post('/monthly/wht-items', route(async (req, res) => {
  const returnId = parseReturnId(req.body.return_id ?? req.body.tax_period_id);
  const items = normalizeItems(req.body.items);
  const replace = req.body.replace === true;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [periodRows] = await connection.execute('SELECT id, status FROM tax_periods WHERE id = ? FOR UPDATE', [returnId]);
    if (!periodRows.length) throw new RequestError(404, 'Monthly tax return not found.');
    if (periodRows[0].status !== 'draft') throw new RequestError(409, 'Only draft monthly tax returns can be edited.');

    const [existingRows] = await connection.execute('SELECT id, tax_object_code, tax_rate FROM wht_return_items WHERE return_id = ? FOR UPDATE', [returnId]);
    const existingById = new Map(existingRows.map((item) => [item.id, item]));
    for (const item of items) {
      if (item.id && !existingById.has(item.id)) throw new RequestError(400, 'A WHT line does not belong to this monthly return.');
    }

    const objectCodes = [...new Set(items.map((item) => item.taxObjectCode))];
    const objectByCode = new Map();
    if (objectCodes.length) {
      const placeholders = objectCodes.map(() => '?').join(', ');
      const [objects] = await connection.execute(
        `SELECT object_code, default_tax_rate FROM wht_tax_objects WHERE object_code IN (${placeholders})`,
        objectCodes
      );
      for (const object of objects) objectByCode.set(object.object_code, Number(object.default_tax_rate));
      for (const code of objectCodes) {
        if (!objectByCode.has(code)) throw new RequestError(400, `Unknown WHT payment object: ${code}.`);
      }
    }

    if (replace) {
      const retainedIds = items.filter((item) => item.id).map((item) => item.id);
      if (retainedIds.length) {
        const placeholders = retainedIds.map(() => '?').join(', ');
        await connection.execute(
          `DELETE FROM wht_return_items WHERE return_id = ? AND id NOT IN (${placeholders})`,
          [returnId, ...retainedIds]
        );
      } else {
        await connection.execute('DELETE FROM wht_return_items WHERE return_id = ?', [returnId]);
      }
    }

    for (const item of items) {
      const taxRate = item.taxRate;
      const withholdingTax = calculateTax(item.baseAmount, taxRate);
      if (item.id) {
        await connection.execute(
          `UPDATE wht_return_items
              SET tax_object_code = ?, base_amount = ?, tax_rate = ?, withholding_tax = ?, remarks = ?, legacy_wht_record_id = NULL
            WHERE id = ? AND return_id = ?`,
          [item.taxObjectCode, item.baseAmount, taxRate, withholdingTax, item.remarks, item.id, returnId]
        );
      } else {
        await connection.execute(
          `INSERT INTO wht_return_items
            (id, return_id, tax_object_code, base_amount, tax_rate, withholding_tax, remarks)
           VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
          [returnId, item.taxObjectCode, item.baseAmount, taxRate, withholdingTax, item.remarks]
        );
      }
    }

    const savedItems = await fetchReturnItems(connection, returnId);
    const cents = (field) => savedItems.reduce((sum, item) => sum + Math.round(Number(item[field] || 0) * 100), 0);
    const response = {
      return_id: returnId,
      items: savedItems,
      totals: { base_amount: cents('base_amount') / 100, withholding_tax: cents('withholding_tax') / 100 },
    };
    await connection.commit();
    res.json(response);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

module.exports = router;
module.exports.calculateTax = calculateTax;
module.exports.parseBaseAmount = parseBaseAmount;
module.exports.normalizeItems = normalizeItems;