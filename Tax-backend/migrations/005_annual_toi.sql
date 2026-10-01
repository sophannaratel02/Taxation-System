CREATE TABLE IF NOT EXISTS annual_toi_returns (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(180) NOT NULL,
  enterprise_tin VARCHAR(50) NOT NULL,
  tax_year SMALLINT UNSIGNED NOT NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  values_json JSON NOT NULL,
  details_json JSON NOT NULL,
  calculations_json JSON NOT NULL,
  status ENUM('draft','filed') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_annual_toi_enterprise_year (enterprise_tin, tax_year),
  INDEX idx_annual_toi_year_status (tax_year, status)
) ENGINE=InnoDB;