const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs/promises');
const path = require('path');

const dbConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'taxation_system',
};

// 1. Initial pool export
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  multipleStatements: true,
});

async function ensureDatabaseExists() {
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
  });

  const dbName = dbConfig.database.replace(/`/g, '');
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.end();
}

async function addColumnIfMissing(tableName, columnName, definition) {
  const [columns] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbConfig.database, tableName, columnName]
  );
  if (Number(columns[0].count) === 0) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function columnExists(tableName, columnName) {
  const [columns] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbConfig.database, tableName, columnName]
  );
  return Number(columns[0].count) > 0;
}

async function addUniqueIndexIfMissing(tableName, indexName, columnName) {
  const [indexes] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbConfig.database, tableName, indexName]
  );
  if (Number(indexes[0].count) === 0) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD UNIQUE INDEX \`${indexName}\` (\`${columnName}\`)`);
  }
}

async function initializeDatabase() {
  const isProd = process.env.NODE_ENV === 'production';
  const allowAutoMigration = String(process.env.ALLOW_DB_AUTOMIGRATION || '').trim().toLowerCase();
  const isMigrationAllowed = allowAutoMigration === 'true' || allowAutoMigration === '1' || !isProd;

  if (isProd && !isMigrationAllowed) {
    throw new Error('Production database auto-migration is disabled. Set ALLOW_DB_AUTOMIGRATION=true once to apply required schema updates.');
  }

  // Ensure DB exists before running the schema on the pool
  await ensureDatabaseExists();

  const schemaSql = await fs.readFile(path.resolve(__dirname, '../schema.sql'), 'utf8');
  const schemaForConfiguredDatabase = schemaSql.replace(
    /^CREATE DATABASE IF NOT EXISTS taxation_system\s+CHARACTER SET utf8mb4\s+COLLATE utf8mb4_unicode_ci;\s*USE taxation_system;\s*/i,
    ''
  );
  const salesCategoryMigration = schemaForConfiguredDatabase.match(
    /-- BEGIN SALES CATEGORY DATA MIGRATION\s*([\s\S]*?)\s*-- END SALES CATEGORY DATA MIGRATION/
  );
  const schemaWithoutSalesCategoryMigration = schemaForConfiguredDatabase.replace(
    /-- BEGIN SALES CATEGORY DATA MIGRATION[\s\S]*?-- END SALES CATEGORY DATA MIGRATION\s*/,
    ''
  );
  await pool.query(schemaWithoutSalesCategoryMigration);

  const salesCategoryColumns = [
    ['non_taxable_sale_usd', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['non_taxable_sale_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['export_sale_usd', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['export_sale_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['taxable_person_value_usd', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['taxable_person_value_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['taxable_person_vat_usd', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['taxable_person_vat_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['local_sale_value_usd', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['local_sale_value_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['local_sale_vat_usd', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['local_sale_vat_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['sale_categories_migrated', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ];
  for (const [columnName, definition] of salesCategoryColumns) {
    await addColumnIfMissing('sale_records', columnName, definition);
  }
  if (salesCategoryMigration) await pool.query(salesCategoryMigration[1]);

  await addColumnIfMissing('sale_records', 'quantity', 'DECIMAL(14,3) NOT NULL DEFAULT 1.000');
  await addColumnIfMissing('annual_toi_returns', 'details_json', 'JSON NULL');

  await addColumnIfMissing('tax_periods', 'previous_vat_credit_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('tax_periods', 'previous_top_credit_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('tax_periods', 'specific_tax_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('tax_periods', 'other_taxes_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00');
  const vatBoxes = [
    ['box_05_previous_credit_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_06_non_taxable_purchases_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_07_local_purchases_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_08_local_input_vat_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_09_import_purchases_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_10_import_input_vat_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_11_total_input_vat_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_12_non_taxable_sales_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_13_export_sales_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_14_standard_sales_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_15_output_vat_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_16_total_output_vat_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_16_tax_payable_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_17_tax_due_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
    ['box_18_credit_carried_forward_khr', 'DECIMAL(16,2) NOT NULL DEFAULT 0.00'],
  ];
  for (const [columnName, definition] of vatBoxes) {
    await addColumnIfMissing('vat_returns', columnName, definition);
  }

  if (await columnExists('tax_periods', 'vat_credit_previous_khr')) {
    await pool.query('UPDATE tax_periods SET previous_vat_credit_khr = vat_credit_previous_khr WHERE previous_vat_credit_khr = 0 AND vat_credit_previous_khr <> 0');
  }
  if (await columnExists('tax_periods', 'top_credit_previous_khr')) {
    await pool.query('UPDATE tax_periods SET previous_top_credit_khr = top_credit_previous_khr WHERE previous_top_credit_khr = 0 AND top_credit_previous_khr <> 0');
  }
  if (await columnExists('tax_periods', 'specific_tax_base_khr') && await columnExists('tax_periods', 'specific_tax_rate')) {
    await pool.query('UPDATE tax_periods SET specific_tax_khr = ROUND(specific_tax_base_khr * specific_tax_rate, 2) WHERE specific_tax_khr = 0 AND specific_tax_base_khr <> 0');
  }

  // Keep databases created by older project versions compatible with the current API.
  await addColumnIfMissing('khqr_payment_intents', 'payway_tran_id', 'VARCHAR(20) NULL');
  await addUniqueIndexIfMissing('khqr_payment_intents', 'uq_khqr_payway_tran_id', 'payway_tran_id');
  await addColumnIfMissing('vendors', 'vat_tin', 'VARCHAR(50) NULL');
  await addColumnIfMissing('users', 'email', 'VARCHAR(255) NULL');
  await addColumnIfMissing('users', 'active', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing('project_files', 'file_size', 'BIGINT NULL');
  await addColumnIfMissing('project_files', 'mime_type', 'VARCHAR(120) NULL');
  await pool.query('ALTER TABLE project_files MODIFY COLUMN project_id BIGINT NULL');
  await addColumnIfMissing('vendors', 'active', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing('customers', 'vat_tin', 'VARCHAR(50) NULL');
  await addColumnIfMissing('customers', 'credit_limit', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('items', 'vat_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 10.00');
  await addColumnIfMissing('items', 'active', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing('invoices', 'invoice_type', "ENUM('TaxInvoice','CommercialInvoice') NOT NULL DEFAULT 'CommercialInvoice'");
  await addColumnIfMissing('invoices', 'user_id', 'INT NULL');
  await addColumnIfMissing('invoices', 'received_usd', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('invoices', 'received_khr', 'DECIMAL(14,0) NOT NULL DEFAULT 0');
  await addColumnIfMissing('invoices', 'change_usd', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('invoices', 'payment_reference', 'VARCHAR(120) NULL');
  await addColumnIfMissing('invoices', 'khqr_payload', 'TEXT NULL');
  await addColumnIfMissing('invoices', 'vat_tin', 'VARCHAR(50) NULL');
  await addColumnIfMissing('invoice_lines', 'cost_price', 'DECIMAL(14,4) NOT NULL DEFAULT 0.0000');
  await addColumnIfMissing('invoice_lines', 'vat_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 10.00');
  await addColumnIfMissing('invoice_lines', 'vat_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('invoice_lines', 'line_total', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('stock_transactions', 'balance_after', 'DECIMAL(14,3) NOT NULL DEFAULT 0.000');
  await addColumnIfMissing('purchase_orders', 'subtotal', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('purchase_orders', 'order_date', 'DATE NULL');
  await pool.query('UPDATE purchase_orders SET order_date = DATE(created_at) WHERE order_date IS NULL');
  await addColumnIfMissing('purchase_orders', 'delivery_total', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('purchase_orders', 'tax_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 10.00');
  await addColumnIfMissing('purchase_orders', 'tax_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('purchase_orders', 'grand_total', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('purchase_orders', 'created_by', 'INT NULL');
  await addColumnIfMissing('purchase_orders', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await pool.query('ALTER TABLE ar_payments MODIFY COLUMN customer_id INT NULL');
  await pool.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'");
  await pool.query("UPDATE users SET role = 'admin' WHERE LOWER(role) = 'admin'");
  await pool.query("UPDATE users SET role = 'user' WHERE LOWER(role) NOT IN ('admin', 'user')");

  // 1. Seed Settings
  const [settings] = await pool.query('SELECT setting_key FROM settings LIMIT 1');
  if (settings.length === 0) {
    const defaultSettings = {
      companyName: 'Axis Investment Consulting',
      address: 'Phnom Penh, Cambodia',
      phone: '023 555 888',
      baseCurrency: 'USD',
      exchangeRate: 4000,
      vatRate: 10,
      branch: 'Head Quarter',
      policy: {
        approval: { projectsRequired: true, filesRequired: true, leaveRequired: true, rejectionReasonRequired: true },
        access: { inactiveLoginBlocked: true, registrationRequiresApproval: false, passwordMinLength: 6 },
        inventory: { negativeStockBlocked: true, adjustmentRequiresAdmin: true, auditNotesRequired: true },
        sales: { discountApprovalRequired: true, maxDiscountPercent: 10, invoiceVoidRequiresAdmin: true },
        documents: { retentionDays: 365, notes: '' },
      },
    };
    await pool.query(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)',
      ['company', JSON.stringify(defaultSettings)]
    );
  }

  // 2. Ensure the default admin exists, even if other users were already created.
  const adminPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');
  const [admins] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', ['admin']);
  if (admins.length === 0) {
    if (!adminPassword) throw new Error('Set ADMIN_PASSWORD before creating the production admin account.');
    await pool.query(
      'INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      ['Admin User', 'admin', process.env.ADMIN_EMAIL?.trim().toLowerCase() || null, await bcrypt.hash(adminPassword, 10), 'admin']
    );
  } else if (process.env.NODE_ENV !== 'production') {
    await pool.query(
      'UPDATE users SET password_hash = ?, role = ?, active = 1 WHERE username = ?',
      [await bcrypt.hash(adminPassword, 10), 'admin', 'admin']
    );
  }
  if (process.env.ADMIN_EMAIL?.trim()) {
    await pool.query(
      'UPDATE users SET email = ? WHERE username = ?',
      [process.env.ADMIN_EMAIL.trim().toLowerCase(), 'admin']
    );
  }

  // 3. Seed Vendors
  const [vendors] = await pool.query('SELECT id, name FROM vendors');
  let vendorMap = new Map(vendors.map(v => [v.name, v.id]));

  if (vendors.length === 0) {
    const defaultVendors = [
      ['Cambodia Beverage Co.', '023 555 019', 5000, 'Main beverage supplier'],
      ['Local Foods Supply', '012 888 220', 3000, 'Weekly delivery'],
      ['Coffee Distribution KH', '010 222 445', 2500, ''],
    ];

    for (const v of defaultVendors) {
      const [res] = await pool.query(
        'INSERT INTO vendors (name, phone, credit_limit, note) VALUES (?, ?, ?, ?)',
        v
      );
      vendorMap.set(v[0], res.insertId);
    }
  }

  // 4. Seed Customers
  const [customers] = await pool.query('SELECT id FROM customers LIMIT 1');
  if (customers.length === 0) {
    await pool.query(
      `INSERT INTO customers (name, phone, deposit, reward_points, balance) VALUES 
       (?, ?, ?, ?, ?), 
       (?, ?, ?, ?, ?)`,
      ['Walk-in customer', '-', 0, 0, 0, 'Sok Dara', '012 345 678', 25, 420, 120]
    );
  }

  // 5. Seed Items (Safely mapping vendor IDs from vendorMap)
  const [items] = await pool.query('SELECT id FROM items LIMIT 1');
  if (items.length === 0) {
    const bevVendorId = vendorMap.get('Cambodia Beverage Co.') || null;
    const foodVendorId = vendorMap.get('Local Foods Supply') || null;
    const coffeeVendorId = vendorMap.get('Coffee Distribution KH') || null;

    const defaultItems = [
      [
        '885000100001',
        'ស្រាបៀរ អង្គរ 330ml',
        'Anchor Beer 330ml',
        'Beverages',
        'Beer',
        'Anchor',
        'Can',
        120,
        24,
        1.0,
        0.65,
        0.65,
        bevVendorId,
        JSON.stringify([
          { name: 'Can', ratio: 1, retailPrice: 1.0 },
          { name: 'Case', ratio: 24, retailPrice: 22.0 },
        ]),
      ],
      [
        '885000100002',
        'ទឹកសុទ្ធ 500ml',
        'Mineral Water 500ml',
        'Beverages',
        'Water',
        'Kulara',
        'Bottle',
        240,
        48,
        0.5,
        0.25,
        0.25,
        foodVendorId,
        JSON.stringify([
          { name: 'Bottle', ratio: 1, retailPrice: 0.5 },
          { name: 'Case', ratio: 24, retailPrice: 10.0 },
        ]),
      ],
      [
        '885000100003',
        'មីកញ្ចប់',
        'Instant Noodles',
        'Food',
        'Grocery',
        'Mama',
        'Pack',
        18,
        24,
        0.75,
        0.42,
        0.42,
        foodVendorId,
        JSON.stringify([
          { name: 'Pack', ratio: 1, retailPrice: 0.75 },
          { name: 'Box', ratio: 30, retailPrice: 20.0 },
        ]),
      ],
      [
        '885000100004',
        'កាហ្វេកំប៉ុង',
        'Canned Coffee',
        'Beverages',
        'Coffee',
        'Wonda',
        'Can',
        0,
        20,
        1.25,
        0.8,
        0.8,
        coffeeVendorId,
        JSON.stringify([{ name: 'Can', ratio: 1, retailPrice: 1.25 }]),
      ],
    ];

    const insertItemQuery = `
      INSERT INTO items 
      (barcode, name_kh, name_en, department, category, brand, base_unit, qty_on_hand, reorder_qty, retail_price, purchase_cost, average_cost, vendor_id, units) 
      VALUES ?
    `;

    // Bulk insert using nested array syntax supported by mysql2
    await pool.query(insertItemQuery, [defaultItems]);
  }
}

module.exports = { pool, initializeDatabase };