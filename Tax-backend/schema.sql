CREATE DATABASE IF NOT EXISTS taxation_system 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE taxation_system;

-- 1. System Settings
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Staff / System Users
CREATE TABLE IF NOT EXISTS companies (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_user_id INT NULL,
  enterprise_name VARCHAR(180) NOT NULL,
  tin VARCHAR(80) NULL,
  tax_registered_date DATE NULL,
  director_name VARCHAR(180) NULL,
  business_activity TEXT NULL,
  accountant_name VARCHAR(180) NULL,
  registered_address TEXT NULL,
  office_phone VARCHAR(60) NULL,
  official_email VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_companies_tin (tin),
  INDEX idx_companies_owner (owner_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  position VARCHAR(160) NULL,
  official_address TEXT NULL,
  website VARCHAR(255) NULL,
  enterprise_name VARCHAR(180) NULL,
  office_phone VARCHAR(60) NULL,
  username VARCHAR(254) UNIQUE NOT NULL,
  email VARCHAR(255) NULL,
  password_hash VARCHAR(255) NOT NULL,
  company_id BIGINT NULL,
  created_by_user_id INT NULL,
  is_owner TINYINT(1) NOT NULL DEFAULT 0,
  permissions JSON NULL,
  verification_token CHAR(64) NULL,
  token_expires_at DATETIME NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('PENDING_VERIFICATION','ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  role ENUM('superadmin','owner','staff') NOT NULL DEFAULT 'staff',
  active TINYINT(1) NOT NULL DEFAULT 1,
  approval_status ENUM('pending','approved') NOT NULL DEFAULT 'approved',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_company (company_id),
  INDEX idx_users_tenant_role (company_id, role),
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  account_code VARCHAR(40) NOT NULL,
  account_name VARCHAR(160) NOT NULL,
  account_type ENUM('asset','liability','equity','revenue','expense') NOT NULL,
  parent_id BIGINT NULL,
  description VARCHAR(500) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_chart_accounts_company_code (company_id, account_code),
  UNIQUE KEY uq_chart_accounts_company_id (company_id, id),
  INDEX idx_chart_of_accounts_company (company_id),
  CONSTRAINT fk_chart_of_accounts_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_chart_accounts_company_parent
    FOREIGN KEY (company_id, parent_id) REFERENCES chart_of_accounts(company_id, id) ON DELETE RESTRICT,
  INDEX idx_accounts_type_active (account_type, active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  entry_number VARCHAR(40) NOT NULL,
  entry_date DATE NOT NULL,
  currency ENUM('USD','KHR') NOT NULL,
  memo VARCHAR(500) NOT NULL,
  status ENUM('draft','posted') NOT NULL DEFAULT 'draft',
  created_by INT NULL,
  posted_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posted_at TIMESTAMP NULL,
  UNIQUE KEY uq_journal_entries_company_number (company_id, entry_number),
  UNIQUE KEY uq_journal_entries_company_id (company_id, id),
  INDEX idx_journal_entries_company (company_id),
  CONSTRAINT fk_journal_entries_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_journal_date_status (entry_date, status),
  INDEX idx_journal_currency (currency)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  journal_entry_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  debit DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  credit DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  CONSTRAINT chk_journal_line_debit_nonnegative CHECK (debit >= 0),
  CONSTRAINT chk_journal_line_credit_nonnegative CHECK (credit >= 0),
  CONSTRAINT chk_journal_line_one_side CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  ),
  INDEX idx_journal_entry_lines_company (company_id),
  CONSTRAINT fk_journal_entry_lines_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_journal_entry_lines_company_entry
    FOREIGN KEY (company_id, journal_entry_id) REFERENCES journal_entries(company_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_journal_entry_lines_company_account
    FOREIGN KEY (company_id, account_id) REFERENCES chart_of_accounts(company_id, id) ON DELETE RESTRICT,
  INDEX idx_journal_lines_account (account_id, journal_entry_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_branch_access (
  user_id INT NOT NULL,
  branch VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, branch),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_branch_access_branch (branch)
) ENGINE=InnoDB;

-- 3. Vendors & Suppliers
CREATE TABLE IF NOT EXISTS vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(180) NULL,
  address TEXT NULL,
  phone VARCHAR(60) NULL,
  alternate_phone VARCHAR(60) NULL,
  email VARCHAR(255) NULL,
  vat_tin VARCHAR(50) NULL, -- Tax Identification Number for input VAT claims
  credit_limit DECIMAL(14,2) DEFAULT 0.00,
  note TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fixed_asset_classes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  class_code VARCHAR(30) NOT NULL UNIQUE,
  class_name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  depreciation_method ENUM('straight_line','declining') NOT NULL,
  annual_rate DECIMAL(9,6) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_asset_class_rate CHECK (annual_rate > 0 AND annual_rate <= 1),
  INDEX idx_asset_class_active (active, class_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fixed_assets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  asset_number VARCHAR(40) NOT NULL UNIQUE,
  asset_code VARCHAR(80) NOT NULL UNIQUE,
  asset_name VARCHAR(180) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  class_id BIGINT NOT NULL,
  manufacturer_number VARCHAR(100) NOT NULL DEFAULT '',
  invoice_number VARCHAR(80) NOT NULL DEFAULT '',
  location VARCHAR(180) NOT NULL,
  custodian VARCHAR(180) NOT NULL,
  vendor_id INT NULL,
  asset_account_id BIGINT NOT NULL,
  depreciation_account_id BIGINT NOT NULL,
  accumulated_depreciation_account_id BIGINT NOT NULL,
  currency ENUM('USD','KHR') NOT NULL DEFAULT 'USD',
  acquisition_date DATE NOT NULL,
  acquisition_value DECIMAL(18,4) NOT NULL,
  deployment_date DATE NOT NULL,
  depreciation_method ENUM('straight_line','declining') NOT NULL,
  annual_rate DECIMAL(9,6) NOT NULL,
  residual_value DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  accumulated_depreciation DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  status ENUM('active','sold','disposed') NOT NULL DEFAULT 'active',
  disposal_date DATE NULL,
  disposal_value DECIMAL(18,4) NULL,
  disposal_journal_entry_id BIGINT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_fixed_asset_value CHECK (
    acquisition_value > 0 AND residual_value >= 0 AND residual_value <= acquisition_value
    AND accumulated_depreciation >= 0 AND accumulated_depreciation <= acquisition_value - residual_value
  ),
  CONSTRAINT chk_fixed_asset_rate CHECK (annual_rate > 0 AND annual_rate <= 1),
  FOREIGN KEY (class_id) REFERENCES fixed_asset_classes(id) ON DELETE RESTRICT,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  FOREIGN KEY (asset_account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (depreciation_account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (accumulated_depreciation_account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (disposal_journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_fixed_assets_status_class (status, class_id),
  INDEX idx_fixed_assets_deployment_date (deployment_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fixed_asset_depreciation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  asset_id BIGINT NOT NULL,
  period_end DATE NOT NULL,
  months_depreciated SMALLINT UNSIGNED NOT NULL,
  depreciation_amount DECIMAL(18,4) NOT NULL,
  accumulated_before DECIMAL(18,4) NOT NULL,
  accumulated_after DECIMAL(18,4) NOT NULL,
  book_value_before DECIMAL(18,4) NOT NULL,
  book_value_after DECIMAL(18,4) NOT NULL,
  journal_entry_id BIGINT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_depreciation_period (asset_id, period_end),
  FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_asset_depreciation_period (period_end)
) ENGINE=InnoDB;

-- 4. Customers
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(60) NULL,
  address TEXT NULL,
  representative VARCHAR(180) NULL,
  email VARCHAR(255) NULL,
  vat_tin VARCHAR(50) NULL, -- Customer VAT TIN for B2B Tax Invoices
  deposit DECIMAL(14,2) DEFAULT 0.00,
  reward_points INT DEFAULT 0,
  balance DECIMAL(14,2) DEFAULT 0.00,
  credit_limit DECIMAL(14,2) DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5. Inventory Items
CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  barcode VARCHAR(80) UNIQUE NOT NULL,
  name_kh VARCHAR(180) NULL,
  name_en VARCHAR(180) NOT NULL,
  department VARCHAR(100) NULL,
  category VARCHAR(100) NULL,
  brand VARCHAR(100) NULL,
  base_unit VARCHAR(50) NOT NULL,
  vat_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00, -- Default VAT (e.g., 10%)
  qty_on_hand DECIMAL(14,0) NOT NULL DEFAULT 0,
  reorder_qty DECIMAL(14,0) NOT NULL DEFAULT 0,
  retail_price DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  purchase_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
  average_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
  markup_amount DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  auto_recalculate_price TINYINT(1) NOT NULL DEFAULT 0,
  vendor_id INT NULL,
  units JSON NOT NULL, -- e.g., [{"unit": "Box", "factor": 24, "barcode": "..."}]
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  INDEX idx_items_barcode (barcode),
  INDEX idx_items_name_en (name_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS item_branch_stock (
  item_id INT NOT NULL,
  branch VARCHAR(120) NOT NULL,
  qty_on_hand DECIMAL(14,0) NOT NULL DEFAULT 0,
  avg_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, branch),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  INDEX idx_branch_stock_branch (branch)
) ENGINE=InnoDB;

-- 6. Invoices (Tax Invoices)
CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(40) UNIQUE NOT NULL,
  invoice_type ENUM('TaxInvoice', 'CommercialInvoice') NOT NULL DEFAULT 'CommercialInvoice',
  customer_id INT NULL,
  customer_name VARCHAR(160) NOT NULL,
  branch VARCHAR(120) NOT NULL DEFAULT 'Head Quarter',
  user_id INT NULL, -- Cashier / Issuer ID
  staff_name VARCHAR(120) NOT NULL,
  payment_method ENUM('cash', 'bank', 'customer_account') NOT NULL,
  net_sale DECIMAL(14,2) NOT NULL,
  vat DECIMAL(14,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL,
  received_usd DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  received_khr DECIMAL(14,0) NOT NULL DEFAULT 0,
  change_usd DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  payment_reference VARCHAR(120) NULL,
  khqr_payload TEXT NULL,
  vat_tin VARCHAR(50) NULL,
  status ENUM('Paid', 'Reversed') NOT NULL DEFAULT 'Paid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_invoices_created_at (created_at),
  INDEX idx_invoices_customer_id (customer_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS khqr_payment_intents (
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
) ENGINE=InnoDB;

-- 7. Invoice Line Items
CREATE TABLE IF NOT EXISTS invoice_lines (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT NOT NULL,
  item_id INT NOT NULL,
  item_name VARCHAR(180) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  qty DECIMAL(14,0) NOT NULL,
  unit_price DECIMAL(14,4) NOT NULL,
  cost_price DECIMAL(14,6) NOT NULL DEFAULT 0.000000, -- Historical cost snapshot for COGS
  qty_base DECIMAL(14,0) NOT NULL DEFAULT 0,
  unit_cost_at_sale DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  cogs_unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  total_cogs DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  vat_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  vat_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  line_net DECIMAL(14,2) NOT NULL, -- Total before VAT, after discount
  line_total DECIMAL(14,2) NOT NULL, -- Final amount inclusive of VAT
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  INDEX idx_invoice_lines_invoice_id (invoice_id),
  INDEX idx_invoice_lines_item_id (item_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_returns (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(40) UNIQUE NOT NULL,
  invoice_id BIGINT NOT NULL,
  branch VARCHAR(120) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sales_returns_invoice (invoice_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_return_lines (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sales_return_id BIGINT NOT NULL,
  invoice_line_id BIGINT NOT NULL,
  item_id INT NOT NULL,
  qty_returned DECIMAL(14,0) NOT NULL,
  qty_base DECIMAL(14,0) NOT NULL,
  unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  FOREIGN KEY (sales_return_id) REFERENCES sales_returns(id) ON DELETE RESTRICT,
  FOREIGN KEY (invoice_line_id) REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  INDEX idx_sales_return_lines_invoice_line (invoice_line_id),
  INDEX idx_sales_return_lines_return (sales_return_id)
) ENGINE=InnoDB;

-- 8. Stock Movement Audit Trail
CREATE TABLE IF NOT EXISTS stock_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  item_name VARCHAR(180) NOT NULL,
  type ENUM('Sale', 'Purchase', 'Adjustment', 'Transfer', 'Reversed', 'Return') NOT NULL,
  qty DECIMAL(14,0) NOT NULL, -- Positive for in, negative for out
  balance_after DECIMAL(14,0) NOT NULL, -- Running balance validation
  unit_cost_at_sale DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  reference VARCHAR(80) NOT NULL,
  branch VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  INDEX idx_transactions_created_at (created_at),
  INDEX idx_transactions_item_id (item_id),
  INDEX idx_transactions_branch_created (branch, created_at, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS projects (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  status ENUM('Pending Approval','Approved','Rejected') NOT NULL DEFAULT 'Pending Approval',
  submitted_by INT NULL,
  reviewed_by INT NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS project_files (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NULL,
  file_size BIGINT NULL,
  mime_type VARCHAR(120) NULL,
  status ENUM('Pending Approval','Approved','Rejected') NOT NULL DEFAULT 'Pending Approval',
  submitted_by INT NULL,
  reviewed_by INT NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('Pending Approval','Approved','Rejected') NOT NULL DEFAULT 'Pending Approval',
  submitted_by INT NULL,
  reviewed_by INT NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id BIGINT NULL,
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS platform_activity_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id BIGINT NULL,
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_platform_activity_logs_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(40) UNIQUE NOT NULL,
  vendor_id INT NULL,
  vendor_name VARCHAR(160) NOT NULL,
  order_date DATE NULL,
  expected_date DATE NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  delivery_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  handling_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  documentation_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  grand_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status ENUM('Pending','Received','Cancelled') NOT NULL DEFAULT 'Pending',
  branch VARCHAR(120) NULL,
  received_branch VARCHAR(120) NULL,
  note TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL,
  item_id INT NULL,
  product_name VARCHAR(180) NOT NULL,
  qty DECIMAL(14,0) NOT NULL,
  unit_price DECIMAL(14,4) NOT NULL,
  merchandise_cost DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  unit_handling_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
  unit_doc_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
  effective_unit_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
  delivery_date DATE NOT NULL,
  delivery_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  item_total DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_returns (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  return_no VARCHAR(40) UNIQUE NOT NULL,
  purchase_order_id BIGINT NOT NULL,
  branch VARCHAR(120) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_purchase_returns_order (purchase_order_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_return_lines (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  purchase_return_id BIGINT NOT NULL,
  purchase_order_item_id BIGINT NOT NULL,
  item_id INT NOT NULL,
  qty_returned DECIMAL(14,0) NOT NULL,
  unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE RESTRICT,
  FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  INDEX idx_purchase_return_lines_order_item (purchase_order_item_id),
  INDEX idx_purchase_return_lines_return (purchase_return_id)
) ENGINE=InnoDB;

-- 15. Payment and cash drawer records
CREATE TABLE IF NOT EXISTS payment_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT NULL,
  customer_id INT NULL,
  payment_method ENUM('cash','bank','card','qr','customer_account') NOT NULL,
  amount_usd DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  amount_khr DECIMAL(14,0) NOT NULL DEFAULT 0,
  reference VARCHAR(120) NULL,
  received_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_payment_records_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cash_registers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  branch VARCHAR(120) NOT NULL,
  opened_by INT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  starting_cash DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  closed_by INT NULL,
  closed_at TIMESTAMP NULL,
  expected_cash DECIMAL(14,2) NULL,
  counted_cash DECIMAL(14,2) NULL,
  variance DECIMAL(14,2) NULL,
  status ENUM('Open','Closed') NOT NULL DEFAULT 'Open',
  open_branch VARCHAR(120) GENERATED ALWAYS AS (
    CASE WHEN status = 'Open' THEN branch ELSE NULL END
  ) STORED,
  FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE INDEX uq_cash_registers_open_branch (open_branch),
  INDEX idx_register_branch_status (branch, status)
) ENGINE=InnoDB;

-- 16. Batch expiry and FIFO inventory
CREATE TABLE IF NOT EXISTS inventory_batches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  branch VARCHAR(120) NOT NULL DEFAULT 'Head Quarter',
  batch_no VARCHAR(80) NOT NULL,
  expiry_date DATE NULL,
  qty_received DECIMAL(14,0) NOT NULL DEFAULT 0,
  qty_remaining DECIMAL(14,0) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  INDEX idx_batches_fifo (item_id, branch, expiry_date, created_at)
) ENGINE=InnoDB;

-- 17. Inter-branch stock transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_no VARCHAR(40) UNIQUE NOT NULL,
  from_branch VARCHAR(120) NOT NULL,
  to_branch VARCHAR(120) NOT NULL,
  status ENUM('Draft','In Transit','Received','Cancelled') NOT NULL DEFAULT 'Draft',
  created_by INT NULL,
  received_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  received_at TIMESTAMP NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_id BIGINT NOT NULL,
  item_id INT NOT NULL,
  qty DECIMAL(14,0) NOT NULL,
  unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_transfer_batches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_item_id BIGINT NOT NULL,
  batch_no VARCHAR(80) NOT NULL,
  expiry_date DATE NULL,
  quantity DECIMAL(14,0) NOT NULL,
  unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0.000000,
  FOREIGN KEY (transfer_item_id) REFERENCES stock_transfer_items(id) ON DELETE CASCADE,
  INDEX idx_transfer_batches_item (transfer_item_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ar_payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NULL,
  invoice_id BIGINT NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_method ENUM('cash','bank','card','qr') NOT NULL DEFAULT 'cash',
  reference VARCHAR(120) NULL,
  paid_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ap_payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id BIGINT NOT NULL,
  vendor_id INT NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_method ENUM('cash','bank','card','qr') NOT NULL DEFAULT 'cash',
  reference VARCHAR(120) NULL,
  paid_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ap_payments_order (purchase_order_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_resets (
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
) ENGINE=InnoDB;

-- 18. Monthly Cambodian tax declaration
CREATE TABLE IF NOT EXISTS tax_periods (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(180) NOT NULL DEFAULT 'Axis Investment Consulting',
  vat_tin VARCHAR(50) NOT NULL DEFAULT 'K002-107004771',
  period_month TINYINT UNSIGNED NOT NULL,
  period_year SMALLINT UNSIGNED NOT NULL,
  nbc_exchange_rate DECIMAL(12,2) NOT NULL DEFAULT 4070.00,
  previous_vat_credit_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  previous_top_credit_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  specific_tax_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  other_taxes_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  accommodation_tax_base_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  public_lighting_tax_base_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  status ENUM('draft','filed','locked') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tax_period_company_month (company_name, period_year, period_month),
  INDEX idx_tax_period_status (status, period_year, period_month)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tax_period_id BIGINT NOT NULL,
  invoice_date DATE NULL,
  invoice_no VARCHAR(80) NULL,
  supplier_name VARCHAR(180) NOT NULL,
  supplier_tin VARCHAR(50) NULL,
  description VARCHAR(500) NULL,
  quantity DECIMAL(14,0) NOT NULL DEFAULT 1,
  expense_type ENUM('non_taxable','import','local') NOT NULL DEFAULT 'local',
  amount_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  taxable_value_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  vat_rate DECIMAL(7,6) NOT NULL DEFAULT 0.100000,
  vat_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE,
  INDEX idx_purchase_period_type (tax_period_id, expense_type),
  INDEX idx_purchase_invoice (tax_period_id, invoice_date, invoice_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tax_period_id BIGINT NOT NULL,
  invoice_date DATE NULL,
  invoice_no VARCHAR(80) NULL,
  customer_name VARCHAR(180) NOT NULL,
  customer_tin VARCHAR(50) NULL,
  description VARCHAR(500) NULL,
  quantity DECIMAL(14,0) NOT NULL DEFAULT 1,
  sale_type ENUM('non_taxable','export_0','taxable_person_10','local_consumer_10') NOT NULL DEFAULT 'local_consumer_10',
  taxable_amount_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  taxable_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  non_taxable_sale_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  non_taxable_sale_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  export_sale_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  export_sale_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  taxable_person_value_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  taxable_person_value_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  taxable_person_vat_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  taxable_person_vat_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  local_sale_value_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  local_sale_value_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  local_sale_vat_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  local_sale_vat_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  sale_categories_migrated TINYINT(1) NOT NULL DEFAULT 0,
  vat_rate DECIMAL(7,6) NOT NULL DEFAULT 0.100000,
  vat_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE,
  INDEX idx_sale_period_type (tax_period_id, sale_type),
  INDEX idx_sale_invoice (tax_period_id, invoice_date, invoice_no)
) ENGINE=InnoDB;

-- BEGIN SALES CATEGORY DATA MIGRATION
UPDATE sale_records
SET
  non_taxable_sale_usd = IF(sale_type = 'non_taxable', taxable_amount_usd, non_taxable_sale_usd),
  non_taxable_sale_khr = IF(sale_type = 'non_taxable', taxable_amount_khr, non_taxable_sale_khr),
  export_sale_usd = IF(sale_type = 'export_0', taxable_amount_usd, export_sale_usd),
  export_sale_khr = IF(sale_type = 'export_0', taxable_amount_khr, export_sale_khr),
  taxable_person_value_usd = IF(sale_type = 'taxable_person_10', taxable_amount_usd, taxable_person_value_usd),
  taxable_person_value_khr = IF(sale_type = 'taxable_person_10', taxable_amount_khr, taxable_person_value_khr),
  taxable_person_vat_usd = IF(sale_type = 'taxable_person_10', ROUND(taxable_amount_usd * vat_rate, 2), taxable_person_vat_usd),
  taxable_person_vat_khr = IF(sale_type = 'taxable_person_10', vat_amount_khr, taxable_person_vat_khr),
  local_sale_value_usd = IF(sale_type = 'local_consumer_10', taxable_amount_usd, local_sale_value_usd),
  local_sale_value_khr = IF(sale_type = 'local_consumer_10', taxable_amount_khr, local_sale_value_khr),
  local_sale_vat_usd = IF(sale_type = 'local_consumer_10', ROUND(taxable_amount_usd * vat_rate, 2), local_sale_vat_usd),
  local_sale_vat_khr = IF(sale_type = 'local_consumer_10', vat_amount_khr, local_sale_vat_khr),
  sale_categories_migrated = 1
WHERE sale_categories_migrated = 0;
-- END SALES CATEGORY DATA MIGRATION

CREATE TABLE IF NOT EXISTS salary_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tax_period_id BIGINT NOT NULL,
  employee_name VARCHAR(180) NOT NULL,
  is_resident TINYINT(1) NOT NULL DEFAULT 1,
  basic_salary_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  basic_salary_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  bonus_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  num_spouses TINYINT UNSIGNED NOT NULL DEFAULT 0,
  num_children SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  deduction_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  taxable_base_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  tax_rate DECIMAL(7,6) NOT NULL DEFAULT 0.000000,
  tos_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  fringe_benefit_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  fringe_benefit_tax_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  net_salary_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE,
  INDEX idx_salary_period_employee (tax_period_id, employee_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wht_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tax_period_id BIGINT NOT NULL,
  wht_type ENUM('resident','non_resident') NOT NULL DEFAULT 'resident',
  category ENUM('service_15','rental_10','interest_non_bank_15','fixed_deposit_6','savings_4','non_resident_14') NOT NULL,
  base_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  wht_rate DECIMAL(7,6) NOT NULL DEFAULT 0.000000,
  wht_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  remarks VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE,
  INDEX idx_wht_period_category (tax_period_id, category)
) ENGINE=InnoDB;

UPDATE salary_records SET tax_rate = 0 WHERE tax_rate < 0 OR tax_rate > 1;
ALTER TABLE salary_records MODIFY COLUMN tax_rate DECIMAL(7,6) NOT NULL DEFAULT 0.000000;
ALTER TABLE salary_records MODIFY COLUMN tos_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS annual_toi_returns (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(180) NOT NULL,
  enterprise_tin VARCHAR(50) NOT NULL,
  tax_year SMALLINT UNSIGNED NOT NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  values_json JSON NOT NULL,
  details_json JSON NULL,
  calculations_json JSON NOT NULL,
  status ENUM('draft','filed') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_annual_toi_enterprise_year (enterprise_tin, tax_year),
  INDEX idx_annual_toi_year_status (tax_year, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wht_tax_objects (
  object_code VARCHAR(60) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  category ENUM('RESIDENT','NON_RESIDENT') NOT NULL,
  default_tax_rate DECIMAL(5,4) NOT NULL,
  CONSTRAINT chk_wht_object_rate CHECK (default_tax_rate >= 0 AND default_tax_rate <= 1)
) ENGINE=InnoDB;

INSERT INTO wht_tax_objects (object_code, description, category, default_tax_rate) VALUES
  ('RES_SERVICE_ROYALTY_15', 'Performance of services and royalties', 'RESIDENT', 0.1500),
  ('RES_NONBANK_INTEREST_15', 'Interest paid to non-bank entities', 'RESIDENT', 0.1500),
  ('RES_FIXED_DEPOSIT_INTEREST_6', 'Interest on fixed-term deposits', 'RESIDENT', 0.0600),
  ('RES_NONFIXED_SAVINGS_INTEREST_4', 'Interest on non-fixed savings', 'RESIDENT', 0.0400),
  ('RES_RENTAL_LEGAL_PERSON_10', 'Rental of movable or immovable property: legal person', 'RESIDENT', 0.1000),
  ('RES_RENTAL_PHYSICAL_PERSON_10', 'Rental of movable or immovable property: physical person', 'RESIDENT', 0.1000),
  ('NR_INTEREST_14', 'Non-resident interest', 'NON_RESIDENT', 0.1400),
  ('NR_ROYALTY_RENTAL_LEASE_14', 'Non-resident royalties, rental or lease', 'NON_RESIDENT', 0.1400),
  ('NR_MANAGEMENT_TECHNICAL_SERVICE_14', 'Non-resident management and technical services', 'NON_RESIDENT', 0.1400),
  ('NR_DIVIDEND_14', 'Non-resident dividends', 'NON_RESIDENT', 0.1400),
  ('NR_OTHER_SERVICE_14', 'Non-resident other services', 'NON_RESIDENT', 0.1400),
  ('LEGACY_RES_RENTAL_10', 'Legacy resident rental entry: confirm legal or physical person', 'RESIDENT', 0.1000),
  ('LEGACY_NONRESIDENT_14', 'Legacy non-resident entry: confirm payment object', 'NON_RESIDENT', 0.1400)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  category = VALUES(category),
  default_tax_rate = VALUES(default_tax_rate);

CREATE TABLE IF NOT EXISTS wht_return_items (
  id CHAR(36) PRIMARY KEY,
  return_id BIGINT NOT NULL,
  tax_object_code VARCHAR(60) NOT NULL,
  base_amount DECIMAL(18,2) NOT NULL,
  tax_rate DECIMAL(5,4) NOT NULL,
  withholding_tax DECIMAL(18,2) NOT NULL,
  remarks TEXT NULL,
  legacy_wht_record_id BIGINT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wht_item_return FOREIGN KEY (return_id) REFERENCES tax_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_wht_item_object FOREIGN KEY (tax_object_code) REFERENCES wht_tax_objects(object_code),
  CONSTRAINT chk_wht_item_base CHECK (base_amount >= 0),
  CONSTRAINT chk_wht_item_rate CHECK (tax_rate >= 0 AND tax_rate <= 1),
  INDEX idx_wht_return_items_return (return_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wht_legacy_imports (
  legacy_wht_record_id BIGINT PRIMARY KEY,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO wht_return_items
  (id, return_id, tax_object_code, base_amount, tax_rate, withholding_tax, remarks, legacy_wht_record_id)
SELECT
  UUID(),
  legacy.tax_period_id,
  CASE
    WHEN legacy.wht_type = 'non_resident' THEN 'LEGACY_NONRESIDENT_14'
    WHEN legacy.category = 'service_15' THEN 'RES_SERVICE_ROYALTY_15'
    WHEN legacy.category = 'interest_non_bank_15' THEN 'RES_NONBANK_INTEREST_15'
    WHEN legacy.category = 'fixed_deposit_6' THEN 'RES_FIXED_DEPOSIT_INTEREST_6'
    WHEN legacy.category = 'savings_4' THEN 'RES_NONFIXED_SAVINGS_INTEREST_4'
    WHEN legacy.category = 'rental_10' THEN 'LEGACY_RES_RENTAL_10'
    ELSE 'LEGACY_NONRESIDENT_14'
  END,
  legacy.base_amount_khr,
  legacy.wht_rate,
  legacy.wht_amount_khr,
  legacy.remarks,
  legacy.id
FROM wht_records AS legacy
WHERE NOT EXISTS (
  SELECT 1 FROM wht_legacy_imports AS imported WHERE imported.legacy_wht_record_id = legacy.id
);

UPDATE wht_return_items AS item
JOIN wht_records AS legacy ON legacy.id = item.legacy_wht_record_id
SET item.tax_object_code = CASE
  WHEN legacy.wht_type = 'non_resident' THEN 'LEGACY_NONRESIDENT_14'
  WHEN legacy.category = 'service_15' THEN 'RES_SERVICE_ROYALTY_15'
  WHEN legacy.category = 'interest_non_bank_15' THEN 'RES_NONBANK_INTEREST_15'
  WHEN legacy.category = 'fixed_deposit_6' THEN 'RES_FIXED_DEPOSIT_INTEREST_6'
  WHEN legacy.category = 'savings_4' THEN 'RES_NONFIXED_SAVINGS_INTEREST_4'
  WHEN legacy.category = 'rental_10' THEN 'LEGACY_RES_RENTAL_10'
  ELSE 'LEGACY_NONRESIDENT_14'
END;

INSERT IGNORE INTO wht_legacy_imports (legacy_wht_record_id)
SELECT id FROM wht_records;

CREATE TABLE IF NOT EXISTS vat_returns (
  tax_period_id BIGINT PRIMARY KEY,
  box_05_previous_credit_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_06_non_taxable_purchases_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_07_local_purchases_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_08_local_input_vat_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_09_import_purchases_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_10_import_input_vat_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_11_total_input_vat_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_12_non_taxable_sales_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_13_export_sales_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_14_standard_sales_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_15_output_vat_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_16_total_output_vat_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_16_tax_payable_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_17_tax_due_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  box_18_credit_carried_forward_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE
) ENGINE=InnoDB;
