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