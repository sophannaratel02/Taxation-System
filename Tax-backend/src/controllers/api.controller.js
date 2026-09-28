const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { khqrData } = require('bakong-khqr');

const { pool } = require('../db');
const authRoutes = require('../routes/auth');
const { authenticate: auth, requireAdmin: adminOnly } = require('../middleware/auth');
const { uploadsDirectory, uploadSingleDocument } = require('../middleware/uploadDocument');

const api = express.Router();
const jwtSecret = process.env.JWT_SECRET || 'development-secret-change-me';
const DEFAULT_VAT_RATE = 0.10;
const PAYWAY_QR_LIFETIME_MINUTES = 15;
const PAYWAY_QR_IMAGE_TEMPLATE = 'template3_color';

// ==========================================
// HELPERS
// ==========================================
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function roundToTwo(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function normalizeKhqrCurrency(currency) {
  const value = String(currency || '').toUpperCase();
  if (value === 'USD' || value === String(khqrData.currency.usd)) return 'USD';
  if (value === 'KHR' || value === String(khqrData.currency.khr)) return 'KHR';
  return '';
}

function paywayRequestHash(fields) {
  const apiKey = String(process.env.ABA_PAYWAY_API_KEY || '').trim();
  return crypto.createHmac('sha512', apiKey).update(fields.map((field) => String(field ?? '')).join('')).digest('base64');
}

function paywayCallbackHash(payload) {
  const fields = Object.keys(payload)
    .sort()
    .map((key) => {
      const value = payload[key];
      return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    });
  return paywayRequestHash(fields);
}

function paywayEndpoint(action) {
  const configuredUrl = String(process.env.ABA_PAYWAY_BASE_URL || 'https://checkout-sandbox.payway.com.kh').trim();
  const baseUrl = new URL(configuredUrl);
  if (baseUrl.protocol !== 'https:') throw new Error('ABA PayWay API URL must use HTTPS.');
  return new URL(`/api/payment-gateway/v1/payments/${action}`, baseUrl.origin).toString();
}

function paywayRequestTime() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function parseUnits(unitsData) {
  if (!unitsData) return [];
  if (typeof unitsData === 'string') {
    try {
      return JSON.parse(unitsData);
    } catch {
      return [];
    }
  }
  return unitsData;
}

function mapItem(row) {
  return {
    id: row.id,
    barcode: row.barcode,
    nameKh: row.name_kh,
    nameEn: row.name_en,
    department: row.department,
    category: row.category,
    brand: row.brand,
    baseUnit: row.base_unit,
    qtyOnHand: Number(row.qty_on_hand),
    reorderQty: Number(row.reorder_qty),
    retailPrice: Number(row.retail_price),
    purchaseCost: Number(row.purchase_cost),
    averageCost: Number(row.average_cost),
    vendorId: row.vendor_id,
    units: parseUnits(row.units),
  };
}

function mapInvoice(row) {
  const invoiceDate = new Date(row.created_at).toISOString().slice(0, 10);
  return {
    id: row.invoice_no,
    invoiceId: row.id,
    date: invoiceDate,
    dueDate: invoiceDate,
    customer: row.customer_name,
    staff: row.staff_name,
    paymentMethod: row.payment_method,
    netSale: Number(row.net_sale),
    vat: Number(row.vat),
    total: Number(row.total),
    status: row.status,
    invoiceType: row.invoice_type || 'CommercialInvoice',
    receivedUSD: Number(row.received_usd || 0),
    receivedKHR: Number(row.received_khr || 0),
    changeUSD: Number(row.change_usd || 0),
    paymentReference: row.payment_reference || '',
    khqrPayload: row.khqr_payload || '',
    vatTin: row.vat_tin || '',
    itemsCount: Number(row.items_count || 0),
  };
}

async function logActivity(connection, userId, action, entityType, entityId, details = {}) {
  await connection.query(
    'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId || null, JSON.stringify(details)]
  );
}

async function notify(connection, userId, type, title, message, entityType, entityId) {
  await connection.query(
    'INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, type, title, message, entityType || null, entityId || null]
  );
}

function calculatePurchaseTotals(items) {
  const base = items.reduce(
    (totals, item) => {
      const subtotal = Number(item.qty) * Number(item.unitPrice);
      const delivery = Number(item.deliveryPrice);
      totals.subtotal += subtotal;
      totals.deliveryTotal += delivery;
      return totals;
    },
    { subtotal: 0, deliveryTotal: 0 }
  );

  const taxableAmount = base.subtotal + base.deliveryTotal;
  const taxAmount = roundToTwo(taxableAmount * 0.10);
  return { ...base, taxRate: 10, taxAmount, grandTotal: taxableAmount + taxAmount };
}

function validatePurchaseOrder(payload) {
  if (!payload.vendorId || !payload.vendorName?.trim()) return 'Supplier is required';
  if (!Array.isArray(payload.items) || payload.items.length === 0) return 'At least one product row is required';
  for (let index = 0; index < payload.items.length; index += 1) {
    const item = payload.items[index];
    if (!item.productName?.trim()) return `Product name is required for row ${index + 1}`;
    if (Number(item.qty) <= 0) return `Quantity must be greater than 0 for row ${index + 1}`;
    if (Number(item.unitPrice) < 0) return `Unit price cannot be negative for row ${index + 1}`;
    if (Number(item.deliveryPrice) < 0) return `Delivery price cannot be negative for row ${index + 1}`;
    if (!item.deliveryDate) return `Delivery date is required for row ${index + 1}`;
  }
  return null;
}

async function insertPurchaseOrderItems(connection, orderId, items) {
  for (const item of items) {
    const itemTotal = Number(item.qty) * Number(item.unitPrice) + Number(item.deliveryPrice);
    await connection.query(
      'INSERT INTO purchase_order_items (purchase_order_id, item_id, product_name, qty, unit_price, delivery_date, delivery_price, item_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [orderId, item.itemId || null, item.productName.trim(), Number(item.qty), Number(item.unitPrice), item.deliveryDate, Number(item.deliveryPrice), itemTotal]
    );
  }
}

async function consumeInventoryBatches(connection, itemId, quantity) {
  let remaining = Number(quantity);
  const [batches] = await connection.query(
    'SELECT id, qty_remaining FROM inventory_batches WHERE item_id = ? AND qty_remaining > 0 ORDER BY expiry_date IS NULL, expiry_date, created_at, id FOR UPDATE',
    [itemId]
  );
  for (const batch of batches) {
    if (remaining <= 0) break;
    const used = Math.min(remaining, Number(batch.qty_remaining));
    await connection.query('UPDATE inventory_batches SET qty_remaining = qty_remaining - ? WHERE id = ?', [used, batch.id]);
    remaining -= used;
  }
}

// ==========================================
// SYSTEM & AUTH
// ==========================================
api.get('/health', async (req, res, next) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    res.json({ ok: true, database: 'mysql' });
  } catch (error) {
    next(error);
  }
});

api.use('/auth', authRoutes);

api.post('/auth/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const [rows] = await pool.query(
      'SELECT id, name, username, password_hash, role FROM users WHERE username = ? AND active = 1 LIMIT 1',
      [username]
    );

    if (!rows[0] || !(await bcrypt.compare(password || '', rows[0].password_hash))) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const user = { id: rows[0].id, name: rows[0].name, username: rows[0].username, role: String(rows[0].role).toLowerCase() };
    res.json({
      token: jwt.sign(user, jwtSecret, { expiresIn: '8h' }),
      user,
    });
  } catch (error) {
    next(error);
  }
});

api.post('/auth/register', async (req, res, next) => {
  try {
    const { name, username, email, password } = req.body;
    const role = 'user';
    const recoveryEmail = String(email || '').trim().toLowerCase();

    if (!name || !username || !isValidEmail(recoveryEmail) || !password || password.length < 6) {
      return res.status(400).json({ message: 'Name, username, a valid recovery email and a password of at least 6 characters are required' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const [result] = await pool.query(
      'INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name, username, recoveryEmail, await bcrypt.hash(password, 10), role]
    );

    res.status(201).json({ id: result.insertId, name, username, email: recoveryEmail, role });
  } catch (error) {
    next(error);
  }
});

api.get('/users', auth, adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, username, email, role, active FROM users ORDER BY name');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.post('/users', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, username, email, password, role = 'user' } = req.body;
    const recoveryEmail = String(email || '').trim().toLowerCase();
    if (!name || !username || !isValidEmail(recoveryEmail) || !password || password.length < 6 || !['admin', 'user'].includes(role)) {
      return res.status(400).json({ message: 'Name, username, valid recovery email, password and role are required' });
    }
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) return res.status(409).json({ message: 'Username already exists' });

    const [result] = await pool.query(
      'INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), username.trim(), recoveryEmail, await bcrypt.hash(password, 10), role]
    );
    await logActivity(pool, req.user.id, 'user_created', 'user', result.insertId, { name: name.trim(), username: username.trim(), role });
    res.status(201).json({ id: result.insertId, name: name.trim(), username: username.trim(), email: recoveryEmail, role, active: 1 });
  } catch (error) {
    next(error);
  }
});

api.get('/me', auth, async (req, res) => res.json(req.user));

api.get('/admin/users', auth, adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, username, email, role, active, created_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.patch('/admin/users/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ message: 'Invalid user id' });
    if (userId === req.user.id && req.body.active === false) return res.status(400).json({ message: 'You cannot deactivate your own account' });

    const [existingRows] = await pool.query('SELECT id, name, username, email, role, active, created_at FROM users WHERE id = ?', [userId]);
    if (!existingRows[0]) return res.status(404).json({ message: 'User not found' });

    const updates = [];
    const values = [];
    if (req.body.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ message: 'Name cannot be empty' });
      updates.push('name = ?');
      values.push(String(req.body.name).trim());
    }
    if (req.body.email !== undefined) {
      const recoveryEmail = String(req.body.email || '').trim().toLowerCase();
      if (!isValidEmail(recoveryEmail)) return res.status(400).json({ message: 'A valid recovery email is required' });
      updates.push('email = ?');
      values.push(recoveryEmail);
    }
    if (req.body.password !== undefined && req.body.password !== '') {
      if (String(req.body.password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
      updates.push('password_hash = ?');
      values.push(await bcrypt.hash(String(req.body.password), 10));
    }
    if (req.body.role !== undefined) {
      if (!['admin', 'user'].includes(String(req.body.role).toLowerCase())) return res.status(400).json({ message: 'Role must be admin or user' });
      updates.push('role = ?');
      values.push(String(req.body.role).toLowerCase());
    }
    if (typeof req.body.active === 'boolean') {
      updates.push('active = ?');
      values.push(req.body.active ? 1 : 0);
    }
    if (!updates.length) return res.status(400).json({ message: 'No valid changes supplied' });

    values.push(userId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    const [updatedRows] = await pool.query('SELECT id, name, username, email, role, active, created_at FROM users WHERE id = ?', [userId]);
    await logActivity(pool, req.user.id, req.body.active !== undefined ? (req.body.active ? 'user_activated' : 'user_deactivated') : 'user_updated', 'user', userId, { changes: Object.keys(req.body).filter((key) => key !== 'password') });
    res.json({ ok: true, user: updatedRows[0] });
  } catch (error) {
    next(error);
  }
});

api.delete('/admin/users/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ message: 'Invalid user id' });
    if (userId === req.user.id) return res.status(400).json({ message: 'You cannot delete your own account' });

    const [users] = await pool.query('SELECT id, name, username FROM users WHERE id = ?', [userId]);
    if (!users[0]) return res.status(404).json({ message: 'User not found' });

    try {
      await pool.query('DELETE FROM users WHERE id = ?', [userId]);
      await logActivity(pool, req.user.id, 'user_deleted', 'user', userId, { name: users[0].name, username: users[0].username });
      res.json({ ok: true, deleted: true });
    } catch (deleteError) {
      if (deleteError.code !== 'ER_ROW_IS_REFERENCED_2') throw deleteError;
      await pool.query('UPDATE users SET active = 0 WHERE id = ?', [userId]);
      await logActivity(pool, req.user.id, 'user_deactivated', 'user', userId, { name: users[0].name, username: users[0].username, reason: 'Linked records retained' });
      res.json({ ok: true, deleted: false, deactivated: true, message: 'User has retained records and was deactivated instead.' });
    }
  } catch (error) {
    next(error);
  }
});

api.get('/admin/activity', auth, adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT a.*, u.name user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 200'
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.get('/notifications', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.patch('/notifications/:id/read', auth, async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// KHQR PAYMENT INTENTS
// ==========================================
api.post('/khqr/payway/callback', async (req, res) => {
  const apiKey = String(process.env.ABA_PAYWAY_API_KEY || '').trim();
  const signature = String(req.get('x-payway-hmac-sha512') || '');
  if (!apiKey || !signature) return res.status(401).send('Invalid callback signature');

  const expected = paywayCallbackHash(req.body || {});
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return res.status(401).send('Invalid callback signature');
  }

  try {
    const callback = req.body || {};
    const transactionId = String(callback.tran_id || '').trim();
    if (!transactionId) return res.status(400).send('Missing transaction ID');

    const [rows] = await pool.query(
      'SELECT id, merchant_account, amount, currency, status FROM khqr_payment_intents WHERE payway_tran_id = ? LIMIT 1',
      [transactionId]
    );
    const intent = rows[0];
    if (!intent) return res.status(404).send('Payment intent not found');
    if (intent.status === 'Paid' || intent.status === 'Used') return res.status(200).send('OK');
    if (String(intent.merchant_account) !== String(process.env.ABA_PAYWAY_MERCHANT_ID || '').trim()) {
      return res.status(409).send('Merchant does not match payment intent');
    }

    const isApproved = String(callback.status) === '0'
      && (!Object.hasOwn(callback, 'payment_status_code') || Number(callback.payment_status_code) === 0);
    if (!isApproved) return res.status(200).send('OK');

    const callbackCurrency = normalizeKhqrCurrency(callback.original_currency);
    const callbackAmount = Number(callback.original_amount ?? callback.total_amount);
    if (callbackCurrency !== normalizeKhqrCurrency(intent.currency)
      || !Number.isFinite(callbackAmount)
      || Math.abs(callbackAmount - Number(intent.amount)) >= 0.001) {
      console.warn('ABA PayWay callback did not match the payment intent.');
      return res.status(409).send('Payment details do not match');
    }

    const reference = String(callback.apv || callback.bank_ref || transactionId).slice(0, 128);
    await pool.query(
      "UPDATE khqr_payment_intents SET status = 'Paid', transaction_hash = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('Pending', 'Expired')",
      [reference, intent.id]
    );
    return res.status(200).send('OK');
  } catch (error) {
    console.error('ABA PayWay callback processing failed:', error.message);
    return res.status(500).send('Callback processing failed');
  }
});

api.post('/khqr/intents', auth, async (req, res, next) => {
  try {
    const merchantId = String(process.env.ABA_PAYWAY_MERCHANT_ID || '').trim();
    const apiKey = String(process.env.ABA_PAYWAY_API_KEY || '').trim();
    if (!merchantId || !apiKey) {
      return res.status(503).json({ message: 'ABA PayWay is not configured. Set ABA_PAYWAY_MERCHANT_ID and ABA_PAYWAY_API_KEY in the backend environment.' });
    }
    const callbackUrl = String(process.env.ABA_PAYWAY_CALLBACK_URL || '').trim();
    let parsedCallbackUrl;
    try {
      parsedCallbackUrl = new URL(callbackUrl);
    } catch {
      return res.status(503).json({ message: 'Set ABA_PAYWAY_CALLBACK_URL to the public HTTPS URL ending in /api/khqr/payway/callback.' });
    }
    const encodedCallbackUrl = Buffer.from(callbackUrl).toString('base64');
    if (parsedCallbackUrl.protocol !== 'https:' || encodedCallbackUrl.length > 255) {
      return res.status(503).json({ message: 'ABA_PAYWAY_CALLBACK_URL must be a public HTTPS URL whose base64 form is no longer than 255 characters.' });
    }

    const currency = normalizeKhqrCurrency(req.body.currency);
    const amount = Number(req.body.amount);
    if (!currency || !Number.isFinite(amount) || amount <= 0 || (currency === 'USD' && amount > 99999999)) {
      return res.status(400).json({ message: 'A positive amount and USD or KHR currency are required' });
    }

    const payableAmount = currency === 'KHR' ? Math.round(amount) : roundToTwo(amount);
    if ((currency === 'USD' && payableAmount < 0.01) || (currency === 'KHR' && payableAmount <= 100)) {
      return res.status(400).json({ message: 'ABA PayWay requires at least 0.01 USD or 101 KHR.' });
    }

    const id = crypto.randomBytes(10).toString('hex').toUpperCase();
    const intentId = crypto.randomUUID();
    const reqTime = paywayRequestTime();
    const amountForHash = String(payableAmount);
    const requestBody = {
      req_time: reqTime,
      merchant_id: merchantId,
      tran_id: id,
      amount: payableAmount,
      purchase_type: 'purchase',
      payment_option: 'abapay_khqr',
      callback_url: encodedCallbackUrl,
      currency,
      lifetime: PAYWAY_QR_LIFETIME_MINUTES,
      qr_image_template: PAYWAY_QR_IMAGE_TEMPLATE,
    };
    requestBody.hash = paywayRequestHash([
      reqTime, merchantId, id, amountForHash,
      '', '', '', '', '',
      requestBody.purchase_type, requestBody.payment_option, requestBody.callback_url, '', currency,
      '', '', '', String(PAYWAY_QR_LIFETIME_MINUTES), PAYWAY_QR_IMAGE_TEMPLATE,
    ]);

    let response;
    try {
      response = await fetch(paywayEndpoint('generate-qr'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15000),
      });
    } catch (fetchError) {
      const isTimeout = fetchError.name === 'TimeoutError' || fetchError.name === 'AbortError';
      return res.status(isTimeout ? 504 : 502).json({ message: isTimeout ? 'ABA PayWay QR request timed out.' : 'ABA PayWay is temporarily unavailable.' });
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok || String(result?.status?.code) !== '0') {
      const code = String(result?.status?.code || '');
      return res.status(502).json({ message: `ABA PayWay could not generate the QR${code ? ` (code ${code})` : ''}.` });
    }

    const qrPayload = String(result.qrString || result.qr_string || '');
    if (!qrPayload) {
      return res.status(502).json({ message: 'ABA PayWay returned an empty QR code.' });
    }

    const md5 = crypto.createHash('md5').update(qrPayload).digest('hex');
    const expiresAt = new Date(Date.now() + PAYWAY_QR_LIFETIME_MINUTES * 60 * 1000);
    const image = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 360 });
    await pool.query(
      'INSERT INTO khqr_payment_intents (id, user_id, md5, payway_tran_id, qr_payload, merchant_account, amount, currency, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [intentId, req.user.id, md5, id, qrPayload, merchantId, payableAmount, currency, expiresAt]
    );

    res.status(201).json({ id: intentId, md5, payload: qrPayload, image, amount: payableAmount, currency, expiresAt });
  } catch (error) {
    next(error);
  }
});

api.post('/khqr/intents/:id/verify', auth, async (req, res, next) => {
  try {
    // 1. ទាញយក intent ពី database
    const [rows] = await pool.query(
      'SELECT id, payway_tran_id, amount, currency, status, expires_at, transaction_hash FROM khqr_payment_intents WHERE id = ? AND user_id = ? LIMIT 1',
      [req.params.id, req.user.id]
    );
    const intent = rows[0];

    if (!intent) {
      return res.status(404).json({ message: 'KHQR payment intent not found' });
    }

    if (intent.status === 'Paid' || intent.status === 'Used') {
      return res.json({
        status: intent.status.toLowerCase(),
        transactionHash: intent.transaction_hash,
      });
    }

    // ពិនិត្យមើលថាតើ QR ផុតកំណត់ហើយឬនៅ
    if (new Date(intent.expires_at).getTime() <= Date.now()) {
      await pool.query(
        "UPDATE khqr_payment_intents SET status = 'Expired' WHERE id = ? AND status = 'Pending'",
        [intent.id]
      );
      return res.json({ status: 'expired' });
    }

    const merchantId = String(process.env.ABA_PAYWAY_MERCHANT_ID || '').trim();
    const apiKey = String(process.env.ABA_PAYWAY_API_KEY || '').trim();
    if (!merchantId || !apiKey) {
      return res.status(503).json({
        message: 'ABA PayWay is not configured. Set ABA_PAYWAY_MERCHANT_ID and ABA_PAYWAY_API_KEY on the backend.',
      });
    }
    if (!intent.payway_tran_id) {
      return res.status(409).json({ message: 'This older payment request cannot be checked by ABA PayWay. Generate a new QR.' });
    }

    const reqTime = paywayRequestTime();
    const requestBody = {
      req_time: reqTime,
      merchant_id: merchantId,
      tran_id: intent.payway_tran_id,
      hash: paywayRequestHash([reqTime, merchantId, intent.payway_tran_id]),
    };

    let response;
    try {
      response = await fetch(paywayEndpoint('check-transaction-2'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15000),
      });
    } catch (fetchError) {
      const isTimeout = fetchError.name === 'TimeoutError' || fetchError.name === 'AbortError';
      return res.status(isTimeout ? 504 : 502).json({ message: isTimeout ? 'ABA PayWay verification timed out. Please check again.' : 'ABA PayWay is temporarily unavailable.' });
    }

    if (!response.ok) {
      return res.status(502).json({ message: 'ABA PayWay verification is temporarily unavailable.' });
    }

    const result = await response.json().catch(() => ({}));
    const transaction = result?.data;
    const apiStatusCode = String(transaction?.status?.code || result?.status?.code || '');
    if (apiStatusCode === '6') {
      return res.json({ status: 'pending' });
    }
    if (apiStatusCode !== '00' || !transaction) {
      return res.status(502).json({ message: 'ABA PayWay rejected the transaction verification request.' });
    }

    if (Number(transaction.payment_status_code) !== 0 || String(transaction.payment_status || '').toUpperCase() !== 'APPROVED') {
      return res.json({ status: 'pending' });
    }

    const transactionCurrency = normalizeKhqrCurrency(transaction.original_currency);
    const intentCurrency = normalizeKhqrCurrency(intent.currency);
    const transactionAmount = Number(transaction.original_amount ?? transaction.total_amount);
    const intentAmount = Number(intent.amount);
    const transactionHash = String(transaction.apv || intent.payway_tran_id).trim();

    const isCurrencyMatch = transactionCurrency === intentCurrency;
    const isAmountMatch = Number.isFinite(transactionAmount) && Math.abs(transactionAmount - intentAmount) < 0.001;

    if (!isCurrencyMatch || !isAmountMatch || !transactionHash) {
      return res.status(409).json({
        message: 'ABA PayWay returned a transaction that does not match this payment request.',
      });
    }

    const verifiedTransactionHash = transactionHash.slice(0, 128);

    const [updateResult] = await pool.query(
      "UPDATE khqr_payment_intents SET status = 'Paid', transaction_hash = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'Pending'",
      [verifiedTransactionHash, intent.id]
    );

    // ប្រសិនបើ update ជោគជ័យ ឬមាន process ផ្សេង update រួចហើយ
    if (updateResult.affectedRows > 0) {
      return res.json({
        status: 'paid',
        transactionHash: verifiedTransactionHash,
      });
    } else {
      // ករណី status ត្រូវបានប្តូររួចហើយដោយ request ស្របគ្នា
      const [latest] = await pool.query(
        'SELECT status, transaction_hash FROM khqr_payment_intents WHERE id = ?',
        [intent.id]
      );
      return res.json({
        status: latest[0]?.status.toLowerCase() || 'paid',
        transactionHash: latest[0]?.transaction_hash || verifiedTransactionHash,
      });
    }
  } catch (error) {
    next(error);
  }
});

// ==========================================
// SALES CHECKOUT (WITH REAL KHQR STRING)
// ==========================================
api.post('/sales', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const lines = req.body.lines || [];
    if (!lines.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Sale requires at least one line item' });
    }

    let netSale = 0;
    const processedLines = [];
    let requiresManagerOverride = false;

    // Sort to prevent DB deadlocks
    const sortedLines = [...lines].sort((a, b) => a.itemId - b.itemId);

    for (const line of sortedLines) {
      const [rows] = await connection.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [line.itemId]);
      if (!rows[0]) {
        await connection.rollback();
        return res.status(404).json({ message: `Item ID ${line.itemId} not found` });
      }

      const item = rows[0];
      const parsedUnits = parseUnits(item.units);
      const requestedUnit = line.unit || item.base_unit;

      const matchedUnit = parsedUnits.find((u) => u.name?.toLowerCase() === requestedUnit.toLowerCase());
      const conversionRatio = Number(matchedUnit?.ratio || 1);
      const unitPrice = line.unitPrice !== undefined ? Number(line.unitPrice) : Number(matchedUnit?.retailPrice || item.retail_price);

      const qty = Number(line.qty);
      if (qty <= 0) {
        await connection.rollback();
        return res.status(400).json({ message: `Invalid quantity for ${item.name_en}` });
      }

      const stockDeductionQty = roundToTwo(qty * conversionRatio);
      if (Number(item.qty_on_hand) < stockDeductionQty) {
        await connection.rollback();
        return res.status(409).json({
          message: `${item.name_en} has insufficient stock (Required: ${stockDeductionQty} ${item.base_unit}, Available: ${item.qty_on_hand} ${item.base_unit})`,
        });
      }

      const discount = roundToTwo(Number(line.discount || 0));
      const lineNet = roundToTwo(unitPrice * qty - discount);
      if (discount > unitPrice * qty * 0.10) requiresManagerOverride = true;
      netSale = roundToTwo(netSale + lineNet);

      processedLines.push({
        itemId: item.id,
        itemName: item.name_en,
        baseUnit: item.base_unit,
        unit: requestedUnit,
        qty,
        stockDeductionQty,
        unitPrice,
        averageCost: Number(item.average_cost),
        discount,
        lineNet,
      });
    }

    const paymentMethod = req.body.paymentMethod || 'cash';
    if (!['cash', 'bank', 'card', 'qr', 'customer_account'].includes(paymentMethod)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    const customerId = req.body.customerId ? Number(req.body.customerId) : null;
    if (paymentMethod === 'customer_account' && !customerId) {
      await connection.rollback();
      return res.status(400).json({ message: 'A customer is required for account sales' });
    }

    const [companyRows] = await connection.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['company']);
    const companySettings = companyRows[0]
      ? (typeof companyRows[0].setting_value === 'string' ? JSON.parse(companyRows[0].setting_value) : companyRows[0].setting_value)
      : {};
    let receivedUSD = Math.max(0, Number(req.body.receivedUSD || 0));
    let receivedKHR = Math.max(0, Number(req.body.receivedKHR || 0));
    const exchangeRate = Math.max(1, Number(companySettings.exchangeRate) || 4000);
    const tenderedUSD = receivedUSD + receivedKHR / exchangeRate;
    const configuredVatRate = Number(companySettings.vatRate ?? DEFAULT_VAT_RATE * 100);
    const vatRate = configuredVatRate > 1 ? configuredVatRate / 100 : configuredVatRate;

    if (requiresManagerOverride) {
      const [managerRows] = await connection.query("SELECT password_hash FROM users WHERE role = 'admin' AND active = 1");
      const approved = managerRows.some((manager) => req.body.managerPin && bcrypt.compareSync(String(req.body.managerPin), manager.password_hash));
      if (!approved) {
        await connection.rollback();
        return res.status(403).json({ message: 'Manager PIN approval is required for discounts above 10%' });
      }
    }

    const vat = roundToTwo(netSale * vatRate);
    const total = roundToTwo(netSale + vat);
    const actualChangeUSD = paymentMethod === 'cash' ? roundToTwo(Math.max(0, tenderedUSD - total)) : 0;

    let paymentIntent = null;
    let khqrPayload = '';
    let paymentReference = req.body.paymentReference || null;
    if (paymentMethod === 'bank' || paymentMethod === 'qr') {
      if (!req.body.paymentIntentId) {
        await connection.rollback();
        return res.status(400).json({ message: 'A verified KHQR payment is required before completing this sale' });
      }
      const [intentRows] = await connection.query(
        'SELECT id, user_id, md5, qr_payload, amount, currency, status, transaction_hash FROM khqr_payment_intents WHERE id = ? FOR UPDATE',
        [req.body.paymentIntentId]
      );
      paymentIntent = intentRows[0];
      if (!paymentIntent || Number(paymentIntent.user_id) !== Number(req.user.id) || paymentIntent.status !== 'Paid') {
        await connection.rollback();
        return res.status(409).json({ message: 'KHQR payment has not been verified or is no longer available' });
      }
      const requiredAmount = paymentIntent.currency === 'KHR' ? Math.round(total * exchangeRate) : total;
      if (Math.abs(Number(paymentIntent.amount) - requiredAmount) > 0.001) {
        await connection.rollback();
        return res.status(409).json({ message: 'Cart total changed. Generate a new KHQR payment request.' });
      }
      receivedUSD = paymentIntent.currency === 'USD' ? total : 0;
      receivedKHR = paymentIntent.currency === 'KHR' ? Number(paymentIntent.amount) : 0;
      khqrPayload = paymentIntent.qr_payload;
      paymentReference = paymentIntent.transaction_hash || paymentIntent.md5;
    }

    if (paymentMethod === 'cash' && tenderedUSD + 0.001 < total) {
      await connection.rollback();
      return res.status(400).json({ message: 'Tendered amount is less than the invoice total' });
    }

    if (customerId) {
      const [customerRows] = await connection.query('SELECT id, balance, credit_limit FROM customers WHERE id = ? FOR UPDATE', [customerId]);
      if (!customerRows[0]) {
        await connection.rollback();
        return res.status(404).json({ message: 'Customer not found' });
      }
      if (paymentMethod === 'customer_account' && Number(customerRows[0].credit_limit) > 0 && Number(customerRows[0].balance) + total > Number(customerRows[0].credit_limit)) {
        await connection.rollback();
        return res.status(409).json({ message: 'Customer credit limit exceeded' });
      }
    }

    const tempNo = `TEMP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const [invoiceResult] = await connection.query(
      'INSERT INTO invoices (invoice_no, customer_id, customer_name, staff_name, payment_method, net_sale, vat, total, received_usd, received_khr, change_usd, payment_reference, khqr_payload, vat_tin, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        tempNo,
        customerId,
        req.body.customerName || 'Walk-in customer',
        req.user.name,
        paymentMethod === 'card' || paymentMethod === 'qr' ? 'bank' : paymentMethod,
        netSale,
        vat,
        total,
        receivedUSD,
        receivedKHR,
        actualChangeUSD,
        paymentReference,
        khqrPayload,
        req.body.vatTin || null,
        req.user.id,
      ]
    );

    const generatedId = invoiceResult.insertId;
    const finalInvoiceNo = `INV-${String(1000 + generatedId).padStart(5, '0')}`;

    await connection.query('UPDATE invoices SET invoice_no = ? WHERE id = ?', [finalInvoiceNo, generatedId]);

    for (const line of processedLines) {
      await connection.query('UPDATE items SET qty_on_hand = qty_on_hand - ? WHERE id = ?', [line.stockDeductionQty, line.itemId]);
      await consumeInventoryBatches(connection, line.itemId, line.stockDeductionQty);

      await connection.query(
        'INSERT INTO invoice_lines (invoice_id, item_id, item_name, unit, qty, unit_price, cost_price, discount, vat_rate, vat_amount, line_net, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [generatedId, line.itemId, line.itemName, line.unit, line.qty, line.unitPrice, Number(line.averageCost || 0), line.discount, vatRate * 100, roundToTwo(line.lineNet * vatRate), line.lineNet, roundToTwo(line.lineNet * (1 + vatRate))]
      );

      const [balanceRows] = await connection.query('SELECT qty_on_hand FROM items WHERE id = ?', [line.itemId]);
      await connection.query(
        'INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [line.itemId, line.itemName, 'Sale', -line.stockDeductionQty, Number(balanceRows[0].qty_on_hand), finalInvoiceNo, req.body.branch || 'Head Quarter']
      );
    }

    const recordMethod = paymentMethod === 'bank' ? 'bank' : paymentMethod;
    const recordedUsd = paymentMethod === 'cash'
      ? roundToTwo(Math.max(0, receivedUSD - actualChangeUSD))
      : paymentMethod === 'bank' && paymentIntent.currency === 'KHR'
        ? 0
        : paymentMethod === 'customer_account'
          ? 0
          : total;
    await connection.query(
      'INSERT INTO payment_records (invoice_id, customer_id, payment_method, amount_usd, amount_khr, reference, received_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [generatedId, customerId, recordMethod, recordedUsd, receivedKHR, paymentReference, req.user.id]
    );

    if (paymentIntent) {
      const [consumed] = await connection.query(
        "UPDATE khqr_payment_intents SET status = 'Used', used_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'Paid'",
        [paymentIntent.id]
      );
      if (consumed.affectedRows !== 1) throw new Error('KHQR payment was already used');
    }

    if (customerId) {
      await connection.query('UPDATE customers SET reward_points = reward_points + FLOOR(?) WHERE id = ?', [total, customerId]);
      if (paymentMethod === 'customer_account') {
        await connection.query('UPDATE customers SET balance = balance + ? WHERE id = ?', [total, customerId]);
      }
    }

    await logActivity(connection, req.user.id, 'sale_completed', 'invoice', generatedId, {
      invoiceNo: finalInvoiceNo,
      paymentMethod,
      total,
      receivedUSD,
      receivedKHR,
      changeUSD: actualChangeUSD,
    });

    await connection.commit();

    res.status(201).json({
      id: finalInvoiceNo,
      date: new Date().toISOString().slice(0, 10),
      customer: req.body.customerName || 'Walk-in customer',
      staff: req.user.name,
      paymentMethod,
      netSale,
      vat,
      total,
      status: 'Paid',
      itemsCount: processedLines.length,
      receivedUSD,
      receivedKHR,
      changeUSD: actualChangeUSD,
      khqrPayload,
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// ==========================================
// ITEMS
// ==========================================
api.get('/items', async (req, res, next) => {
  try {
    const search = `%${req.query.search || ''}%`;
    const [rows] = await pool.query(
      'SELECT * FROM items WHERE active = 1 AND (barcode LIKE ? OR name_en LIKE ? OR name_kh LIKE ?) ORDER BY name_en',
      [search, search, search]
    );
    res.json(rows.map(mapItem));
  } catch (error) {
    next(error);
  }
});

api.post('/items', auth, adminOnly, async (req, res, next) => {
  try {
    const item = req.body;
    const baseUnit = item.baseUnit || 'Unit';
    const retailPrice = Number(item.retailPrice || 0);
    const purchaseCost = Number(item.purchaseCost || 0);

    const defaultUnits = item.units && item.units.length ? item.units : [{ name: baseUnit, ratio: 1, retailPrice }];

    const [result] = await pool.query(
      `INSERT INTO items 
      (barcode, name_kh, name_en, department, category, brand, base_unit, qty_on_hand, reorder_qty, retail_price, purchase_cost, average_cost, vendor_id, units) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.barcode,
        item.nameKh || '',
        item.nameEn,
        item.department || 'General',
        item.category || 'General',
        item.brand || '',
        baseUnit,
        Number(item.qtyOnHand || 0),
        Number(item.reorderQty || 0),
        retailPrice,
        purchaseCost,
        purchaseCost,
        item.vendorId || null,
        JSON.stringify(defaultUnits),
      ]
    );

    const [rows] = await pool.query('SELECT * FROM items WHERE id = ?', [result.insertId]);
    res.status(201).json(mapItem(rows[0]));
  } catch (error) {
    next(error);
  }
});

api.put('/items/:id', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid item id' });
    if (!req.body.nameEn?.trim() || !req.body.barcode?.trim()) return res.status(400).json({ message: 'Item name and barcode are required' });

    await connection.beginTransaction();
    const [existingRows] = await connection.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
    if (!existingRows[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Item not found' });
    }
    const existing = existingRows[0];
    const qtyOnHand = Math.max(0, Number(req.body.qtyOnHand ?? existing.qty_on_hand));
    const quantityDelta = qtyOnHand - Number(existing.qty_on_hand);
    const baseUnit = req.body.baseUnit?.trim() || existing.base_unit;
    const retailPrice = Math.max(0, Number(req.body.retailPrice ?? existing.retail_price));
    const purchaseCost = Math.max(0, Number(req.body.purchaseCost ?? existing.purchase_cost));
    const units = Array.isArray(req.body.units) && req.body.units.length ? req.body.units : [{ name: baseUnit, ratio: 1, retailPrice }];

    await connection.query(
      'UPDATE items SET barcode = ?, name_kh = ?, name_en = ?, department = ?, category = ?, brand = ?, base_unit = ?, qty_on_hand = ?, reorder_qty = ?, retail_price = ?, purchase_cost = ?, vendor_id = ?, units = ? WHERE id = ?',
      [
        req.body.barcode.trim(),
        req.body.nameKh || '',
        req.body.nameEn.trim(),
        req.body.department || 'General',
        req.body.category || 'General',
        req.body.brand || '',
        baseUnit,
        qtyOnHand,
        Math.max(0, Number(req.body.reorderQty || 0)),
        retailPrice,
        purchaseCost,
        req.body.vendorId || null,
        JSON.stringify(units),
        itemId,
      ]
    );

    if (quantityDelta !== 0) {
      await connection.query('INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        itemId,
        req.body.nameEn.trim(),
        'Adjustment',
        quantityDelta,
        qtyOnHand,
        'ITEM-EDIT',
        req.body.branch || 'Head Quarter',
      ]);
    }

    await logActivity(connection, req.user.id, 'item_updated', 'item', itemId, { quantityDelta, name: req.body.nameEn.trim() });
    await connection.commit();

    const [rows] = await pool.query('SELECT * FROM items WHERE id = ?', [itemId]);
    res.json(mapItem(rows[0]));
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.delete('/items/:id', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid item id' });
    const [result] = await connection.query('UPDATE items SET active = 0 WHERE id = ? AND active = 1', [itemId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Item not found' });
    await logActivity(connection, req.user.id, 'item_archived', 'item', itemId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  } finally {
    connection.release();
  }
});

// ==========================================
// STOCK ADJUSTMENTS
// ==========================================
api.post('/stock/adjustments', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [req.body.itemId]);
    if (!rows[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Item not found' });
    }

    const item = rows[0];
    const quantity = Number(req.body.quantity);

    if (isNaN(quantity) || quantity === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Valid non-zero quantity is required' });
    }

    const balanceAfter = Number(item.qty_on_hand) + quantity;
    if (balanceAfter < 0) {
      await connection.rollback();
      return res.status(409).json({ message: 'Adjustment cannot make stock negative' });
    }
    await connection.query('UPDATE items SET qty_on_hand = ? WHERE id = ?', [balanceAfter, item.id]);
    await connection.query(
      'INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [item.id, item.name_en, 'Adjustment', quantity, balanceAfter, req.body.note || 'Manual adjustment', req.body.branch || 'Head Quarter']
    );

    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// ==========================================
// VENDORS & CUSTOMERS
// ==========================================
api.get('/vendors', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vendors WHERE active = 1 ORDER BY name');
    res.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        creditLimit: Number(row.credit_limit || 0),
        balance: 0,
        note: row.note,
        vatTin: row.vat_tin || '',
      }))
    );
  } catch (error) {
    next(error);
  }
});

api.post('/vendors', auth, adminOnly, async (req, res, next) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ message: 'Vendor name is required' });
    const [result] = await pool.query('INSERT INTO vendors (name, phone, credit_limit, note) VALUES (?, ?, ?, ?)', [
      req.body.name.trim(),
      req.body.phone || '',
      Number(req.body.creditLimit || 0),
      req.body.note || '',
    ]);
    const [rows] = await pool.query('SELECT * FROM vendors WHERE id = ?', [result.insertId]);
    const vendor = rows[0];
    res.status(201).json({ id: vendor.id, name: vendor.name, phone: vendor.phone, creditLimit: Number(vendor.credit_limit), balance: 0, note: vendor.note, vatTin: vendor.vat_tin || '' });
  } catch (error) {
    next(error);
  }
});

api.put('/vendors/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const vendorId = Number(req.params.id);
    if (!Number.isInteger(vendorId) || vendorId < 1) return res.status(400).json({ message: 'Invalid vendor id' });
    if (!req.body.name?.trim()) return res.status(400).json({ message: 'Vendor name is required' });

    const [result] = await pool.query('UPDATE vendors SET name = ?, phone = ?, vat_tin = ?, credit_limit = ?, note = ? WHERE id = ? AND active = 1', [
      req.body.name.trim(),
      req.body.phone || '',
      req.body.vatTin || '',
      Number(req.body.creditLimit || 0),
      req.body.note || '',
      vendorId,
    ]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Vendor not found' });
    const [rows] = await pool.query('SELECT * FROM vendors WHERE id = ?', [vendorId]);
    const vendor = rows[0];
    res.json({ id: vendor.id, name: vendor.name, phone: vendor.phone, vatTin: vendor.vat_tin || '', creditLimit: Number(vendor.credit_limit || 0), balance: 0, note: vendor.note || '' });
  } catch (error) {
    next(error);
  }
});

api.delete('/vendors/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const vendorId = Number(req.params.id);
    if (!Number.isInteger(vendorId) || vendorId < 1) return res.status(400).json({ message: 'Invalid vendor id' });
    const [result] = await pool.query('UPDATE vendors SET active = 0 WHERE id = ? AND active = 1', [vendorId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Vendor not found' });
    await logActivity(pool, req.user.id, 'vendor_archived', 'vendor', vendorId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

api.get('/customers', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM customers ORDER BY name');
    res.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        deposit: Number(row.deposit || 0),
        rewardPoints: Number(row.reward_points || 0),
        balance: Number(row.balance || 0),
        creditLimit: Number(row.credit_limit || 0),
        vatTin: row.vat_tin || '',
      }))
    );
  } catch (error) {
    next(error);
  }
});

api.post('/customers', auth, adminOnly, async (req, res, next) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ message: 'Customer name is required' });
    const [result] = await pool.query('INSERT INTO customers (name, phone, vat_tin, deposit, reward_points, balance, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      req.body.name.trim(),
      req.body.phone || '',
      req.body.vatTin || '',
      Number(req.body.deposit || 0),
      0,
      0,
      Number(req.body.creditLimit || 0),
    ]);
    const [rows] = await pool.query('SELECT * FROM customers WHERE id = ?', [result.insertId]);
    const customer = rows[0];
    res.status(201).json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      vatTin: customer.vat_tin || '',
      deposit: Number(customer.deposit),
      rewardPoints: Number(customer.reward_points),
      balance: Number(customer.balance),
      creditLimit: Number(customer.credit_limit || 0),
    });
  } catch (error) {
    next(error);
  }
});

api.put('/customers/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId < 1) return res.status(400).json({ message: 'Invalid customer id' });
    if (!req.body.name?.trim()) return res.status(400).json({ message: 'Customer name is required' });
    const [result] = await pool.query('UPDATE customers SET name = ?, phone = ?, vat_tin = ?, deposit = ?, credit_limit = ? WHERE id = ?', [
      req.body.name.trim(),
      req.body.phone || '',
      req.body.vatTin || '',
      Number(req.body.deposit || 0),
      Number(req.body.creditLimit || 0),
      customerId,
    ]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Customer not found' });
    const [rows] = await pool.query('SELECT * FROM customers WHERE id = ?', [customerId]);
    const customer = rows[0];
    res.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      vatTin: customer.vat_tin || '',
      deposit: Number(customer.deposit),
      rewardPoints: Number(customer.reward_points),
      balance: Number(customer.balance),
      creditLimit: Number(customer.credit_limit || 0),
    });
  } catch (error) {
    next(error);
  }
});

api.delete('/customers/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId < 1) return res.status(400).json({ message: 'Invalid customer id' });
    const [result] = await pool.query('DELETE FROM customers WHERE id = ?', [customerId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Customer not found' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// INVOICES & REPORTS
// ==========================================
api.get('/invoices', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        i.id, i.invoice_no, i.customer_name, i.staff_name, i.payment_method, 
        i.net_sale, i.vat, i.total, i.status, i.created_at, i.invoice_type, i.received_usd, i.received_khr,
        i.change_usd, i.payment_reference, i.khqr_payload, i.vat_tin,
        COUNT(l.id) AS items_count
      FROM invoices i
      LEFT JOIN invoice_lines l ON l.invoice_id = i.id
      GROUP BY i.id, i.invoice_no, i.customer_name, i.staff_name, i.payment_method, 
               i.net_sale, i.vat, i.total, i.status, i.created_at, i.invoice_type, i.received_usd, i.received_khr,
               i.change_usd, i.payment_reference, i.khqr_payload, i.vat_tin
      ORDER BY i.created_at DESC
    `);
    res.json(rows.map(mapInvoice));
  } catch (error) {
    next(error);
  }
});

api.get('/invoices/:identifier', async (req, res, next) => {
  try {
    const identifier = String(req.params.identifier || '').trim();
    const numericId = /^\d+$/.test(identifier) ? Number(identifier) : 0;
    const [invoiceRows] = await pool.query(
      `
      SELECT i.*, c.name AS customer_detail_name, c.phone AS customer_phone
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.invoice_no = ? OR i.id = ?
      LIMIT 1
    `,
      [identifier, numericId]
    );

    if (!invoiceRows[0]) return res.status(404).json({ message: 'Invoice not found' });

    const invoice = invoiceRows[0];
    const [lineRows] = await pool.query(
      `
      SELECT id, item_id, item_name, unit, qty, unit_price, discount, line_net,
             COALESCE(line_total, line_net) AS line_total,
             COALESCE(vat_rate, 0) AS vat_rate,
             COALESCE(vat_amount, 0) AS vat_amount
      FROM invoice_lines
      WHERE invoice_id = ?
      ORDER BY id
    `,
      [invoice.id]
    );

    res.json({
      ...mapInvoice(invoice),
      customerDetails: invoice.customer_id
        ? {
            id: invoice.customer_id,
            name: invoice.customer_detail_name || invoice.customer_name,
            phone: invoice.customer_phone || '',
          }
        : {
            name: invoice.customer_name || 'Walk-in customer',
            phone: '',
          },
      issueDate: new Date(invoice.created_at).toISOString(),
      subtotal: Number(invoice.net_sale),
      tax: Number(invoice.vat),
      lineItems: lineRows.map((line) => ({
        id: line.id,
        itemId: line.item_id,
        name: line.item_name,
        unit: line.unit,
        quantity: Number(line.qty),
        unitPrice: Number(line.unit_price),
        discount: Number(line.discount || 0),
        subtotal: Number(line.line_net),
        tax: Number(line.vat_amount || 0),
        total: Number(line.line_total),
        vatRate: Number(line.vat_rate || 0),
      })),
    });
  } catch (error) {
    next(error);
  }
});

api.get('/reports/sales-by-staff', auth, async (req, res, next) => {
  try {
    const conditions = ["i.status = 'Paid'"];
    const params = [];
    if (req.query.from) {
      conditions.push('i.created_at >= ?');
      params.push(`${req.query.from} 00:00:00`);
    }
    if (req.query.to) {
      conditions.push('i.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(req.query.to);
    }
    const [rows] = await pool.query(
      `
      SELECT COALESCE(i.user_id, 0) AS staff_id, i.staff_name,
             COUNT(*) AS invoice_count,
             SUM(i.total) AS grand_total,
             SUM(i.vat) AS vat,
             SUM(COALESCE(costs.exit_costs, 0)) AS exit_costs
      FROM invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(cost_price * qty) AS exit_costs
        FROM invoice_lines
        GROUP BY invoice_id
      ) costs ON costs.invoice_id = i.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY i.user_id, i.staff_name
      ORDER BY grand_total DESC, i.staff_name
    `,
      params
    );
    res.json(
      rows.map((row) => ({
        staffId: Number(row.staff_id),
        staffName: row.staff_name,
        invoiceCount: Number(row.invoice_count),
        grandTotal: Number(row.grand_total || 0),
        vat: Number(row.vat || 0),
        exitCosts: Number(row.exit_costs || 0),
      }))
    );
  } catch (error) {
    next(error);
  }
});

api.get('/transactions', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS date, item_name AS item, type, qty, balance_after AS balanceAfter, reference, branch FROM stock_transactions ORDER BY created_at DESC, id DESC LIMIT 100"
    );
    res.json(
      rows.map((row) => ({
        ...row,
        qty: Number(row.qty),
        balanceAfter: Number(row.balanceAfter),
      }))
    );
  } catch (error) {
    next(error);
  }
});

// ==========================================
// PURCHASE ORDERS
// ==========================================
api.get('/purchase-orders', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT po.*, COUNT(poi.id) item_count FROM purchase_orders po LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id GROUP BY po.id ORDER BY po.created_at DESC`
    );
    res.json(
      rows.map((row) => ({
        id: row.order_no,
        orderId: row.id,
        vendorId: row.vendor_id,
        vendor: row.vendor_name,
        expected: row.expected_date,
        subtotal: Number(row.subtotal || 0),
        deliveryTotal: Number(row.delivery_total || 0),
        taxRate: Number(row.tax_rate || 10),
        taxAmount: Number(row.tax_amount || 0),
        total: Number(row.grand_total ?? row.total),
        status: row.status,
        note: row.note,
        itemCount: Number(row.item_count),
        createdBy: row.created_by,
      }))
    );
  } catch (error) {
    next(error);
  }
});

api.post('/purchase-orders', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const validation = validatePurchaseOrder(req.body);
    if (validation) return res.status(400).json({ message: validation });
    await connection.beginTransaction();
    const [countRows] = await connection.query('SELECT COUNT(*) AS count FROM purchase_orders');
    const orderNo = `PO-${String(1001 + Number(countRows[0].count)).padStart(4, '0')}`;
    const totals = calculatePurchaseTotals(req.body.items);
    const [result] = await connection.query(
      'INSERT INTO purchase_orders (order_no, vendor_id, vendor_name, expected_date, subtotal, delivery_total, tax_rate, tax_amount, grand_total, total, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [orderNo, req.body.vendorId, req.body.vendorName.trim(), req.body.expectedDate || null, totals.subtotal, totals.deliveryTotal, totals.taxRate, totals.taxAmount, totals.grandTotal, totals.grandTotal, req.body.note || '', req.user.id]
    );
    await insertPurchaseOrderItems(connection, result.insertId, req.body.items);
    await logActivity(connection, req.user.id, 'purchase_order_created', 'purchase_order', result.insertId, { orderNo, total: totals.grandTotal });
    await connection.commit();
    res.status(201).json({ id: orderNo, orderId: result.insertId, vendor: req.body.vendorName.trim(), ...totals, status: 'Pending', note: req.body.note || '', items: req.body.items });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.get('/purchase-orders/:id', auth, async (req, res, next) => {
  try {
    const numericId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    const [orders] = await pool.query(
      numericId === null ? 'SELECT * FROM purchase_orders WHERE order_no = ?' : 'SELECT * FROM purchase_orders WHERE order_no = ? OR id = ?',
      numericId === null ? [req.params.id] : [req.params.id, numericId]
    );
    if (!orders[0]) return res.status(404).json({ message: 'Purchase order not found' });
    const [items] = await pool.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY id', [orders[0].id]);
    res.json({
      ...orders[0],
      orderNo: orders[0].order_no,
      subtotal: Number(orders[0].subtotal || 0),
      deliveryTotal: Number(orders[0].delivery_total || 0),
      taxRate: Number(orders[0].tax_rate || 10),
      taxAmount: Number(orders[0].tax_amount || 0),
      grandTotal: Number(orders[0].grand_total ?? orders[0].total),
      items: items.map((item) => ({
        id: item.id,
        itemId: item.item_id,
        productName: item.product_name,
        qty: Number(item.qty),
        unitPrice: Number(item.unit_price),
        deliveryDate: item.delivery_date,
        deliveryPrice: Number(item.delivery_price),
        itemTotal: Number(item.item_total),
      })),
    });
  } catch (error) {
    next(error);
  }
});

api.put('/purchase-orders/:id', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const validation = validatePurchaseOrder(req.body);
    if (validation) return res.status(400).json({ message: validation });
    await connection.beginTransaction();
    const numericId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    const [orders] = await connection.query(
      numericId === null ? 'SELECT * FROM purchase_orders WHERE order_no = ? FOR UPDATE' : 'SELECT * FROM purchase_orders WHERE order_no = ? OR id = ? FOR UPDATE',
      numericId === null ? [req.params.id] : [req.params.id, numericId]
    );
    if (!orders[0]) return res.status(404).json({ message: 'Purchase order not found' });
    const totals = calculatePurchaseTotals(req.body.items);
    await connection.query(
      'UPDATE purchase_orders SET vendor_id = ?, vendor_name = ?, expected_date = ?, subtotal = ?, delivery_total = ?, tax_rate = ?, tax_amount = ?, grand_total = ?, total = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.body.vendorId, req.body.vendorName.trim(), req.body.expectedDate || null, totals.subtotal, totals.deliveryTotal, totals.taxRate, totals.taxAmount, totals.grandTotal, totals.grandTotal, req.body.note || '', orders[0].id]
    );
    await connection.query('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [orders[0].id]);
    await insertPurchaseOrderItems(connection, orders[0].id, req.body.items);
    await logActivity(connection, req.user.id, 'purchase_order_updated', 'purchase_order', orders[0].id, { orderNo: orders[0].order_no });
    await connection.commit();
    res.json({ id: orders[0].order_no, orderId: orders[0].id, ...totals, items: req.body.items });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.delete('/purchase-orders/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const numericId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    const [result] = await pool.query(
      numericId === null ? 'DELETE FROM purchase_orders WHERE order_no = ?' : 'DELETE FROM purchase_orders WHERE order_no = ? OR id = ?',
      numericId === null ? [req.params.id] : [req.params.id, numericId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Purchase order not found' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

api.post('/purchase-orders/:id/receive', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const numericId = Number(req.params.id) || 0;
    const [orders] = await connection.query('SELECT * FROM purchase_orders WHERE order_no = ? OR id = ? FOR UPDATE', [req.params.id, numericId]);
    if (!orders[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (orders[0].status === 'Received') {
      await connection.rollback();
      return res.status(409).json({ message: 'Purchase order is already received' });
    }
    const [lines] = await connection.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?', [orders[0].id]);
    for (const line of lines) {
      if (!line.item_id) continue;
      const [items] = await connection.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [line.item_id]);
      if (!items[0]) continue;
      const item = items[0];
      const oldQty = Number(item.qty_on_hand);
      const receivedQty = Number(line.qty);
      const unitCost = Number(line.unit_price);
      const newQty = oldQty + receivedQty;
      const averageCost = newQty > 0 ? (oldQty * Number(item.average_cost) + receivedQty * unitCost) / newQty : unitCost;
      await connection.query('UPDATE items SET qty_on_hand = ?, purchase_cost = ?, average_cost = ? WHERE id = ?', [newQty, unitCost, averageCost, item.id]);
      await connection.query(
        'INSERT INTO inventory_batches (item_id, batch_no, expiry_date, qty_received, qty_remaining, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
        [item.id, req.body.batchNo || orders[0].order_no, line.delivery_date || null, receivedQty, receivedQty, unitCost]
      );
      await connection.query('INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        item.id,
        item.name_en,
        'Purchase',
        receivedQty,
        newQty,
        orders[0].order_no,
        req.body.branch || 'Head Quarter',
      ]);
    }
    await connection.query("UPDATE purchase_orders SET status = 'Received', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [orders[0].id]);
    await logActivity(connection, req.user.id, 'purchase_order_received', 'purchase_order', orders[0].id, { orderNo: orders[0].order_no });
    await connection.commit();
    res.json({ ok: true, orderNo: orders[0].order_no, status: 'Received' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// ==========================================
// REGISTER & CASH MANAGEMENT
// ==========================================
api.get('/register/current', auth, async (req, res, next) => {
  try {
    const branch = req.query.branch || 'Head Quarter';
    const [rows] = await pool.query("SELECT * FROM cash_registers WHERE branch = ? AND status = 'Open' ORDER BY id DESC LIMIT 1", [branch]);
    res.json(rows[0] || null);
  } catch (error) {
    next(error);
  }
});

api.post('/register/open', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const branch = String(req.body.branch || 'Head Quarter').trim();
    const startingCash = Math.max(0, Number(req.body.startingCash || 0));
    await connection.beginTransaction();
    const [open] = await connection.query("SELECT id FROM cash_registers WHERE branch = ? AND status = 'Open' FOR UPDATE", [branch]);
    if (open.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'A register is already open for this branch' });
    }
    const [result] = await connection.query('INSERT INTO cash_registers (branch, opened_by, starting_cash) VALUES (?, ?, ?)', [branch, req.user.id, startingCash]);
    await logActivity(connection, req.user.id, 'register_opened', 'cash_register', result.insertId, { branch, startingCash });
    await connection.commit();
    res.status(201).json({ id: result.insertId, branch, startingCash, status: 'Open' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.post('/register/close', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const branch = String(req.body.branch || 'Head Quarter').trim();
    const countedCash = Math.max(0, Number(req.body.countedCash || 0));
    await connection.beginTransaction();
    const [registers] = await connection.query("SELECT * FROM cash_registers WHERE branch = ? AND status = 'Open' ORDER BY id DESC LIMIT 1 FOR UPDATE", [branch]);
    if (!registers[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'No open register for this branch' });
    }
    const register = registers[0];
    const [sales] = await connection.query(
      "SELECT COALESCE(SUM(p.amount_usd), 0) AS cash_sales FROM payment_records p JOIN invoices i ON i.id = p.invoice_id WHERE p.payment_method = 'cash' AND i.created_at >= ? AND i.status = 'Paid'",
      [register.opened_at]
    );
    const expectedCash = Number(register.starting_cash) + Number(sales[0].cash_sales || 0);
    const variance = roundToTwo(countedCash - expectedCash);
    await connection.query(
      "UPDATE cash_registers SET closed_by = ?, closed_at = CURRENT_TIMESTAMP, expected_cash = ?, counted_cash = ?, variance = ?, status = 'Closed' WHERE id = ?",
      [req.user.id, expectedCash, countedCash, variance, register.id]
    );
    await logActivity(connection, req.user.id, 'register_closed', 'cash_register', register.id, { expectedCash, countedCash, variance });
    await connection.commit();
    res.json({ id: register.id, expectedCash, countedCash, variance, status: 'Closed' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.get('/register/report', auth, async (req, res, next) => {
  try {
    const registerId = Number(req.query.registerId);
    if (!registerId) return res.status(400).json({ message: 'Register id is required' });
    const [registers] = await pool.query('SELECT * FROM cash_registers WHERE id = ?', [registerId]);
    if (!registers[0]) return res.status(404).json({ message: 'Register not found' });
    const [totals] = await pool.query(
      'SELECT payment_method, SUM(amount_usd) amount_usd, SUM(amount_khr) amount_khr, COUNT(*) payments FROM payment_records WHERE created_at >= ? AND created_at <= COALESCE(?, CURRENT_TIMESTAMP) GROUP BY payment_method',
      [registers[0].opened_at, registers[0].closed_at]
    );
    res.json({ register: registers[0], totals });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// AR & AP (ACCOUNT RECEIVABLE / PAYABLE)
// ==========================================
api.post('/ar/payments', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const customerId = Number(req.body.customerId) > 0 ? Number(req.body.customerId) : null;
    const invoiceId = Number(req.body.invoiceId) > 0 ? Number(req.body.invoiceId) : null;
    const amount = roundToTwo(Number(req.body.amount));
    if ((!customerId && !invoiceId) || amount <= 0) return res.status(400).json({ message: 'Invoice or customer and positive amount are required' });

    await connection.beginTransaction();
    const [invoices] = await connection.query(
      `
      SELECT i.id, i.customer_id, i.total, COALESCE(SUM(ap.amount), 0) AS paid_amount
      FROM invoices i
      LEFT JOIN ar_payments ap ON ap.invoice_id = i.id
      WHERE i.id = ? AND i.payment_method = ? AND i.status = ?
      GROUP BY i.id, i.customer_id, i.total
      FOR UPDATE
    `,
      [invoiceId, 'customer_account', 'Paid']
    );

    if (invoiceId && !invoices[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Receivable invoice not found' });
    }
    if (invoiceId && amount > roundToTwo(Number(invoices[0].total) - Number(invoices[0].paid_amount)) + 0.001) {
      await connection.rollback();
      return res.status(409).json({ message: 'Payment exceeds the invoice balance' });
    }
    const resolvedCustomerId = customerId || (invoices[0]?.customer_id ? Number(invoices[0].customer_id) : null);
    if (resolvedCustomerId) {
      const [customers] = await connection.query('SELECT id FROM customers WHERE id = ? FOR UPDATE', [resolvedCustomerId]);
      if (!customers[0]) {
        await connection.rollback();
        return res.status(404).json({ message: 'Customer not found' });
      }
    }
    const [result] = await connection.query(
      'INSERT INTO ar_payments (customer_id, invoice_id, amount, payment_method, reference, paid_by) VALUES (?, ?, ?, ?, ?, ?)',
      [resolvedCustomerId, invoiceId, amount, req.body.paymentMethod || 'cash', req.body.reference || null, req.user.id]
    );
    if (resolvedCustomerId) await connection.query('UPDATE customers SET balance = GREATEST(0, balance - ?) WHERE id = ?', [amount, resolvedCustomerId]);
    await logActivity(connection, req.user.id, 'ar_payment_recorded', resolvedCustomerId ? 'customer' : 'invoice', resolvedCustomerId || invoiceId, { amount, invoiceId });
    await connection.commit();
    res.status(201).json({ id: result.insertId, customerId: resolvedCustomerId, invoiceId, amount });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.get('/ar/summary', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.id AS invoice_id, i.invoice_no, i.customer_id, i.customer_name, i.created_at,
             i.total, COALESCE(SUM(ap.amount), 0) AS paid_amount,
             GREATEST(0, i.total - COALESCE(SUM(ap.amount), 0)) AS balance
      FROM invoices i
      LEFT JOIN ar_payments ap ON ap.invoice_id = i.id
      WHERE i.payment_method = 'customer_account' AND i.status = 'Paid'
      GROUP BY i.id, i.invoice_no, i.customer_id, i.customer_name, i.created_at, i.total
      HAVING balance > 0
      ORDER BY i.created_at ASC
    `);
    res.json(
      rows.map((row) => ({
        invoiceId: Number(row.invoice_id),
        invoice: row.invoice_no,
        customerId: row.customer_id ? Number(row.customer_id) : null,
        customer: row.customer_name,
        date: row.created_at,
        total: Number(row.total),
        paid: Number(row.paid_amount),
        balance: Number(row.balance),
      }))
    );
  } catch (error) {
    next(error);
  }
});

api.get('/ap/summary', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT po.id AS order_id, po.order_no, po.vendor_id, po.vendor_name, po.expected_date, po.created_at,
             po.grand_total AS total, COALESCE(SUM(ap.amount), 0) AS paid_amount,
             GREATEST(0, po.grand_total - COALESCE(SUM(ap.amount), 0)) AS balance, po.status
      FROM purchase_orders po
      LEFT JOIN ap_payments ap ON ap.purchase_order_id = po.id
      WHERE po.status <> 'Cancelled'
      GROUP BY po.id, po.order_no, po.vendor_id, po.vendor_name, po.expected_date, po.created_at, po.grand_total, po.status
      HAVING balance > 0
      ORDER BY COALESCE(po.expected_date, po.created_at), po.id
    `);
    res.json(
      rows.map((row) => ({
        orderId: Number(row.order_id),
        order: row.order_no,
        vendorId: row.vendor_id ? Number(row.vendor_id) : null,
        vendor: row.vendor_name,
        dueDate: row.expected_date || row.created_at,
        total: Number(row.total),
        paid: Number(row.paid_amount),
        balance: Number(row.balance),
        status: row.status,
      }))
    );
  } catch (error) {
    next(error);
  }
});

api.post('/ap/payments', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const orderId = Number(req.body.orderId);
    const amount = roundToTwo(Number(req.body.amount));
    if (!orderId || amount <= 0) return res.status(400).json({ message: 'Purchase order and positive amount are required' });

    await connection.beginTransaction();
    const [orders] = await connection.query('SELECT po.*, COALESCE(SUM(ap.amount), 0) paid_amount FROM purchase_orders po LEFT JOIN ap_payments ap ON ap.purchase_order_id = po.id WHERE po.id = ? GROUP BY po.id FOR UPDATE', [orderId]);
    if (!orders[0] || orders[0].status === 'Cancelled') {
      await connection.rollback();
      return res.status(404).json({ message: 'Payable order not found' });
    }
    const balance = Number(orders[0].grand_total) - Number(orders[0].paid_amount || 0);
    if (amount > balance + 0.001) {
      await connection.rollback();
      return res.status(400).json({ message: 'Payment exceeds payable balance' });
    }
    await connection.query('INSERT INTO ap_payments (purchase_order_id, vendor_id, amount, payment_method, reference, paid_by) VALUES (?, ?, ?, ?, ?, ?)', [
      orderId,
      orders[0].vendor_id || null,
      amount,
      req.body.paymentMethod || 'cash',
      req.body.reference || null,
      req.user.id,
    ]);
    await logActivity(connection, req.user.id, 'ap_payment_recorded', 'purchase_order', orderId, { amount, vendor: orders[0].vendor_name });
    await connection.commit();
    res.status(201).json({ orderId, amount, balance: roundToTwo(balance - amount) });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.post('/manager/override', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Manager approval required' });
    if (!req.body.action?.trim()) return res.status(400).json({ message: 'Override action is required' });
    await logActivity(pool, req.user.id, 'manager_override', req.body.entityType || 'system', req.body.entityId || null, { action: req.body.action, reason: req.body.reason || null });
    res.json({ ok: true, approvedBy: req.user.name });
  } catch (error) {
    next(error);
  }
});

api.get('/reports/tax-export', auth, adminOnly, async (req, res, next) => {
  try {
    const kind = req.query.kind === 'purchases' ? 'purchases' : 'sales';
    const conditions = [];
    const params = [];
    if (req.query.from) {
      conditions.push('created_at >= ?');
      params.push(`${req.query.from} 00:00:00`);
    }
    if (req.query.to) {
      conditions.push('created_at < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(req.query.to);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const [rows] =
      kind === 'sales'
        ? await pool.query(`SELECT invoice_no AS invoice, created_at AS date, customer_name AS customer, vat_tin, net_sale, vat, total, payment_method FROM invoices${where} ORDER BY created_at`, params)
        : await pool.query(`SELECT order_no AS order_no, created_at AS date, vendor_name AS vendor, tax_rate, tax_amount, grand_total, status FROM purchase_orders${where} ORDER BY created_at`, params);
    const headers = rows.length ? Object.keys(rows[0]) : kind === 'sales' ? ['invoice', 'date', 'customer', 'vat_tin', 'net_sale', 'vat', 'total', 'payment_method'] : ['order_no', 'date', 'vendor', 'tax_rate', 'tax_amount', 'grand_total', 'status'];
    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${kind}-tax-book.csv`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// INVENTORY BATCHES & TRANSFERS
// ==========================================
api.get('/inventory/batches', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT b.*, i.name_en item_name FROM inventory_batches b JOIN items i ON i.id = b.item_id ORDER BY b.expiry_date, b.created_at');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.post('/inventory/batches', auth, adminOnly, async (req, res, next) => {
  try {
    const itemId = Number(req.body.itemId);
    const qty = Number(req.body.quantity);
    if (!itemId || qty <= 0 || !req.body.batchNo) return res.status(400).json({ message: 'Item, batch number and positive quantity are required' });
    const [result] = await pool.query('INSERT INTO inventory_batches (item_id, batch_no, expiry_date, qty_received, qty_remaining, unit_cost) VALUES (?, ?, ?, ?, ?, ?)', [
      itemId,
      req.body.batchNo.trim(),
      req.body.expiryDate || null,
      qty,
      qty,
      Number(req.body.unitCost || 0),
    ]);
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    next(error);
  }
});

api.get('/inventory/transfers', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM stock_transfers ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.post('/inventory/transfers', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    if (!req.body.fromBranch || !req.body.toBranch || !Array.isArray(req.body.items) || !req.body.items.length) {
      return res.status(400).json({ message: 'Branches and transfer items are required' });
    }
    await connection.beginTransaction();
    const [count] = await connection.query('SELECT COUNT(*) total FROM stock_transfers');
    const transferNo = `TR-${String(Number(count[0].total) + 1).padStart(5, '0')}`;
    const [result] = await connection.query('INSERT INTO stock_transfers (transfer_no, from_branch, to_branch, status, created_by) VALUES (?, ?, ?, ?, ?)', [
      transferNo,
      req.body.fromBranch,
      req.body.toBranch,
      'In Transit',
      req.user.id,
    ]);
    for (const item of req.body.items) {
      const qty = Number(item.qty);
      if (qty <= 0) throw new Error('Transfer quantities must be positive');
      await connection.query('INSERT INTO stock_transfer_items (transfer_id, item_id, qty) VALUES (?, ?, ?)', [result.insertId, item.itemId, qty]);
    }
    await logActivity(connection, req.user.id, 'stock_transfer_created', 'stock_transfer', result.insertId, { transferNo });
    await connection.commit();
    res.status(201).json({ id: result.insertId, transferNo, status: 'In Transit' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// ==========================================
// PROJECTS & FILES
// ==========================================
api.get('/projects', auth, async (req, res, next) => {
  try {
    const admin = req.user.role === 'admin';
    const [rows] = await pool.query(
      `SELECT p.*, u.name submitted_by_name, r.name reviewed_by_name FROM projects p JOIN users u ON u.id = p.submitted_by LEFT JOIN users r ON r.id = p.reviewed_by ${admin ? '' : 'WHERE p.submitted_by = ?'} ORDER BY p.created_at DESC`,
      admin ? [] : [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.post('/projects', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    if (req.user.role !== 'user') return res.status(403).json({ message: 'Only users can submit projects' });
    if (!req.body.title?.trim()) return res.status(400).json({ message: 'Project title is required' });
    await connection.beginTransaction();
    const [result] = await connection.query('INSERT INTO projects (title, description, submitted_by) VALUES (?, ?, ?)', [req.body.title.trim(), req.body.description || '', req.user.id]);
    const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin' AND active = 1");
    for (const admin of admins) await notify(connection, admin.id, 'project_submitted', 'New project submitted', `${req.user.name} submitted ${req.body.title}`, 'project', result.insertId);
    await logActivity(connection, req.user.id, 'project_submitted', 'project', result.insertId);
    await connection.commit();
    res.status(201).json({ id: result.insertId, title: req.body.title.trim(), description: req.body.description || '', status: 'Pending Approval', submitted_by: req.user.id });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.patch('/admin/projects/:id/review', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const status = String(req.body.status || '').toLowerCase() === 'approved' ? 'Approved' : String(req.body.status || '').toLowerCase() === 'rejected' ? 'Rejected' : '';
    if (!status) return res.status(400).json({ message: 'Status must be Approved or Rejected' });
    if (status === 'Rejected' && !req.body.reason?.trim()) return res.status(400).json({ message: 'Rejection reason is required' });
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM projects WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Project not found' });
    if (rows[0].status !== 'Pending Approval') {
      await connection.rollback();
      return res.status(409).json({ message: 'This project has already been reviewed' });
    }
    await connection.query('UPDATE projects SET status = ?, reviewed_by = ?, rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.user.id, status === 'Rejected' ? req.body.reason.trim() : null, req.params.id]);
    await notify(connection, rows[0].submitted_by, 'project_reviewed', `Project ${status}`, `${rows[0].title} was ${status.toLowerCase()}${status === 'Rejected' ? `: ${req.body.reason.trim()}` : ''}`, 'project', rows[0].id);
    await logActivity(connection, req.user.id, `project_${status.toLowerCase()}`, 'project', rows[0].id, { reason: req.body.reason || null });
    await connection.commit();
    res.json({ ok: true, status });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.get('/projects/:id/files', auth, async (req, res, next) => {
  try {
    const [projects] = await pool.query('SELECT submitted_by FROM projects WHERE id = ?', [req.params.id]);
    if (!projects[0] || (req.user.role !== 'admin' && projects[0].submitted_by !== req.user.id)) return res.status(403).json({ message: 'Access denied' });
    const [rows] = await pool.query('SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.get('/files', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, p.title AS project_title
       FROM project_files f
       LEFT JOIN projects p ON p.id = f.project_id
       WHERE f.submitted_by = ?
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.post('/files', auth, uploadSingleDocument, async (req, res, next) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: 'Choose a document to upload.' });
  if (req.user.role !== 'user') {
    await fs.unlink(file.path).catch(() => {});
    return res.status(403).json({ message: 'Only user accounts can submit documents for approval.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const fileName = path.basename(file.originalname).slice(0, 255) || 'document';
    const [result] = await connection.query(
      `INSERT INTO project_files (project_id, file_name, file_url, file_size, mime_type, submitted_by)
       VALUES (NULL, ?, ?, ?, ?, ?)`,
      [fileName, file.filename, file.size, file.mimetype, req.user.id]
    );
    const [admins] = await connection.query("SELECT id FROM users WHERE LOWER(role) = 'admin' AND active = 1");
    for (const admin of admins) {
      await notify(connection, admin.id, 'file_submitted', 'New file submitted', `${req.user.name} submitted ${fileName}`, 'file', result.insertId);
    }
    await logActivity(connection, req.user.id, 'file_submitted', 'file', result.insertId, { fileName });
    await connection.commit();
    res.status(201).json({
      id: result.insertId,
      file_name: fileName,
      file_size: file.size,
      mime_type: file.mimetype,
      status: 'Pending Approval',
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    await fs.unlink(file.path).catch(() => {});
    next(error);
  } finally {
    connection?.release();
  }
});

api.get('/files/:id/download', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, file_name, file_url, submitted_by FROM project_files WHERE id = ? LIMIT 1', [req.params.id]);
    const file = rows[0];
    if (!file) return res.status(404).json({ message: 'File not found.' });
    if (req.user.role !== 'admin' && Number(file.submitted_by) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'You cannot access this file.' });
    }
    if (!file.file_url) return res.status(404).json({ message: 'This record has no uploaded file.' });

    const storedName = path.basename(file.file_url);
    const filePath = path.join(uploadsDirectory, storedName);
    res.download(filePath, path.basename(file.file_name), (error) => {
      if (error && !res.headersSent) {
        if (error.code === 'ENOENT') return res.status(404).json({ message: 'Uploaded file is missing from storage.' });
        next(error);
      }
    });
  } catch (error) {
    next(error);
  }
});

api.post('/projects/:id/files', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const [projects] = await connection.query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!projects[0] || (req.user.role !== 'admin' && projects[0].submitted_by !== req.user.id)) return res.status(403).json({ message: 'Access denied' });
    if (!req.body.fileName?.trim()) return res.status(400).json({ message: 'File name is required' });
    await connection.beginTransaction();
    const [result] = await connection.query('INSERT INTO project_files (project_id, file_name, file_url, submitted_by) VALUES (?, ?, ?, ?)', [
      req.params.id,
      req.body.fileName.trim(),
      req.body.fileUrl || null,
      req.user.id,
    ]);
    const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin' AND active = 1");
    for (const admin of admins) await notify(connection, admin.id, 'file_submitted', 'New file submitted', `${req.user.name} submitted ${req.body.fileName}`, 'file', result.insertId);
    await logActivity(connection, req.user.id, 'file_submitted', 'file', result.insertId);
    await connection.commit();
    res.status(201).json({ id: result.insertId, project_id: Number(req.params.id), file_name: req.body.fileName.trim(), status: 'Pending Approval' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.get('/admin/files', auth, adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT f.*, p.title project_title, u.name submitted_by_name FROM project_files f LEFT JOIN projects p ON p.id = f.project_id JOIN users u ON u.id = f.submitted_by ORDER BY f.created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.patch('/admin/files/:id/review', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const status = String(req.body.status || '').toLowerCase() === 'approved' ? 'Approved' : String(req.body.status || '').toLowerCase() === 'rejected' ? 'Rejected' : '';
    if (!status) return res.status(400).json({ message: 'Invalid review status' });
    if (status === 'Rejected' && !req.body.reason?.trim()) return res.status(400).json({ message: 'Rejection reason is required' });
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM project_files WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'File not found' });
    if (rows[0].status !== 'Pending Approval') {
      await connection.rollback();
      return res.status(409).json({ message: 'This file has already been reviewed' });
    }
    await connection.query('UPDATE project_files SET status = ?, reviewed_by = ?, rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [
      status,
      req.user.id,
      status === 'Rejected' ? req.body.reason.trim() : null,
      req.params.id,
    ]);
    await notify(connection, rows[0].submitted_by, 'file_reviewed', `File ${status}`, `${rows[0].file_name} was ${status.toLowerCase()}`, 'file', rows[0].id);
    await logActivity(connection, req.user.id, `file_${status.toLowerCase()}`, 'file', rows[0].id, { status, fileName: rows[0].file_name, reason: req.body.reason?.trim() || null });
    await connection.commit();
    res.json({ ok: true, status });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// ==========================================
// LEAVE REQUESTS
// ==========================================
api.get('/leave-requests', auth, async (req, res, next) => {
  try {
    const isAdmin = String(req.user.role || '').toLowerCase() === 'admin';
    const [rows] = await pool.query(
      `SELECT l.*, u.name submitted_by_name FROM leave_requests l JOIN users u ON u.id = l.submitted_by ${isAdmin ? '' : 'WHERE l.submitted_by = ?'} ORDER BY l.created_at DESC`,
      isAdmin ? [] : [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.post('/leave-requests', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const startDate = req.body.startDate || req.body.start_date;
    const endDate = req.body.endDate || req.body.end_date;
    const reason = String(req.body.reason || '').trim();
    if (!startDate || !endDate || !reason) return res.status(400).json({ message: 'Start date, end date, and reason are required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
      return res.status(400).json({ message: 'End date must be on or after the start date' });
    }
    await connection.beginTransaction();
    const [result] = await connection.query('INSERT INTO leave_requests (start_date, end_date, reason, submitted_by) VALUES (?, ?, ?, ?)', [startDate, endDate, reason, req.user.id]);
    const [admins] = await connection.query("SELECT id FROM users WHERE LOWER(role) = 'admin' AND active = 1");
    for (const admin of admins) await notify(connection, admin.id, 'leave_submitted', 'New leave request', `${req.user.name} submitted a leave request`, 'leave', result.insertId);
    await logActivity(connection, req.user.id, 'leave_submitted', 'leave', result.insertId);
    await connection.commit();
    res.status(201).json({ id: result.insertId, start_date: startDate, end_date: endDate, reason, status: 'Pending Approval' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.patch('/admin/leave-requests/:id/review', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const status = String(req.body.status || '').toLowerCase() === 'approved' ? 'Approved' : String(req.body.status || '').toLowerCase() === 'rejected' ? 'Rejected' : '';
    if (!status) return res.status(400).json({ message: 'Invalid review status' });
    if (status === 'Rejected' && !req.body.reason?.trim()) return res.status(400).json({ message: 'Rejection reason is required' });
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM leave_requests WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Leave request not found' });
    if (rows[0].status !== 'Pending Approval') {
      await connection.rollback();
      return res.status(409).json({ message: 'This leave request has already been reviewed' });
    }
    await connection.query('UPDATE leave_requests SET status = ?, reviewed_by = ?, rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [
      status,
      req.user.id,
      status === 'Rejected' ? req.body.reason.trim() : null,
      req.params.id,
    ]);
    await notify(connection, rows[0].submitted_by, 'leave_reviewed', `Leave request ${status}`, `Your leave request was ${status.toLowerCase()}`, 'leave', rows[0].id);
    await logActivity(connection, req.user.id, `leave_${status.toLowerCase()}`, 'leave', rows[0].id, {
      status,
      startDate: rows[0].start_date,
      endDate: rows[0].end_date,
      reason: req.body.reason?.trim() || null,
    });
    await connection.commit();
    res.json({ ok: true, status });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// ==========================================
// SETTINGS & POLICY
// ==========================================
api.get('/settings', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['company']);
    res.json(rows[0] ? (typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value) : {});
  } catch (error) {
    next(error);
  }
});

api.get('/policy-notes', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['company']);
    const settings = rows[0] ? (typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value) : {};
    res.json({ notes: String(settings.policy?.documents?.notes || '') });
  } catch (error) {
    next(error);
  }
});

api.put('/admin/policy-notes', auth, adminOnly, async (req, res, next) => {
  try {
    const notes = String(req.body?.notes || '').trim();
    if (notes.length > 2000) return res.status(400).json({ message: 'Policy notes cannot exceed 2000 characters' });
    const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['company']);
    const settings = rows[0] ? (typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value) : {};
    const policy = settings.policy || {};
    policy.documents = { ...(policy.documents || {}), notes };
    settings.policy = policy;
    await pool.query('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', ['company', JSON.stringify(settings)]);
    await logActivity(pool, req.user.id, 'policy_notes_updated', 'settings', null, { length: notes.length });
    res.json({ notes });
  } catch (error) {
    next(error);
  }
});

api.delete('/admin/policy-notes', auth, adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['company']);
    const settings = rows[0] ? (typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value) : {};
    settings.policy = { ...(settings.policy || {}), documents: { ...(settings.policy?.documents || {}), notes: '' } };
    await pool.query('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', ['company', JSON.stringify(settings)]);
    await logActivity(pool, req.user.id, 'policy_notes_deleted', 'settings', null);
    res.json({ notes: '' });
  } catch (error) {
    next(error);
  }
});

api.put('/settings', auth, adminOnly, async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ message: 'Settings payload must be an object' });
    if (req.body.policy !== undefined && (typeof req.body.policy !== 'object' || Array.isArray(req.body.policy))) {
      return res.status(400).json({ message: 'Policy settings must be an object' });
    }
    await pool.query('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', ['company', JSON.stringify(req.body)]);
    if (req.body.policy !== undefined) await logActivity(pool, req.user.id, 'policy_updated', 'settings', null, { sections: Object.keys(req.body.policy) });
    res.json(req.body);
  } catch (error) {
    next(error);
  }
});

module.exports = api;