const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const testDatabase = String(process.env.MYSQL_TEST_DATABASE || '').trim();
const testHost = String(process.env.MYSQL_TEST_HOST || '127.0.0.1').trim();
const testUser = String(process.env.MYSQL_TEST_USER || 'root').trim();
const testPassword = process.env.MYSQL_TEST_PASSWORD || '';
const testPort = String(process.env.MYSQL_TEST_PORT || '3306').trim();
const safeTestDatabase = /^[A-Za-z0-9_]+$/.test(testDatabase)
  && /(^test_|_test(?:_|$))/i.test(testDatabase)
  && testDatabase.toLowerCase() !== 'taxation_system';

if (!testDatabase) {
  test('MySQL stock transaction integration tests (set MYSQL_TEST_DATABASE)', { skip: 'MYSQL_TEST_DATABASE is not configured' }, () => {});
} else if (!safeTestDatabase) {
  test('MySQL stock transaction integration tests (isolated database required)', () => {
    assert.fail('MYSQL_TEST_DATABASE must be a disposable database name containing "test" and only letters, numbers, or underscores');
  });
} else {
  process.env.NODE_ENV = 'test';
  process.env.MYSQL_DATABASE = testDatabase;
  process.env.MYSQL_HOST = testHost;
  process.env.MYSQL_USER = testUser;
  process.env.MYSQL_PASSWORD = testPassword;
  process.env.MYSQL_PORT = testPort;
  const jwt = require('jsonwebtoken');
  const app = require('../src/app');
  const { pool, initializeDatabase } = require('../src/db');
  const { resolveJwtSecret } = require('../src/config/runtime');
  const { invalidateInventoryPolicyCache } = require('../src/services/inventoryPolicy');

  let server;
  let baseUrl;

  async function request(path, token, body) {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  async function get(path, token) {
    const response = await fetch(`${baseUrl}/api${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: await response.json() };
  }

  async function createActor(branches, role = 'user') {
    const name = `Stock Test ${crypto.randomUUID()}`;
    const [result] = await pool.query(
      'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, `stock_${crypto.randomUUID().replace(/-/g, '')}`, 'integration-test-only', role]
    );
    for (const branch of branches) {
      await pool.query('INSERT INTO user_branch_access (user_id, branch) VALUES (?, ?)', [result.insertId, branch]);
    }
    return jwt.sign({ id: result.insertId, name, role }, resolveJwtSecret(), { expiresIn: '5m' });
  }

  async function createItem(branch, quantity) {
    const barcode = `IT-${crypto.randomUUID()}`;
    const [result] = await pool.query(
      'INSERT INTO items (barcode, name_en, base_unit, qty_on_hand, purchase_cost, average_cost, units) VALUES (?, ?, ?, 0, 0.25, 0.25, ?)',
      [barcode, `Stock Integration ${barcode}`, 'Each', JSON.stringify([{ name: 'Each', ratio: 1, retailPrice: 1 }])]
    );
    await pool.query(
      'INSERT INTO item_branch_stock (item_id, branch, qty_on_hand, avg_cost) VALUES (?, ?, ?, 0.25)',
      [result.insertId, branch, quantity]
    );
    await pool.query('UPDATE items SET qty_on_hand = ? WHERE id = ?', [quantity, result.insertId]);
    if (quantity > 0) {
      await pool.query(
        'INSERT INTO inventory_batches (item_id, branch, batch_no, qty_received, qty_remaining, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
        [result.insertId, branch, `B-${barcode}`, quantity, quantity, 0.25]
      );
    }
    return result.insertId;
  }

  async function itemState(itemId, branch) {
    const [[items]] = await pool.query('SELECT qty_on_hand FROM items WHERE id = ?', [itemId]);
    const [[stock]] = await pool.query(
      'SELECT qty_on_hand FROM item_branch_stock WHERE item_id = ? AND branch = ?',
      [itemId, branch]
    );
    const [batches] = await pool.query(
      'SELECT qty_remaining FROM inventory_batches WHERE item_id = ? AND branch = ?',
      [itemId, branch]
    );
    return {
      item: Number(items.qty_on_hand),
      branch: Number(stock?.qty_on_hand || 0),
      batches: batches.reduce((total, batch) => total + Number(batch.qty_remaining), 0),
    };
  }

  async function setInventoryPolicy(overrides) {
    const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['company']);
    const settings = typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value;
    settings.policy = settings.policy || {};
    settings.policy.inventory = {
      negativeStockBlocked: true,
      adjustmentRequiresAdmin: true,
      auditNotesRequired: true,
      ...overrides,
    };
    await pool.query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [JSON.stringify(settings), 'company']);
    invalidateInventoryPolicyCache();
  }

  const testBranch = () => `Test-${crypto.randomUUID().slice(0, 8)}`;

  test.before(async () => {
    await initializeDatabase();
    server = app.listen(0);
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  test.after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  });

  test('aggregates duplicate sale lines and rejects the entire over-stock sale', async () => {
    await setInventoryPolicy({});
    const branch = testBranch();
    const token = await createActor([branch]);
    const itemId = await createItem(branch, 1);

    const result = await request('/sales', token, {
      branch,
      paymentMethod: 'cash',
      receivedUSD: 100,
      lines: [
        { itemId, unit: 'Each', qty: 1, unitPrice: 1 },
        { itemId, unit: 'Each', qty: 1, unitPrice: 1 },
      ],
    });

    assert.equal(result.status, 409);
    assert.match(result.body.message, /insufficient stock/i);
    assert.deepEqual(await itemState(itemId, branch), { item: 1, branch: 1, batches: 1 });
    const [[invoiceLines]] = await pool.query('SELECT COUNT(*) AS count FROM invoice_lines WHERE item_id = ?', [itemId]);
    const [[movements]] = await pool.query('SELECT COUNT(*) AS count FROM stock_transactions WHERE item_id = ?', [itemId]);
    assert.equal(Number(invoiceLines.count), 0);
    assert.equal(Number(movements.count), 0);
  });

  test('rejects fractional sale quantities and deducts whole quantities from stock and FIFO batches', async () => {
    await setInventoryPolicy({});
    const branch = testBranch();
    const token = await createActor([branch]);
    const itemId = await createItem(branch, 1);

    const result = await request('/sales', token, {
      branch,
      paymentMethod: 'cash',
      receivedUSD: 100,
      lines: [{ itemId, unit: 'Each', qty: 0.5, unitPrice: 1 }],
    });

    assert.equal(result.status, 400);
    assert.match(result.body.message, /whole number/);
    assert.deepEqual(await itemState(itemId, branch), { item: 1, branch: 1, batches: 1 });
    const validSale = await request('/sales', token, {
      branch,
      paymentMethod: 'cash',
      receivedUSD: 100,
      lines: [{ itemId, unit: 'Each', qty: 1, unitPrice: 1 }],
    });
    assert.equal(validSale.status, 201);
    assert.deepEqual(await itemState(itemId, branch), { item: 0, branch: 0, batches: 0 });
    const [[line]] = await pool.query(
      'SELECT il.qty, il.cogs_unit_cost, il.total_cogs FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id WHERE i.invoice_no = ?',
      [validSale.body.id]
    );
    const [[movement]] = await pool.query(
      "SELECT qty, balance_after FROM stock_transactions WHERE item_id = ? AND type = 'Sale'",
      [itemId]
    );
    assert.equal(Number(line.qty), 1);
    assert.equal(Number(line.cogs_unit_cost), 0.25);
    assert.equal(Number(line.total_cogs), 0.25);
    assert.equal(Number(movement.qty), -1);
    assert.equal(Number(movement.balance_after), 0);

    const [[saleDateRow]] = await pool.query(
      'SELECT DATE_FORMAT(created_at, ?) AS sale_date FROM invoices WHERE invoice_no = ?',
      ['%Y-%m-%d', result.body.id]
    );
    const report = await get(
      `/reports/inventory-valuation?branch=${encodeURIComponent(branch)}&startDate=${saleDateRow.sale_date}&endDate=${saleDateRow.sale_date}`,
      token
    );
    assert.equal(report.status, 200);
    const reportItem = report.body.items.find((item) => Number(item.item_id) === itemId);
    assert.equal(reportItem.cogs_amount, 0.25);
    assert.equal(reportItem.qty_on_hand, 0);
    assert.equal(report.body.summary.cogs, 0.25);
    assert.equal(report.body.summary.is_balanced, null);

    const invalidDate = await get(`/reports/inventory-valuation?branch=${encodeURIComponent(branch)}&startDate=2026-02-30`, token);
    assert.equal(invalidDate.status, 400);
  });

  test('keeps dispatched stock in transit and credits the destination with a dual ledger on receipt', async () => {
    await setInventoryPolicy({});
    const fromBranch = testBranch();
    const toBranch = testBranch();
    const dispatchToken = await createActor([fromBranch]);
    const receiveToken = await createActor([toBranch]);
    const itemId = await createItem(fromBranch, 2);

    const dispatched = await request('/inventory/transfers', dispatchToken, {
      fromBranch,
      toBranch,
      items: [{ itemId, qty: 1 }],
    });
    assert.equal(dispatched.status, 201);
    assert.equal(dispatched.body.status, 'In Transit');
    assert.deepEqual(await itemState(itemId, fromBranch), { item: 1, branch: 1, batches: 1 });
    const [[destinationBefore]] = await pool.query(
      'SELECT COUNT(*) AS count FROM item_branch_stock WHERE item_id = ? AND branch = ?',
      [itemId, toBranch]
    );
    assert.equal(Number(destinationBefore.count), 0);

    const received = await request(`/inventory/transfers/${dispatched.body.id}/receive`, receiveToken, {});
    assert.equal(received.status, 200);
    assert.equal(received.body.status, 'Received');
    assert.deepEqual(await itemState(itemId, toBranch), { item: 1, branch: 1, batches: 1 });
    const [movements] = await pool.query(
      'SELECT qty, branch FROM stock_transactions WHERE item_id = ? AND reference = ? ORDER BY id',
      [itemId, dispatched.body.transferNo]
    );
    assert.deepEqual(movements.map((movement) => [Number(movement.qty), movement.branch]), [
      [-1, fromBranch],
      [1, toBranch],
    ]);
  });

  test('values branch transfers at source moving-average cost, not FIFO batch-layer cost', async () => {
    await setInventoryPolicy({});
    const fromBranch = testBranch();
    const toBranch = testBranch();
    const dispatchToken = await createActor([fromBranch]);
    const receiveToken = await createActor([toBranch]);
    const itemId = await createItem(fromBranch, 2);
    await pool.query('UPDATE item_branch_stock SET avg_cost = 0.5 WHERE item_id = ? AND branch = ?', [itemId, fromBranch]);
    await pool.query('UPDATE items SET average_cost = 0.5, purchase_cost = 0.5 WHERE id = ?', [itemId]);
    await pool.query(
      'UPDATE inventory_batches SET qty_received = 1, qty_remaining = 1, unit_cost = 0.25 WHERE item_id = ?',
      [itemId]
    );
    await pool.query(
      'INSERT INTO inventory_batches (item_id, branch, batch_no, qty_received, qty_remaining, unit_cost) VALUES (?, ?, ?, 1, 1, 0.75)',
      [itemId, fromBranch, `HIGH-COST-${crypto.randomUUID()}`]
    );

    const dispatched = await request('/inventory/transfers', dispatchToken, {
      fromBranch,
      toBranch,
      items: [{ itemId, qty: 1 }],
    });
    assert.equal(dispatched.status, 201);
    const [[transferItem]] = await pool.query(
      'SELECT unit_cost FROM stock_transfer_items WHERE transfer_id = ? AND item_id = ?',
      [dispatched.body.id, itemId]
    );
    assert.equal(Number(transferItem.unit_cost), 0.5);

    const received = await request(`/inventory/transfers/${dispatched.body.id}/receive`, receiveToken, {});
    assert.equal(received.status, 200);
    const [[destinationStock]] = await pool.query(
      'SELECT qty_on_hand, avg_cost FROM item_branch_stock WHERE item_id = ? AND branch = ?',
      [itemId, toBranch]
    );
    assert.equal(Number(destinationStock.qty_on_hand), 1);
    assert.equal(Number(destinationStock.avg_cost), 0.5);
    const [movements] = await pool.query(
      'SELECT qty, unit_cost FROM stock_transactions WHERE item_id = ? AND reference = ? ORDER BY id',
      [itemId, dispatched.body.transferNo]
    );
    assert.deepEqual(movements.map((movement) => [Number(movement.qty), Number(movement.unit_cost)]), [
      [-1, 0.5],
      [1, 0.5],
    ]);
  });

  test('rolls back invoice, item stock, branch stock, and FIFO batches on a mid-sale database failure', async () => {
    await setInventoryPolicy({});
    const branch = testBranch();
    const token = await createActor([branch]);
    const itemId = await createItem(branch, 1);
    const triggerName = `test_fail_sale_${crypto.randomUUID().replace(/-/g, '')}`;
    await pool.query(
      `CREATE TRIGGER \`${triggerName}\` BEFORE INSERT ON stock_transactions
       FOR EACH ROW
       BEGIN
         IF NEW.item_id = ${itemId} AND NEW.type = 'Sale' THEN
           SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced stock integration failure';
         END IF;
       END`
    );

    try {
      const result = await request('/sales', token, {
        branch,
        paymentMethod: 'cash',
        receivedUSD: 100,
        lines: [{ itemId, unit: 'Each', qty: 1, unitPrice: 1 }],
      });
      assert.equal(result.status, 500);
      assert.deepEqual(await itemState(itemId, branch), { item: 1, branch: 1, batches: 1 });
      const [[invoiceLines]] = await pool.query('SELECT COUNT(*) AS count FROM invoice_lines WHERE item_id = ?', [itemId]);
      const [[movements]] = await pool.query('SELECT COUNT(*) AS count FROM stock_transactions WHERE item_id = ?', [itemId]);
      assert.equal(Number(invoiceLines.count), 0);
      assert.equal(Number(movements.count), 0);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS \`${triggerName}\``);
    }
  });

  test('applies branch access and live adjustment and negative-stock policies', async () => {
    await setInventoryPolicy({ adjustmentRequiresAdmin: false, auditNotesRequired: true, negativeStockBlocked: true });
    const branch = testBranch();
    const otherBranch = testBranch();
    const token = await createActor([branch]);
    const itemId = await createItem(branch, 0);

    const forbidden = await request('/stock/adjustments', token, {
      itemId,
      quantity: 1,
      notes: 'opening',
      branch: otherBranch,
    });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.message, 'Forbidden: Unauthorized branch access');

    const missingNotes = await request('/stock/adjustments', token, { itemId, quantity: 1, branch });
    assert.equal(missingNotes.status, 400);
    assert.equal(missingNotes.body.message, 'Adjustment notes are required');

    await setInventoryPolicy({ adjustmentRequiresAdmin: false, auditNotesRequired: false, negativeStockBlocked: false });
    const adjustment = await request('/stock/adjustments', token, { itemId, quantity: 1, branch });
    assert.equal(adjustment.status, 200);
    assert.deepEqual(await itemState(itemId, branch), { item: 1, branch: 1, batches: 1 });
    const adjustmentReport = await get(`/reports/inventory-valuation?branch=${encodeURIComponent(branch)}`, token);
    const adjustmentMovement = adjustmentReport.body.movements.find((movement) => movement.type === 'Adjustment');
    assert.equal(adjustmentMovement.unit_cost, 0.25);
    assert.equal(adjustmentMovement.movement_cost, 0.25);
    assert.equal(adjustmentReport.body.summary.total_available_goods_cost, 0.25);
    assert.equal(adjustmentReport.body.summary.is_balanced, true);

    const oversold = await request('/sales', token, {
      branch,
      paymentMethod: 'cash',
      receivedUSD: 100,
      lines: [{ itemId, unit: 'Each', qty: 2, unitPrice: 1 }],
    });
    assert.equal(oversold.status, 201);
    assert.deepEqual(await itemState(itemId, branch), { item: -1, branch: -1, batches: 0 });
  });

  test('nets incoming adjustment stock against a negative branch deficit before opening the FIFO batch', async () => {
    await setInventoryPolicy({ adjustmentRequiresAdmin: false, auditNotesRequired: false, negativeStockBlocked: false });
    const branch = testBranch();
    const token = await createActor([branch]);
    const itemId = await createItem(branch, 0);

    const writeOff = await request('/stock/adjustments', token, {
      itemId,
      quantity: -3,
      notes: 'Backorder deficit',
      branch,
    });
    assert.equal(writeOff.status, 200);
    assert.deepEqual(await itemState(itemId, branch), { item: -3, branch: -3, batches: 0 });

    const receipt = await request('/stock/adjustments', token, {
      itemId,
      quantity: 10,
      notes: 'Stock received',
      branch,
    });
    assert.equal(receipt.status, 200);
    assert.deepEqual(await itemState(itemId, branch), { item: 7, branch: 7, batches: 7 });
    const [[batch]] = await pool.query(
      'SELECT qty_received, qty_remaining FROM inventory_batches WHERE item_id = ? AND branch = ? ORDER BY id DESC LIMIT 1',
      [itemId, branch]
    );
    assert.equal(Number(batch.qty_received), 10);
    assert.equal(Number(batch.qty_remaining), 7);

    const partialBranch = testBranch();
    const partialToken = await createActor([partialBranch]);
    const partiallyRecoveredItemId = await createItem(partialBranch, 0);
    const partialWriteOff = await request('/stock/adjustments', partialToken, {
      itemId: partiallyRecoveredItemId,
      quantity: -3,
      notes: 'Backorder deficit',
      branch: partialBranch,
    });
    assert.equal(partialWriteOff.status, 200);
    const partialReceipt = await request('/stock/adjustments', partialToken, {
      itemId: partiallyRecoveredItemId,
      quantity: 2,
      notes: 'Partial receipt',
      branch: partialBranch,
    });
    assert.equal(partialReceipt.status, 200);
    assert.deepEqual(await itemState(partiallyRecoveredItemId, partialBranch), {
      item: -1,
      branch: -1,
      batches: 0,
    });
  });

  test('nets direct batch receipt against a negative branch deficit', async () => {
    await setInventoryPolicy({ negativeStockBlocked: false });
    const branch = testBranch();
    const token = await createActor([branch], 'admin');
    const itemId = await createItem(branch, 0);

    const writeOff = await request('/stock/adjustments', token, {
      itemId,
      quantity: -3,
      notes: 'Backorder deficit',
      branch,
    });
    assert.equal(writeOff.status, 200);
    assert.deepEqual(await itemState(itemId, branch), { item: -3, branch: -3, batches: 0 });

    const batchNo = `DIRECT-${crypto.randomUUID()}`;
    const receipt = await request('/inventory/batches', token, {
      itemId,
      quantity: 10,
      batchNo,
      branch,
    });
    assert.equal(receipt.status, 201);
    assert.deepEqual(await itemState(itemId, branch), { item: 7, branch: 7, batches: 7 });
    const [[batch]] = await pool.query(
      'SELECT qty_received, qty_remaining FROM inventory_batches WHERE item_id = ? AND branch = ? AND batch_no = ?',
      [itemId, branch, batchNo]
    );
    assert.equal(Number(batch.qty_received), 10);
    assert.equal(Number(batch.qty_remaining), 7);
    const [[movement]] = await pool.query(
      'SELECT qty, balance_after FROM stock_transactions WHERE item_id = ? AND reference = ?',
      [itemId, batchNo]
    );
    assert.equal(Number(movement.qty), 10);
    assert.equal(Number(movement.balance_after), 7);
  });

  test('serializes concurrent adjustments and limits stock reads to assigned branches', async () => {
    await setInventoryPolicy({ adjustmentRequiresAdmin: false, auditNotesRequired: false });
    const branch = testBranch();
    const unauthorizedBranch = testBranch();
    const token = await createActor([branch]);
    const itemId = await createItem(branch, 0);

    const [firstAdjustment, secondAdjustment] = await Promise.all([
      request('/stock/adjustments', token, { itemId, quantity: 1, notes: 'Concurrent A', branch }),
      request('/stock/adjustments', token, { itemId, quantity: 2, notes: 'Concurrent B', branch }),
    ]);
    assert.equal(firstAdjustment.status, 200);
    assert.equal(secondAdjustment.status, 200);
    assert.deepEqual(await itemState(itemId, branch), { item: 3, branch: 3, batches: 3 });

    const otherItemId = await createItem(unauthorizedBranch, 1);
    for (const [stockItemId, movementBranch] of [[itemId, branch], [otherItemId, unauthorizedBranch]]) {
      await pool.query(
        'INSERT INTO stock_transactions (item_id, item_name, type, qty, balance_after, reference, branch) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [stockItemId, `Stock Integration ${stockItemId}`, 'Adjustment', 1, 1, 'read-scope-test', movementBranch]
      );
    }

    const itemReadForbidden = await get(`/items?branch=${encodeURIComponent(unauthorizedBranch)}`, token);
    const movementReadForbidden = await get(`/transactions?branch=${encodeURIComponent(unauthorizedBranch)}`, token);
    assert.equal(itemReadForbidden.status, 403);
    assert.equal(movementReadForbidden.status, 403);

    const scopedMovements = await get('/transactions', token);
    assert.equal(scopedMovements.status, 200);
    assert.ok(scopedMovements.body.data.every((movement) => movement.branch === branch));
    const unauthorizedValuation = await get(`/reports/inventory-valuation?branch=${encodeURIComponent(unauthorizedBranch)}`, token);
    assert.equal(unauthorizedValuation.status, 403);
    const scopedValuation = await get('/reports/inventory-valuation', token);
    assert.equal(scopedValuation.status, 200);
    const unauthorizedItem = scopedValuation.body.items.find((row) => Number(row.item_id) === otherItemId);
    assert.equal(Number(unauthorizedItem.qty_on_hand), 0);
  });

  test('allocates landed purchase costs, snapshots AVCO COGS, and reports inventory valuation', async () => {
    await setInventoryPolicy({});
    const branch = testBranch();
    const token = await createActor([branch], 'admin');
    const vendorName = `AVCO Test ${crypto.randomUUID()}`;
    const [vendor] = await pool.query(
      'INSERT INTO vendors (name, phone, credit_limit, note) VALUES (?, ?, 0, ?)',
      [vendorName, '', 'Inventory costing integration fixture']
    );
    const barcode = `AVCO-${crypto.randomUUID()}`;
    const createdItem = await request('/items', token, {
      nameEn: 'Milk Star Grow 180ml*24',
      barcode,
      category: 'Dairy',
      baseUnit: 'Each',
      retailPrice: 0.7632,
      purchaseCost: 0.52,
      markupAmount: 0.1931,
      autoRecalculatePrice: true,
      qtyOnHand: 0,
      branch,
    });
    assert.equal(createdItem.status, 201);
    const itemId = Number(createdItem.body.id);
    const receivePurchase = async ({ date, quantity, unitPrice, handlingCost, documentationCost }) => {
      const order = await request('/purchase-orders', token, {
        vendorId: vendor.insertId,
        vendorName,
        orderDate: date,
        expectedDate: date,
        handlingCost,
        documentationCost,
        items: [{
          itemId,
          productName: 'Milk Star Grow 180ml*24',
          qty: quantity,
          unitPrice,
          deliveryDate: date,
          deliveryPrice: 0,
        }],
      });
      assert.equal(order.status, 201);
      const received = await request(`/purchase-orders/${order.body.id}/receive`, token, { branch });
      assert.equal(received.status, 200);
      return order.body.orderId;
    };

    const firstOrderId = await receivePurchase({
      date: '2026-10-01',
      quantity: 100,
      unitPrice: 0.52,
      handlingCost: 6.96,
      documentationCost: 4.64,
    });
    const [[firstCost]] = await pool.query(
      'SELECT unit_handling_cost, unit_doc_cost, effective_unit_cost FROM purchase_order_items WHERE purchase_order_id = ?',
      [firstOrderId]
    );
    assert.equal(Number(firstCost.unit_handling_cost).toFixed(4), '0.0696');
    assert.equal(Number(firstCost.unit_doc_cost).toFixed(4), '0.0464');
    assert.equal(Number(firstCost.effective_unit_cost).toFixed(4), '0.6360');
    let [[stock]] = await pool.query('SELECT qty_on_hand, avg_cost FROM item_branch_stock WHERE item_id = ? AND branch = ?', [itemId, branch]);
    assert.equal(Number(stock.qty_on_hand), 100);
    assert.equal(Number(stock.avg_cost).toFixed(4), '0.6360');

    for (const qty of [40, 20]) {
      const sale = await request('/sales', token, {
        branch,
        paymentMethod: 'cash',
        receivedUSD: 100,
        lines: [{ itemId, unit: 'Each', qty, unitPrice: 0.7632 }],
      });
      assert.equal(sale.status, 201);
    }
    [[stock]] = await pool.query('SELECT qty_on_hand, avg_cost FROM item_branch_stock WHERE item_id = ? AND branch = ?', [itemId, branch]);
    assert.equal(Number(stock.qty_on_hand), 40);
    assert.equal(Number(stock.avg_cost).toFixed(4), '0.6360');

    const secondOrderId = await receivePurchase({
      date: '2026-10-10',
      quantity: 50,
      unitPrice: 0.78,
      handlingCost: 5.57,
      documentationCost: 3.71,
    });
    const [[secondCost]] = await pool.query(
      'SELECT effective_unit_cost FROM purchase_order_items WHERE purchase_order_id = ?',
      [secondOrderId]
    );
    assert.equal(Number(secondCost.effective_unit_cost).toFixed(4), '0.9656');
    [[stock]] = await pool.query(
      'SELECT bs.qty_on_hand, bs.avg_cost, i.purchase_cost, i.average_cost FROM item_branch_stock bs JOIN items i ON i.id = bs.item_id WHERE bs.item_id = ? AND bs.branch = ?',
      [itemId, branch]
    );
    assert.equal(Number(stock.qty_on_hand), 90);
    assert.equal(Number(stock.avg_cost).toFixed(4), '0.8191');
    assert.equal(Number(stock.average_cost).toFixed(4), '0.8191');
    assert.equal(Number(stock.purchase_cost).toFixed(4), '0.8191');

    const [[saleCosts]] = await pool.query(
      "SELECT SUM(il.qty_base) AS sold, SUM(il.qty_base * il.unit_cost_at_sale) AS cogs, SUM(il.qty * il.unit_price) AS sales FROM invoice_lines il JOIN invoices inv ON inv.id = il.invoice_id WHERE il.item_id = ? AND inv.branch = ? AND inv.status = 'Paid'",
      [itemId, branch]
    );
    assert.equal(Number(saleCosts.sold), 60);
    assert.equal(Number(saleCosts.cogs).toFixed(2), '38.16');
    assert.equal(Number(saleCosts.sales).toFixed(3), '45.792');

    const valuation = await get(`/reports/inventory-valuation?branch=${encodeURIComponent(branch)}`, token);
    assert.equal(valuation.status, 200);
    const row = valuation.body.items.find((entry) => Number(entry.item_id) === itemId);
    assert.ok(row);
    assert.equal(Number(row.total_qty_sold), 60);
    assert.equal(Number(row.cogs_amount).toFixed(2), '38.16');
    assert.equal(Number(row.sales_amount).toFixed(2), '45.79');
    assert.equal(Number(row.gross_profit).toFixed(2), '7.63');
    assert.equal(Number(row.total_stock_value).toFixed(2), '73.72');
    assert.equal(Number(row.total_purchased_qty), 150);
    assert.equal(Number(row.total_landed_cost).toFixed(2), '111.88');
    assert.equal(Number(valuation.body.summary.total_purchased_qty), 150);
    assert.equal(Number(valuation.body.summary.total_landed_cost).toFixed(2), '111.88');
    assert.equal(Number(valuation.body.summary.total_sold_qty), 60);
    assert.equal(Number(valuation.body.summary.gross_revenue).toFixed(2), '45.79');
    assert.equal(Number(valuation.body.summary.ending_stock_qty), 90);
    assert.equal(Number(valuation.body.summary.ending_stock_value).toFixed(2), '73.72');
    assert.equal(Number(valuation.body.summary.cogs).toFixed(2), '38.16');
    assert.equal(Number(valuation.body.summary.gross_profit).toFixed(2), '7.63');
    const [[repricedItem]] = await pool.query('SELECT retail_price FROM items WHERE id = ?', [itemId]);
    assert.equal(Number(repricedItem.retail_price).toFixed(4), '1.1587');
  });

  test('matches the workbook purchase, sales, and Stock Costs schedule using full-precision landed cost', async () => {
    await setInventoryPolicy({});
    const branch = testBranch();
    const token = await createActor([branch], 'admin');
    const vendorName = `Workbook Cost Test ${crypto.randomUUID()}`;
    const [vendor] = await pool.query(
      'INSERT INTO vendors (name, phone, credit_limit, note) VALUES (?, ?, 0, ?)',
      [vendorName, '', 'Google Sheets stock valuation fixture']
    );
    const products = [
      { name: 'Milk Star Grow 180ml*24', purchases: [[100, 0.52], [50, 0.78], [150, 0.6864]], sales: [40, 20, 30, 30, 75], price: 0.76, endingQty: 105, endingValue: 83.19, endingAverage: 0.7923 },
      { name: 'Snack chip Star', purchases: [[300, 1.30], [150, 1.95], [450, 1.716]], sales: [120, 60, 90, 90, 225], price: 1.91, endingQty: 315, endingValue: 623.91, endingAverage: 1.9807 },
      { name: 'Baby Food Pasta Rice100g', purchases: [[250, 2.90], [125, 4.35], [375, 3.828]], sales: [100, 50, 75, 75, 188], price: 4.26, endingQty: 262, endingValue: 1157.62, endingAverage: 4.4184 },
      { name: 'Kidsnack Snack Kemy Grin 150g', purchases: [[150, 3.30], [75, 4.95], [225, 4.356]], sales: [60, 30, 45, 45, 112], price: 4.84, endingQty: 158, endingValue: 794.40, endingAverage: 5.0278 },
      { name: 'Baby Food Snack kemy BeBe Grain 40g', purchases: [[200, 2.90], [100, 4.35], [300, 3.828]], sales: [80, 40, 60, 60, 150], price: 4.26, endingQty: 210, endingValue: 927.87, endingAverage: 4.4184 },
    ];
    for (const product of products) {
      product.itemId = await createItem(branch, 0);
      await pool.query(
        'UPDATE items SET name_en = ?, purchase_cost = ?, average_cost = 0, retail_price = ?, units = ? WHERE id = ?',
        [product.name, product.purchases[0][1], product.price, JSON.stringify([{ name: 'Each', ratio: 1, retailPrice: product.price }]), product.itemId]
      );
      await pool.query('UPDATE item_branch_stock SET avg_cost = 0 WHERE item_id = ? AND branch = ?', [product.itemId, branch]);
    }

    const receivePurchase = async (purchaseIndex, date, handlingCost, documentationCost) => {
      const order = await request('/purchase-orders', token, {
        vendorId: vendor.insertId,
        vendorName,
        orderDate: date,
        expectedDate: date,
        handlingCost,
        documentationCost,
        items: products.map((product) => ({
          itemId: product.itemId,
          productName: product.name,
          qty: product.purchases[purchaseIndex][0],
          unitPrice: product.purchases[purchaseIndex][1],
          deliveryDate: date,
          deliveryPrice: 0,
        })),
      });
      assert.equal(order.status, 201, JSON.stringify(order.body));
      const received = await request(`/purchase-orders/${order.body.id}/receive`, token, { branch });
      assert.equal(received.status, 200, JSON.stringify(received.body));
      return order.body.orderId;
    };
    const recordSales = async (saleIndex, date) => {
      const sale = await request('/sales', token, {
        branch,
        paymentMethod: 'cash',
        receivedUSD: 5000,
        lines: products.map((product) => ({
          itemId: product.itemId,
          unit: 'Each',
          qty: product.sales[saleIndex],
          unitPrice: product.price,
        })),
      });
      assert.equal(sale.status, 201, `${date}: ${JSON.stringify(sale.body)}`);
    };

    const firstOrderId = await receivePurchase(0, '2026-10-01', 300, 200);
    await recordSales(0, '2026-10-02');
    await recordSales(1, '2026-10-05');
    const secondOrderId = await receivePurchase(1, '2026-10-10', 200, 200);
    await recordSales(2, '2026-10-12');
    await recordSales(3, '2026-10-20');
    const thirdOrderId = await receivePurchase(2, '2026-10-25', 400, 250);
    await recordSales(4, '2026-10-27');

    const [[firstPurchaseCost]] = await pool.query(
      'SELECT unit_handling_cost, unit_doc_cost, effective_unit_cost FROM purchase_order_items WHERE purchase_order_id = ? AND item_id = ?',
      [firstOrderId, products[0].itemId]
    );
    assert.equal(Number(firstPurchaseCost.unit_handling_cost).toFixed(6), '0.069581');
    assert.equal(Number(firstPurchaseCost.unit_doc_cost).toFixed(6), '0.046387');
    assert.equal(Number(firstPurchaseCost.effective_unit_cost).toFixed(6), '0.635968');
    const [[secondPurchaseCost]] = await pool.query(
      'SELECT effective_unit_cost FROM purchase_order_items WHERE purchase_order_id = ? AND item_id = ?',
      [secondOrderId, products[0].itemId]
    );
    assert.equal(Number(secondPurchaseCost.effective_unit_cost).toFixed(6), '0.965549');
    const [[thirdPurchaseCost]] = await pool.query(
      'SELECT effective_unit_cost FROM purchase_order_items WHERE purchase_order_id = ? AND item_id = ?',
      [thirdOrderId, products[0].itemId]
    );
    assert.equal(Number(thirdPurchaseCost.effective_unit_cost).toFixed(6), '0.786906');

    for (const product of products) {
      const state = await itemState(product.itemId, branch);
      assert.equal(state.item, product.endingQty, product.name);
      assert.equal(state.branch, product.endingQty, product.name);
      assert.equal(state.batches, product.endingQty, product.name);
    }
    const valuation = await get(`/reports/inventory-valuation?branch=${encodeURIComponent(branch)}`, token);
    assert.equal(valuation.status, 200);
    for (const product of products) {
      const row = valuation.body.items.find((entry) => Number(entry.item_id) === product.itemId);
      assert.ok(row, product.name);
      assert.equal(Number(row.qty_on_hand), product.endingQty, product.name);
      assert.equal(Number(row.moving_avg_cost).toFixed(4), product.endingAverage.toFixed(4), product.name);
      assert.equal(Number(row.total_stock_value).toFixed(2), product.endingValue.toFixed(2), product.name);
    }
    assert.equal(Number(valuation.body.summary.total_purchased_qty), 3000);
    assert.equal(Number(valuation.body.summary.total_landed_cost).toFixed(2), '9912.66');
    assert.equal(Number(valuation.body.summary.total_sold_qty), 1950);
    assert.equal(Number(valuation.body.summary.gross_revenue).toFixed(2), '6419.11');
    assert.equal(Number(valuation.body.summary.ending_stock_qty), 1050);
    assert.equal(Number(valuation.body.summary.ending_stock_value).toFixed(2), '3586.98');
    assert.equal(Number(valuation.body.summary.total_available_goods_cost).toFixed(2), '9912.66');
    assert.equal(Number(valuation.body.summary.other_stock_outflow_cost).toFixed(2), '0.00');
    assert.equal(Number(valuation.body.summary.cogs).toFixed(2), '6325.68');
    assert.equal(Number(valuation.body.summary.gross_profit).toFixed(2), '93.43');
    assert.equal(valuation.body.summary.is_balanced, true);
  });
}
