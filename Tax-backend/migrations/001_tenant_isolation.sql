-- Run after schema.sql. Legacy operational data is assigned only to the
-- existing Super Admin's company; newly registered companies remain empty.
DELIMITER $$

DROP PROCEDURE IF EXISTS migrate_tenant_isolation$$
CREATE PROCEDURE migrate_tenant_isolation()
BEGIN
  DECLARE finished TINYINT DEFAULT 0;
  DECLARE table_name VARCHAR(64);
  DECLARE user_finished TINYINT DEFAULT 0;
  DECLARE unlinked_user_id INT;
  DECLARE unlinked_name VARCHAR(120);
  DECLARE unlinked_enterprise VARCHAR(180);

  DECLARE tenant_tables CURSOR FOR
    SELECT 'chart_of_accounts' UNION ALL SELECT 'journal_entries'
    UNION ALL SELECT 'journal_entry_lines' UNION ALL SELECT 'user_branch_access'
    UNION ALL SELECT 'vendors' UNION ALL SELECT 'fixed_asset_classes'
    UNION ALL SELECT 'fixed_assets' UNION ALL SELECT 'fixed_asset_depreciation'
    UNION ALL SELECT 'customers' UNION ALL SELECT 'items'
    UNION ALL SELECT 'item_branch_stock' UNION ALL SELECT 'invoices'
    UNION ALL SELECT 'khqr_payment_intents' UNION ALL SELECT 'invoice_lines'
    UNION ALL SELECT 'sales_returns' UNION ALL SELECT 'sales_return_lines'
    UNION ALL SELECT 'stock_transactions' UNION ALL SELECT 'projects'
    UNION ALL SELECT 'project_files' UNION ALL SELECT 'leave_requests'
    UNION ALL SELECT 'notifications' UNION ALL SELECT 'activity_logs'
    UNION ALL SELECT 'purchase_orders' UNION ALL SELECT 'purchase_order_items'
    UNION ALL SELECT 'purchase_returns' UNION ALL SELECT 'purchase_return_lines'
    UNION ALL SELECT 'payment_records' UNION ALL SELECT 'cash_registers'
    UNION ALL SELECT 'inventory_batches' UNION ALL SELECT 'stock_transfers'
    UNION ALL SELECT 'stock_transfer_items' UNION ALL SELECT 'stock_transfer_batches'
    UNION ALL SELECT 'ar_payments' UNION ALL SELECT 'ap_payments'
    UNION ALL SELECT 'password_resets' UNION ALL SELECT 'tax_periods'
    UNION ALL SELECT 'purchase_records' UNION ALL SELECT 'sale_records'
    UNION ALL SELECT 'salary_records' UNION ALL SELECT 'wht_records'
    UNION ALL SELECT 'annual_toi_returns' UNION ALL SELECT 'wht_return_items'
    UNION ALL SELECT 'wht_legacy_imports' UNION ALL SELECT 'vat_returns';

  DECLARE unlinked_users CURSOR FOR
    SELECT id, name, enterprise_name FROM users
    WHERE company_id IS NULL AND LOWER(role) <> 'superadmin' ORDER BY id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = 1;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_owner'
  ) THEN
    ALTER TABLE users ADD COLUMN is_owner TINYINT(1) NOT NULL DEFAULT 0;
  END IF;

  SET @tenant_admin_id = (SELECT id FROM users WHERE LOWER(role) = 'superadmin' ORDER BY id LIMIT 1);
  IF @tenant_admin_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Create a Super Admin before tenant migration.';
  END IF;
  SET @legacy_company_id = (SELECT company_id FROM users WHERE id = @tenant_admin_id);
  IF @legacy_company_id IS NULL THEN
    INSERT INTO companies (owner_user_id, enterprise_name)
    SELECT id, COALESCE(NULLIF(enterprise_name, ''), CONCAT(name, '''s Company'))
    FROM users WHERE id = @tenant_admin_id;
    SET @legacy_company_id = LAST_INSERT_ID();
    UPDATE users SET company_id = @legacy_company_id, is_owner = 1 WHERE id = @tenant_admin_id;
    UPDATE companies SET owner_user_id = @tenant_admin_id WHERE id = @legacy_company_id;
  END IF;

  UPDATE users SET company_id = @legacy_company_id, is_owner = 1
  WHERE company_id IS NULL AND LOWER(role) = 'superadmin';

  SET finished = 0;
  OPEN unlinked_users;
  assign_users: LOOP
    FETCH unlinked_users INTO unlinked_user_id, unlinked_name, unlinked_enterprise;
    IF finished = 1 THEN LEAVE assign_users; END IF;
    INSERT INTO companies (owner_user_id, enterprise_name)
    VALUES (unlinked_user_id, COALESCE(NULLIF(unlinked_enterprise, ''), CONCAT(unlinked_name, '''s Company')));
    UPDATE users SET company_id = LAST_INSERT_ID(), is_owner = 1 WHERE id = unlinked_user_id;
  END LOOP;
  CLOSE unlinked_users;

  SET finished = 0;
  OPEN tenant_tables;
  migrate_tables: LOOP
    FETCH tenant_tables INTO table_name;
    IF finished = 1 THEN LEAVE migrate_tables; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = table_name AND COLUMN_NAME = 'company_id'
    ) THEN
      SET @tenant_ddl = CONCAT('ALTER TABLE `', table_name, '` ADD COLUMN company_id BIGINT NULL');
      PREPARE tenant_stmt FROM @tenant_ddl;
      EXECUTE tenant_stmt;
      DEALLOCATE PREPARE tenant_stmt;
    END IF;

    IF table_name = 'user_branch_access' THEN
      UPDATE user_branch_access access_row
      JOIN users account ON account.id = access_row.user_id
      SET access_row.company_id = COALESCE(account.company_id, @legacy_company_id)
      WHERE access_row.company_id IS NULL;
    ELSE
      SET @tenant_ddl = CONCAT('UPDATE `', table_name, '` SET company_id = ? WHERE company_id IS NULL');
      PREPARE tenant_stmt FROM @tenant_ddl;
      SET @tenant_company = @legacy_company_id;
      EXECUTE tenant_stmt USING @tenant_company;
      DEALLOCATE PREPARE tenant_stmt;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = table_name AND INDEX_NAME = CONCAT('idx_', table_name, '_company')
    ) THEN
      SET @tenant_ddl = CONCAT('ALTER TABLE `', table_name, '` ADD INDEX `idx_', table_name, '_company` (company_id)');
      PREPARE tenant_stmt FROM @tenant_ddl;
      EXECUTE tenant_stmt;
      DEALLOCATE PREPARE tenant_stmt;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = table_name
        AND CONSTRAINT_NAME = CONCAT('fk_', table_name, '_company')
    ) THEN
      SET @tenant_ddl = CONCAT(
        'ALTER TABLE `', table_name, '` ADD CONSTRAINT `fk_', table_name,
        '_company` FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT'
      );
      PREPARE tenant_stmt FROM @tenant_ddl;
      EXECUTE tenant_stmt;
      DEALLOCATE PREPARE tenant_stmt;
    END IF;

    SET @tenant_ddl = CONCAT('ALTER TABLE `', table_name, '` MODIFY company_id BIGINT NOT NULL');
    PREPARE tenant_stmt FROM @tenant_ddl;
    EXECUTE tenant_stmt;
    DEALLOCATE PREPARE tenant_stmt;
  END LOOP;
  CLOSE tenant_tables;

  BEGIN
    DECLARE key_finished TINYINT DEFAULT 0;
    DECLARE key_table VARCHAR(64);
    DECLARE key_column VARCHAR(64);
    DECLARE key_index VARCHAR(64);
    DECLARE tenant_keys CURSOR FOR
      SELECT 'chart_of_accounts', 'account_code', 'uq_chart_accounts_company_code'
      UNION ALL SELECT 'fixed_asset_classes', 'class_code', 'uq_fixed_asset_classes_company_code'
      UNION ALL SELECT 'items', 'barcode', 'uq_items_company_barcode'
      UNION ALL SELECT 'journal_entries', 'entry_number', 'uq_journal_entries_company_number'
      UNION ALL SELECT 'invoices', 'invoice_no', 'uq_invoices_company_number'
      UNION ALL SELECT 'sales_returns', 'return_no', 'uq_sales_returns_company_number'
      UNION ALL SELECT 'purchase_orders', 'order_no', 'uq_purchase_orders_company_number'
      UNION ALL SELECT 'purchase_returns', 'return_no', 'uq_purchase_returns_company_number'
      UNION ALL SELECT 'fixed_assets', 'asset_number', 'uq_fixed_assets_company_number'
      UNION ALL SELECT 'fixed_assets', 'asset_code', 'uq_fixed_assets_company_code'
      UNION ALL SELECT 'cash_registers', 'open_branch', 'uq_cash_registers_company_open_branch'
      UNION ALL SELECT 'stock_transfers', 'transfer_no', 'uq_stock_transfers_company_number';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET key_finished = 1;

    OPEN tenant_keys;
    tenant_key_loop: LOOP
      FETCH tenant_keys INTO key_table, key_column, key_index;
      IF key_finished = 1 THEN LEAVE tenant_key_loop; END IF;

      SELECT GROUP_CONCAT(CONCAT('DROP INDEX `', indexed_column.INDEX_NAME, '`') SEPARATOR ', ')
      INTO @tenant_drop_indexes
      FROM information_schema.STATISTICS indexed_column
      WHERE indexed_column.TABLE_SCHEMA = DATABASE()
        AND indexed_column.TABLE_NAME = key_table
        AND indexed_column.COLUMN_NAME = key_column
        AND indexed_column.NON_UNIQUE = 0
        AND indexed_column.INDEX_NAME <> 'PRIMARY'
        AND (SELECT COUNT(*) FROM information_schema.STATISTICS all_columns
             WHERE all_columns.TABLE_SCHEMA = indexed_column.TABLE_SCHEMA
               AND all_columns.TABLE_NAME = indexed_column.TABLE_NAME
               AND all_columns.INDEX_NAME = indexed_column.INDEX_NAME) = 1;
      IF @tenant_drop_indexes IS NOT NULL THEN
        SET @tenant_ddl = CONCAT('ALTER TABLE `', key_table, '` ', @tenant_drop_indexes);
        PREPARE tenant_stmt FROM @tenant_ddl;
        EXECUTE tenant_stmt;
        DEALLOCATE PREPARE tenant_stmt;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = key_table AND INDEX_NAME = key_index
      ) THEN
        SET @tenant_ddl = CONCAT(
          'ALTER TABLE `', key_table, '` ADD UNIQUE INDEX `', key_index,
          '` (company_id, `', key_column, '`)'
        );
        PREPARE tenant_stmt FROM @tenant_ddl;
        EXECUTE tenant_stmt;
        DEALLOCATE PREPARE tenant_stmt;
      END IF;
    END LOOP;
    CLOSE tenant_keys;
  END;

  BEGIN
    DECLARE composite_finished TINYINT DEFAULT 0;
    DECLARE composite_table VARCHAR(64);
    DECLARE composite_columns VARCHAR(255);
    DECLARE composite_index VARCHAR(64);
    DECLARE composite_keys CURSOR FOR
      SELECT 'tax_periods', 'company_name,period_year,period_month', 'uq_tax_periods_tenant_month';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET composite_finished = 1;

    OPEN composite_keys;
    composite_key_loop: LOOP
      FETCH composite_keys INTO composite_table, composite_columns, composite_index;
      IF composite_finished = 1 THEN LEAVE composite_key_loop; END IF;

      SELECT GROUP_CONCAT(CONCAT('DROP INDEX `', indexed_column.INDEX_NAME, '`') SEPARATOR ', ')
      INTO @tenant_drop_indexes
      FROM information_schema.STATISTICS indexed_column
      WHERE indexed_column.TABLE_SCHEMA = DATABASE()
        AND indexed_column.TABLE_NAME = composite_table
        AND indexed_column.NON_UNIQUE = 0
        AND indexed_column.INDEX_NAME <> 'PRIMARY'
        AND (SELECT GROUP_CONCAT(all_columns.COLUMN_NAME ORDER BY all_columns.SEQ_IN_INDEX SEPARATOR ',')
             FROM information_schema.STATISTICS all_columns
             WHERE all_columns.TABLE_SCHEMA = indexed_column.TABLE_SCHEMA
               AND all_columns.TABLE_NAME = indexed_column.TABLE_NAME
               AND all_columns.INDEX_NAME = indexed_column.INDEX_NAME) = composite_columns;
      IF @tenant_drop_indexes IS NOT NULL THEN
        SET @tenant_ddl = CONCAT('ALTER TABLE `', composite_table, '` ', @tenant_drop_indexes);
        PREPARE tenant_stmt FROM @tenant_ddl;
        EXECUTE tenant_stmt;
        DEALLOCATE PREPARE tenant_stmt;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = composite_table AND INDEX_NAME = composite_index
      ) THEN
        SET @tenant_ddl = CONCAT(
          'ALTER TABLE `', composite_table, '` ADD UNIQUE INDEX `', composite_index,
          '` (company_id, ', REPLACE(composite_columns, ',', ', '), ')'
        );
        PREPARE tenant_stmt FROM @tenant_ddl;
        EXECUTE tenant_stmt;
        DEALLOCATE PREPARE tenant_stmt;
      END IF;
    END LOOP;
    CLOSE composite_keys;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chart_of_accounts'
      AND INDEX_NAME = 'uq_chart_accounts_company_id'
  ) THEN
    ALTER TABLE chart_of_accounts ADD UNIQUE INDEX uq_chart_accounts_company_id (company_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_entries'
      AND INDEX_NAME = 'uq_journal_entries_company_id'
  ) THEN
    ALTER TABLE journal_entries ADD UNIQUE INDEX uq_journal_entries_company_id (company_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'chart_of_accounts'
      AND CONSTRAINT_NAME = 'fk_chart_accounts_company_parent'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM chart_of_accounts child
      JOIN chart_of_accounts parent ON parent.id = child.parent_id
      WHERE child.parent_id IS NOT NULL AND child.company_id <> parent.company_id
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Chart of accounts contains cross-company parent references.';
    END IF;
    ALTER TABLE chart_of_accounts
      ADD CONSTRAINT fk_chart_accounts_company_parent
      FOREIGN KEY (company_id, parent_id)
      REFERENCES chart_of_accounts(company_id, id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_entry_lines'
      AND CONSTRAINT_NAME = 'fk_journal_entry_lines_company_entry'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM journal_entry_lines line
      JOIN journal_entries entry ON entry.id = line.journal_entry_id
      WHERE line.company_id <> entry.company_id
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Journal lines contain cross-company journal references.';
    END IF;
    ALTER TABLE journal_entry_lines
      ADD CONSTRAINT fk_journal_entry_lines_company_entry
      FOREIGN KEY (company_id, journal_entry_id)
      REFERENCES journal_entries(company_id, id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_entry_lines'
      AND CONSTRAINT_NAME = 'fk_journal_entry_lines_company_account'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM journal_entry_lines line
      JOIN chart_of_accounts account ON account.id = line.account_id
      WHERE line.company_id <> account.company_id
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Journal lines contain cross-company account references.';
    END IF;
    ALTER TABLE journal_entry_lines
      ADD CONSTRAINT fk_journal_entry_lines_company_account
      FOREIGN KEY (company_id, account_id)
      REFERENCES chart_of_accounts(company_id, id) ON DELETE RESTRICT;
  END IF;

  CREATE TABLE IF NOT EXISTS categories (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_categories_company_name (company_id, name),
    INDEX idx_categories_company (company_id),
    CONSTRAINT fk_categories_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB;
  CREATE TABLE IF NOT EXISTS company_tax_rates (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT NOT NULL,
    rate_code VARCHAR(40) NOT NULL,
    rate_name VARCHAR(120) NOT NULL,
    rate_percent DECIMAL(7,4) NOT NULL,
    tax_type VARCHAR(30) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_company_tax_rate_code (company_id, rate_code),
    INDEX idx_company_tax_rates_company (company_id),
    CONSTRAINT fk_company_tax_rates_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB;
  CREATE TABLE IF NOT EXISTS company_settings (
    company_id BIGINT NOT NULL,
    setting_key VARCHAR(80) NOT NULL,
    setting_value JSON NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, setting_key),
    CONSTRAINT fk_company_settings_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB;
END$$

CALL migrate_tenant_isolation()$$
DROP PROCEDURE migrate_tenant_isolation$$
DELIMITER ;