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
  CONSTRAINT fk_purchase_tax_period FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE,
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
  CONSTRAINT fk_sale_tax_period FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE,
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
  CONSTRAINT fk_salary_tax_period FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE,
  INDEX idx_salary_period_employee (tax_period_id, employee_name)
) ENGINE=InnoDB;

UPDATE salary_records SET tax_rate = 0 WHERE tax_rate < 0 OR tax_rate > 1;
ALTER TABLE salary_records MODIFY COLUMN tax_rate DECIMAL(7,6) NOT NULL DEFAULT 0.000000;
ALTER TABLE salary_records MODIFY COLUMN tos_amount_khr DECIMAL(16,2) NOT NULL DEFAULT 0.00;

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
  CONSTRAINT fk_wht_tax_period FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE,
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
  CONSTRAINT fk_vat_return_tax_period FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO tax_periods (company_name, vat_tin, period_month, period_year, nbc_exchange_rate, status)
VALUES ('Axis Investment Consulting', 'K002-107004771', 2, 2020, 4070.00, 'draft')
ON DUPLICATE KEY UPDATE vat_tin = VALUES(vat_tin);