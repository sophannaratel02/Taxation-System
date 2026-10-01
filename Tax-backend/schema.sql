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
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(80) UNIQUE NOT NULL,
  email VARCHAR(255) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Vendors & Suppliers
CREATE TABLE IF NOT EXISTS vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(60) NULL,
  vat_tin VARCHAR(50) NULL, -- Tax Identification Number for input VAT claims
  credit_limit DECIMAL(14,2) DEFAULT 0.00,
  note TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 4. Customers
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(60) NULL,
  vat_tin VARCHAR(50) NULL, -- Customer VAT TIN for B2B Tax Invoices
  deposit DECIMAL(14,2) DEFAULT 0.00,
  reward_points INT DEFAULT 0,
  balance DECIMAL(14,2) DEFAULT 0.00,
  credit_limit DECIMAL(14,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  qty_on_hand DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  reorder_qty DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  retail_price DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  purchase_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  average_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  vendor_id INT NULL,
  units JSON NOT NULL, -- e.g., [{"unit": "Box", "factor": 24, "barcode": "..."}]
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  INDEX idx_items_barcode (barcode),
  INDEX idx_items_name_en (name_en)
) ENGINE=InnoDB;

-- 6. Invoices (Tax Invoices)
CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(40) UNIQUE NOT NULL,
  invoice_type ENUM('TaxInvoice', 'CommercialInvoice') NOT NULL DEFAULT 'CommercialInvoice',
  customer_id INT NULL,
  customer_name VARCHAR(160) NOT NULL,
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
  qty DECIMAL(14,3) NOT NULL,
  unit_price DECIMAL(14,4) NOT NULL,
  cost_price DECIMAL(14,4) NOT NULL DEFAULT 0.0000, -- Historical cost snapshot for COGS
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

-- 8. Stock Movement Audit Trail
CREATE TABLE IF NOT EXISTS stock_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  item_name VARCHAR(180) NOT NULL,
  type ENUM('Sale', 'Purchase', 'Adjustment', 'Transfer', 'Reversed') NOT NULL,
  qty DECIMAL(14,3) NOT NULL, -- Positive for in, negative for out
  balance_after DECIMAL(14,3) NOT NULL, -- Running balance validation
  reference VARCHAR(80) NOT NULL,
  branch VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  INDEX idx_transactions_created_at (created_at),
  INDEX idx_transactions_item_id (item_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS projects (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS project_files (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leave_requests (
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

CREATE TABLE IF NOT EXISTS purchase_orders (
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
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_items (
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
  opened_by INT NOT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  starting_cash DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  closed_by INT NULL,
  closed_at TIMESTAMP NULL,
  expected_cash DECIMAL(14,2) NULL,
  counted_cash DECIMAL(14,2) NULL,
  variance DECIMAL(14,2) NULL,
  status ENUM('Open','Closed') NOT NULL DEFAULT 'Open',
  FOREIGN KEY (opened_by) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_register_branch_status (branch, status)
) ENGINE=InnoDB;

-- 16. Batch expiry and FIFO inventory
CREATE TABLE IF NOT EXISTS inventory_batches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  batch_no VARCHAR(80) NOT NULL,
  expiry_date DATE NULL,
  qty_received DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  qty_remaining DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  INDEX idx_batches_fifo (item_id, expiry_date, created_at)
) ENGINE=InnoDB;

-- 17. Inter-branch stock transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_no VARCHAR(40) UNIQUE NOT NULL,
  from_branch VARCHAR(120) NOT NULL,
  to_branch VARCHAR(120) NOT NULL,
  status ENUM('Draft','In Transit','Received','Cancelled') NOT NULL DEFAULT 'Draft',
  created_by INT NOT NULL,
  received_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  received_at TIMESTAMP NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_id BIGINT NOT NULL,
  item_id INT NOT NULL,
  qty DECIMAL(14,3) NOT NULL,
  FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
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
  quantity DECIMAL(14,3) NOT NULL DEFAULT 1.000,
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
  quantity DECIMAL(14,3) NOT NULL DEFAULT 1.000,
  sale_type ENUM('non_taxable','export_0','taxable_person_10','local_consumer_10') NOT NULL DEFAULT 'local_consumer_10',
  taxable_amount_usd DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  taxable_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  vat_rate DECIMAL(7,6) NOT NULL DEFAULT 0.100000,
  vat_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE,
  INDEX idx_sale_period_type (tax_period_id, sale_type),
  INDEX idx_sale_invoice (tax_period_id, invoice_date, invoice_no)
) ENGINE=InnoDB;

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

INSERT INTO tax_periods (company_name, vat_tin, period_month, period_year, nbc_exchange_rate, status)
VALUES ('Axis Investment Consulting', 'K002-107004771', 2, 2020, 4070.00, 'draft')
ON DUPLICATE KEY UPDATE vat_tin = VALUES(vat_tin);