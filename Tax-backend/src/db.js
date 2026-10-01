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

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(80) PRIMARY KEY,
    setting_value JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    username VARCHAR(80) UNIQUE NOT NULL,
    email VARCHAR(255) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    is_used TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_resets_email (email),
    INDEX idx_password_resets_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS vendors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    phone VARCHAR(60) NULL,
    credit_limit DECIMAL(14,2) DEFAULT 0.00,
    note TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    phone VARCHAR(60) NULL,
    deposit DECIMAL(14,2) DEFAULT 0.00,
    reward_points INT DEFAULT 0,
    balance DECIMAL(14,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barcode VARCHAR(80) UNIQUE NOT NULL,
    name_kh VARCHAR(180) NULL,
    name_en VARCHAR(180) NOT NULL,
    department VARCHAR(100) NULL,
    category VARCHAR(100) NULL,
    brand VARCHAR(100) NULL,
    base_unit VARCHAR(50) NOT NULL,
    qty_on_hand DECIMAL(14,3) NOT NULL DEFAULT 0.000,
    reorder_qty DECIMAL(14,3) NOT NULL DEFAULT 0.000,
    retail_price DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
    purchase_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
    average_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
    vendor_id INT NULL,
    units JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    INDEX idx_items_barcode (barcode)
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS invoices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    invoice_no VARCHAR(40) UNIQUE NOT NULL,
    customer_id INT NULL,
    customer_name VARCHAR(160) NOT NULL,
    staff_name VARCHAR(120) NOT NULL,
    payment_method ENUM('cash','bank','customer_account') NOT NULL,
    net_sale DECIMAL(14,2) NOT NULL,
    vat DECIMAL(14,2) NOT NULL,
    total DECIMAL(14,2) NOT NULL,
    status ENUM('Paid','Reversed') NOT NULL DEFAULT 'Paid',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    INDEX idx_invoices_created_at (created_at)
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS khqr_payment_intents (
    id CHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    payway_tran_id VARCHAR(20) NULL,
    md5 CHAR(32) NOT NULL UNIQUE,
    qr_payload TEXT NOT NULL,
    merchant_account VARCHAR(80) NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    currency ENUM('USD','KHR') NOT NULL,
    status ENUM('Pending','Paid','Used','Expired') NOT NULL DEFAULT 'Pending',
    transaction_hash VARCHAR(128) NULL,
    expires_at DATETIME NOT NULL,
    verified_at DATETIME NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_khqr_payway_tran_id (payway_tran_id),
    INDEX idx_khqr_intents_user_status (user_id, status),
    INDEX idx_khqr_intents_expiry (status, expires_at)
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS invoice_lines (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    item_id INT NOT NULL,
    item_name VARCHAR(180) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    qty DECIMAL(14,3) NOT NULL,
    unit_price DECIMAL(14,4) NOT NULL,
    discount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    line_net DECIMAL(14,2) NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
    INDEX idx_lines_invoice_id (invoice_id),
    INDEX idx_lines_item_id (item_id)
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS stock_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    item_name VARCHAR(180) NOT NULL,
    type ENUM('Sale','Purchase','Adjustment','Transfer','Reversed') NOT NULL,
    qty DECIMAL(14,3) NOT NULL,
    balance_after DECIMAL(14,3) NOT NULL DEFAULT 0.000,
    reference VARCHAR(80) NOT NULL,
    branch VARCHAR(120) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
    INDEX idx_transactions_created_at (created_at),
    INDEX idx_transactions_item_id (item_id)
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(40) UNIQUE NOT NULL,
    vendor_id INT NULL,
    vendor_name VARCHAR(160) NOT NULL,
    order_date DATE NULL,
    expected_date DATE NULL,
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    delivery_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    grand_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    status ENUM('Pending','Received','Cancelled') NOT NULL DEFAULT 'Pending',
    note TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS purchase_order_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id BIGINT NOT NULL,
    item_id INT NULL,
    product_name VARCHAR(180) NOT NULL,
    qty DECIMAL(14,3) NOT NULL,
    unit_price DECIMAL(14,4) NOT NULL,
    delivery_date DATE NOT NULL,
    delivery_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    item_total DECIMAL(14,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS ap_payments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, purchase_order_id BIGINT NOT NULL, vendor_id INT NULL,
    amount DECIMAL(14,2) NOT NULL, payment_method ENUM('cash','bank','card','qr') NOT NULL DEFAULT 'cash',
    reference VARCHAR(120) NULL, paid_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_ap_payments_order (purchase_order_id)
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS projects (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    description TEXT NULL,
    status ENUM('Pending Approval','Approved','Rejected') NOT NULL DEFAULT 'Pending Approval',
    submitted_by INT NOT NULL,
    reviewed_by INT NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    FOREIGN KEY (submitted_by) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS project_files (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NULL,
    file_size BIGINT NULL,
    mime_type VARCHAR(120) NULL,
    status ENUM('Pending Approval','Approved','Rejected') NOT NULL DEFAULT 'Pending Approval',
    submitted_by INT NOT NULL,
    reviewed_by INT NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS leave_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('Pending Approval','Approved','Rejected') NOT NULL DEFAULT 'Pending Approval',
    submitted_by INT NOT NULL,
    reviewed_by INT NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    FOREIGN KEY (submitted_by) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    entity_type VARCHAR(50) NULL,
    entity_id BIGINT NULL,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB;`,

  `CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NULL,
    entity_id BIGINT NULL,
    details JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS payment_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, invoice_id BIGINT NULL, customer_id INT NULL,
      payment_method ENUM('cash','bank','card','qr','customer_account') NOT NULL,
      amount_usd DECIMAL(14,2) NOT NULL DEFAULT 0.00, amount_khr DECIMAL(14,0) NOT NULL DEFAULT 0,
      reference VARCHAR(120) NULL, received_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_payment_records_created_at (created_at)
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS cash_registers (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, branch VARCHAR(120) NOT NULL, opened_by INT NOT NULL,
      opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, starting_cash DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      closed_by INT NULL, closed_at TIMESTAMP NULL, expected_cash DECIMAL(14,2) NULL,
      counted_cash DECIMAL(14,2) NULL, variance DECIMAL(14,2) NULL,
      status ENUM('Open','Closed') NOT NULL DEFAULT 'Open', FOREIGN KEY (opened_by) REFERENCES users(id),
      FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL, INDEX idx_register_branch_status (branch, status)
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS inventory_batches (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, item_id INT NOT NULL, batch_no VARCHAR(80) NOT NULL,
      expiry_date DATE NULL, qty_received DECIMAL(14,3) NOT NULL DEFAULT 0.000,
      qty_remaining DECIMAL(14,3) NOT NULL DEFAULT 0.000, unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
      INDEX idx_batches_fifo (item_id, expiry_date, created_at)
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS stock_transfers (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, transfer_no VARCHAR(40) UNIQUE NOT NULL,
      from_branch VARCHAR(120) NOT NULL, to_branch VARCHAR(120) NOT NULL,
      status ENUM('Draft','In Transit','Received','Cancelled') NOT NULL DEFAULT 'Draft',
      created_by INT NOT NULL, received_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      received_at TIMESTAMP NULL, FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, transfer_id BIGINT NOT NULL, item_id INT NOT NULL,
      qty DECIMAL(14,3) NOT NULL, FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB;`,

    `CREATE TABLE IF NOT EXISTS ar_payments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, invoice_id BIGINT NULL,
      amount DECIMAL(14,2) NOT NULL, payment_method ENUM('cash','bank','card','qr') NOT NULL DEFAULT 'cash',
      reference VARCHAR(120) NULL, paid_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
      FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;`,

];

async function initializeDatabase() {
  // Ensure DB exists before running table migrations on the pool
  await ensureDatabaseExists();

  for (const statement of schemaStatements) {
    await pool.query(statement);
  }

  const monthlyTaxMigration = await fs.readFile(path.resolve(__dirname, '../migrations/004_monthly_tax.sql'), 'utf8');
  await pool.query(monthlyTaxMigration);
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
  const salesCategoryMigration = await fs.readFile(path.resolve(__dirname, '../migrations/007_sales_journal_categories.sql'), 'utf8');
  await pool.query(salesCategoryMigration);
  const annualTaxMigration = await fs.readFile(path.resolve(__dirname, '../migrations/005_annual_toi.sql'), 'utf8');
  await pool.query(annualTaxMigration);
  await addColumnIfMissing('annual_toi_returns', 'details_json', 'JSON NULL');
  const gdtWhtMigration = await fs.readFile(path.resolve(__dirname, '../migrations/006_gdt_wht_items.sql'), 'utf8');
  await pool.query(gdtWhtMigration);
  await addColumnIfMissing('sale_records', 'quantity', 'DECIMAL(14,3) NOT NULL DEFAULT 1.000');

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