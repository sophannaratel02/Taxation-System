const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { khqrData } = require('bakong-khqr');

const { pool } = require('../db');
const { resolveJwtSecret } = require('../config/runtime');
const authRoutes = require('../routes/auth');
const {
  authenticate: auth,
  requireAdmin: adminOnly,
  requireOwner: ownerOnly,
  requireSuperAdmin: superAdminOnly,
} = require('../middleware/auth');
const {
  assertBranchAccess,
  getAuthorizedBranches,
  invoiceCustomerMismatch,
  isSystemAdministrator,
} = require('../services/branchAuthorization');
const {
  invalidateAccessPolicyCache,
  loadAccessPolicy,
  loginBlockMessage,
  passwordMeetsPolicy,
} = require('../services/accessPolicy');
const { branchFilter, movementCostExpression } = require('../services/stockCost');
const { resolveReportDateRange } = require('../services/reportDateRange');
const { invalidateInventoryPolicyCache, loadInventoryPolicy } = require('../services/inventoryPolicy');
const { effectiveAccountRole, findUserForLogin } = require('../services/authentication');
const { STAFF_PRESETS, buildPermissions, hasPermission, parsePermissions } = require('../services/permissions');
const {
  assertRegisterOpen,
  isOpenRegisterConflict,
  resolveSaleLine,
  validateCashTender,
} = require('../services/posSale');
const { prepareSalesReturnLines } = require('../services/salesReturn');
const { preparePurchaseReturnLines } = require('../services/purchaseReturn');
const { mapCustomer, prepareCustomerProfile } = require('../services/customerProfile');
const { getTenantCompanyId } = require('../services/tenantContext');

const api = express.Router();
const jwtSecret = resolveJwtSecret();
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

function currentCompanyId() {
  const companyId = Number(getTenantCompanyId());
  if (!Number.isSafeInteger(companyId) || companyId < 1) {
    throw new Error('A tenant context is required for inventory operations');
  }
  return companyId;
}

function assertWholeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity)) {
    throw new Error('Stock quantity calculations must remain whole safe integers');
  }
  return quantity;
}

function validateStockQuantity(value, { allowZero = false } = {}) {
  const quantity = Number(value);
  if (
    !Number.isSafeInteger(quantity)
    || (allowZero ? quantity < 0 : quantity <= 0)
  ) return null;
  return quantity;
}

function validateStockAdjustmentQuantity(value) {
  const quantity = Number(value);
  if (
    !Number.isSafeInteger(quantity)
    || quantity === 0
  ) return null;
  return quantity;
}

function hasAtMostDecimals(value, places) {
  const number = Number(value);
  const scale = 10 ** places;
  return Number.isFinite(number) && Math.abs(number * scale - Math.round(number * scale)) <= 1e-8;
}

function validateItemAmounts(item) {
  const values = {
    retailPrice: Number(item.retailPrice ?? 0),
    purchaseCost: Number(item.purchaseCost ?? 0),
    reorderQty: Number(item.reorderQty ?? 0),
    markupAmount: Number(item.markupAmount ?? 0),
  };
  if (!Object.values(values).every((value) => Number.isFinite(value) && value >= 0)) {
    return 'Prices, markup and reorder quantity must be non-negative numbers';
  }
  if (!hasAtMostDecimals(values.retailPrice, 4)
    || !hasAtMostDecimals(values.purchaseCost, 6)
    || !Number.isSafeInteger(values.reorderQty)
    || !hasAtMostDecimals(values.markupAmount, 4)) {
    return 'Selling price supports 4 decimals; markup supports 4 decimals and cost supports 6 decimals; reorder quantity must be a whole number';
  }
  return null;
}

function stockError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getBranch(value) {
  const branch = String(value || 'Head Quarter').trim();
  if (!branch || branch.length > 120) throw stockError(400, 'A valid branch is required');
  return branch;
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

function normalizeItemUnits(unitsData, baseUnit, retailPrice) {
  const sourceUnits = parseUnits(unitsData);
  const units = Array.isArray(sourceUnits)
    ? sourceUnits.map((unit) => ({
      ...unit,
      name: String(unit?.name || '').trim(),
      ratio: Number(unit?.ratio ?? 1),
      retailPrice: Number(unit?.retailPrice ?? 0),
    }))
    : [];
  const baseIndex = units.findIndex((unit) => unit.name.toLowerCase() === String(baseUnit).trim().toLowerCase());
  if (baseIndex < 0) {
    units.unshift({ name: String(baseUnit).trim(), ratio: 1, retailPrice: Number(retailPrice) });
  } else if (baseIndex > 0) {
    units.unshift(units.splice(baseIndex, 1)[0]);
  }
  if (!units.length) units.push({ name: String(baseUnit).trim(), ratio: 1, retailPrice: Number(retailPrice) });
  units[0].name = String(baseUnit).trim();
  units[0].ratio = 1;
  units[0].retailPrice = Number(retailPrice);
  return units;
}

function validateItemUnits(units) {
  const names = new Set();
  for (const unit of units) {
    const name = String(unit?.name || '').trim();
    const ratio = Number(unit?.ratio);
    const retailPrice = Number(unit?.retailPrice);
    if (!name || names.has(name.toLowerCase())) return 'Unit names must be present and unique';
    if (!Number.isSafeInteger(ratio) || ratio <= 0) return 'Unit quantities must be positive whole numbers';
    if (!Number.isFinite(retailPrice) || retailPrice < 0 || !hasAtMostDecimals(retailPrice, 4)) {
      return 'Unit selling prices must be non-negative and support up to 4 decimals';
    }
    names.add(name.toLowerCase());
  }
  return null;
}

function mapItem(row) {
  const item = {
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
    averageCost: Number(row.branch_avg_cost ?? row.average_cost),
    markupAmount: Number(row.markup_amount ?? 0),
    autoRecalculatePrice: Boolean(row.auto_recalculate_price),
    vendorId: row.vendor_id,
    vendorName: row.vendor_name || '',
    units: parseUnits(row.units),
  };
  if (row.branch_qty_on_hand !== undefined) {
    item.totalQtyOnHand = item.qtyOnHand;
    item.qtyOnHand = Number(row.branch_qty_on_hand);
  }
  return item;
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

async function logPlatformActivity(connection, userId, action, entityType, entityId, details = {}) {
  await connection.query(
    'INSERT INTO platform_activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId || null, JSON.stringify(details)]
  );
}

async function deleteCompanyWorkspaceData(connection, companyId) {
  const [tableRows] = await connection.query(
    `SELECT DISTINCT columnInfo.TABLE_NAME
     FROM information_schema.COLUMNS columnInfo
     JOIN information_schema.TABLES tableInfo
       ON tableInfo.TABLE_SCHEMA = columnInfo.TABLE_SCHEMA
       AND tableInfo.TABLE_NAME = columnInfo.TABLE_NAME
     WHERE columnInfo.TABLE_SCHEMA = DATABASE()
       AND columnInfo.COLUMN_NAME = 'company_id'
       AND tableInfo.TABLE_TYPE = 'BASE TABLE'
       AND columnInfo.TABLE_NAME <> 'companies'`
  );
  const tables = tableRows.map((row) => row.TABLE_NAME);
  if (tables.some((table) => !/^[a-z0-9_]+$/i.test(table))) {
    throw new Error('Cannot safely delete workspace data because a database table name is invalid.');
  }
  if (!tables.length) return;

  const placeholders = tables.map(() => '?').join(', ');
  const [foreignKeys] = await connection.query(
    `SELECT k.TABLE_NAME, k.COLUMN_NAME, k.CONSTRAINT_NAME, k.REFERENCED_TABLE_NAME,
       k.REFERENCED_COLUMN_NAME, r.DELETE_RULE
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
       AND r.TABLE_NAME = k.TABLE_NAME
       AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.CONSTRAINT_SCHEMA = DATABASE()
       AND k.REFERENCED_TABLE_NAME IS NOT NULL
       AND k.TABLE_NAME IN (${placeholders})
       AND k.REFERENCED_TABLE_NAME IN (${placeholders})
     ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
    [...tables, ...tables]
  );

  const scopedTables = new Set(tables);
  const parentTables = new Map(tables.map((table) => [table, new Set()]));
  const restrictiveSelfReferences = new Map();
  for (const foreignKey of foreignKeys) {
    if (foreignKey.TABLE_NAME === foreignKey.REFERENCED_TABLE_NAME) {
      if (foreignKey.DELETE_RULE === 'RESTRICT' || foreignKey.DELETE_RULE === 'NO ACTION') {
        const key = `${foreignKey.TABLE_NAME}:${foreignKey.CONSTRAINT_NAME}`;
        if (!restrictiveSelfReferences.has(key)) {
          restrictiveSelfReferences.set(key, {
            table: foreignKey.TABLE_NAME,
            columns: [],
          });
        }
        restrictiveSelfReferences.get(key).columns.push({
          child: foreignKey.COLUMN_NAME,
          parent: foreignKey.REFERENCED_COLUMN_NAME,
        });
      }
      continue;
    }

    parentTables.get(foreignKey.TABLE_NAME).add(foreignKey.REFERENCED_TABLE_NAME);
  }

  const pendingChildren = new Map(tables.map((table) => [table, 0]));
  for (const referencedTables of parentTables.values()) {
    for (const parent of referencedTables) {
      pendingChildren.set(parent, pendingChildren.get(parent) + 1);
    }
  }
  const readyTables = tables.filter((table) => pendingChildren.get(table) === 0);
  const deletionOrder = [];
  while (readyTables.length) {
    const table = readyTables.shift();
    deletionOrder.push(table);
    for (const parent of parentTables.get(table)) {
      const remainingChildren = pendingChildren.get(parent) - 1;
      pendingChildren.set(parent, remainingChildren);
      if (remainingChildren === 0) readyTables.push(parent);
    }
  }
  if (deletionOrder.length !== scopedTables.size) {
    throw new Error('Cannot safely delete workspace data because tenant tables have cyclic foreign-key dependencies.');
  }

  for (const table of deletionOrder) {
    const selfReferences = [...restrictiveSelfReferences.values()]
      .filter((reference) => reference.table === table);
    if (!selfReferences.length) {
      await connection.query(`DELETE FROM \`${table}\` WHERE company_id = ?`, [companyId]);
      continue;
    }

    const joins = selfReferences.map((reference, index) => {
      const conditions = reference.columns
        .map(({ child, parent }) => `child${index}.\`${child}\` = parent.\`${parent}\``)
        .join(' AND ');
      return `LEFT JOIN \`${table}\` child${index} ON ${conditions}`;
    }).join(' ');
    const noChildren = selfReferences
      .map((reference, index) => `child${index}.\`${reference.columns[0].child}\` IS NULL`)
      .join(' AND ');

    while (true) {
      const [result] = await connection.query(
        `DELETE parent FROM \`${table}\` parent ${joins}
         WHERE parent.company_id = ? AND ${noChildren}`,
        [companyId]
      );
      if (!result.affectedRows) break;
    }
    const [[remainingRows]] = await connection.query(
      `SELECT COUNT(*) AS remaining FROM \`${table}\` WHERE company_id = ?`,
      [companyId]
    );
    if (Number(remainingRows.remaining) > 0) {
      throw new Error(`Cannot safely delete workspace data because ${table} contains a self-referencing cycle.`);
    }
  }
}

async function lockSuperAdminAccounts(connection) {
  const [rows] = await connection.query(
    `SELECT id, active, status, approval_status FROM users
     WHERE LOWER(role) = 'superadmin' FOR UPDATE`
  );
  return rows.filter((user) =>
    Number(user.active) === 1
    && String(user.status).toUpperCase() === 'ACTIVE'
    && String(user.approval_status).toLowerCase() === 'approved'
  );
}

async function addUserBranches(connection, users, companyId) {
  if (!users.length) return users;
  const userIds = users.map((user) => user.id);
  const [rows] = await connection.query(
    'SELECT user_id, branch FROM user_branch_access WHERE company_id = ? AND user_id IN (?) ORDER BY branch',
    [companyId, userIds]
  );
  const branchesByUser = new Map();
  for (const row of rows) {
    if (!branchesByUser.has(Number(row.user_id))) branchesByUser.set(Number(row.user_id), []);
    branchesByUser.get(Number(row.user_id)).push(row.branch);
  }
  return users.map((user) => ({
    ...user,
    branches: branchesByUser.get(Number(user.id)) || [],
  }));
}

function normalizeBranchAccess(value, role) {
  const branches = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const normalized = [...new Set(branches.map((branch) => String(branch || '').trim()).filter(Boolean))];
  if (normalized.some((branch) => branch.length > 120)) {
    throw stockError(400, 'Branch names must be 120 characters or fewer');
  }
  if (!isSystemAdministrator({ role }) && !normalized.length) {
    throw stockError(400, 'At least one authorized branch is required for staff users');
  }
  return normalized;
}

function prepareStaffPermissions(preset, grants) {
  try {
    return buildPermissions(preset, grants);
  } catch (error) {
    throw stockError(400, error.message);
  }
}

async function saveUserBranches(connection, userId, companyId, branches) {
  await connection.query('DELETE FROM user_branch_access WHERE user_id = ? AND company_id = ?', [userId, companyId]);
  for (const branch of branches) {
    await connection.query('INSERT INTO user_branch_access (user_id, branch, company_id) VALUES (?, ?, ?)', [userId, branch, companyId]);
  }
}

async function defaultBranchForUser(connection, companyId) {
  const [rows] = await connection.query(
    'SELECT setting_value FROM company_settings WHERE company_id = ? AND setting_key = ?',
    [companyId, 'company']
  );
  const settings = rows[0]
    ? (typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value)
    : {};
  return String(settings.branch || 'Head Quarter').trim();
}

async function notify(connection, userId, type, title, message, entityType, entityId) {
  await connection.query(
    'INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, type, title, message, entityType || null, entityId || null]
  );
}

async function getCompanyReviewers(connection, companyId) {
  const [accounts] = await connection.query(
    `SELECT id, role, is_owner, permissions FROM users
     WHERE company_id = ? AND LOWER(role) IN ('owner', 'staff') AND active = 1`,
    [companyId]
  );
  return accounts.filter((account) => hasPermission(
    { ...account, role: Number(account.is_owner) === 1 ? 'owner' : account.role },
    'approvals.manage'
  ));
}

function calculatePurchaseTotals(items, taxRate = DEFAULT_VAT_RATE * 100, handlingCost = 0, documentationCost = 0) {
  const normalizedHandlingCost = Number(handlingCost || 0);
  const normalizedDocumentationCost = Number(documentationCost || 0);
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

  const taxableAmount = base.subtotal + base.deliveryTotal + normalizedHandlingCost + normalizedDocumentationCost;
  const normalizedTaxRate = Number(taxRate);
  const taxAmount = roundToTwo(taxableAmount * (normalizedTaxRate / 100));
  return { ...base, handlingCost: normalizedHandlingCost, documentationCost: normalizedDocumentationCost, taxRate: normalizedTaxRate, taxAmount, grandTotal: taxableAmount + taxAmount };
}

async function getConfiguredPurchaseTaxRate(connection, companyId) {
  const [rows] = await connection.query(
    'SELECT setting_value FROM company_settings WHERE company_id = ? AND setting_key = ?',
    [companyId, 'company']
  );
  const settings = rows[0]
    ? (typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value)
    : {};
  const configuredRate = Number(settings.vatRate ?? DEFAULT_VAT_RATE * 100);
  return Number.isFinite(configuredRate) ? configuredRate : DEFAULT_VAT_RATE * 100;
}

function validatePurchaseOrder(payload) {
  const orderDate = String(payload.orderDate || '');
  const parsedOrderDate = new Date(`${orderDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || Number.isNaN(parsedOrderDate.getTime()) || parsedOrderDate.toISOString().slice(0, 10) !== orderDate) {
    return 'A valid order date is required';
  }
  if (!Number.isInteger(Number(payload.vendorId)) || Number(payload.vendorId) < 1) return 'Supplier is required';
  for (const key of ['handlingCost', 'documentationCost']) {
    const cost = Number(payload[key] || 0);
    if (!Number.isFinite(cost) || cost < 0) return `${key === 'handlingCost' ? 'Handling' : 'Documentation'} cost must be non-negative`;
    if (Math.abs(cost * 100 - Math.round(cost * 100)) > 0.000001) return `${key === 'handlingCost' ? 'Handling' : 'Documentation'} cost cannot exceed two decimal places`;
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) return 'At least one product row is required';
  for (let index = 0; index < payload.items.length; index += 1) {
    const item = payload.items[index];
    if (!Number.isInteger(Number(item.itemId)) || Number(item.itemId) < 1) return `Select an inventory catalog item for row ${index + 1}`;
    if (!item.productName?.trim()) return `Product name is required for row ${index + 1}`;
    const quantity = validateStockQuantity(item.qty);
    const unitPrice = item.unitPrice === null || item.unitPrice === '' ? Number.NaN : Number(item.unitPrice);
    const deliveryPrice = item.deliveryPrice === null || item.deliveryPrice === '' ? Number.NaN : Number(item.deliveryPrice);
    const deliveryDate = String(item.deliveryDate || '');
    if (quantity === null) return `Quantity must be a positive whole number for row ${index + 1}`;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return `Unit price must be a non-negative number for row ${index + 1}`;
    if (Math.abs(unitPrice * 10000 - Math.round(unitPrice * 10000)) > 0.00001) return `Unit price cannot exceed four decimal places for row ${index + 1}`;
    if (!Number.isFinite(deliveryPrice) || deliveryPrice < 0) return `Delivery price must be a non-negative number for row ${index + 1}`;
    if (Math.abs(deliveryPrice * 100 - Math.round(deliveryPrice * 100)) > 0.000001) return `Delivery price cannot exceed two decimal places for row ${index + 1}`;
    const parsedDeliveryDate = new Date(`${deliveryDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || Number.isNaN(parsedDeliveryDate.getTime()) || parsedDeliveryDate.toISOString().slice(0, 10) !== deliveryDate) return `A valid delivery date is required for row ${index + 1}`;
  }
  return null;
}

async function validatePurchaseOrderCatalogItems(connection, items, companyId) {
  const itemIds = [...new Set(items.map((item) => Number(item.itemId)))];
  const [rows] = await connection.query(
    'SELECT id FROM items WHERE company_id = ? AND active = 1 AND id IN (?) FOR UPDATE',
    [companyId, itemIds]
  );
  return rows.length === itemIds.length ? null : 'One or more inventory catalog items are unavailable';
}

async function insertPurchaseOrderItems(connection, orderId, items) {
  for (const item of items) {
    const quantity = Number(item.qty);
    const unitPrice = Number(item.unitPrice);
    const deliveryPrice = Number(item.deliveryPrice);
    const deliveryDate = String(item.deliveryDate);
    const itemTotal = quantity * unitPrice + deliveryPrice;
    await connection.query(
      'INSERT INTO purchase_order_items (purchase_order_id, item_id, product_name, qty, unit_price, merchandise_cost, delivery_date, delivery_price, item_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [orderId, item.itemId || null, item.productName.trim(), quantity, unitPrice, unitPrice, deliveryDate, deliveryPrice, itemTotal]
    );
  }
}

async function getBranchStock(connection, itemId, branch) {
  const companyId = currentCompanyId();
  await connection.query(
    'INSERT IGNORE INTO item_branch_stock (company_id, item_id, branch, qty_on_hand) VALUES (?, ?, ?, 0)',
    [companyId, itemId, branch]
  );
  const [rows] = await connection.query(
    'SELECT qty_on_hand FROM item_branch_stock WHERE company_id = ? AND item_id = ? AND branch = ? FOR UPDATE',
    [companyId, itemId, branch]
  );
  return Number(rows[0]?.qty_on_hand || 0);
}

async function getBranchStockState(connection, itemId, branch) {
  const companyId = currentCompanyId();
  await getBranchStock(connection, itemId, branch);
  const [rows] = await connection.query(
    'SELECT qty_on_hand, avg_cost FROM item_branch_stock WHERE company_id = ? AND item_id = ? AND branch = ? FOR UPDATE',
    [companyId, itemId, branch]
  );
  return { quantity: Number(rows[0]?.qty_on_hand || 0), averageCost: Number(rows[0]?.avg_cost || 0) };
}

async function refreshItemMovingAverage(connection, itemId, fallbackCost) {
  const companyId = currentCompanyId();
  const [rows] = await connection.query(
    `SELECT SUM(qty_on_hand) AS net_qty,
            SUM(qty_on_hand * avg_cost) AS stock_value
     FROM item_branch_stock WHERE company_id = ? AND item_id = ?`,
    [companyId, itemId]
  );
  const quantity = Number(rows[0]?.net_qty || 0);
  const movingAverage = quantity > 0
    ? Number((Number(rows[0].stock_value) / quantity).toFixed(6))
    : Number(Number(fallbackCost || 0).toFixed(6));
  await connection.query(
    'UPDATE items SET purchase_cost = ?, average_cost = ? WHERE id = ? AND company_id = ?',
    [movingAverage, movingAverage, itemId, companyId]
  );
  return movingAverage;
}

async function receiveBranchStock(connection, itemId, branch, quantity, unitCost) {
  const companyId = currentCompanyId();
  const current = await getBranchStockState(connection, itemId, branch);
  const nextQuantity = assertWholeQuantity(current.quantity + quantity);
  const nextAverage = current.quantity < 0
    ? (nextQuantity > 0 ? unitCost : current.averageCost)
    : nextQuantity > 0
      ? Number(((current.quantity * current.averageCost + quantity * unitCost) / nextQuantity).toFixed(6))
      : unitCost;
  const batchQuantity = assertWholeQuantity(Math.max(0, nextQuantity) - Math.max(0, current.quantity));
  const balance = await changeBranchStock(connection, itemId, branch, quantity);
  await connection.query(
    'UPDATE item_branch_stock SET avg_cost = ? WHERE company_id = ? AND item_id = ? AND branch = ?',
    [nextAverage, companyId, itemId, branch]
  );
  await refreshItemMovingAverage(connection, itemId, nextAverage);
  return { balance, batchQuantity, averageCost: nextAverage };
}

async function updateAutoSellingPrice(connection, item, landedCost) {
  const companyId = currentCompanyId();
  if (!item.auto_recalculate_price) return;
  const newRetailPrice = Number((landedCost + Number(item.markup_amount || 0)).toFixed(4));
  const units = parseUnits(item.units).map((unit) => ({
    ...unit,
    retailPrice: Number((newRetailPrice * Number(unit.ratio || 1)).toFixed(4)),
  }));
  const baseUnit = String(item.base_unit || 'Unit');
  const baseUnitEntry = units.find((unit) => String(unit.name || '').toLowerCase() === baseUnit.toLowerCase());
  if (baseUnitEntry) {
    baseUnitEntry.ratio = 1;
    baseUnitEntry.retailPrice = newRetailPrice;
  } else {
    units.unshift({ name: baseUnit, ratio: 1, retailPrice: newRetailPrice });
  }
  await connection.query(
    'UPDATE items SET retail_price = ?, units = ? WHERE id = ? AND company_id = ?',
    [newRetailPrice, JSON.stringify(units), item.id, companyId]
  );
}

async function getRemainingBatchQuantity(connection, itemId, branch, incomingQuantity) {
  const current = await getBranchStock(connection, itemId, branch);
  const next = assertWholeQuantity(current + incomingQuantity);
  return assertWholeQuantity(Math.max(0, next) - Math.max(0, current));
}

async function changeBranchStock(connection, itemId, branch, delta, { negativeStockBlocked = true } = {}) {
  const companyId = currentCompanyId();
  const quantity = assertWholeQuantity(delta);
  const current = await getBranchStock(connection, itemId, branch);
  const next = assertWholeQuantity(current + quantity);
  if (negativeStockBlocked && quantity < 0 && next < 0) {
    throw stockError(409, 'Insufficient stock at the selected branch');
  }
  await connection.query(
    'UPDATE item_branch_stock SET qty_on_hand = ? WHERE company_id = ? AND item_id = ? AND branch = ?',
    [next, companyId, itemId, branch]
  );
  await connection.query('UPDATE items SET qty_on_hand = qty_on_hand + ? WHERE id = ? AND company_id = ?', [quantity, itemId, companyId]);
  return next;
}

async function consumeInventoryBatches(connection, itemId, branch, quantity, batchId = null, { allowShortfall = false } = {}) {
  const companyId = currentCompanyId();
  let remaining = assertWholeQuantity(quantity);
  const [batches] = await connection.query(
    `SELECT id, batch_no, expiry_date, qty_remaining, unit_cost
     FROM inventory_batches
     WHERE company_id = ? AND item_id = ? AND branch = ? AND qty_remaining > 0${batchId ? ' AND id = ?' : ''}
     ORDER BY expiry_date IS NULL, expiry_date, created_at, id FOR UPDATE`,
    batchId ? [companyId, itemId, branch, batchId] : [companyId, itemId, branch]
  );
  const consumed = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const used = assertWholeQuantity(Math.min(remaining, Number(batch.qty_remaining)));
    if (used <= 0) continue;
    await connection.query('UPDATE inventory_batches SET qty_remaining = qty_remaining - ? WHERE id = ? AND company_id = ?', [used, batch.id, companyId]);
    consumed.push({
      batchNo: batch.batch_no,
      expiryDate: batch.expiry_date,
      quantity: used,
      unitCost: Number(batch.unit_cost),
    });
    remaining = assertWholeQuantity(remaining - used);
  }
  if (remaining > 0 && !allowShortfall) {
    throw stockError(409, `Batch stock does not reconcile with on-hand stock for item ${itemId}`);
  }
  return consumed;
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

api.get('/auth/registration-policy', async (req, res, next) => {
  try {
    const accessPolicy = await loadAccessPolicy(pool);
    res.json({
      passwordMinLength: accessPolicy.passwordMinLength,
      registrationRequiresApproval: accessPolicy.registrationRequiresApproval,
    });
  } catch (error) {
    next(error);
  }
});

api.post('/auth/login', async (req, res, next) => {
  try {
    const identifier = String(req.body?.username || req.body?.email || '').trim();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!identifier || identifier.length > 254 || !password) {
      return res.status(400).json({ message: 'Enter your email and password.' });
    }

    const account = await findUserForLogin(pool, identifier);
    if (!account || !(await bcrypt.compare(password, account.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const accessPolicy = await loadAccessPolicy(pool);
    const loginMessage = loginBlockMessage(account, accessPolicy);
    if (loginMessage) return res.status(403).json({ message: loginMessage });

    const user = {
      id: account.id,
      name: account.name,
      username: account.username,
      role: effectiveAccountRole(account),
      company_id: account.company_id === null ? null : Number(account.company_id),
      is_owner: Number(account.is_owner || 0),
      permissions: effectiveAccountRole(account) === 'staff' ? account.permissions : null,
    };
    const branches = await getAuthorizedBranches(pool, user);
    res.json({
      token: jwt.sign({ ...user, branches }, jwtSecret, { expiresIn: '8h' }),
      user: { ...user, branches },
    });
  } catch (error) {
    next(error);
  }
});

api.get('/users', auth, ownerOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id, name, position, username, email, role, active, is_owner, permissions, created_by_user_id FROM users WHERE company_id = ? AND LOWER(role) = 'staff' ORDER BY name", [req.companyId]);
    res.json(await addUserBranches(pool, rows, req.companyId));
  } catch (error) {
    next(error);
  }
});

api.post('/users', auth, ownerOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { name, username, email, password } = req.body;
    const position = String(req.body.position || '').trim() || null;
    const role = 'staff';
    const permissions = prepareStaffPermissions(
      req.body.preset || req.body.permissions?.preset || 'cashier',
      req.body.permissions?.grants || STAFF_PRESETS[req.body.preset || req.body.permissions?.preset || 'cashier']
    );
    const recoveryEmail = String(email || '').trim().toLowerCase();
    const accessPolicy = await loadAccessPolicy(connection);
    if (!name || !username || !isValidEmail(recoveryEmail) || !passwordMeetsPolicy(password, accessPolicy)) {
      return res.status(400).json({
        message: `Name, username, valid recovery email, and a password of at least ${accessPolicy.passwordMinLength} characters are required`,
      });
    }
    if (position && position.length > 160) {
      return res.status(400).json({ message: 'Position cannot exceed 160 characters' });
    }
    const branches = normalizeBranchAccess(
      req.body.branches === undefined ? [await defaultBranchForUser(connection, req.companyId)] : req.body.branches,
      role
    );
    const [existing] = await connection.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) return res.status(409).json({ message: 'Username already exists' });

    await connection.beginTransaction();
    const companyId = req.companyId;
    const [result] = await connection.query(
      `INSERT INTO users
        (name, username, email, password_hash, role, company_id, created_by_user_id, permissions, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        username.trim(),
        recoveryEmail,
        await bcrypt.hash(password, 10),
        role,
        companyId,
        req.user.id,
        JSON.stringify(permissions),
        position,
      ]
    );
    await saveUserBranches(connection, result.insertId, companyId, branches);
    await logActivity(connection, req.user.id, 'user_created', 'user', result.insertId, { name: name.trim(), username: username.trim(), role });
    await connection.commit();
    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      position,
      username: username.trim(),
      email: recoveryEmail,
      role,
      permissions,
      created_by_user_id: Number(req.user.id),
      active: 1,
      branches,
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.get('/me', auth, async (req, res, next) => {
  try {
    const branches = await getAuthorizedBranches(pool, req.user);
    res.json({ ...req.user, branches });
  } catch (error) {
    next(error);
  }
});

api.get('/admin/users', auth, ownerOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id, name, position, username, email, role, active, created_at, is_owner, permissions, created_by_user_id FROM users WHERE company_id = ? AND LOWER(role) = 'staff' ORDER BY created_at DESC", [req.companyId]);
    res.json(await addUserBranches(pool, rows, req.companyId));
  } catch (error) {
    next(error);
  }
});

api.patch('/admin/users/:id', auth, ownerOnly, async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ message: 'Invalid user id' });
    if (userId === req.user.id && req.body.active === false) return res.status(400).json({ message: 'You cannot deactivate your own account' });

    const [existingRows] = await pool.query('SELECT id, name, username, email, role, active, created_at, is_owner, permissions FROM users WHERE id = ? AND company_id = ?', [userId, req.companyId]);
    if (!existingRows[0]) return res.status(404).json({ message: 'User not found' });
    if (String(existingRows[0].role).toLowerCase() === 'superadmin') {
      return res.status(403).json({ message: 'Only platform routes can manage Super Admin accounts' });
    }
    const updates = [];
    const values = [];
    if (req.body.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ message: 'Name cannot be empty' });
      updates.push('name = ?');
      values.push(String(req.body.name).trim());
    }
    if (req.body.position !== undefined) {
      const position = String(req.body.position || '').trim();
      if (position.length > 160) return res.status(400).json({ message: 'Position cannot exceed 160 characters' });
      updates.push('position = ?');
      values.push(position || null);
    }
    if (req.body.email !== undefined) {
      const recoveryEmail = String(req.body.email || '').trim().toLowerCase();
      if (!isValidEmail(recoveryEmail)) return res.status(400).json({ message: 'A valid recovery email is required' });
      updates.push('email = ?');
      values.push(recoveryEmail);
    }
    if (req.body.password !== undefined && req.body.password !== '') {
      const accessPolicy = await loadAccessPolicy(pool);
      if (!passwordMeetsPolicy(req.body.password, accessPolicy)) {
        return res.status(400).json({ message: `Password must be at least ${accessPolicy.passwordMinLength} characters` });
      }
      updates.push('password_hash = ?');
      values.push(await bcrypt.hash(String(req.body.password), 10));
    }
    if (Number(existingRows[0].is_owner) || String(existingRows[0].role).toLowerCase() === 'owner') {
      return res.status(400).json({ message: 'Company owner accounts cannot be managed as staff.' });
    }
    if (req.body.role !== undefined && String(req.body.role).toLowerCase() !== 'staff') {
      return res.status(400).json({ message: 'Company sub-account roles must be staff.' });
    }
    if (req.body.permissions !== undefined || req.body.preset !== undefined) {
      const currentPermissions = parsePermissions(existingRows[0].permissions);
      const preset = req.body.preset || req.body.permissions?.preset || currentPermissions.preset;
      const grants = req.body.permissions?.grants || STAFF_PRESETS[preset] || currentPermissions.grants;
      const permissions = prepareStaffPermissions(preset, grants);
      updates.push('permissions = ?');
      values.push(JSON.stringify(permissions));
    }
    if (typeof req.body.active === 'boolean') {
      updates.push('active = ?');
      values.push(req.body.active ? 1 : 0);
      updates.push("status = CASE WHEN ? = 1 THEN 'ACTIVE' ELSE 'INACTIVE' END");
      values.push(req.body.active ? 1 : 0);
      if (req.body.active) {
        updates.push("approval_status = 'approved'");
      }
    }
    if (!updates.length) return res.status(400).json({ message: 'No valid changes supplied' });

    const role = 'staff';
    const branches = req.body.branches === undefined
      ? null
      : normalizeBranchAccess(req.body.branches, role);
    if (
      branches
      && !isSystemAdministrator(existingRows[0])
      && !isSystemAdministrator({ role })
      && !branches.length
    ) {
      return res.status(400).json({ message: 'At least one authorized branch is required for staff users' });
    }

    values.push(userId);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`, [...values, req.companyId]);
    if (branches) await saveUserBranches(connection, userId, req.companyId, branches);
    const [updatedRows] = await connection.query('SELECT id, name, position, username, email, role, active, created_at, is_owner, permissions FROM users WHERE id = ? AND company_id = ?', [userId, req.companyId]);
    if (!updatedRows[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'User not found' });
    }
    const usersWithBranches = await addUserBranches(connection, updatedRows, req.companyId);
    await logActivity(connection, req.user.id, req.body.active !== undefined ? (req.body.active ? 'user_activated' : 'user_deactivated') : 'user_updated', 'user', userId, { changes: Object.keys(req.body).filter((key) => key !== 'password') });
    await connection.commit();
    transactionStarted = false;
    res.json({ ok: true, user: usersWithBranches[0] });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
});

api.delete('/admin/users/:id', auth, ownerOnly, async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ message: 'Invalid user id' });
    if (userId === req.user.id) return res.status(400).json({ message: 'You cannot delete your own account' });

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [users] = await connection.query(
      `SELECT id, name, username, role, company_id, is_owner FROM users
       WHERE id = ? AND company_id = ? FOR UPDATE`,
      [userId, req.companyId]
    );
    if (!users[0]) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'User not found' });
    }
    if (String(users[0].role).toLowerCase() === 'superadmin') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: 'The Super Admin account cannot be deleted.' });
    }
    const [ownedCompanies] = await connection.query(
      'SELECT id FROM companies WHERE owner_user_id = ? LIMIT 1 FOR UPDATE',
      [userId]
    );
    if (Number(users[0].is_owner) === 1 || ownedCompanies.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: 'Company owner accounts cannot be deleted.' });
    }

    await connection.query('DELETE FROM users WHERE id = ? AND company_id = ?', [userId, req.companyId]);
    await logActivity(connection, req.user.id, 'user_deleted', 'user', userId, {
      companyId: Number(users[0].company_id),
      name: users[0].name,
      username: users[0].username,
      historicalRecordsPreserved: true,
    });
    await connection.commit();
    transactionStarted = false;
    res.json({ ok: true, deleted: true, historicalRecordsPreserved: true });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

api.patch('/superadmin/users/:id', auth, superAdminOnly, async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  const reject = async (status, message) => {
    if (connection && transactionStarted) {
      await connection.rollback();
      transactionStarted = false;
    }
    return res.status(status).json({ message });
  };
  try {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const body = req.body || {};
    const allowedFields = new Set(['name', 'email', 'password', 'role', 'active', 'permissions', 'preset']);
    const unsupportedFields = Object.keys(body).filter((field) => !allowedFields.has(field));
    if (unsupportedFields.length) {
      return res.status(400).json({ message: `Unsupported user fields: ${unsupportedFields.join(', ')}` });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const activeSuperAdmins = await lockSuperAdminAccounts(connection);
    const [userRows] = await connection.query(
      `SELECT id, name, username, email, role, active, status, approval_status, created_at,
        company_id, is_owner FROM users WHERE id = ? FOR UPDATE`,
      [userId]
    );
    const user = userRows[0];
    if (!user) {
      return await reject(404, 'User not found');
    }
    if (userId === Number(req.user.id) && body.active === false) {
      return await reject(400, 'You cannot deactivate your own account');
    }

    const existingRole = String(user.role).toLowerCase();
    let requestedRole = existingRole;
    const updates = [];
    const values = [];
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return await reject(400, 'Name cannot be empty');
      updates.push('name = ?');
      values.push(name);
    }
    if (body.email !== undefined) {
      const email = String(body.email || '').trim().toLowerCase();
      if (!isValidEmail(email)) return await reject(400, 'A valid recovery email is required');
      updates.push('email = ?');
      values.push(email);
    }
    if (body.password !== undefined && body.password !== '') {
      const accessPolicy = await loadAccessPolicy(connection);
      if (!passwordMeetsPolicy(body.password, accessPolicy)) {
        return await reject(400, `Password must be at least ${accessPolicy.passwordMinLength} characters`);
      }
      updates.push('password_hash = ?');
      values.push(await bcrypt.hash(String(body.password), 10));
    }
    if (body.role !== undefined) {
      requestedRole = String(body.role).toLowerCase();
      if (!['superadmin', 'owner', 'staff'].includes(requestedRole)) {
        return await reject(400, 'Role must be superadmin, owner or staff.');
      }
      if (requestedRole === 'superadmin' && existingRole !== 'superadmin') {
        return await reject(400, 'New Super Admin accounts cannot be created through account editing.');
      }
      if ((Number(user.is_owner) === 1 || existingRole === 'owner') && requestedRole !== 'owner') {
        return await reject(400, 'A company owner must transfer company ownership before changing roles.');
      }
      if (requestedRole === 'owner' && existingRole !== 'owner') {
        if (user.company_id === null) return await reject(400, 'A company owner must belong to a company.');
        const [ownerRows] = await connection.query(
          'SELECT owner_user_id FROM companies WHERE id = ? FOR UPDATE',
          [user.company_id]
        );
        if (!ownerRows[0]) return await reject(404, 'Company not found');
        if (ownerRows[0].owner_user_id !== null && Number(ownerRows[0].owner_user_id) !== userId) {
          return await reject(409, 'This company already has an owner.');
        }
        await connection.query('UPDATE companies SET owner_user_id = ? WHERE id = ?', [userId, user.company_id]);
        updates.push('is_owner = 1');
      } else if (requestedRole !== 'owner' && existingRole !== requestedRole) {
        updates.push('is_owner = 0');
      }
      if (requestedRole !== existingRole) {
        updates.push('role = ?');
        values.push(requestedRole);
      }
    }
    if (body.permissions !== undefined && requestedRole !== 'staff') {
      return await reject(400, 'Only staff accounts can have operational permissions.');
    }
    if (requestedRole === 'staff' && (body.permissions !== undefined || body.preset !== undefined)) {
      const currentPermissions = parsePermissions(user.permissions);
      const preset = body.preset || body.permissions?.preset || currentPermissions.preset;
      const grants = body.permissions?.grants || STAFF_PRESETS[preset] || currentPermissions.grants;
      const permissions = prepareStaffPermissions(preset, grants);
      updates.push('permissions = ?');
      values.push(JSON.stringify(permissions));
    } else if (requestedRole === 'staff' && existingRole !== 'staff') {
      updates.push('permissions = ?');
      values.push(JSON.stringify({ preset: 'cashier', grants: STAFF_PRESETS.cashier }));
    } else if (requestedRole !== existingRole && requestedRole !== 'staff') {
      updates.push('permissions = NULL');
    }
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') {
        return await reject(400, 'Active must be a boolean');
      }
      updates.push('active = ?');
      values.push(body.active ? 1 : 0);
      updates.push("status = CASE WHEN ? = 1 THEN 'ACTIVE' ELSE 'INACTIVE' END");
      values.push(body.active ? 1 : 0);
      if (body.active) updates.push("approval_status = 'approved'");
    }
    if (!updates.length) {
      return await reject(400, 'No valid changes supplied');
    }

    const isCurrentlyActiveSuperAdmin = activeSuperAdmins.some((account) => Number(account.id) === userId);
    if (isCurrentlyActiveSuperAdmin && activeSuperAdmins.length <= 1) {
      return await reject(400, 'The last active Super Admin cannot be updated, demoted or deactivated.');
    }

    values.push(userId);
    await connection.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    await logPlatformActivity(connection, req.user.id, 'platform_user_updated', 'user', userId, {
      companyId: user.company_id === null ? null : Number(user.company_id),
      changes: Object.keys(body).filter((field) => field !== 'password'),
    });
    const [updatedRows] = await connection.query(
      'SELECT id, name, username, email, role, active, status, approval_status, created_at, company_id, is_owner, permissions, created_by_user_id FROM users WHERE id = ?',
      [userId]
    );
    await connection.commit();
    transactionStarted = false;
    res.json({ ok: true, user: updatedRows[0] });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

api.get('/superadmin/users/:id/ownership-transfer-options', auth, superAdminOnly, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const [users] = await pool.query(
      'SELECT id, company_id, is_owner FROM users WHERE id = ?',
      [userId]
    );
    const user = users[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [companies] = await pool.query(
      'SELECT id, enterprise_name FROM companies WHERE owner_user_id = ? ORDER BY id',
      [userId]
    );
    if (Number(user.is_owner) !== 1 && !companies.length) {
      return res.status(400).json({ message: 'This account does not own a company.' });
    }

    const candidates = user.company_id === null ? [] : (
      await pool.query(
        `SELECT id, name, username, company_id FROM users
         WHERE company_id = ? AND id <> ? AND LOWER(role) = 'staff' AND is_owner = 0
           AND active = 1 AND status = 'ACTIVE' AND approval_status = 'approved'
         ORDER BY name, id`,
        [user.company_id, userId]
      )
    )[0].map((candidate) => ({
      id: Number(candidate.id),
      name: candidate.name,
      username: candidate.username,
      companyId: Number(candidate.company_id),
    }));

    res.json({
      companies: companies.map((company) => ({
        id: Number(company.id),
        name: company.enterprise_name,
      })),
      candidates,
    });
  } catch (error) {
    next(error);
  }
});

api.delete('/superadmin/users/:id', auth, superAdminOnly, async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  try {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    if (userId === Number(req.user.id)) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const activeSuperAdmins = await lockSuperAdminAccounts(connection);
    const [users] = await connection.query(
      'SELECT id, name, username, role, company_id, is_owner, active, status, approval_status FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );
    const user = users[0];
    if (!user) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'User not found' });
    }

    const [ownedCompanies] = await connection.query(
      'SELECT id, enterprise_name FROM companies WHERE owner_user_id = ? ORDER BY id FOR UPDATE',
      [userId]
    );
    const isOwner = Number(user.is_owner) === 1 || ownedCompanies.length > 0;
    let successor;
    const requestedTransfer = req.body?.transferToUserId;
    const transferRequested = requestedTransfer !== undefined
      && requestedTransfer !== null
      && String(requestedTransfer).trim() !== '';
    if (isOwner && transferRequested) {
      if (ownedCompanies.length > 1) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({ message: 'Transfer each company to its own eligible owner before deleting this account.' });
      }
      const transferToUserId = Number(requestedTransfer);
      if (!Number.isSafeInteger(transferToUserId) || transferToUserId < 1 || transferToUserId === userId) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(400).json({ message: 'Select an eligible company user to receive ownership before deleting this account.' });
      }

      const [successors] = await connection.query(
        `SELECT id, name, username FROM users
         WHERE id = ? AND company_id = ? AND LOWER(role) = 'staff' AND is_owner = 0
           AND active = 1 AND status = 'ACTIVE' AND approval_status = 'approved'
         FOR UPDATE`,
        [transferToUserId, user.company_id]
      );
      successor = successors[0];
      if (!successor) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(400).json({ message: 'The selected ownership recipient must be an active, approved user in the same company.' });
      }

      await connection.query(
        'UPDATE companies SET owner_user_id = ? WHERE id = ? AND (owner_user_id = ? OR owner_user_id IS NULL)',
        [transferToUserId, ownedCompanies[0]?.id || user.company_id, userId]
      );
      await connection.query('UPDATE users SET is_owner = 0 WHERE id = ?', [userId]);
      await connection.query(
        "UPDATE users SET role = 'owner', is_owner = 1, permissions = NULL WHERE id = ?",
        [transferToUserId]
      );
      await logPlatformActivity(connection, req.user.id, 'platform_company_ownership_transferred', 'user', transferToUserId, {
        fromUserId: userId,
        fromUsername: user.username,
        toUsername: successor.username,
        companyIds: ownedCompanies.map((company) => Number(company.id)),
      });
    }

    const isActiveSuperAdmin = activeSuperAdmins.some((account) => Number(account.id) === userId);
    if (isActiveSuperAdmin && activeSuperAdmins.length <= 1) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: 'The last active Super Admin cannot be deleted.' });
    }

    if (isOwner && !successor) {
      await connection.query('UPDATE companies SET owner_user_id = NULL WHERE owner_user_id = ?', [userId]);
    }

    await connection.query('DELETE FROM users WHERE id = ?', [userId]);
    await logPlatformActivity(connection, req.user.id, 'platform_user_deleted', 'user', userId, {
      companyId: user.company_id === null ? null : Number(user.company_id),
      name: user.name,
      username: user.username,
      ...(successor ? {
        ownershipTransferredTo: {
          userId: Number(successor.id),
          name: successor.name,
          username: successor.username,
        },
      } : {}),
      historicalRecordsPreserved: true,
    });
    await connection.commit();
    transactionStarted = false;
    res.json({
      ok: true,
      deleted: true,
      historicalRecordsPreserved: true,
      ...(successor ? {
        ownershipTransferredTo: {
          userId: Number(successor.id),
          name: successor.name,
          username: successor.username,
        },
      } : {}),
    });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

api.get('/superadmin/users', auth, superAdminOnly, async (req, res, next) => {
  try {
    const pageValue = String(req.query.page ?? '1');
    const limitValue = String(req.query.limit ?? '20');
    if (!/^[1-9]\d*$/.test(pageValue) || !/^[1-9]\d*$/.test(limitValue)) {
      return res.status(400).json({ message: 'Page and limit must be positive integers.' });
    }
    const page = Number(pageValue);
    const limit = Number(limitValue);
    if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit) || limit > 100) {
      return res.status(400).json({ message: 'Page must be valid and limit cannot exceed 100.' });
    }
    const search = String(req.query.search || '').trim();
    if (search.length > 120) {
      return res.status(400).json({ message: 'Search must be 120 characters or fewer.' });
    }
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) {
      return res.status(400).json({ message: 'Requested page is too large.' });
    }

    const searchTokens = search.split(/\s+/).filter(Boolean);
    const searchFields = [
      'u.name', 'u.first_name', 'u.last_name', 'u.username', 'u.email', 'u.role',
      'u.status', 'u.approval_status', 'u.position', 'u.enterprise_name', 'u.office_phone',
      'c.enterprise_name', 'c.tin', 'c.official_email', 'c.office_phone',
    ];
    const userFilter = searchTokens.length
      ? ` WHERE ${searchTokens.map(() => `(${searchFields.map((field) => `${field} LIKE ? ESCAPE '!'`).join(' OR ')})`).join(' AND ')}`
      : '';
    const searchParameters = searchTokens.flatMap((token) => {
      const escapedToken = token.replace(/[!%_]/g, '!$&');
      return searchFields.map(() => `%${escapedToken}%`);
    });
    const [[countRows], [userRows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total_count
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id${userFilter}`,
        searchParameters
      ),
      pool.query(
        `SELECT u.id, u.name, u.username, u.email, u.role, u.active, u.status,
            u.approval_status, u.created_at, u.company_id, u.is_owner, u.permissions,
          c.enterprise_name AS company_name,
          EXISTS (SELECT 1 FROM companies owned WHERE owned.owner_user_id = u.id) AS owns_company
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id${userFilter}
         ORDER BY c.enterprise_name, u.role, u.name, u.id
         LIMIT ? OFFSET ?`,
        [...searchParameters, limit, offset]
      ),
    ]);
    const totalCount = Number(countRows[0].total_count);
    const totalPages = Math.ceil(totalCount / limit);
    const users = userRows.map((user) => ({
      id: Number(user.id),
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      active: Number(user.active) === 1,
      status: user.status,
      approvalStatus: user.approval_status,
      createdAt: user.created_at,
      companyId: user.company_id === null ? null : Number(user.company_id),
      companyName: user.company_name,
      isOwner: Number(user.is_owner) === 1 || Number(user.owns_company) === 1,
      permissions: effectiveAccountRole(user) === 'staff' ? parsePermissions(user.permissions) : null,
    }));

    await logPlatformActivity(pool, req.user.id, 'platform_users_viewed', 'platform', null, {
      page,
      limit,
      search,
      totalCount,
    });
    res.json({ users, totalCount, page, totalPages });
  } catch (error) {
    next(error);
  }
});

api.get('/superadmin/overview', auth, superAdminOnly, async (req, res, next) => {
  try {
    const pageValue = String(req.query.page ?? '1');
    const limitValue = String(req.query.limit ?? '20');
    if (!/^[1-9]\d*$/.test(pageValue) || !/^[1-9]\d*$/.test(limitValue)) {
      return res.status(400).json({ message: 'Page and limit must be positive integers.' });
    }
    const page = Number(pageValue);
    const limit = Number(limitValue);
    if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit) || limit > 100) {
      return res.status(400).json({ message: 'Page must be valid and limit cannot exceed 100.' });
    }
    const search = String(req.query.search || '').trim();
    if (search.length > 120) {
      return res.status(400).json({ message: 'Search must be 120 characters or fewer.' });
    }
    const escapedSearch = search.replace(/[!%_]/g, '!$&');
    const companyFilter = search ? " WHERE c.enterprise_name LIKE ? ESCAPE '!'" : '';
    const companyParameters = search ? [`%${escapedSearch}%`] : [];
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) {
      return res.status(400).json({ message: 'Requested page is too large.' });
    }

    const [[countRows], [companyRows], [summaryRows]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total_count FROM companies c${companyFilter}`, companyParameters),
      pool.query(
        `SELECT c.id, c.enterprise_name, c.created_at,
          COUNT(DISTINCT CASE WHEN LOWER(u.role) <> 'superadmin' THEN u.id END) AS user_count,
          COUNT(DISTINCT CASE
            WHEN LOWER(u.role) <> 'superadmin' AND u.active = 1
              AND u.status = 'ACTIVE' AND u.approval_status = 'approved'
            THEN u.id END) AS active_user_count,
          COUNT(DISTINCT CASE
            WHEN LOWER(u.role) <> 'superadmin' AND (LOWER(u.role) = 'owner' OR u.is_owner = 1)
            THEN u.id END) AS owner_count
         FROM companies c
         LEFT JOIN users u ON u.company_id = c.id
         ${companyFilter}
         GROUP BY c.id, c.enterprise_name, c.created_at
         ORDER BY c.enterprise_name, c.id
         LIMIT ? OFFSET ?`,
        [...companyParameters, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT c.id) AS total_companies,
          COUNT(DISTINCT CASE WHEN LOWER(u.role) <> 'superadmin' THEN u.id END) AS total_users,
          COUNT(DISTINCT CASE
            WHEN LOWER(u.role) <> 'superadmin' AND (LOWER(u.role) = 'owner' OR u.is_owner = 1)
            THEN u.id END) AS total_owners
         FROM companies c
         LEFT JOIN users u ON u.company_id = c.id`
      ),
    ]);
    const totalCount = Number(countRows[0].total_count);
    const totalPages = Math.ceil(totalCount / limit);
    const companies = companyRows.map((row) => ({
      id: Number(row.id),
      name: row.enterprise_name,
      createdAt: row.created_at,
      userCount: Number(row.user_count),
      activeUserCount: Number(row.active_user_count),
      ownerCount: Number(row.owner_count),
    }));
    const summary = {
      totalCompanies: Number(summaryRows[0].total_companies),
      totalUsers: Number(summaryRows[0].total_users),
      totalOwners: Number(summaryRows[0].total_owners),
    };

    await logPlatformActivity(pool, req.user.id, 'platform_overview_viewed', 'platform', null, {
      page,
      limit,
      search,
      totalCount,
    });
    res.json({ companies, totalCount, page, totalPages, summary });
  } catch (error) {
    next(error);
  }
});

api.delete('/superadmin/companies/:id', auth, superAdminOnly, async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  try {
    const companyId = Number(req.params.id);
    if (!Number.isSafeInteger(companyId) || companyId < 1) {
      return res.status(400).json({ message: 'Invalid company id.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [companies] = await connection.query(
      'SELECT id, enterprise_name FROM companies WHERE id = ? FOR UPDATE',
      [companyId]
    );
    const company = companies[0];
    if (!company) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Company not found.' });
    }

    if (String(req.body?.confirmName || '').trim() !== String(company.enterprise_name).trim()) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(400).json({ message: 'Company name confirmation does not match.' });
    }

    await deleteCompanyWorkspaceData(connection, companyId);
    const [deleted] = await connection.query('DELETE FROM companies WHERE id = ?', [companyId]);
    if (deleted.affectedRows !== 1) {
      throw new Error('The company workspace could not be deleted.');
    }

    await logPlatformActivity(connection, req.user.id, 'platform_company_deleted', 'company', companyId, {
      companyName: company.enterprise_name,
      workspaceDataDeleted: true,
    });
    await connection.commit();
    transactionStarted = false;
    res.json({ ok: true, deleted: true, companyId, companyName: company.enterprise_name });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

api.get('/admin/activity', auth, adminOnly, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT a.*, u.name user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id AND u.company_id = a.company_id WHERE a.company_id = ? ORDER BY a.created_at DESC LIMIT 200',
      [req.companyId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.get('/notifications', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100', [req.companyId, req.user.id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.patch('/notifications/:id/read', auth, async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ? AND user_id = ?', [req.params.id, req.companyId, req.user.id]);
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
      'SELECT id, company_id, merchant_account, amount, currency, status FROM khqr_payment_intents WHERE payway_tran_id = ? LIMIT 1',
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
      "UPDATE khqr_payment_intents SET status = 'Paid', transaction_hash = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ? AND status IN ('Pending', 'Expired')",
      [reference, intent.id, intent.company_id]
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
      'INSERT INTO khqr_payment_intents (id, company_id, user_id, md5, payway_tran_id, qr_payload, merchant_account, amount, currency, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [intentId, req.companyId, req.user.id, md5, id, qrPayload, merchantId, payableAmount, currency, expiresAt]
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
      'SELECT id, company_id, payway_tran_id, amount, currency, status, expires_at, transaction_hash FROM khqr_payment_intents WHERE id = ? AND company_id = ? AND user_id = ? LIMIT 1',
      [req.params.id, req.companyId, req.user.id]
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
        "UPDATE khqr_payment_intents SET status = 'Expired' WHERE id = ? AND company_id = ? AND status = 'Pending'",
        [intent.id, req.companyId]
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
      "UPDATE khqr_payment_intents SET status = 'Paid', transaction_hash = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ? AND status = 'Pending'",
      [verifiedTransactionHash, intent.id, req.companyId]
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
        'SELECT status, transaction_hash FROM khqr_payment_intents WHERE id = ? AND company_id = ?',
        [intent.id, req.companyId]
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

    const branch = getBranch(req.body.branch);
    await assertBranchAccess(connection, req.user, branch);
    const [openRegisters] = await connection.query(
      "SELECT id FROM cash_registers WHERE company_id = ? AND branch = ? AND status = 'Open' ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [req.companyId, branch]
    );
    assertRegisterOpen(openRegisters[0]);
    const inventoryPolicy = await loadInventoryPolicy(connection);
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!lines.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Sale requires at least one line item' });
    }
    if (lines.some((line) => !line || typeof line !== 'object' || Array.isArray(line))) {
      await connection.rollback();
      return res.status(400).json({ message: 'Each sale line must be a valid item object' });
    }

    let netSale = 0;
    const processedLines = [];
    const requiredByItem = new Map();
    const itemsById = new Map();
    const branchCostByItem = new Map();

    const itemIds = [...new Set(lines.map((line) => Number(line.itemId)))].sort((a, b) => a - b);
    if (itemIds.some((itemId) => !Number.isInteger(itemId) || itemId < 1)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Each sale line requires a valid item id' });
    }

    for (const itemId of itemIds) {
      const [rows] = await connection.query('SELECT * FROM items WHERE id = ? AND company_id = ? AND active = 1 FOR UPDATE', [itemId, req.companyId]);
      if (!rows[0]) {
        await connection.rollback();
        return res.status(404).json({ message: `Item ID ${itemId} not found` });
      }
      itemsById.set(itemId, rows[0]);
      branchCostByItem.set(itemId, await getBranchStockState(connection, itemId, branch));
    }

    const [companyRows] = await connection.query(
      'SELECT setting_value FROM company_settings WHERE company_id = ? AND setting_key = ?',
      [req.companyId, 'company']
    );
    const companySettings = companyRows[0]
      ? (typeof companyRows[0].setting_value === 'string' ? JSON.parse(companyRows[0].setting_value) : companyRows[0].setting_value)
      : {};
    const salesPolicy = companySettings.policy?.sales || {};
    const discountApprovalRequired = salesPolicy.discountApprovalRequired !== false;
    const maxDiscountPercent = Number.isFinite(Number(salesPolicy.maxDiscountPercent))
      ? Math.max(0, Math.min(100, Number(salesPolicy.maxDiscountPercent)))
      : 10;
    let managerApprovalRequired = false;
    const configuredVatRate = Number(companySettings.vatRate ?? DEFAULT_VAT_RATE * 100);
    const vatRate = configuredVatRate > 1 ? configuredVatRate / 100 : configuredVatRate;
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) {
      await connection.rollback();
      return res.status(500).json({ message: 'The configured VAT rate is invalid' });
    }
    const configuredExchangeRate = Number(companySettings.exchangeRate);
    const exchangeRate = Number.isFinite(configuredExchangeRate) && configuredExchangeRate > 0
      ? configuredExchangeRate
      : 4000;
    let receivedUSD = 0;
    let receivedKHR = 0;
    let tenderedUSD = 0;

    for (const line of lines) {
      const item = itemsById.get(Number(line.itemId));
      const resolvedLine = resolveSaleLine(line, item, {
        averageCost: branchCostByItem.get(item.id).averageCost,
      });
      const { unit, ratio, unitPrice, qty, stockDeductionQty, discount, lineNet, grossAmount } = resolvedLine;

      requiredByItem.set(
        item.id,
        assertWholeQuantity((requiredByItem.get(item.id) || 0) + stockDeductionQty)
      );
      if (discountApprovalRequired && discount > grossAmount * maxDiscountPercent / 100) {
        managerApprovalRequired = true;
      }
      netSale = roundToTwo(netSale + lineNet);

      processedLines.push({
        itemId: item.id,
        itemName: item.name_en,
        baseUnit: item.base_unit,
        unit,
        qty,
        stockDeductionQty,
        unitPrice,
        averageCost: branchCostByItem.get(item.id).averageCost,
        unitCostAtSale: branchCostByItem.get(item.id).averageCost,
        costPrice: Number((branchCostByItem.get(item.id).averageCost * ratio).toFixed(6)),
        discount,
        lineNet,
      });
    }

    for (const [itemId, requiredQty] of requiredByItem) {
      const availableQty = await getBranchStock(connection, itemId, branch);
      if (inventoryPolicy.negativeStockBlocked && availableQty < requiredQty) {
        const item = itemsById.get(itemId);
        await connection.rollback();
        return res.status(409).json({
          message: `${item.name_en} has insufficient stock (Required: ${requiredQty} ${item.base_unit}, Available: ${availableQty} ${item.base_unit})`,
        });
      }
    }

    const paymentMethod = req.body.paymentMethod || 'cash';
    if (!['cash', 'bank', 'card', 'qr', 'customer_account'].includes(paymentMethod)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    const customerId = req.body.customerId === undefined || req.body.customerId === null || req.body.customerId === ''
      ? null
      : Number(req.body.customerId);
    if (customerId !== null && (!Number.isInteger(customerId) || customerId < 1)) {
      await connection.rollback();
      return res.status(400).json({ message: 'A valid customer id is required' });
    }
    if (paymentMethod === 'customer_account' && !customerId) {
      await connection.rollback();
      return res.status(400).json({ message: 'A customer is required for account sales' });
    }

    if (managerApprovalRequired) {
      const [managerRows] = await connection.query(
        "SELECT password_hash, role, is_owner, permissions FROM users WHERE company_id = ? AND (role IN ('owner', 'staff') OR is_owner = 1) AND active = 1",
        [req.companyId]
      );
      const approved = managerRows.some((manager) =>
        hasPermission({ ...manager, role: Number(manager.is_owner) === 1 ? 'owner' : manager.role }, 'approvals.manage')
        && req.body.managerPin
        && bcrypt.compareSync(String(req.body.managerPin), manager.password_hash)
      );
      if (!approved) {
        await connection.rollback();
        return res.status(403).json({ message: `Manager PIN approval is required for discounts above ${maxDiscountPercent}%` });
      }
    }

    for (const line of processedLines) {
      line.vatAmount = roundToTwo(line.lineNet * vatRate);
    }
    const vat = roundToTwo(processedLines.reduce((sum, line) => sum + line.vatAmount, 0));
    const total = roundToTwo(netSale + vat);
    let actualChangeUSD = 0;
    if (paymentMethod === 'cash') {
      const tender = validateCashTender(req.body.receivedUSD, req.body.receivedKHR, exchangeRate);
      receivedUSD = tender.receivedUSD;
      receivedKHR = tender.receivedKHR;
      tenderedUSD = tender.tenderedUSD;
      if (tenderedUSD < total) {
        await connection.rollback();
        return res.status(400).json({ message: 'Tendered amount is less than the invoice total' });
      }
      actualChangeUSD = roundToTwo(Math.max(0, tenderedUSD - total));
    }

    let paymentIntent = null;
    let khqrPayload = '';
    let paymentReference = req.body.paymentReference || null;
    if (paymentMethod === 'bank' || paymentMethod === 'qr') {
      if (!req.body.paymentIntentId) {
        await connection.rollback();
        return res.status(400).json({ message: 'A verified KHQR payment is required before completing this sale' });
      }
      const [intentRows] = await connection.query(
        'SELECT id, user_id, md5, qr_payload, amount, currency, status, transaction_hash FROM khqr_payment_intents WHERE id = ? AND company_id = ? FOR UPDATE',
        [req.body.paymentIntentId, req.companyId]
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
    } else if (paymentMethod === 'card') {
      receivedUSD = total;
    }

    let customerName = 'Walk-in customer';
    if (customerId) {
      const [customerRows] = await connection.query('SELECT id, name, balance, credit_limit FROM customers WHERE id = ? AND company_id = ? FOR UPDATE', [customerId, req.companyId]);
      if (!customerRows[0]) {
        await connection.rollback();
        return res.status(404).json({ message: 'Customer not found' });
      }
      if (paymentMethod === 'customer_account' && Number(customerRows[0].credit_limit) > 0 && Number(customerRows[0].balance) + total > Number(customerRows[0].credit_limit)) {
        await connection.rollback();
        return res.status(409).json({ message: 'Customer credit limit exceeded' });
      }
      customerName = customerRows[0].name;
    }

    const tempNo = `TEMP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const [invoiceResult] = await connection.query(
      'INSERT INTO invoices (invoice_no, customer_id, customer_name, branch, staff_name, payment_method, net_sale, vat, total, received_usd, received_khr, change_usd, payment_reference, khqr_payload, vat_tin, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        tempNo,
        customerId,
        customerName,
        branch,
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

    for (const [itemId, quantity] of requiredByItem) {
      const item = itemsById.get(itemId);
      const availableBeforeSale = await getBranchStock(connection, itemId, branch);
      await consumeInventoryBatches(connection, itemId, branch, quantity, null, {
        allowShortfall: !inventoryPolicy.negativeStockBlocked && availableBeforeSale < quantity,
      });
      const balanceAfter = await changeBranchStock(connection, itemId, branch, -quantity, inventoryPolicy);
      await refreshItemMovingAverage(connection, itemId, branchCostByItem.get(itemId).averageCost);
      await connection.query(
        'INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, unit_cost_at_sale, unit_cost, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [itemId, item.name_en, 'Sale', -quantity, balanceAfter, branchCostByItem.get(itemId).averageCost, branchCostByItem.get(itemId).averageCost, finalInvoiceNo, branch]
      );
    }

    for (const line of processedLines) {
      await connection.query(
        'INSERT INTO invoice_lines (invoice_id, item_id, item_name, unit, qty, qty_base, unit_price, cost_price, unit_cost_at_sale, cogs_unit_cost, total_cogs, discount, vat_rate, vat_amount, line_net, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [generatedId, line.itemId, line.itemName, line.unit, line.qty, line.stockDeductionQty, line.unitPrice, line.costPrice, line.unitCostAtSale, line.unitCostAtSale, Number((line.stockDeductionQty * line.unitCostAtSale).toFixed(6)), line.discount, vatRate * 100, line.vatAmount, line.lineNet, roundToTwo(line.lineNet + line.vatAmount)]
      );
    }

    const recordMethod = paymentMethod === 'card' || paymentMethod === 'qr' ? 'bank' : paymentMethod;
    const recordedUsd = paymentMethod === 'cash'
      ? receivedUSD
      : (paymentMethod === 'bank' || paymentMethod === 'qr') && paymentIntent.currency === 'KHR'
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
      paymentMethod: paymentMethod === 'card' || paymentMethod === 'qr' ? 'bank' : paymentMethod,
      total,
      receivedUSD,
      receivedKHR,
      changeUSD: actualChangeUSD,
    });

    const [invoiceRows] = await connection.query(
      'SELECT created_at FROM invoices WHERE id = ? AND company_id = ?',
      [generatedId, req.companyId]
    );
    await connection.commit();

    res.status(201).json({
      id: finalInvoiceNo,
      date: new Date(invoiceRows[0].created_at).toISOString().slice(0, 10),
      issueDate: new Date(invoiceRows[0].created_at).toISOString(),
      customer: customerName,
      staff: req.user.name,
      paymentMethod,
      netSale,
      vat,
      vatRate: vatRate * 100,
      total,
      status: 'Paid',
      itemsCount: processedLines.length,
      items: processedLines.map((line) => ({
        nameEn: line.itemName,
        qty: line.qty,
        unitPrice: line.unitPrice,
        discount: line.discount,
        unit: line.unit,
        uomName: line.unit,
      })),
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
api.get('/items', auth, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    if (search.length > 120) return res.status(400).json({ message: 'Search must be 120 characters or fewer.' });
    const searchTokens = search.split(/\s+/).filter(Boolean);
    const searchFields = [
      'i.barcode',
      'i.name_en',
      'i.name_kh',
      'i.department',
      'i.category',
      'i.brand',
      'i.base_unit',
      'CAST(i.id AS CHAR)',
      'CAST(i.vendor_id AS CHAR)',
      'CAST(i.units AS CHAR)',
      'CAST(i.retail_price AS CHAR)',
      'CAST(i.purchase_cost AS CHAR)',
      'CAST(i.average_cost AS CHAR)',
      'v.name',
      'v.contact_name',
      'v.vat_tin',
      'v.phone',
      'v.email',
    ];
    const searchCondition = searchTokens.length
      ? ` AND ${searchTokens.map(() => `(${searchFields.map((field) => `${field} LIKE ? ESCAPE '!'`).join(' OR ')})`).join(' AND ')}`
      : '';
    const searchValues = searchTokens.flatMap((token) => {
      const escapedToken = token.replace(/[!%_]/g, '!$&');
      return searchFields.map(() => `%${escapedToken}%`);
    });
    const authorizedBranches = await getAuthorizedBranches(pool, req.user);
    const requestedBranch = req.query.branch ? getBranch(req.query.branch) : null;
    if (requestedBranch) await assertBranchAccess(pool, req.user, requestedBranch);
    const branch = requestedBranch || (authorizedBranches ? authorizedBranches[0] || null : null);
    if (authorizedBranches && !branch) return res.json([]);
    const [rows] = await pool.query(
      branch
        ? `SELECT i.*, v.name AS vendor_name, COALESCE(b.qty_on_hand, 0) AS branch_qty_on_hand, b.avg_cost AS branch_avg_cost
           FROM items i
           LEFT JOIN item_branch_stock b ON b.item_id = i.id AND b.branch = ? AND b.company_id = ?
           LEFT JOIN vendors v ON v.id = i.vendor_id AND v.company_id = i.company_id
           WHERE i.company_id = ? AND i.active = 1${searchCondition}
           ORDER BY i.name_en`
        : `SELECT i.*, v.name AS vendor_name FROM items i
           LEFT JOIN vendors v ON v.id = i.vendor_id AND v.company_id = i.company_id
           WHERE i.company_id = ? AND i.active = 1${searchCondition}
           ORDER BY i.name_en`,
      branch ? [branch, req.companyId, req.companyId, ...searchValues] : [req.companyId, ...searchValues]
    );
    res.json(rows.map(mapItem));
  } catch (error) {
    next(error);
  }
});

api.post('/items', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const item = req.body;
    if (item.units !== undefined && !Array.isArray(item.units)) {
      return res.status(400).json({ message: 'Units must be provided as a list' });
    }
    const qtyOnHand = validateStockQuantity(item.qtyOnHand || 0, { allowZero: true });
    const baseUnit = item.baseUnit || 'Unit';
    const branch = getBranch(item.branch);
    const retailPrice = Number(item.retailPrice || 0);
    const purchaseCost = Number(item.purchaseCost || 0);
    const markupAmount = Number(item.markupAmount ?? 0);
    const reorderQty = Number(item.reorderQty || 0);
    if (!item.nameEn?.trim() || !item.barcode?.trim()) return res.status(400).json({ message: 'Item name and barcode are required' });
    if (qtyOnHand === null) return res.status(400).json({ message: 'Opening quantity must be a non-negative whole number' });
    const amountError = validateItemAmounts(item);
    if (amountError) return res.status(400).json({ message: amountError });

    const defaultUnits = normalizeItemUnits(item.units, baseUnit, retailPrice);
    const unitsError = validateItemUnits(defaultUnits);
    if (unitsError) return res.status(400).json({ message: unitsError });

    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO items 
      (barcode, name_kh, name_en, department, category, brand, base_unit, qty_on_hand, reorder_qty, retail_price, purchase_cost, average_cost, markup_amount, auto_recalculate_price, vendor_id, units)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        item.barcode,
        item.nameKh || '',
        item.nameEn,
        item.department || 'General',
        item.category || 'General',
        item.brand || '',
        baseUnit,
        qtyOnHand,
        reorderQty,
        retailPrice,
        purchaseCost,
        purchaseCost,
        markupAmount,
        item.autoRecalculatePrice ? 1 : 0,
        item.vendorId || null,
        JSON.stringify(defaultUnits),
      ]
    );

    await connection.query(
      'INSERT INTO item_branch_stock (item_id, branch, qty_on_hand, avg_cost) VALUES (?, ?, ?, ?)',
      [result.insertId, branch, qtyOnHand, purchaseCost]
    );
    if (qtyOnHand > 0) {
      const reference = `OPENING-${result.insertId}`;
      await connection.query('INSERT INTO inventory_batches (item_id, branch, batch_no, qty_received, qty_remaining, unit_cost) VALUES (?, ?, ?, ?, ?, ?)', [result.insertId, branch, reference, qtyOnHand, qtyOnHand, purchaseCost]);
      await connection.query('INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, unit_cost, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [result.insertId, item.nameEn.trim(), 'Adjustment', qtyOnHand, qtyOnHand, purchaseCost, reference, branch]);
    }
    await connection.commit();
    const [rows] = await pool.query('SELECT * FROM items WHERE id = ? AND company_id = ?', [result.insertId, req.companyId]);
    res.status(201).json(mapItem(rows[0]));
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.put('/items/:id', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid item id' });
    if (req.body.units !== undefined && !Array.isArray(req.body.units)) {
      return res.status(400).json({ message: 'Units must be provided as a list' });
    }
    if (!req.body.nameEn?.trim() || !req.body.barcode?.trim()) return res.status(400).json({ message: 'Item name and barcode are required' });

    await connection.beginTransaction();
    const [existingRows] = await connection.query('SELECT * FROM items WHERE id = ? AND company_id = ? FOR UPDATE', [itemId, req.companyId]);
    if (!existingRows[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Item not found' });
    }
    const existing = existingRows[0];
    const qtyOnHand = validateStockQuantity(req.body.qtyOnHand ?? existing.qty_on_hand, { allowZero: true });
    if (qtyOnHand === null) {
      await connection.rollback();
      return res.status(400).json({ message: 'On-hand quantity must be a non-negative whole number' });
    }
    if (qtyOnHand !== Number(existing.qty_on_hand)) {
      await connection.rollback();
      return res.status(409).json({ message: 'Use stock adjustments to change on-hand quantity' });
    }
    const baseUnit = req.body.baseUnit?.trim() || existing.base_unit;
    const retailPrice = Number(req.body.retailPrice ?? existing.retail_price);
    const purchaseCost = Number(req.body.purchaseCost ?? existing.purchase_cost);
    const reorderQty = Number(req.body.reorderQty ?? 0);
    const markupAmount = Number(req.body.markupAmount ?? existing.markup_amount ?? 0);
    const amountError = validateItemAmounts({
      retailPrice,
      purchaseCost,
      reorderQty,
      markupAmount,
    });
    if (amountError) {
      await connection.rollback();
      return res.status(400).json({ message: amountError });
    }
    const units = normalizeItemUnits(
      req.body.units === undefined ? existing.units : req.body.units,
      baseUnit,
      retailPrice
    );
    const unitsError = validateItemUnits(units);
    if (unitsError) {
      await connection.rollback();
      return res.status(400).json({ message: unitsError });
    }

    await connection.query(
      'UPDATE items SET barcode = ?, name_kh = ?, name_en = ?, department = ?, category = ?, brand = ?, base_unit = ?, qty_on_hand = ?, reorder_qty = ?, retail_price = ?, purchase_cost = ?, markup_amount = ?, auto_recalculate_price = ?, vendor_id = ?, units = ? WHERE id = ? AND company_id = ?',
      [
        req.body.barcode.trim(),
        req.body.nameKh || '',
        req.body.nameEn.trim(),
        req.body.department || 'General',
        req.body.category || 'General',
        req.body.brand || '',
        baseUnit,
        qtyOnHand,
        reorderQty,
        retailPrice,
        purchaseCost,
        markupAmount,
        req.body.autoRecalculatePrice === undefined ? existing.auto_recalculate_price : (req.body.autoRecalculatePrice ? 1 : 0),
        req.body.vendorId || null,
        JSON.stringify(units),
        itemId,
        req.companyId,
      ]
    );

    await logActivity(connection, req.user.id, 'item_updated', 'item', itemId, { name: req.body.nameEn.trim() });
    await connection.commit();

    const [rows] = await pool.query('SELECT * FROM items WHERE id = ? AND company_id = ?', [itemId, req.companyId]);
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
    const [result] = await connection.query('UPDATE items SET active = 0 WHERE id = ? AND company_id = ? AND active = 1', [itemId, req.companyId]);
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
api.post('/stock/adjustments', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const itemId = Number(req.body.itemId);
    const quantity = validateStockAdjustmentQuantity(req.body.quantity);
    const branch = getBranch(req.body.branch);
    if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Valid item id is required' });
    if (quantity === null) return res.status(400).json({ message: 'Quantity must be a non-zero whole number' });

    await assertBranchAccess(connection, req.user, branch);
    const inventoryPolicy = await loadInventoryPolicy(connection);
    if (inventoryPolicy.adjustmentRequiresAdmin && !hasPermission(req.user, 'approvals.manage')) {
      return res.status(403).json({ message: 'Admin approval is required for stock adjustments' });
    }
    const submittedNote = req.body.notes !== undefined ? req.body.notes : req.body.note;
    if (inventoryPolicy.auditNotesRequired && !String(submittedNote || '').trim()) {
      return res.status(400).json({ message: 'Adjustment notes are required' });
    }

    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT * FROM items WHERE id = ? AND active = 1 FOR UPDATE', [itemId]);
    if (!rows[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Item not found' });
    }

    const item = rows[0];
    const note = String(submittedNote || '').trim() || 'Manual adjustment';
    if (note.length > 80) {
      await connection.rollback();
      return res.status(400).json({ message: 'Adjustment reason must be 80 characters or fewer' });
    }
    const batchId = req.body.batchId ? Number(req.body.batchId) : null;
    if (batchId !== null && (!Number.isInteger(batchId) || batchId < 1)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid inventory batch id' });
    }
    let balanceAfter;
    const branchState = await getBranchStockState(connection, item.id, branch);
    const adjustmentUnitCost = branchState.quantity > 0
      ? branchState.averageCost
      : branchState.averageCost || Number(item.average_cost || item.purchase_cost || 0);
    if (quantity < 0) {
      const availableBeforeAdjustment = await getBranchStock(connection, item.id, branch);
      await consumeInventoryBatches(connection, item.id, branch, Math.abs(quantity), batchId, {
        allowShortfall: !inventoryPolicy.negativeStockBlocked && availableBeforeAdjustment < Math.abs(quantity),
      });
      balanceAfter = await changeBranchStock(connection, item.id, branch, quantity, inventoryPolicy);
      await refreshItemMovingAverage(connection, item.id, Number(item.average_cost || 0));
    } else {
      const received = await receiveBranchStock(connection, item.id, branch, quantity, adjustmentUnitCost);
      const batchNo = `ADJ-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      await connection.query(
        'INSERT INTO inventory_batches (item_id, branch, batch_no, qty_received, qty_remaining, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
        [item.id, branch, batchNo, quantity, received.batchQuantity, adjustmentUnitCost]
      );
      balanceAfter = received.balance;
    }
    await connection.query(
      'INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, unit_cost, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [item.id, item.name_en, 'Adjustment', quantity, balanceAfter, adjustmentUnitCost, note, branch]
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
const vendorSelectSql = `
  SELECT v.*,
    COALESCE((
      SELECT SUM(GREATEST(po.grand_total - COALESCE((
        SELECT SUM(ap.amount) FROM ap_payments ap WHERE ap.company_id = po.company_id AND ap.purchase_order_id = po.id
      ), 0), 0))
      FROM purchase_orders po
      WHERE po.company_id = v.company_id AND po.vendor_id = v.id AND po.status <> 'Cancelled'
    ), 0) AS balance
  FROM vendors v
`;

function mapVendor(row) {
  return {
    id: Number(row.id),
    name: row.name,
    contactName: row.contact_name || '',
    address: row.address || '',
    phone: row.phone || '',
    alternatePhone: row.alternate_phone || '',
    email: row.email || '',
    creditLimit: Number(row.credit_limit || 0),
    balance: Number(row.balance || 0),
    note: row.note || '',
    vatTin: row.vat_tin || '',
  };
}

function prepareVendorProfile(payload = {}, { requireComplete = true } = {}) {
  const profile = {
    name: String(payload.name || '').trim(),
    contactName: String(payload.contactName || '').trim(),
    vatTin: String(payload.vatTin || '').trim(),
    address: String(payload.address || '').trim(),
    phone: String(payload.phone || '').trim(),
    alternatePhone: String(payload.alternatePhone || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    creditLimit: Number(payload.creditLimit ?? 0),
    note: String(payload.note || '').trim(),
  };

  if (!profile.name) throw new Error('Company name is required');
  if (requireComplete && !profile.contactName) throw new Error('Contact name is required');
  if (requireComplete && !profile.vatTin) throw new Error('Tax Identification Number (TIN) is required');
  if (requireComplete && !profile.address) throw new Error('Vendor address is required');
  if (requireComplete && !profile.phone) throw new Error('Telephone is required');
  if (requireComplete && !profile.email) throw new Error('A valid vendor email address is required');
  if (profile.email && !isValidEmail(profile.email)) throw new Error('A valid vendor email address is required');
  if (profile.name.length > 160) throw new Error('Company name cannot exceed 160 characters');
  if (profile.contactName.length > 180) throw new Error('Contact name cannot exceed 180 characters');
  if (profile.vatTin.length > 50) throw new Error('Tax Identification Number cannot exceed 50 characters');
  if (profile.address.length > 5000) throw new Error('Address cannot exceed 5000 characters');
  if (profile.phone.length > 60 || profile.alternatePhone.length > 60) {
    throw new Error('Telephone numbers cannot exceed 60 characters');
  }
  if (profile.email.length > 255) throw new Error('Email cannot exceed 255 characters');
  if (!Number.isFinite(profile.creditLimit) || profile.creditLimit < 0
    || Math.abs(profile.creditLimit * 100 - Math.round(profile.creditLimit * 100)) > 1e-8) {
    throw new Error('Credit limit must be a non-negative amount with no more than 2 decimals');
  }

  return profile;
}

api.get('/vendors', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${vendorSelectSql} WHERE v.company_id = ? AND v.active = 1 ORDER BY v.name`, [req.companyId]);
    res.json(rows.map(mapVendor));
  } catch (error) {
    next(error);
  }
});

api.post('/vendors', auth, adminOnly, async (req, res, next) => {
  try {
    let profile;
    try {
      profile = prepareVendorProfile(req.body);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    const [result] = await pool.query(
      `INSERT INTO vendors
        (name, contact_name, vat_tin, address, phone, alternate_phone, email, credit_limit, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.name,
        profile.contactName,
        profile.vatTin,
        profile.address,
        profile.phone,
        profile.alternatePhone || null,
        profile.email,
        profile.creditLimit,
        profile.note,
      ]
    );
    const [rows] = await pool.query(`${vendorSelectSql} WHERE v.id = ? AND v.company_id = ?`, [result.insertId, req.companyId]);
    res.status(201).json(mapVendor(rows[0]));
  } catch (error) {
    next(error);
  }
});

api.put('/vendors/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const vendorId = Number(req.params.id);
    if (!Number.isInteger(vendorId) || vendorId < 1) return res.status(400).json({ message: 'Invalid vendor id' });
    let profile;
    try {
      profile = prepareVendorProfile(req.body, { requireComplete: false });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const [result] = await pool.query(
      `UPDATE vendors
       SET name = ?, contact_name = ?, vat_tin = ?, address = ?, phone = ?, alternate_phone = ?, email = ?, credit_limit = ?, note = ?
       WHERE id = ? AND company_id = ? AND active = 1`,
      [
        profile.name,
        profile.contactName,
        profile.vatTin,
        profile.address,
        profile.phone,
        profile.alternatePhone || null,
        profile.email,
        profile.creditLimit,
        profile.note,
        vendorId,
        req.companyId,
      ]
    );
    if (!result.affectedRows) {
      const [existingRows] = await pool.query(
        'SELECT id FROM vendors WHERE id = ? AND company_id = ? AND active = 1',
        [vendorId, req.companyId]
      );
      if (!existingRows.length) return res.status(404).json({ message: 'Vendor not found' });
    }
    const [rows] = await pool.query(`${vendorSelectSql} WHERE v.id = ? AND v.company_id = ?`, [vendorId, req.companyId]);
    res.json(mapVendor(rows[0]));
  } catch (error) {
    next(error);
  }
});

api.delete('/vendors/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const vendorId = Number(req.params.id);
    if (!Number.isInteger(vendorId) || vendorId < 1) return res.status(400).json({ message: 'Invalid vendor id' });
    const [result] = await pool.query('UPDATE vendors SET active = 0 WHERE id = ? AND company_id = ? AND active = 1', [vendorId, req.companyId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Vendor not found' });
    await logActivity(pool, req.user.id, 'vendor_archived', 'vendor', vendorId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

api.get('/customers', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM customers WHERE company_id = ? ORDER BY name', [req.companyId]);
    res.json(rows.map(mapCustomer));
  } catch (error) {
    next(error);
  }
});

api.post('/customers', auth, async (req, res, next) => {
  try {
    const customerInput = prepareCustomerProfile(req.body);
    const [result] = await pool.query('INSERT INTO customers (name, phone, address, representative, email, vat_tin, deposit, reward_points, balance, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      customerInput.name,
      customerInput.phone,
      customerInput.address,
      customerInput.representative,
      customerInput.email,
      customerInput.vatTin,
      customerInput.deposit,
      0,
      0,
      customerInput.creditLimit,
    ]);
    const [rows] = await pool.query('SELECT * FROM customers WHERE id = ? AND company_id = ?', [result.insertId, req.companyId]);
    const customer = rows[0];
    res.status(201).json(mapCustomer(customer));
  } catch (error) {
    next(error);
  }
});

api.put('/customers/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId < 1) return res.status(400).json({ message: 'Invalid customer id' });
    const customerInput = prepareCustomerProfile(req.body);
    const [result] = await pool.query('UPDATE customers SET name = ?, phone = ?, address = ?, representative = ?, email = ?, vat_tin = ?, deposit = ?, credit_limit = ? WHERE id = ? AND company_id = ?', [
      customerInput.name,
      customerInput.phone,
      customerInput.address,
      customerInput.representative,
      customerInput.email,
      customerInput.vatTin,
      customerInput.deposit,
      customerInput.creditLimit,
      customerId,
      req.companyId,
    ]);
    if (!result.affectedRows) {
      const [existing] = await pool.query('SELECT id FROM customers WHERE id = ? AND company_id = ? LIMIT 1', [customerId, req.companyId]);
      if (!existing.length) return res.status(404).json({ message: 'Customer not found' });
    }
    const [rows] = await pool.query('SELECT * FROM customers WHERE id = ? AND company_id = ?', [customerId, req.companyId]);
    const customer = rows[0];
    res.json(mapCustomer(customer));
  } catch (error) {
    next(error);
  }
});

api.delete('/customers/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId < 1) return res.status(400).json({ message: 'Invalid customer id' });
    const [result] = await pool.query('DELETE FROM customers WHERE id = ? AND company_id = ?', [customerId, req.companyId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Customer not found' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// INVOICES & REPORTS
// ==========================================
api.get('/invoices', auth, async (req, res, next) => {
  try {
    const branches = await getAuthorizedBranches(pool, req.user);
    const branchScope = branchFilter('i.branch', branches);
    const [rows] = await pool.query(`
      SELECT 
        i.id, i.invoice_no, i.customer_name, i.staff_name, i.payment_method, 
        i.net_sale, i.vat, i.total, i.status, i.created_at, i.invoice_type, i.received_usd, i.received_khr,
        i.change_usd, i.payment_reference, i.khqr_payload, i.vat_tin,
        COUNT(l.id) AS items_count
      FROM invoices i
      LEFT JOIN invoice_lines l ON l.invoice_id = i.id
      WHERE i.company_id = ?${branchScope.condition}
      GROUP BY i.id, i.invoice_no, i.customer_name, i.staff_name, i.payment_method, 
               i.net_sale, i.vat, i.total, i.status, i.created_at, i.invoice_type, i.received_usd, i.received_khr,
               i.change_usd, i.payment_reference, i.khqr_payload, i.vat_tin
      ORDER BY i.created_at DESC
    `, [req.companyId, ...branchScope.params]);
    res.json(rows.map(mapInvoice));
  } catch (error) {
    next(error);
  }
});

api.get('/invoices/:identifier', auth, async (req, res, next) => {
  try {
    const identifier = String(req.params.identifier || '').trim();
    const numericId = /^\d+$/.test(identifier) ? Number(identifier) : 0;
    const [invoiceRows] = await pool.query(
      `
      SELECT i.*, c.name AS customer_detail_name, c.phone AS customer_phone
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
      WHERE i.company_id = ? AND (i.invoice_no = ? OR i.id = ?)
      LIMIT 1
    `,
      [req.companyId, identifier, numericId]
    );

    if (!invoiceRows[0]) return res.status(404).json({ message: 'Invoice not found' });

    const invoice = invoiceRows[0];
    await assertBranchAccess(pool, req.user, invoice.branch);
    const [lineRows] = await pool.query(
      `
      SELECT id, item_id, item_name, unit, qty, qty_base, unit_price, cost_price,
             unit_cost_at_sale, cogs_unit_cost, discount, line_net,
             COALESCE(line_total, line_net) AS line_total,
             COALESCE(vat_rate, 0) AS vat_rate,
             COALESCE(vat_amount, 0) AS vat_amount
      FROM invoice_lines
      WHERE invoice_id = ? AND company_id = ?
      ORDER BY id
    `,
      [invoice.id, req.companyId]
    );
    const [returnRows] = await pool.query(
      `SELECT sr.return_no, sr.reason, sr.created_at, u.name AS created_by_name,
              srl.invoice_line_id, srl.qty_returned, srl.qty_base
       FROM sales_returns sr
       JOIN sales_return_lines srl ON srl.sales_return_id = sr.id
       LEFT JOIN users u ON u.id = sr.created_by
       WHERE sr.invoice_id = ? AND sr.company_id = ?
       ORDER BY sr.created_at DESC, sr.id DESC, srl.id`,
      [invoice.id, req.companyId]
    );
    const returnedByLine = new Map();
    const returnsById = new Map();
    for (const returned of returnRows) {
      const lineId = Number(returned.invoice_line_id);
      const lineTotals = returnedByLine.get(lineId) || { quantity: 0, quantityBase: 0 };
      lineTotals.quantity += Number(returned.qty_returned || 0);
      lineTotals.quantityBase += Number(returned.qty_base || 0);
      returnedByLine.set(lineId, lineTotals);
      if (!returnsById.has(returned.return_no)) {
        returnsById.set(returned.return_no, {
          returnNo: returned.return_no,
          reason: returned.reason,
          createdAt: returned.created_at,
          createdBy: returned.created_by_name || '',
          items: [],
        });
      }
      returnsById.get(returned.return_no).items.push({
        invoiceLineId: lineId,
        quantity: Number(returned.qty_returned || 0),
        quantityBase: Number(returned.qty_base || 0),
      });
    }

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
        quantityBase: Number(line.qty_base || 0),
        returnedQuantity: Number(returnedByLine.get(Number(line.id))?.quantity || 0),
        returnableQuantity: Math.max(0, Number(line.qty || 0) - Number(returnedByLine.get(Number(line.id))?.quantity || 0)),
        unitPrice: Number(line.unit_price),
        discount: Number(line.discount || 0),
        subtotal: Number(line.line_net),
        tax: Number(line.vat_amount || 0),
        total: Number(line.line_total),
        vatRate: Number(line.vat_rate || 0),
        costPrice: Number(line.cost_price || 0),
        unitCostAtSale: Number(line.unit_cost_at_sale || 0),
        cogsUnitCost: Number(line.cogs_unit_cost || 0),
      })),
      returns: Array.from(returnsById.values()),
    });
  } catch (error) {
    next(error);
  }
});

api.post('/invoices/:identifier/returns', auth, async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    const identifier = String(req.params.identifier || '').trim();
    const numericId = /^\d+$/.test(identifier) ? Number(identifier) : 0;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 500) {
      throw stockError(400, 'A return reason is required (maximum 500 characters)');
    }

    await connection.beginTransaction();
    transactionStarted = true;
    const [invoiceRows] = await connection.query(
      `SELECT id, invoice_no, branch, status
       FROM invoices
       WHERE company_id = ? AND (invoice_no = ? OR id = ?)
       LIMIT 1 FOR UPDATE`,
      [req.companyId, identifier, numericId]
    );
    const invoice = invoiceRows[0];
    if (!invoice) throw stockError(404, 'Invoice not found');
    if (invoice.status !== 'Paid') throw stockError(409, 'Only paid invoices can be returned');
    await assertBranchAccess(connection, req.user, invoice.branch);

    const [invoiceLines] = await connection.query(
      `SELECT id, item_id, item_name, qty, qty_base, cost_price, unit_cost_at_sale, cogs_unit_cost
       FROM invoice_lines
       WHERE invoice_id = ? AND company_id = ?
       ORDER BY item_id, id
       FOR UPDATE`,
      [invoice.id, req.companyId]
    );
    const [previousReturns] = await connection.query(
      `SELECT srl.invoice_line_id, SUM(srl.qty_returned) AS qty_returned,
             SUM(srl.qty_base) AS qty_base_returned
      FROM sales_return_lines srl
      WHERE srl.company_id = ? AND srl.invoice_line_id IN (
        SELECT id FROM invoice_lines WHERE invoice_id = ? AND company_id = ?
      )
       GROUP BY srl.invoice_line_id`,
      [req.companyId, invoice.id, req.companyId]
    );
    const returnedByLine = new Map(previousReturns.map((line) => [
      Number(line.invoice_line_id),
      {
        quantity: Number(line.qty_returned || 0),
        quantityBase: Number(line.qty_base_returned || 0),
      },
    ]));
    const linesWithReturns = invoiceLines.map((line) => ({
      ...line,
      qty_returned: returnedByLine.get(Number(line.id))?.quantity || 0,
      qty_base_returned: returnedByLine.get(Number(line.id))?.quantityBase || 0,
    }));
    const preparedLines = prepareSalesReturnLines(req.body?.lines, linesWithReturns)
      .sort((left, right) => Number(left.line.item_id) - Number(right.line.item_id)
        || Number(left.line.id) - Number(right.line.id));

    const returnNo = `RET-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const [returnResult] = await connection.query(
      `INSERT INTO sales_returns (return_no, invoice_id, branch, reason, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [returnNo, invoice.id, invoice.branch, reason, req.user.id]
    );

    for (const returned of preparedLines) {
      const { line, quantity, quantityBase, unitCost } = returned;
      const received = await receiveBranchStock(
        connection,
        Number(line.item_id),
        invoice.branch,
        quantityBase,
        unitCost
      );
      if (received.batchQuantity > 0) {
        await connection.query(
          `INSERT INTO inventory_batches
             (item_id, branch, batch_no, qty_received, qty_remaining, unit_cost)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            line.item_id,
            invoice.branch,
            `${returnNo}-${line.id}`,
            received.batchQuantity,
            received.batchQuantity,
            unitCost,
          ]
        );
      }
      await connection.query(
        `INSERT INTO sales_return_lines
           (sales_return_id, invoice_line_id, item_id, qty_returned, qty_base, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [returnResult.insertId, line.id, line.item_id, quantity, quantityBase, unitCost]
      );
      await connection.query(
        `INSERT INTO stock_transactions
           (item_id, item_name, type, qty, balance_after, unit_cost_at_sale, unit_cost, reference, branch)
         VALUES (?, ?, 'Return', ?, ?, ?, ?, ?, ?)`,
        [
          line.item_id,
          line.item_name,
          quantityBase,
          received.balance,
          unitCost,
          unitCost,
          returnNo,
          invoice.branch,
        ]
      );
    }

    await logActivity(connection, req.user.id, 'sales_return_created', 'sales_return', returnResult.insertId, {
      returnNo,
      invoiceNo: invoice.invoice_no,
      reason,
      lines: preparedLines.map(({ line, quantity, quantityBase }) => ({
        invoiceLineId: line.id,
        quantity,
        quantityBase,
      })),
      effect: 'inventory_only',
    });
    await connection.commit();
    transactionStarted = false;
    res.status(201).json({ returnNo, message: 'Items returned to inventory; no refund or revenue adjustment was made' });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  } finally {
    if (connection) connection.release();
  }
});

api.get('/reports/sales-by-staff', auth, async (req, res, next) => {
  try {
    const dateRange = resolveReportDateRange(req.query.from, req.query.to);
    if (dateRange.error) return res.status(400).json({ message: dateRange.error });
    const conditions = ["i.company_id = ?", "i.status = 'Paid'"];
    const params = [req.companyId, req.companyId];
    const branches = await getAuthorizedBranches(pool, req.user);
    const branchScope = branchFilter('i.branch', branches);
    if (branchScope.condition) {
      conditions.push(branchScope.condition.replace(/^ AND /, ''));
      params.push(...branchScope.params);
    }
    conditions.push('i.created_at >= ?');
    params.push(`${dateRange.from} 00:00:00`);
    conditions.push('i.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(dateRange.to);
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
        FROM invoice_lines WHERE company_id = ?
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
    const requestedPage = Number(req.query.page);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(500, requestedLimit)
      : 50;
    const filters = ['company_id = ?'];
    const values = [req.companyId];

    if (req.query.item_id !== undefined && req.query.item_id !== '') {
      const itemId = Number(req.query.item_id);
      if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid item id filter' });
      filters.push('item_id = ?');
      values.push(itemId);
    }
    if (req.query.branch) {
      const branch = getBranch(req.query.branch);
      await assertBranchAccess(pool, req.user, branch);
      filters.push('branch = ?');
      values.push(branch);
    } else {
      const authorizedBranches = await getAuthorizedBranches(pool, req.user);
      if (authorizedBranches) {
        if (authorizedBranches.length) {
          filters.push('branch IN (?)');
          values.push(authorizedBranches);
        } else {
          filters.push('1 = 0');
        }
      }
    }
    for (const [key, operator] of [['startDate', '>'], ['endDate', '<']]) {
      const date = String(req.query[key] || '');
      if (!date) continue;
      const parsedDate = new Date(`${date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
        return res.status(400).json({ message: `Invalid ${key} filter` });
      }
      filters.push(operator === '>' ? 'created_at >= ?' : 'created_at < DATE_ADD(?, INTERVAL 1 DAY)');
      values.push(date);
    }
    if (req.query.type) {
      const type = String(req.query.type);
      if (!['Sale', 'Purchase', 'Adjustment', 'Transfer', 'Reversed', 'Return'].includes(type)) {
        return res.status(400).json({ message: 'Invalid movement type filter' });
      }
      filters.push('type = ?');
      values.push(type);
    }
    const searchText = String(req.query.search || '').trim();
    if (searchText.length > 120) return res.status(400).json({ message: 'Search must be 120 characters or fewer.' });
    if (searchText) {
      const searchTokens = searchText.split(/\s+/).filter(Boolean);
      const searchFields = [
        'item_name',
        'reference',
        'type',
        'branch',
        "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')",
        'CAST(item_id AS CHAR)',
        'CAST(qty AS CHAR)',
        'CAST(balance_after AS CHAR)',
      ];
      filters.push(searchTokens.map(() => `(${searchFields.map((field) => `${field} LIKE ? ESCAPE '!'`).join(' OR ')})`).join(' AND '));
      for (const token of searchTokens) {
        const escapedToken = token.replace(/[!%_]/g, '!$&');
        values.push(...searchFields.map(() => `%${escapedToken}%`));
      }
    }

    if (req.query.startDate && req.query.endDate && req.query.startDate > req.query.endDate) {
      return res.status(400).json({ message: 'startDate must be on or before endDate' });
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM stock_transactions ${whereSql}`,
      values
    );
    const total = Number(countRows[0].total);
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS date, item_id AS itemId,
              item_name AS item, type, qty, balance_after AS balanceAfter, reference, branch
       FROM stock_transactions ${whereSql}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit]
    );
    res.json({
      data: rows.map((row) => ({
        ...row,
        qty: Number(row.qty),
        balanceAfter: Number(row.balanceAfter),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// PURCHASE ORDERS
// ==========================================
api.get('/purchase-orders', auth, async (req, res, next) => {
  try {
    const branches = await getAuthorizedBranches(pool, req.user);
    const branchScope = branchFilter('po.branch', branches);
    const [rows] = await pool.query(
      `SELECT po.*, DATE_FORMAT(po.order_date, '%Y-%m-%d') AS order_date_display, COUNT(poi.id) item_count, COALESCE(ap.paid_amount, 0) AS paid_amount FROM purchase_orders po LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id AND poi.company_id = po.company_id LEFT JOIN (SELECT company_id, purchase_order_id, SUM(amount) AS paid_amount FROM ap_payments GROUP BY company_id, purchase_order_id) ap ON ap.company_id = po.company_id AND ap.purchase_order_id = po.id WHERE po.company_id = ?${branchScope.condition} GROUP BY po.id, ap.paid_amount ORDER BY po.created_at DESC`,
      [req.companyId, ...branchScope.params]
    );
    res.json(
      rows.map((row) => ({
        id: row.order_no,
        orderId: row.id,
        vendorId: row.vendor_id,
        vendor: row.vendor_name,
        orderDate: row.order_date_display,
        expected: row.expected_date,
        subtotal: Number(row.subtotal || 0),
        deliveryTotal: Number(row.delivery_total || 0),
        handlingCost: Number(row.handling_cost || 0),
        documentationCost: Number(row.documentation_cost || 0),
        taxRate: Number(row.tax_rate || 10),
        taxAmount: Number(row.tax_amount || 0),
        total: Number(row.grand_total ?? row.total),
        status: row.status,
        note: row.note,
        itemCount: Number(row.item_count),
        paidAmount: Number(row.paid_amount || 0),
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
    const catalogError = await validatePurchaseOrderCatalogItems(connection, req.body.items, req.companyId);
    if (catalogError) {
      await connection.rollback();
      return res.status(400).json({ message: catalogError });
    }
    const [vendors] = await connection.query('SELECT id, name FROM vendors WHERE id = ? AND company_id = ? AND active = 1 FOR UPDATE', [req.body.vendorId, req.companyId]);
    if (!vendors[0]) {
      await connection.rollback();
      return res.status(400).json({ message: 'The selected supplier is unavailable' });
    }
    const branch = getBranch(req.body.branch || await defaultBranchForUser(connection, req.companyId));
    await assertBranchAccess(connection, req.user, branch);
    const handlingCost = Number(req.body.handlingCost || 0);
    const documentationCost = Number(req.body.documentationCost || 0);
    const totals = calculatePurchaseTotals(req.body.items, await getConfiguredPurchaseTaxRate(connection, req.companyId), handlingCost, documentationCost);
    const temporaryOrderNo = `TMP-${crypto.randomBytes(8).toString('hex')}`;
    const [result] = await connection.query(
      'INSERT INTO purchase_orders (order_no, vendor_id, vendor_name, order_date, expected_date, subtotal, delivery_total, handling_cost, documentation_cost, tax_rate, tax_amount, grand_total, total, branch, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [temporaryOrderNo, vendors[0].id, vendors[0].name, req.body.orderDate, req.body.expectedDate || null, totals.subtotal, totals.deliveryTotal, handlingCost, documentationCost, totals.taxRate, totals.taxAmount, totals.grandTotal, totals.grandTotal, branch, req.body.note || '', req.user.id]
    );
    const orderNo = `PO-${String(1000 + Number(result.insertId)).padStart(4, '0')}`;
    await connection.query('UPDATE purchase_orders SET order_no = ? WHERE id = ?', [orderNo, result.insertId]);
    await insertPurchaseOrderItems(connection, result.insertId, req.body.items);
    await logActivity(connection, req.user.id, 'purchase_order_created', 'purchase_order', result.insertId, { orderNo, total: totals.grandTotal });
    await connection.commit();
    res.status(201).json({ id: orderNo, orderId: result.insertId, vendor: vendors[0].name, orderDate: req.body.orderDate, branch, ...totals, status: 'Pending', note: req.body.note || '', items: req.body.items });
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
    const branches = await getAuthorizedBranches(pool, req.user);
    const branchScope = branchFilter('po.branch', branches);
    const [orders] = await pool.query(
      numericId === null
        ? `SELECT po.*, u.name AS created_by_name, DATE_FORMAT(po.order_date, '%Y-%m-%d') AS order_date_display, DATE_FORMAT(po.expected_date, '%Y-%m-%d') AS expected_date_display FROM purchase_orders po LEFT JOIN users u ON u.id = po.created_by WHERE po.company_id = ? AND po.order_no = ?${branchScope.condition}`
        : `SELECT po.*, u.name AS created_by_name, DATE_FORMAT(po.order_date, '%Y-%m-%d') AS order_date_display, DATE_FORMAT(po.expected_date, '%Y-%m-%d') AS expected_date_display FROM purchase_orders po LEFT JOIN users u ON u.id = po.created_by WHERE po.company_id = ? AND (po.order_no = ? OR po.id = ?)${branchScope.condition}`,
      [req.companyId, ...(numericId === null ? [req.params.id] : [req.params.id, numericId]), ...branchScope.params]
    );
    if (!orders[0]) return res.status(404).json({ message: 'Purchase order not found' });
    const [items] = await pool.query(
      `SELECT poi.*, DATE_FORMAT(poi.delivery_date, '%Y-%m-%d') AS delivery_date_display,
              COALESCE(stock.qty_on_hand, 0) AS available_stock
       FROM purchase_order_items poi
       LEFT JOIN item_branch_stock stock
         ON stock.item_id = poi.item_id AND stock.branch = ? AND stock.company_id = poi.company_id
       WHERE poi.purchase_order_id = ? AND poi.company_id = ?
       ORDER BY poi.id`,
      [orders[0].received_branch || orders[0].branch || '', orders[0].id, req.companyId]
    );
    const [returnRows] = await pool.query(
      `SELECT pr.return_no, pr.reason, pr.created_at, u.name AS created_by_name,
              prl.purchase_order_item_id, prl.qty_returned
       FROM purchase_returns pr
       JOIN purchase_return_lines prl ON prl.purchase_return_id = pr.id
       LEFT JOIN users u ON u.id = pr.created_by
       WHERE pr.purchase_order_id = ? AND pr.company_id = ?
       ORDER BY pr.created_at DESC, pr.id DESC, prl.id`,
      [orders[0].id, req.companyId]
    );
    const returnedByOrderLine = new Map();
    const returnsByNo = new Map();
    for (const returned of returnRows) {
      const orderLineId = Number(returned.purchase_order_item_id);
      returnedByOrderLine.set(
        orderLineId,
        Number(returnedByOrderLine.get(orderLineId) || 0) + Number(returned.qty_returned || 0)
      );
      if (!returnsByNo.has(returned.return_no)) {
        returnsByNo.set(returned.return_no, {
          returnNo: returned.return_no,
          reason: returned.reason,
          createdAt: returned.created_at,
          createdBy: returned.created_by_name || '',
          items: [],
        });
      }
      returnsByNo.get(returned.return_no).items.push({
        purchaseOrderItemId: orderLineId,
        quantity: Number(returned.qty_returned || 0),
      });
    }
    const [payments] = await pool.query(
      `SELECT ap.id, ap.amount, ap.payment_method, ap.reference, ap.created_at, u.name AS paid_by_name
       FROM ap_payments ap
       LEFT JOIN users u ON u.id = ap.paid_by
       WHERE ap.purchase_order_id = ? AND ap.company_id = ?
       ORDER BY ap.created_at, ap.id`,
      [orders[0].id, req.companyId]
    );
    const paidAmount = payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
    res.json({
      ...orders[0],
      orderNo: orders[0].order_no,
      branch: orders[0].branch || orders[0].received_branch || '',
      receivedBranch: orders[0].received_branch || '',
      orderDate: orders[0].order_date_display,
      expectedDate: orders[0].expected_date_display,
      subtotal: Number(orders[0].subtotal || 0),
      deliveryTotal: Number(orders[0].delivery_total || 0),
      handlingCost: Number(orders[0].handling_cost || 0),
      documentationCost: Number(orders[0].documentation_cost || 0),
      taxRate: Number(orders[0].tax_rate || 10),
      taxAmount: Number(orders[0].tax_amount || 0),
      grandTotal: Number(orders[0].grand_total ?? orders[0].total),
      paidAmount,
      balance: Math.max(0, Number(orders[0].grand_total ?? orders[0].total) - paidAmount),
      items: items.map((item) => ({
        id: item.id,
        itemId: item.item_id,
        productName: item.product_name,
        qty: Number(item.qty),
        returnedQuantity: Number(returnedByOrderLine.get(Number(item.id)) || 0),
        returnableQuantity: Math.max(0, Number(item.qty) - Number(returnedByOrderLine.get(Number(item.id)) || 0)),
        availableStock: Number(item.available_stock || 0),
        unitPrice: Number(item.unit_price),
        merchandiseCost: Number(item.merchandise_cost || item.unit_price),
        unitHandlingCost: Number(item.unit_handling_cost || 0),
        unitDocumentationCost: Number(item.unit_doc_cost || 0),
        effectiveUnitCost: Number(item.effective_unit_cost || 0),
        deliveryDate: item.delivery_date_display,
        deliveryPrice: Number(item.delivery_price),
        itemTotal: Number(item.item_total),
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount || 0),
        paymentMethod: payment.payment_method,
        reference: payment.reference,
        paidAt: payment.created_at,
        paidBy: payment.paid_by_name,
      })),
      returns: Array.from(returnsByNo.values()),
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
    const catalogError = await validatePurchaseOrderCatalogItems(connection, req.body.items, req.companyId);
    if (catalogError) {
      await connection.rollback();
      return res.status(400).json({ message: catalogError });
    }
    const numericId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    const [orders] = await connection.query(
      numericId === null
        ? 'SELECT * FROM purchase_orders WHERE company_id = ? AND order_no = ? FOR UPDATE'
        : 'SELECT * FROM purchase_orders WHERE company_id = ? AND (order_no = ? OR id = ?) FOR UPDATE',
      numericId === null ? [req.companyId, req.params.id] : [req.companyId, req.params.id, numericId]
    );
    if (!orders[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (orders[0].status !== 'Pending') {
      await connection.rollback();
      return res.status(409).json({ message: 'Only pending purchase orders can be edited' });
    }
    const [payments] = await connection.query('SELECT COUNT(*) AS count FROM ap_payments WHERE company_id = ? AND purchase_order_id = ?', [req.companyId, orders[0].id]);
    if (Number(payments[0].count) > 0) {
      await connection.rollback();
      return res.status(409).json({ message: 'Purchase orders with recorded payments cannot be edited' });
    }
    const [vendors] = await connection.query('SELECT id, name FROM vendors WHERE id = ? AND company_id = ? AND active = 1 FOR UPDATE', [req.body.vendorId, req.companyId]);
    if (!vendors[0]) {
      await connection.rollback();
      return res.status(400).json({ message: 'The selected supplier is unavailable' });
    }
    const handlingCost = Number(req.body.handlingCost || 0);
    const documentationCost = Number(req.body.documentationCost || 0);
    const totals = calculatePurchaseTotals(req.body.items, await getConfiguredPurchaseTaxRate(connection, req.companyId), handlingCost, documentationCost);
    await connection.query(
      'UPDATE purchase_orders SET vendor_id = ?, vendor_name = ?, order_date = ?, expected_date = ?, subtotal = ?, delivery_total = ?, handling_cost = ?, documentation_cost = ?, tax_rate = ?, tax_amount = ?, grand_total = ?, total = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?',
      [vendors[0].id, vendors[0].name, req.body.orderDate, req.body.expectedDate || null, totals.subtotal, totals.deliveryTotal, handlingCost, documentationCost, totals.taxRate, totals.taxAmount, totals.grandTotal, totals.grandTotal, req.body.note || '', orders[0].id, req.companyId]
    );
    await connection.query('DELETE FROM purchase_order_items WHERE purchase_order_id = ? AND company_id = ?', [orders[0].id, req.companyId]);
    await insertPurchaseOrderItems(connection, orders[0].id, req.body.items);
    await logActivity(connection, req.user.id, 'purchase_order_updated', 'purchase_order', orders[0].id, { orderNo: orders[0].order_no });
    await connection.commit();
    res.json({ id: orders[0].order_no, orderId: orders[0].id, orderDate: req.body.orderDate, ...totals, items: req.body.items });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.delete('/purchase-orders/:id', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const numericId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    const [orders] = await connection.query(
      numericId === null
        ? 'SELECT * FROM purchase_orders WHERE company_id = ? AND order_no = ? FOR UPDATE'
        : 'SELECT * FROM purchase_orders WHERE company_id = ? AND (order_no = ? OR id = ?) FOR UPDATE',
      numericId === null ? [req.companyId, req.params.id] : [req.companyId, req.params.id, numericId]
    );
    if (!orders[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (orders[0].status !== 'Pending') {
      await connection.rollback();
      return res.status(409).json({ message: 'Only pending purchase orders can be deleted' });
    }
    const [payments] = await connection.query('SELECT COUNT(*) AS count FROM ap_payments WHERE company_id = ? AND purchase_order_id = ?', [req.companyId, orders[0].id]);
    if (Number(payments[0].count) > 0) {
      await connection.rollback();
      return res.status(409).json({ message: 'Purchase orders with recorded payments cannot be deleted' });
    }
    await connection.query('DELETE FROM purchase_orders WHERE id = ? AND company_id = ?', [orders[0].id, req.companyId]);
    await logActivity(connection, req.user.id, 'purchase_order_deleted', 'purchase_order', orders[0].id, { orderNo: orders[0].order_no });
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.post('/purchase-orders/:id/receive', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const branch = getBranch(req.body.branch);
    await assertBranchAccess(connection, req.user, branch);
    await connection.beginTransaction();
    const numericId = Number(req.params.id) || 0;
    const [orders] = await connection.query('SELECT * FROM purchase_orders WHERE company_id = ? AND (order_no = ? OR id = ?) FOR UPDATE', [req.companyId, req.params.id, numericId]);
    if (!orders[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    await assertBranchAccess(connection, req.user, orders[0].branch || orders[0].received_branch || branch);
    if (orders[0].status === 'Received') {
      await connection.rollback();
      return res.status(409).json({ message: 'Purchase order is already received' });
    }
    if (orders[0].status !== 'Pending') {
      await connection.rollback();
      return res.status(409).json({ message: 'Only pending purchase orders can be received' });
    }
    const [lines] = await connection.query('SELECT * FROM purchase_order_items WHERE company_id = ? AND purchase_order_id = ?', [req.companyId, orders[0].id]);
    if (!lines.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'This purchase order has no products to receive' });
    }
    if (lines.some((line) => !line.item_id)) {
      await connection.rollback();
      return res.status(409).json({ message: 'Link every product to an inventory catalog item before receiving this order' });
    }
    const merchandiseTotal = lines.reduce((total, line) => total + Number(line.qty) * Number(line.merchandise_cost || line.unit_price), 0);
    const totalReceivedQty = lines.reduce((total, line) => total + Number(line.qty), 0);
    const handlingPool = Number(orders[0].handling_cost || 0) + lines.reduce((total, line) => total + Number(line.delivery_price || 0), 0);
    const documentationPool = Number(orders[0].documentation_cost || 0);
    for (const line of [...lines].sort((a, b) => Number(a.item_id) - Number(b.item_id))) {
      const [items] = await connection.query('SELECT * FROM items WHERE id = ? AND company_id = ? AND active = 1 FOR UPDATE', [line.item_id, req.companyId]);
      if (!items[0]) {
        await connection.rollback();
        return res.status(409).json({ message: `Inventory item for "${line.product_name}" is unavailable` });
      }
      const item = items[0];
      const receivedQty = validateStockQuantity(line.qty);
      if (receivedQty === null) throw stockError(409, `Invalid received quantity for ${line.product_name}`);
      const merchandiseCost = Number(line.merchandise_cost || line.unit_price);
      const lineValue = receivedQty * merchandiseCost;
      const weight = merchandiseTotal > 0 ? lineValue / merchandiseTotal : receivedQty / totalReceivedQty;
      const allocatedHandlingCost = (handlingPool * weight) / receivedQty;
      const allocatedDocCost = (documentationPool * weight) / receivedQty;
      const unitHandlingCost = Number(allocatedHandlingCost.toFixed(6));
      const unitDocCost = Number(allocatedDocCost.toFixed(6));
      const unitCost = Number((merchandiseCost + unitHandlingCost + unitDocCost).toFixed(6));
      await connection.query(
        'UPDATE purchase_order_items SET merchandise_cost = ?, unit_handling_cost = ?, unit_doc_cost = ?, effective_unit_cost = ? WHERE id = ? AND company_id = ?',
        [merchandiseCost, unitHandlingCost, unitDocCost, unitCost, line.id, req.companyId]
      );
      const received = await receiveBranchStock(connection, item.id, branch, receivedQty, unitCost);
      await connection.query(
        'INSERT INTO inventory_batches (item_id, branch, batch_no, expiry_date, qty_received, qty_remaining, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [item.id, branch, req.body.batchNo || orders[0].order_no, null, receivedQty, received.batchQuantity, unitCost]
      );
      await connection.query('INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, unit_cost, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        item.id,
        item.name_en,
        'Purchase',
        receivedQty,
        received.balance,
        unitCost,
        orders[0].order_no,
        branch,
      ]);
      await updateAutoSellingPrice(connection, item, unitCost);
    }
    await connection.query(
      "UPDATE purchase_orders SET status = 'Received', branch = ?, received_branch = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?",
      [branch, branch, orders[0].id, req.companyId]
    );
    await logActivity(connection, req.user.id, 'purchase_order_received', 'purchase_order', orders[0].id, {
      orderNo: orders[0].order_no,
      branch,
    });
    await connection.commit();
    res.json({ ok: true, orderNo: orders[0].order_no, status: 'Received' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.post('/purchase-orders/:id/returns', auth, async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 500) {
      throw stockError(400, 'A return reason is required (maximum 500 characters)');
    }

    await connection.beginTransaction();
    transactionStarted = true;
    const numericId = /^\d+$/.test(String(req.params.id || '')) ? Number(req.params.id) : 0;
    const [orders] = await connection.query(
      `SELECT id, order_no, status, received_branch
       FROM purchase_orders
       WHERE order_no = ? OR id = ?
       LIMIT 1 FOR UPDATE`,
      [req.params.id, numericId]
    );
    const order = orders[0];
    if (!order) throw stockError(404, 'Purchase order not found');
    if (order.status !== 'Received') {
      throw stockError(409, 'Only received purchase orders can be returned to the supplier');
    }

    const branch = String(order.received_branch || '').trim();
    if (!branch) {
      throw stockError(409, 'The receiving branch for this purchase order is unavailable');
    }
    await assertBranchAccess(connection, req.user, branch);

    const [orderLines] = await connection.query(
      `SELECT id, item_id, product_name, qty
       FROM purchase_order_items
       WHERE purchase_order_id = ?
       ORDER BY item_id, id
       FOR UPDATE`,
      [order.id]
    );
    const [previousReturns] = await connection.query(
      `SELECT purchase_order_item_id, SUM(qty_returned) AS qty_returned
       FROM purchase_return_lines
       WHERE purchase_order_item_id IN (
         SELECT id FROM purchase_order_items WHERE purchase_order_id = ?
       )
       GROUP BY purchase_order_item_id`,
      [order.id]
    );
    const returnedByOrderLine = new Map(previousReturns.map((line) => [
      Number(line.purchase_order_item_id),
      Number(line.qty_returned || 0),
    ]));
    const orderLinesWithReturns = orderLines.map((line) => ({
      ...line,
      qty_returned: returnedByOrderLine.get(Number(line.id)) || 0,
    }));
    const preparedLines = preparePurchaseReturnLines(req.body?.lines, orderLinesWithReturns)
      .sort((left, right) => Number(left.line.item_id) - Number(right.line.item_id)
        || Number(left.line.id) - Number(right.line.id));

    const returnNo = `PRT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const [returnResult] = await connection.query(
      `INSERT INTO purchase_returns (return_no, purchase_order_id, branch, reason, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [returnNo, order.id, branch, reason, req.user.id]
    );

    for (const { line, quantity } of preparedLines) {
      const itemId = Number(line.item_id);
      const stock = await getBranchStockState(connection, itemId, branch);
      if (quantity > stock.quantity + 1e-8) {
        throw stockError(409, `Insufficient available stock to return ${line.product_name} to the supplier`);
      }

      const consumedBatches = await consumeInventoryBatches(connection, itemId, branch, quantity);
      const consumedQuantity = consumedBatches.reduce((total, batch) => total + Number(batch.quantity), 0);
      if (Math.abs(consumedQuantity - quantity) > 1e-8) {
        throw stockError(409, `Batch stock does not reconcile with on-hand stock for ${line.product_name}`);
      }
      const unitCost = Number(stock.averageCost.toFixed(6));
      const balanceAfter = await changeBranchStock(connection, itemId, branch, -quantity);
      await refreshItemMovingAverage(connection, itemId, stock.averageCost);

      await connection.query(
        `INSERT INTO purchase_return_lines
           (purchase_return_id, purchase_order_item_id, item_id, qty_returned, unit_cost)
         VALUES (?, ?, ?, ?, ?)`,
        [returnResult.insertId, line.id, itemId, quantity, unitCost]
      );
      await connection.query(
        `INSERT INTO stock_transactions
           (item_id, item_name, type, qty, balance_after, unit_cost, reference, branch)
         VALUES (?, ?, 'Return', ?, ?, ?, ?, ?)`,
        [
          itemId,
          line.product_name,
          -quantity,
          balanceAfter,
          unitCost,
          returnNo,
          branch,
        ]
      );
    }

    await logActivity(connection, req.user.id, 'purchase_return_created', 'purchase_return', returnResult.insertId, {
      returnNo,
      orderNo: order.order_no,
      reason,
      branch,
      lines: preparedLines.map(({ line, quantity }) => ({
        purchaseOrderItemId: line.id,
        quantity,
      })),
      effect: 'inventory_only',
    });
    await connection.commit();
    transactionStarted = false;
    res.status(201).json({
      returnNo,
      message: 'Items returned to the supplier and removed from inventory; Accounts Payable was not changed',
    });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  } finally {
    if (connection) connection.release();
  }
});

// ==========================================
// REGISTER & CASH MANAGEMENT
// ==========================================
api.get('/register/current', auth, async (req, res, next) => {
  try {
    const branch = getBranch(req.query.branch);
    await assertBranchAccess(pool, req.user, branch);
    const [rows] = await pool.query("SELECT * FROM cash_registers WHERE company_id = ? AND branch = ? AND status = 'Open' ORDER BY id DESC LIMIT 1", [req.companyId, branch]);
    res.json(rows[0] || null);
  } catch (error) {
    next(error);
  }
});

api.post('/register/open', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const branch = getBranch(req.body.branch);
    const startingCash = Number(req.body.startingCash ?? 0);
    if (!Number.isFinite(startingCash) || startingCash < 0 || !hasAtMostDecimals(startingCash, 2)) {
      return res.status(400).json({ message: 'Starting cash must be a non-negative amount with no more than 2 decimals' });
    }
    await assertBranchAccess(connection, req.user, branch);
    await connection.beginTransaction();
    const [result] = await connection.query('INSERT INTO cash_registers (branch, opened_by, starting_cash) VALUES (?, ?, ?)', [branch, req.user.id, startingCash]);
    await logActivity(connection, req.user.id, 'register_opened', 'cash_register', result.insertId, { branch, startingCash });
    const [registers] = await connection.query('SELECT * FROM cash_registers WHERE id = ? AND company_id = ?', [result.insertId, req.companyId]);
    await connection.commit();
    res.status(201).json(registers[0]);
  } catch (error) {
    await connection.rollback();
    if (isOpenRegisterConflict(error)) {
      return res.status(409).json({ message: 'A register is already open for this branch' });
    }
    next(error);
  } finally {
    connection.release();
  }
});

api.post('/register/close', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const branch = getBranch(req.body.branch);
    const countedCash = Number(req.body.countedCash ?? 0);
    if (!Number.isFinite(countedCash) || countedCash < 0 || !hasAtMostDecimals(countedCash, 2)) {
      return res.status(400).json({ message: 'Counted cash must be a non-negative amount with no more than 2 decimals' });
    }
    await assertBranchAccess(connection, req.user, branch);
    await connection.beginTransaction();
    const [registers] = await connection.query("SELECT * FROM cash_registers WHERE company_id = ? AND branch = ? AND status = 'Open' ORDER BY id DESC LIMIT 1 FOR UPDATE", [req.companyId, branch]);
    if (!registers[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'No open register for this branch' });
    }
    const register = registers[0];
    const [sales] = await connection.query(
      "SELECT COALESCE(SUM(total), 0) AS cash_sales FROM invoices WHERE company_id = ? AND payment_method = 'cash' AND branch = ? AND created_at >= ? AND status = 'Paid'",
      [req.companyId, branch, register.opened_at]
    );
    const expectedCash = Number(register.starting_cash) + Number(sales[0].cash_sales || 0);
    const variance = roundToTwo(countedCash - expectedCash);
    await connection.query(
      "UPDATE cash_registers SET closed_by = ?, closed_at = CURRENT_TIMESTAMP, expected_cash = ?, counted_cash = ?, variance = ?, status = 'Closed' WHERE id = ? AND company_id = ?",
      [req.user.id, expectedCash, countedCash, variance, register.id, req.companyId]
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
    const [registers] = await pool.query('SELECT * FROM cash_registers WHERE id = ? AND company_id = ?', [registerId, req.companyId]);
    if (!registers[0]) return res.status(404).json({ message: 'Register not found' });
    await assertBranchAccess(pool, req.user, registers[0].branch);
    const [totals] = await pool.query(
      `SELECT p.payment_method, SUM(p.amount_usd) amount_usd, SUM(p.amount_khr) amount_khr, COUNT(*) payments
       FROM payment_records p
       JOIN invoices i ON i.id = p.invoice_id AND i.company_id = p.company_id
       WHERE p.company_id = ? AND i.branch = ? AND i.created_at >= ? AND i.created_at <= COALESCE(?, CURRENT_TIMESTAMP)
       GROUP BY p.payment_method`,
      [req.companyId, registers[0].branch, registers[0].opened_at, registers[0].closed_at]
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
    const hasCustomerId = req.body.customerId !== undefined && req.body.customerId !== null && req.body.customerId !== '';
    const hasInvoiceId = req.body.invoiceId !== undefined && req.body.invoiceId !== null && req.body.invoiceId !== '';
    const customerId = hasCustomerId ? Number(req.body.customerId) : null;
    const invoiceId = hasInvoiceId ? Number(req.body.invoiceId) : null;
    const amount = roundToTwo(Number(req.body.amount));
    if ((hasCustomerId && (!Number.isSafeInteger(customerId) || customerId < 1))
      || (hasInvoiceId && (!Number.isSafeInteger(invoiceId) || invoiceId < 1))
      || (!customerId && !invoiceId)
      || !Number.isFinite(amount)
      || amount <= 0) {
      return res.status(400).json({ message: 'Invoice or customer and positive amount are required' });
    }

    await connection.beginTransaction();
    const authorizedBranches = await getAuthorizedBranches(connection, req.user);
    if (!invoiceId && !hasPermission(req.user, 'approvals.manage')) {
      await connection.rollback();
      return res.status(400).json({ message: 'Select a receivable invoice to record a branch-authorized payment.' });
    }
    const [invoices] = invoiceId
      ? await connection.query(
        `SELECT i.id, i.customer_id, i.branch, i.total, COALESCE(SUM(ap.amount), 0) AS paid_amount
         FROM invoices i
         LEFT JOIN ar_payments ap ON ap.invoice_id = i.id AND ap.company_id = i.company_id
         WHERE i.id = ? AND i.company_id = ? AND i.payment_method = ? AND i.status = ?
         GROUP BY i.id, i.customer_id, i.branch, i.total
         FOR UPDATE`,
        [invoiceId, req.companyId, 'customer_account', 'Paid']
      )
      : [[]];

    if (invoiceId && !invoices[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Receivable invoice not found' });
    }
    if (invoiceId) await assertBranchAccess(connection, req.user, invoices[0].branch);
    if (invoiceId && invoiceCustomerMismatch(invoices[0], customerId)) {
      await connection.rollback();
      return res.status(400).json({ message: 'The selected customer does not own this receivable invoice.' });
    }
    if (invoiceId && amount > roundToTwo(Number(invoices[0].total) - Number(invoices[0].paid_amount)) + 0.001) {
      await connection.rollback();
      return res.status(409).json({ message: 'Payment exceeds the invoice balance' });
    }
    const resolvedCustomerId = customerId || (invoices[0]?.customer_id ? Number(invoices[0].customer_id) : null);
    if (resolvedCustomerId) {
      const [customers] = await connection.query('SELECT id FROM customers WHERE id = ? AND company_id = ? FOR UPDATE', [resolvedCustomerId, req.companyId]);
      if (!customers[0]) {
        await connection.rollback();
        return res.status(404).json({ message: 'Customer not found' });
      }
    }
    const [result] = await connection.query(
      'INSERT INTO ar_payments (customer_id, invoice_id, amount, payment_method, reference, paid_by) VALUES (?, ?, ?, ?, ?, ?)',
      [resolvedCustomerId, invoiceId, amount, req.body.paymentMethod || 'cash', req.body.reference || null, req.user.id]
    );
    if (resolvedCustomerId) await connection.query('UPDATE customers SET balance = GREATEST(0, balance - ?) WHERE id = ? AND company_id = ?', [amount, resolvedCustomerId, req.companyId]);
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
    const branches = await getAuthorizedBranches(pool, req.user);
    const branchScope = branchFilter('i.branch', branches);
    const [rows] = await pool.query(`
      SELECT i.id AS invoice_id, i.invoice_no, i.customer_id, i.customer_name, i.created_at,
             i.total, COALESCE(SUM(ap.amount), 0) AS paid_amount,
             GREATEST(0, i.total - COALESCE(SUM(ap.amount), 0)) AS balance
      FROM invoices i
      LEFT JOIN ar_payments ap ON ap.invoice_id = i.id AND ap.company_id = i.company_id
      WHERE i.company_id = ? AND i.payment_method = 'customer_account' AND i.status = 'Paid'${branchScope.condition}
      GROUP BY i.id, i.invoice_no, i.customer_id, i.customer_name, i.created_at, i.total
      HAVING balance > 0
      ORDER BY i.created_at ASC
    `, [req.companyId, ...branchScope.params]);
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
    const branches = await getAuthorizedBranches(pool, req.user);
    const branchScope = branchFilter('po.branch', branches);
    const [rows] = await pool.query(`
      SELECT po.id AS order_id, po.order_no, po.vendor_id, po.vendor_name, po.expected_date, po.created_at,
             po.grand_total AS total, COALESCE(SUM(ap.amount), 0) AS paid_amount,
             GREATEST(0, po.grand_total - COALESCE(SUM(ap.amount), 0)) AS balance, po.status
      FROM purchase_orders po
      LEFT JOIN ap_payments ap ON ap.purchase_order_id = po.id AND ap.company_id = po.company_id
      WHERE po.company_id = ? AND po.status <> 'Cancelled'${branchScope.condition}
      GROUP BY po.id, po.order_no, po.vendor_id, po.vendor_name, po.expected_date, po.created_at, po.grand_total, po.status
      HAVING balance > 0
      ORDER BY COALESCE(po.expected_date, po.created_at), po.id
    `, [req.companyId, ...branchScope.params]);
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
    const [orders] = await connection.query(
      'SELECT po.*, COALESCE(SUM(ap.amount), 0) paid_amount FROM purchase_orders po LEFT JOIN ap_payments ap ON ap.purchase_order_id = po.id AND ap.company_id = po.company_id WHERE po.id = ? AND po.company_id = ? GROUP BY po.id FOR UPDATE',
      [orderId, req.companyId]
    );
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
    if (!hasPermission(req.user, 'approvals.manage')) return res.status(403).json({ message: 'Manager approval required' });
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
    const conditions = ['company_id = ?'];
    const params = [req.companyId];
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
    const filters = ['b.company_id = ?'];
    const values = [req.companyId];
    if (req.query.branch) {
      filters.push('b.branch = ?');
      values.push(getBranch(req.query.branch));
      await assertBranchAccess(pool, req.user, getBranch(req.query.branch));
    } else {
      const branches = await getAuthorizedBranches(pool, req.user);
      if (branches) {
        if (!branches.length) return res.json([]);
        filters.push('b.branch IN (?)');
        values.push(branches);
      }
    }
    if (req.query.item_id) {
      const itemId = Number(req.query.item_id);
      if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ message: 'Invalid item id filter' });
      filters.push('b.item_id = ?');
      values.push(itemId);
    }
    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT b.*, i.name_en item_name
       FROM inventory_batches b JOIN items i ON i.id = b.item_id AND i.company_id = b.company_id
       ${whereSql}
       ORDER BY b.expiry_date IS NULL, b.expiry_date, b.created_at, b.id`,
      values
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.get('/reports/inventory-valuation', auth, async (req, res, next) => {
  try {
    const authorizedBranches = await getAuthorizedBranches(pool, req.user);
    const requestedBranch = req.query.branch ? getBranch(req.query.branch) : null;
    const startDate = req.query.startDate ? String(req.query.startDate) : null;
    const endDate = req.query.endDate ? String(req.query.endDate) : null;
    const isValidDate = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if ((startDate && !isValidDate(startDate)) || (endDate && !isValidDate(endDate))) {
      return res.status(400).json({ message: 'startDate and endDate must be valid YYYY-MM-DD dates' });
    }
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ message: 'startDate must be on or before endDate' });
    }
    if (requestedBranch) await assertBranchAccess(pool, req.user, requestedBranch);
    if (!requestedBranch && authorizedBranches && !authorizedBranches.length) {
      return res.json({
        summary: {
          total_purchased_qty: 0,
          total_landed_cost: 0,
          total_sold_qty: 0,
          gross_revenue: 0,
          ending_stock_qty: 0,
          ending_stock_value: 0,
          total_available_goods_cost: 0,
          other_stock_outflow_cost: 0,
          cogs: 0,
          gross_profit: 0,
          is_balanced: true,
        },
        items: [],
        movements: [],
      });
    }

    const branchCondition = requestedBranch
      ? ' WHERE company_id = ? AND branch = ?'
      : ' WHERE company_id = ? AND branch IN (?)';
    const invoiceBranchCondition = requestedBranch
      ? ' AND inv.branch = ?'
      : ' AND inv.branch IN (?)';
    const purchaseBranchCondition = requestedBranch
      ? ' AND st.branch = ?'
      : ' AND st.branch IN (?)';
    const purchaseTenantCondition = ' AND st.company_id = ?';
    const salesTenantCondition = ' AND inv.company_id = ? AND il.company_id = inv.company_id';
    const stockBranchValues = requestedBranch ? [req.companyId, requestedBranch] : [req.companyId, authorizedBranches];
    const purchaseBranchValues = requestedBranch ? [req.companyId, requestedBranch] : [req.companyId, authorizedBranches];
    const salesBranchValues = requestedBranch ? [req.companyId, requestedBranch] : [req.companyId, authorizedBranches];
    const purchaseDateConditions = [];
    const purchaseDateValues = [];
    const salesDateConditions = [];
    const salesDateValues = [];
    if (startDate) {
      purchaseDateConditions.push(' AND st.created_at >= ?');
      purchaseDateValues.push(startDate);
      salesDateConditions.push(' AND inv.created_at >= ?');
      salesDateValues.push(startDate);
    }
    if (endDate) {
      purchaseDateConditions.push(' AND st.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
      purchaseDateValues.push(endDate);
      salesDateConditions.push(' AND inv.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
      salesDateValues.push(endDate);
    }
    const [rows] = await pool.query(
      `SELECT i.id AS item_id, i.name_en AS item_name,
              COALESCE(stock.qty_on_hand, 0) AS qty_on_hand,
              COALESCE(stock.moving_avg_cost, i.average_cost, i.purchase_cost, 0) AS moving_avg_cost,
              COALESCE(stock.stock_value, 0) AS total_stock_value,
              COALESCE(sales.total_qty_sold, 0) AS total_qty_sold,
              COALESCE(sales.cogs_amount, 0) AS cogs_amount,
              COALESCE(sales.sales_amount, 0) AS sales_amount,
              COALESCE(sales.sales_amount, 0) - COALESCE(sales.cogs_amount, 0) AS gross_profit,
              COALESCE(purchases.total_purchased_qty, 0) AS total_purchased_qty,
              COALESCE(purchases.total_landed_cost, 0) AS total_landed_cost
       FROM items i
       LEFT JOIN (
         SELECT item_id,
                SUM(qty_on_hand) AS qty_on_hand,
                SUM(qty_on_hand * avg_cost) AS stock_value,
                CASE WHEN SUM(qty_on_hand) > 0
                     THEN SUM(qty_on_hand * avg_cost) / SUM(qty_on_hand)
                     ELSE MAX(avg_cost) END AS moving_avg_cost
         FROM item_branch_stock${branchCondition}
         GROUP BY item_id
       ) stock ON stock.item_id = i.id
       LEFT JOIN (
         SELECT st.item_id, SUM(st.qty) AS total_purchased_qty,
                SUM(st.qty * st.unit_cost) AS total_landed_cost
         FROM stock_transactions st
         WHERE st.type = 'Purchase'${purchaseTenantCondition}${purchaseBranchCondition}${purchaseDateConditions.join('')}
         GROUP BY st.item_id
       ) purchases ON purchases.item_id = i.id
       LEFT JOIN (
         SELECT il.item_id,
                SUM(CASE WHEN il.qty_base > 0 THEN il.qty_base ELSE il.qty END) AS total_qty_sold,
                SUM(CASE WHEN il.total_cogs <> 0 THEN il.total_cogs
                         WHEN il.qty_base > 0
                         THEN il.qty_base * COALESCE(NULLIF(il.cogs_unit_cost, 0), il.unit_cost_at_sale)
                         ELSE il.qty * il.cost_price END) AS cogs_amount,
                SUM(il.line_net) AS sales_amount
         FROM invoice_lines il
         JOIN invoices inv ON inv.id = il.invoice_id AND inv.company_id = il.company_id
         WHERE inv.status = 'Paid'${salesTenantCondition}${invoiceBranchCondition}${salesDateConditions.join('')}
         GROUP BY il.item_id
       ) sales ON sales.item_id = i.id
       WHERE i.company_id = ? AND i.active = 1
       ORDER BY i.name_en`,
      [
        ...stockBranchValues,
        ...purchaseBranchValues,
        ...purchaseDateValues,
        ...salesBranchValues,
        ...salesDateValues,
        req.companyId,
      ]
    );
    const adjustmentCost = movementCostExpression('st', 'item', 'branch_cost');
    const [movementRows] = await pool.query(
      `SELECT st.id, DATE_FORMAT(st.created_at, '%Y-%m-%d %H:%i:%s') AS movement_date,
              st.item_id, st.item_name, st.type, st.qty, st.balance_after,
              CASE WHEN st.type = 'Adjustment' THEN ${adjustmentCost} ELSE st.unit_cost END AS report_unit_cost,
              st.unit_cost_at_sale, st.reference, st.branch
       FROM stock_transactions st
       LEFT JOIN items item ON item.id = st.item_id AND item.company_id = st.company_id
       LEFT JOIN item_branch_stock branch_cost
         ON branch_cost.item_id = st.item_id AND branch_cost.branch = st.branch AND branch_cost.company_id = st.company_id
       WHERE st.company_id = ? AND st.type IN ('Purchase', 'Sale', 'Return', 'Adjustment', 'Transfer')${purchaseTenantCondition}${purchaseBranchCondition}${purchaseDateConditions.join('')}
       ORDER BY st.created_at DESC, st.id DESC
       LIMIT 500`,
      [req.companyId, ...purchaseBranchValues, ...purchaseDateValues]
    );
    const [[stockFlow]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN st.qty > 0 AND st.type <> 'Sale'
                           THEN st.qty * CASE WHEN st.type = 'Adjustment' THEN ${adjustmentCost} ELSE st.unit_cost END ELSE 0 END), 0) AS inflow_cost,
         COALESCE(SUM(CASE WHEN st.qty < 0 AND st.type <> 'Sale'
                           THEN ABS(st.qty) * CASE WHEN st.type = 'Adjustment' THEN ${adjustmentCost} ELSE st.unit_cost END ELSE 0 END), 0) AS other_outflow_cost
       FROM stock_transactions st
       LEFT JOIN items item ON item.id = st.item_id AND item.company_id = st.company_id
       LEFT JOIN item_branch_stock branch_cost
         ON branch_cost.item_id = st.item_id AND branch_cost.branch = st.branch AND branch_cost.company_id = st.company_id
       WHERE st.company_id = ? AND st.type IN ('Purchase', 'Return', 'Adjustment', 'Transfer')${purchaseTenantCondition}${purchaseBranchCondition}${purchaseDateConditions.join('')}`,
      [req.companyId, ...purchaseBranchValues, ...purchaseDateValues]
    );
    const items = rows.map((row) => ({
      item_id: Number(row.item_id),
      item_name: row.item_name,
      qty_on_hand: Number(row.qty_on_hand),
      moving_avg_cost: Number(row.moving_avg_cost),
      total_stock_value: Number(row.total_stock_value),
      total_qty_sold: Number(row.total_qty_sold),
      cogs_amount: Number(row.cogs_amount),
      sales_amount: Number(row.sales_amount),
      gross_profit: Number(row.gross_profit),
      total_purchased_qty: Number(row.total_purchased_qty),
      total_landed_cost: Number(row.total_landed_cost),
    }));
    const totalPurchasedQty = items.reduce((total, item) => total + item.total_purchased_qty, 0);
    const totalLandedCost = items.reduce((total, item) => total + item.total_landed_cost, 0);
    const totalSoldQty = items.reduce((total, item) => total + item.total_qty_sold, 0);
    const grossRevenue = items.reduce((total, item) => total + item.sales_amount, 0);
    const endingStockQty = items.reduce((total, item) => total + item.qty_on_hand, 0);
    const endingStockValue = items.reduce((total, item) => total + item.total_stock_value, 0);
    const cogs = items.reduce((total, item) => total + item.cogs_amount, 0);
    const totalAvailableGoodsCost = Number(stockFlow.inflow_cost);
    const otherStockOutflowCost = Number(stockFlow.other_outflow_cost);
    const isBalanced = Math.abs(Number((
      totalAvailableGoodsCost - cogs - otherStockOutflowCost - endingStockValue
    ).toFixed(2))) < 0.01;
    const movements = movementRows.reverse().map((row) => {
      const unitCost = row.type === 'Sale'
        ? Number(row.unit_cost_at_sale || row.unit_cost || 0)
        : Number(row.report_unit_cost || 0);
      return {
        id: Number(row.id),
        date: row.movement_date,
        item_id: Number(row.item_id),
        item_name: row.item_name,
        type: row.type,
        qty: Number(row.qty),
        balance_after: Number(row.balance_after),
        unit_cost: unitCost,
        movement_cost: Number((Math.abs(Number(row.qty)) * unitCost).toFixed(6)),
        reference: row.reference,
        branch: row.branch,
      };
    });
    res.json({
      summary: {
        total_purchased_qty: totalPurchasedQty,
        total_landed_cost: totalLandedCost,
        total_sold_qty: totalSoldQty,
        gross_revenue: grossRevenue,
        ending_stock_qty: endingStockQty,
        ending_stock_value: endingStockValue,
        total_available_goods_cost: totalAvailableGoodsCost,
        other_stock_outflow_cost: otherStockOutflowCost,
        cogs,
        gross_profit: grossRevenue - cogs,
        is_balanced: startDate || endDate ? null : isBalanced,
      },
      items,
      movements,
    });
  } catch (error) {
    next(error);
  }
});

api.post('/inventory/batches', auth, adminOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const itemId = Number(req.body.itemId);
    const quantity = validateStockQuantity(req.body.quantity);
    const branch = getBranch(req.body.branch);
    const batchNo = String(req.body.batchNo || '').trim();
    const requestedUnitCost = req.body.unitCost === undefined || req.body.unitCost === null || req.body.unitCost === ''
      ? null
      : Number(req.body.unitCost);
    if (!Number.isInteger(itemId) || itemId < 1 || quantity === null || !batchNo) {
      return res.status(400).json({ message: 'Item, batch number and positive whole quantity are required' });
    }
    if (batchNo.length > 80 || (requestedUnitCost !== null && (!Number.isFinite(requestedUnitCost) || requestedUnitCost < 0))) {
      return res.status(400).json({ message: 'Batch number or unit cost is invalid' });
    }

    await connection.beginTransaction();
    const [items] = await connection.query('SELECT * FROM items WHERE id = ? AND company_id = ? AND active = 1 FOR UPDATE', [itemId, req.companyId]);
    if (!items[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Item not found' });
    }
    const item = items[0];
    const branchState = await getBranchStockState(connection, itemId, branch);
    const unitCost = Number((requestedUnitCost ?? (branchState.averageCost || item.average_cost || item.purchase_cost || 0)).toFixed(6));
    const received = await receiveBranchStock(connection, itemId, branch, quantity, unitCost);
    const [result] = await connection.query(
      'INSERT INTO inventory_batches (company_id, item_id, branch, batch_no, expiry_date, qty_received, qty_remaining, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.companyId, itemId, branch, batchNo, req.body.expiryDate || null, quantity, received.batchQuantity, unitCost]
    );
    await connection.query(
      'INSERT INTO stock_transactions (company_id, item_id, item_name, type, qty, balance_after, unit_cost, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.companyId, itemId, items[0].name_en, 'Purchase', quantity, received.balance, unitCost, batchNo, branch]
    );
    await updateAutoSellingPrice(connection, item, unitCost);
    await logActivity(connection, req.user.id, 'inventory_batch_created', 'inventory_batch', result.insertId, { itemId, branch, quantity, batchNo });
    await connection.commit();
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.get('/inventory/transfers', auth, async (req, res, next) => {
  try {
    const branches = await getAuthorizedBranches(pool, req.user);
    const [transfers] = branches
      ? branches.length
        ? await pool.query(
        'SELECT * FROM stock_transfers WHERE company_id = ? AND (from_branch IN (?) OR to_branch IN (?)) ORDER BY created_at DESC, id DESC',
        [req.companyId, branches, branches]
        )
        : [[]]
    : await pool.query('SELECT * FROM stock_transfers WHERE company_id = ? ORDER BY created_at DESC, id DESC', [req.companyId]);
    if (!transfers.length) return res.json([]);
    const transferIds = transfers.map((transfer) => transfer.id);
    const [lines] = await pool.query(
      `SELECT ti.*, i.name_en item_name
       FROM stock_transfer_items ti JOIN items i ON i.id = ti.item_id AND i.company_id = ti.company_id
       WHERE ti.company_id = ? AND ti.transfer_id IN (?) ORDER BY ti.transfer_id, ti.item_id`,
      [req.companyId, transferIds]
    );
    const lineIds = lines.map((line) => line.id);
    const [batches] = lineIds.length
      ? await pool.query('SELECT * FROM stock_transfer_batches WHERE company_id = ? AND transfer_item_id IN (?) ORDER BY id', [req.companyId, lineIds])
      : [[]];
    const batchesByLine = new Map();
    for (const batch of batches) {
      if (!batchesByLine.has(batch.transfer_item_id)) batchesByLine.set(batch.transfer_item_id, []);
      batchesByLine.get(batch.transfer_item_id).push(batch);
    }
    const linesByTransfer = new Map();
    for (const line of lines) {
      if (!linesByTransfer.has(line.transfer_id)) linesByTransfer.set(line.transfer_id, []);
      linesByTransfer.get(line.transfer_id).push({
        id: line.id,
        itemId: line.item_id,
        itemName: line.item_name,
        qty: Number(line.qty),
        batches: (batchesByLine.get(line.id) || []).map((batch) => ({
          batchNo: batch.batch_no,
          expiryDate: batch.expiry_date,
          quantity: Number(batch.quantity),
        })),
      });
    }
    res.json(transfers.map((transfer) => ({
      ...transfer,
      items: linesByTransfer.get(transfer.id) || [],
    })));
  } catch (error) {
    next(error);
  }
});

api.post('/inventory/transfers', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    if (!req.body.fromBranch || !req.body.toBranch) {
      return res.status(400).json({ message: 'Source and destination branches are required' });
    }
    const fromBranch = getBranch(req.body.fromBranch);
    const toBranch = getBranch(req.body.toBranch);
    if (fromBranch.toLowerCase() === toBranch.toLowerCase()) {
      return res.status(400).json({ message: 'Source and destination branches must be different' });
    }
    await assertBranchAccess(connection, req.user, fromBranch);
    if (!Array.isArray(req.body.items) || !req.body.items.length) {
      return res.status(400).json({ message: 'Branches and transfer items are required' });
    }
    const quantitiesByItem = new Map();
    for (const line of req.body.items) {
      const itemId = Number(line.itemId);
      const quantity = validateStockQuantity(line.qty);
      if (!Number.isInteger(itemId) || itemId < 1 || quantity === null) {
        return res.status(400).json({ message: 'Each transfer line requires a valid item and positive whole quantity' });
      }
      quantitiesByItem.set(itemId, assertWholeQuantity((quantitiesByItem.get(itemId) || 0) + quantity));
    }

    await connection.beginTransaction();
    const transferNo = `TR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const [result] = await connection.query('INSERT INTO stock_transfers (transfer_no, from_branch, to_branch, status, created_by) VALUES (?, ?, ?, ?, ?)', [
      transferNo,
      fromBranch,
      toBranch,
      'In Transit',
      req.user.id,
    ]);

    for (const itemId of [...quantitiesByItem.keys()].sort((a, b) => a - b)) {
      const quantity = quantitiesByItem.get(itemId);
      const [items] = await connection.query('SELECT * FROM items WHERE id = ? AND company_id = ? AND active = 1 FOR UPDATE', [itemId, req.companyId]);
      if (!items[0]) throw stockError(404, `Item ID ${itemId} not found`);
      const sourceState = await getBranchStockState(connection, itemId, fromBranch);
      const available = sourceState.quantity;
      if (available < quantity) {
        throw stockError(409, `${items[0].name_en} has insufficient stock at ${fromBranch} (Required: ${quantity}, Available: ${available})`);
      }
      const transferUnitCost = Number(sourceState.averageCost.toFixed(6));
      const consumedBatches = await consumeInventoryBatches(connection, itemId, fromBranch, quantity);
      const balanceAfter = await changeBranchStock(connection, itemId, fromBranch, -quantity);
      await refreshItemMovingAverage(connection, itemId, Number(items[0].average_cost || 0));
      const [transferItem] = await connection.query(
        'INSERT INTO stock_transfer_items (transfer_id, item_id, qty, unit_cost) VALUES (?, ?, ?, ?)',
        [result.insertId, itemId, quantity, transferUnitCost]
      );
      for (const batch of consumedBatches) {
        await connection.query(
          'INSERT INTO stock_transfer_batches (transfer_item_id, batch_no, expiry_date, quantity, unit_cost) VALUES (?, ?, ?, ?, ?)',
          [transferItem.insertId, batch.batchNo, batch.expiryDate, batch.quantity, batch.unitCost]
        );
      }
      await connection.query(
        'INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, unit_cost, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [itemId, items[0].name_en, 'Transfer', -quantity, balanceAfter, transferUnitCost, transferNo, fromBranch]
      );
    }
    await logActivity(connection, req.user.id, 'stock_transfer_dispatched', 'stock_transfer', result.insertId, { transferNo, fromBranch, toBranch });
    await connection.commit();
    res.status(201).json({ id: result.insertId, transferNo, status: 'In Transit' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

api.post('/inventory/transfers/:id/receive', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const transferId = Number(req.params.id);
    if (!Number.isInteger(transferId) || transferId < 1) return res.status(400).json({ message: 'Invalid transfer id' });
    await connection.beginTransaction();
    const [transfers] = await connection.query('SELECT * FROM stock_transfers WHERE id = ? AND company_id = ? FOR UPDATE', [transferId, req.companyId]);
    if (!transfers[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Transfer not found' });
    }
    const transfer = transfers[0];
    await assertBranchAccess(connection, req.user, transfer.to_branch);
    if (transfer.status !== 'In Transit') {
      await connection.rollback();
      return res.status(409).json({ message: 'Only in-transit transfers can be received' });
    }
    const [lines] = await connection.query(
      'SELECT * FROM stock_transfer_items WHERE transfer_id = ? AND company_id = ? ORDER BY item_id FOR UPDATE',
      [transferId, req.companyId]
    );
    if (!lines.length) throw stockError(409, 'This transfer has no items');

    for (const line of lines) {
      const [items] = await connection.query('SELECT * FROM items WHERE id = ? AND company_id = ? FOR UPDATE', [line.item_id, req.companyId]);
      if (!items[0]) throw stockError(404, `Item ID ${line.item_id} not found`);
      const [batches] = await connection.query(
        'SELECT * FROM stock_transfer_batches WHERE transfer_item_id = ? AND company_id = ? ORDER BY id FOR UPDATE',
        [line.id, req.companyId]
      );
      const batchQuantity = assertWholeQuantity(batches.reduce((sum, batch) => sum + Number(batch.quantity), 0));
      if (batchQuantity !== assertWholeQuantity(Number(line.qty))) {
        throw stockError(409, `Transfer batch quantities do not reconcile for ${items[0].name_en}`);
      }

      for (const batch of batches) {
        const received = await receiveBranchStock(
          connection,
          line.item_id,
          transfer.to_branch,
          Number(batch.quantity),
          Number(line.unit_cost || 0)
        );
        await connection.query(
          'INSERT INTO inventory_batches (item_id, branch, batch_no, expiry_date, qty_received, qty_remaining, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [line.item_id, transfer.to_branch, batch.batch_no, batch.expiry_date, batch.quantity, received.batchQuantity, batch.unit_cost]
        );
      }
      const balanceAfter = await getBranchStock(connection, line.item_id, transfer.to_branch);
      await connection.query(
        'INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, unit_cost, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [line.item_id, items[0].name_en, 'Transfer', Number(line.qty), balanceAfter, Number(line.unit_cost || 0), transfer.transfer_no, transfer.to_branch]
      );
    }

    await connection.query(
      "UPDATE stock_transfers SET status = 'Received', received_by = ?, received_at = CURRENT_TIMESTAMP WHERE id = ?",
      [req.user.id, transferId]
    );
    await logActivity(connection, req.user.id, 'stock_transfer_received', 'stock_transfer', transferId, { transferNo: transfer.transfer_no });
    await connection.commit();
    res.json({ ok: true, transferNo: transfer.transfer_no, status: 'Received' });
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
    const admin = hasPermission(req.user, 'approvals.manage');
    const [rows] = await pool.query(
      `SELECT p.*, u.name submitted_by_name, r.name reviewed_by_name FROM projects p
       JOIN users u ON u.id = p.submitted_by AND u.company_id = p.company_id
       LEFT JOIN users r ON r.id = p.reviewed_by AND r.company_id = p.company_id
       WHERE p.company_id = ?${admin ? '' : ' AND p.submitted_by = ?'} ORDER BY p.created_at DESC`,
      admin ? [req.companyId] : [req.companyId, req.user.id]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.post('/projects', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    if (!req.body.title?.trim()) return res.status(400).json({ message: 'Project title is required' });
    await connection.beginTransaction();
    const [result] = await connection.query('INSERT INTO projects (title, description, submitted_by) VALUES (?, ?, ?)', [req.body.title.trim(), req.body.description || '', req.user.id]);
    const reviewers = await getCompanyReviewers(connection, req.companyId);
    for (const reviewer of reviewers) await notify(connection, reviewer.id, 'project_submitted', 'New project submitted', `${req.user.name} submitted ${req.body.title}`, 'project', result.insertId);
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
    const [rows] = await connection.query('SELECT * FROM projects WHERE id = ? AND company_id = ? FOR UPDATE', [req.params.id, req.companyId]);
    if (!rows[0]) return res.status(404).json({ message: 'Project not found' });
    if (rows[0].status !== 'Pending Approval') {
      await connection.rollback();
      return res.status(409).json({ message: 'This project has already been reviewed' });
    }
    await connection.query('UPDATE projects SET status = ?, reviewed_by = ?, rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?', [status, req.user.id, status === 'Rejected' ? req.body.reason.trim() : null, req.params.id, req.companyId]);
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
    const [projects] = await pool.query('SELECT submitted_by FROM projects WHERE id = ? AND company_id = ?', [req.params.id, req.companyId]);
    if (!projects[0] || (!hasPermission(req.user, 'approvals.manage') && projects[0].submitted_by !== req.user.id)) return res.status(403).json({ message: 'Access denied' });
    const [rows] = await pool.query('SELECT * FROM project_files WHERE project_id = ? AND company_id = ? ORDER BY created_at DESC', [req.params.id, req.companyId]);
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
       LEFT JOIN projects p ON p.id = f.project_id AND p.company_id = f.company_id
       WHERE f.company_id = ? AND f.submitted_by = ?
       ORDER BY f.created_at DESC`,
      [req.companyId, req.user.id]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

api.post('/projects/:id/files', auth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const [projects] = await connection.query('SELECT * FROM projects WHERE id = ? AND company_id = ?', [req.params.id, req.companyId]);
    if (!projects[0] || (!hasPermission(req.user, 'approvals.manage') && projects[0].submitted_by !== req.user.id)) return res.status(403).json({ message: 'Access denied' });
    if (!req.body.fileName?.trim()) return res.status(400).json({ message: 'File name is required' });
    await connection.beginTransaction();
    const [result] = await connection.query('INSERT INTO project_files (project_id, file_name, file_url, submitted_by) VALUES (?, ?, ?, ?)', [
      req.params.id,
      req.body.fileName.trim(),
      req.body.fileUrl || null,
      req.user.id,
    ]);
    const reviewers = await getCompanyReviewers(connection, req.companyId);
    for (const reviewer of reviewers) await notify(connection, reviewer.id, 'file_submitted', 'New file submitted', `${req.user.name} submitted ${req.body.fileName}`, 'file', result.insertId);
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
      'SELECT f.*, p.title project_title, u.name submitted_by_name FROM project_files f LEFT JOIN projects p ON p.id = f.project_id AND p.company_id = f.company_id JOIN users u ON u.id = f.submitted_by AND u.company_id = f.company_id WHERE f.company_id = ? ORDER BY f.created_at DESC',
      [req.companyId]
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
    const [rows] = await connection.query('SELECT * FROM project_files WHERE id = ? AND company_id = ? FOR UPDATE', [req.params.id, req.companyId]);
    if (!rows[0]) return res.status(404).json({ message: 'File not found' });
    if (rows[0].status !== 'Pending Approval') {
      await connection.rollback();
      return res.status(409).json({ message: 'This file has already been reviewed' });
    }
    await connection.query('UPDATE project_files SET status = ?, reviewed_by = ?, rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?', [
      status,
      req.user.id,
      status === 'Rejected' ? req.body.reason.trim() : null,
      req.params.id,
      req.companyId,
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
    const isAdmin = hasPermission(req.user, 'approvals.manage');
    const [rows] = await pool.query(
      `SELECT l.*, u.name submitted_by_name FROM leave_requests l
       JOIN users u ON u.id = l.submitted_by AND u.company_id = l.company_id
       WHERE l.company_id = ?${isAdmin ? '' : ' AND l.submitted_by = ?'} ORDER BY l.created_at DESC`,
      isAdmin ? [req.companyId] : [req.companyId, req.user.id]
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
    const reviewers = await getCompanyReviewers(connection, req.companyId);
    for (const reviewer of reviewers) await notify(connection, reviewer.id, 'leave_submitted', 'New leave request', `${req.user.name} submitted a leave request`, 'leave', result.insertId);
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
    const [rows] = await connection.query('SELECT * FROM leave_requests WHERE id = ? AND company_id = ? FOR UPDATE', [req.params.id, req.companyId]);
    if (!rows[0]) return res.status(404).json({ message: 'Leave request not found' });
    if (rows[0].status !== 'Pending Approval') {
      await connection.rollback();
      return res.status(409).json({ message: 'This leave request has already been reviewed' });
    }
    await connection.query('UPDATE leave_requests SET status = ?, reviewed_by = ?, rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?', [
      status,
      req.user.id,
      status === 'Rejected' ? req.body.reason.trim() : null,
      req.params.id,
      req.companyId,
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
    const [rows] = await pool.query(
      'SELECT setting_value FROM company_settings WHERE company_id = ? AND setting_key = ?',
      [req.companyId, 'company']
    );
    const settings = rows[0] ? (typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value) : {};
    let branches = await getAuthorizedBranches(pool, req.user);
    if (!branches?.length && isSystemAdministrator(req.user)) {
      const [branchRows] = await pool.query(
        `SELECT branch FROM user_branch_access WHERE company_id = ?
         UNION SELECT branch FROM invoices WHERE company_id = ?
         UNION SELECT branch FROM item_branch_stock WHERE company_id = ?
         UNION SELECT branch FROM cash_registers WHERE company_id = ?
         UNION SELECT ? AS branch`,
        [req.companyId, req.companyId, req.companyId, req.companyId, String(settings.branch || 'Main Branch')]
      );
      branches = branchRows.map((row) => String(row.branch));
    }
    if (branches && branches.length) {
      const activeBranch = branches.find((branch) => branch.toLowerCase() === String(settings.branch || '').toLowerCase()) || branches[0];
      res.json({ ...settings, branch: activeBranch, availableBranches: branches });
      return;
    }
    res.json({ ...settings, availableBranches: [] });
  } catch (error) {
    next(error);
  }
});

api.put('/settings', auth, adminOnly, async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ message: 'Settings payload must be an object' });
    if (Object.hasOwn(req.body, 'policy')) {
      return res.status(400).json({ message: 'Policy settings are no longer configurable.' });
    }
    if (req.body.branch !== undefined) {
      if (typeof req.body.branch !== 'string' || !req.body.branch.trim() || req.body.branch.trim().length > 120) {
        return res.status(400).json({ message: 'Operating branch name must contain 1 to 120 characters.' });
      }
      req.body.branch = req.body.branch.trim();
    }
    const [existingRows] = await pool.query(
      'SELECT setting_value FROM company_settings WHERE company_id = ? AND setting_key = ?',
      [req.companyId, 'company']
    );
    const existingSettings = existingRows[0]
      ? (typeof existingRows[0].setting_value === 'string' ? JSON.parse(existingRows[0].setting_value) : existingRows[0].setting_value)
      : {};
    const settings = { ...existingSettings, ...req.body };
    await pool.query(
      `INSERT INTO company_settings (company_id, setting_key, setting_value) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [req.companyId, 'company', JSON.stringify(settings)]
    );
    invalidateInventoryPolicyCache();
    invalidateAccessPolicyCache();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

api.validatePurchaseOrder = validatePurchaseOrder;
api.validateItemAmounts = validateItemAmounts;
api.validateItemUnits = validateItemUnits;
api.normalizeItemUnits = normalizeItemUnits;
api.prepareVendorProfile = prepareVendorProfile;
module.exports = api;