const TENANT_TABLES = [
  'chart_of_accounts', 'journal_entries', 'journal_entry_lines', 'user_branch_access',
  'vendors', 'fixed_asset_classes', 'fixed_assets', 'fixed_asset_depreciation',
  'customers', 'items', 'item_branch_stock', 'invoices', 'khqr_payment_intents',
  'invoice_lines', 'sales_returns', 'sales_return_lines', 'stock_transactions',
  'projects', 'project_files', 'leave_requests', 'notifications', 'activity_logs',
  'purchase_orders', 'purchase_order_items', 'purchase_returns', 'purchase_return_lines',
  'payment_records', 'cash_registers', 'inventory_batches', 'stock_transfers',
  'stock_transfer_items', 'stock_transfer_batches', 'ar_payments', 'ap_payments',
  'password_resets', 'tax_periods', 'purchase_records', 'sale_records',
  'salary_records', 'wht_records', 'annual_toi_returns', 'wht_return_items',
  'wht_legacy_imports', 'vat_returns',
];

const TENANT_UNIQUE_KEYS = [
  ['chart_of_accounts', 'account_code', 'uq_chart_accounts_company_code'],
  ['fixed_asset_classes', 'class_code', 'uq_fixed_asset_classes_company_code'],
  ['items', 'barcode', 'uq_items_company_barcode'],
  ['journal_entries', 'entry_number', 'uq_journal_entries_company_number'],
  ['invoices', 'invoice_no', 'uq_invoices_company_number'],
  ['sales_returns', 'return_no', 'uq_sales_returns_company_number'],
  ['purchase_orders', 'order_no', 'uq_purchase_orders_company_number'],
  ['purchase_returns', 'return_no', 'uq_purchase_returns_company_number'],
  ['fixed_assets', 'asset_number', 'uq_fixed_assets_company_number'],
  ['fixed_assets', 'asset_code', 'uq_fixed_assets_company_code'],
  ['cash_registers', 'open_branch', 'uq_cash_registers_company_open_branch'],
  ['stock_transfers', 'transfer_no', 'uq_stock_transfers_company_number'],
];

const TENANT_COMPOSITE_UNIQUE_KEYS = [
  ['tax_periods', ['company_name', 'period_year', 'period_month'], 'uq_tax_periods_tenant_month'],
];

const TENANT_COMPOSITE_FOREIGN_KEYS = [
  {
    tableName: 'chart_of_accounts',
    indexName: 'uq_chart_accounts_company_id',
    constraintName: 'fk_chart_accounts_company_parent',
    columns: ['company_id', 'parent_id'],
    referencedTable: 'chart_of_accounts',
    referencedColumns: ['company_id', 'id'],
    onDelete: 'RESTRICT',
    invalidRowsQuery: `SELECT COUNT(*) AS count FROM chart_of_accounts child
      JOIN chart_of_accounts parent ON parent.id = child.parent_id
      WHERE child.parent_id IS NOT NULL AND child.company_id <> parent.company_id`,
  },
  {
    tableName: 'journal_entries',
    indexName: 'uq_journal_entries_company_id',
    constraintName: null,
    columns: null,
  },
  {
    tableName: 'journal_entry_lines',
    indexName: null,
    constraintName: 'fk_journal_entry_lines_company_entry',
    columns: ['company_id', 'journal_entry_id'],
    referencedTable: 'journal_entries',
    referencedColumns: ['company_id', 'id'],
    onDelete: 'CASCADE',
    invalidRowsQuery: `SELECT COUNT(*) AS count FROM journal_entry_lines line
      JOIN journal_entries entry ON entry.id = line.journal_entry_id
      WHERE line.company_id <> entry.company_id`,
  },
  {
    tableName: 'journal_entry_lines',
    indexName: null,
    constraintName: 'fk_journal_entry_lines_company_account',
    columns: ['company_id', 'account_id'],
    referencedTable: 'chart_of_accounts',
    referencedColumns: ['company_id', 'id'],
    onDelete: 'RESTRICT',
    invalidRowsQuery: `SELECT COUNT(*) AS count FROM journal_entry_lines line
      JOIN chart_of_accounts account ON account.id = line.account_id
      WHERE line.company_id <> account.company_id`,
  },
];

async function hasColumn(connection, databaseName, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [databaseName, tableName, columnName]
  );
  return Number(rows[0].count) > 0;
}

async function assignUnlinkedUsers(connection, legacyCompanyId) {
  const tenantId = Number(legacyCompanyId);
  if (!Number.isSafeInteger(tenantId) || tenantId < 1) {
    throw new Error('A valid legacy company ID is required to assign unlinked users.');
  }
  const [users] = await connection.query(
    `SELECT id, name, enterprise_name, is_owner FROM users
     WHERE company_id IS NULL AND LOWER(role) <> 'superadmin' ORDER BY id`
  );
  for (const user of users) {
    const [ownedCompanies] = await connection.query(
      'SELECT id FROM companies WHERE owner_user_id = ? ORDER BY id LIMIT 1',
      [user.id]
    );
    if (ownedCompanies.length) {
      await connection.query(
        'UPDATE users SET company_id = ?, is_owner = 1 WHERE id = ?',
        [ownedCompanies[0].id, user.id]
      );
      continue;
    }

    if (Number(user.is_owner) !== 1) {
      await connection.query(
        'UPDATE users SET company_id = ?, is_owner = 0 WHERE id = ?',
        [tenantId, user.id]
      );
      continue;
    }

    const [result] = await connection.query(
      'INSERT INTO companies (owner_user_id, enterprise_name) VALUES (?, ?)',
      [user.id, user.enterprise_name || `${user.name}'s Company`]
    );
    await connection.query(
      'UPDATE users SET company_id = ?, is_owner = 1 WHERE id = ?',
      [result.insertId, user.id]
    );
  }
}

async function getOrCreateLegacyCompany(connection) {
  const [platformAdmins] = await connection.query(
    `SELECT id, name, enterprise_name, company_id
     FROM users WHERE LOWER(role) = 'superadmin' ORDER BY id LIMIT 1`
  );
  if (!platformAdmins.length) throw new Error('Cannot migrate tenant data before the Super Admin account exists.');
  const platformAdmin = platformAdmins[0];
  let companyId = platformAdmin.company_id ? Number(platformAdmin.company_id) : null;

  if (!companyId) {
    const [owned] = await connection.query(
      'SELECT id FROM companies WHERE owner_user_id = ? ORDER BY id LIMIT 1',
      [platformAdmin.id]
    );
    if (owned.length) companyId = Number(owned[0].id);
  }

  if (!companyId) {
    const [existingCompanies] = await connection.query('SELECT id FROM companies ORDER BY id LIMIT 1');
    if (existingCompanies.length) companyId = Number(existingCompanies[0].id);
  }

  if (!companyId) {
    const [result] = await connection.query(
      'INSERT INTO companies (enterprise_name) VALUES (?)',
      [platformAdmin.enterprise_name || `${platformAdmin.name}'s Company`]
    );
    companyId = Number(result.insertId);
  }

  await connection.query(
    `UPDATE companies SET owner_user_id = NULL
     WHERE id = ? AND owner_user_id = ?`,
    [companyId, platformAdmin.id]
  );
  await connection.query('UPDATE users SET company_id = NULL, is_owner = 0 WHERE id = ?', [platformAdmin.id]);

  const [owners] = await connection.query(
    'SELECT owner_user_id FROM companies WHERE id = ?',
    [companyId]
  );
  if (owners[0]?.owner_user_id == null) {
    const [candidates] = await connection.query(
      `SELECT id FROM users
       WHERE id <> ? AND LOWER(role) = 'admin' AND active = 1
         AND status = 'ACTIVE' AND approval_status = 'approved'
         AND (company_id IS NULL OR company_id = ?)
       ORDER BY id LIMIT 1`,
      [platformAdmin.id, companyId]
    );
    if (candidates.length) {
      await connection.query('UPDATE users SET company_id = ?, is_owner = 1 WHERE id = ?', [companyId, candidates[0].id]);
      await connection.query('UPDATE companies SET owner_user_id = ? WHERE id = ?', [candidates[0].id, companyId]);
    }
  }

  return companyId;
}

async function ensureTenantColumn(connection, databaseName, tableName, legacyCompanyId) {
  if (!await hasColumn(connection, databaseName, tableName, 'company_id')) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN company_id BIGINT NULL`);
  }

  if (tableName === 'user_branch_access') {
    await connection.query(
      `UPDATE user_branch_access access_row
       JOIN users account ON account.id = access_row.user_id
       SET access_row.company_id = COALESCE(account.company_id, ?)
       WHERE access_row.company_id IS NULL`,
      [legacyCompanyId]
    );
  } else {
    await connection.query(
      `UPDATE \`${tableName}\` SET company_id = ? WHERE company_id IS NULL`,
      [legacyCompanyId]
    );
  }

  const indexName = `idx_${tableName}_company`;
  const [indexes] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [databaseName, tableName, indexName]
  );
  if (!Number(indexes[0].count)) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (company_id)`);
  }

  const constraintName = `fk_${tableName}_company`;
  const [constraints] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [databaseName, tableName, constraintName]
  );
  if (!Number(constraints[0].count)) {
    await connection.query(
      `ALTER TABLE \`${tableName}\`
       ADD CONSTRAINT \`${constraintName}\`
       FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT`
    );
  }
  await connection.query(`ALTER TABLE \`${tableName}\` MODIFY company_id BIGINT NOT NULL`);
}

async function replaceUniqueKey(connection, databaseName, tableName, columnName, indexName) {
  const [indexes] = await connection.query(
    `SELECT DISTINCT INDEX_NAME
     FROM information_schema.STATISTICS indexed_column
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
       AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
       AND (SELECT COUNT(*) FROM information_schema.STATISTICS all_columns
            WHERE all_columns.TABLE_SCHEMA = indexed_column.TABLE_SCHEMA
              AND all_columns.TABLE_NAME = indexed_column.TABLE_NAME
              AND all_columns.INDEX_NAME = indexed_column.INDEX_NAME) = 1`,
    [databaseName, tableName, columnName]
  );
  for (const index of indexes) {
    await connection.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${index.INDEX_NAME}\``);
  }
  const [target] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [databaseName, tableName, indexName]
  );
  if (!Number(target[0].count)) {
    await connection.query(
      `ALTER TABLE \`${tableName}\` ADD UNIQUE INDEX \`${indexName}\` (company_id, \`${columnName}\`)`
    );
  }
}

async function replaceCompositeUniqueKey(connection, databaseName, tableName, columns, indexName) {
  const columnList = columns.join(',');
  const [indexes] = await connection.query(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
     GROUP BY INDEX_NAME
     HAVING GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') = ?`,
    [databaseName, tableName, columnList]
  );
  for (const index of indexes) {
    await connection.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${index.INDEX_NAME}\``);
  }
  const [target] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [databaseName, tableName, indexName]
  );
  if (!Number(target[0].count)) {
    await connection.query(
      `ALTER TABLE \`${tableName}\` ADD UNIQUE INDEX \`${indexName}\` (company_id, ${columns.map((column) => `\`${column}\``).join(', ')})`
    );
  }
}

async function ensureAccountingCompositeForeignKeys(connection, databaseName) {
  for (const config of TENANT_COMPOSITE_FOREIGN_KEYS) {
    if (config.indexName) {
      const [indexes] = await connection.query(
        `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [databaseName, config.tableName, config.indexName]
      );
      if (!Number(indexes[0].count)) {
        await connection.query(
          `ALTER TABLE \`${config.tableName}\` ADD UNIQUE INDEX \`${config.indexName}\` (company_id, id)`
        );
      }
    }
    if (!config.constraintName) continue;

    const [constraints] = await connection.query(
      `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
      [databaseName, config.tableName, config.constraintName]
    );
    if (Number(constraints[0].count)) continue;

    const [invalidRows] = await connection.query(config.invalidRowsQuery);
    if (Number(invalidRows[0].count)) {
      throw new Error(`Cannot enforce ${config.constraintName}: accounting records reference another company's data.`);
    }

    await connection.query(
      `ALTER TABLE \`${config.tableName}\`
       ADD CONSTRAINT \`${config.constraintName}\`
       FOREIGN KEY (${config.columns.map((column) => `\`${column}\``).join(', ')})
       REFERENCES \`${config.referencedTable}\` (${config.referencedColumns.map((column) => `\`${column}\``).join(', ')})
       ON DELETE ${config.onDelete}`
    );
  }
}

async function ensureTenantWriteTriggers(connection, databaseName, tableName) {
  const triggerDefinitions = [
    ['insert', 'INSERT', `IF COALESCE(@tax_schema_migration_context, 0) <> 1
        AND @tax_company_id IS NOT NULL AND NEW.company_id IS NOT NULL
        AND NEW.company_id <> @tax_company_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cross-tenant write rejected';
      END IF;
      SET NEW.company_id = COALESCE(@tax_company_id, NEW.company_id);
      IF COALESCE(@tax_schema_migration_context, 0) <> 1 AND NEW.company_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tenant context required for tenant data';
      END IF;
      `],
    ['update', 'UPDATE', `IF COALESCE(@tax_schema_migration_context, 0) <> 1
        AND @tax_company_id IS NOT NULL
        AND (OLD.company_id <> @tax_company_id OR NEW.company_id <> @tax_company_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cross-tenant write rejected';
      END IF;`],
    ['delete', 'DELETE', `IF COALESCE(@tax_schema_migration_context, 0) <> 1
        AND @tax_company_id IS NOT NULL AND OLD.company_id <> @tax_company_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cross-tenant write rejected';
      END IF;`],
  ];

  for (const [suffix, operation, body] of triggerDefinitions) {
    const triggerName = `trg_tenant_${tableName}_${suffix}`;
    const [existing] = await connection.query(
      `SELECT ACTION_STATEMENT FROM information_schema.TRIGGERS
       WHERE TRIGGER_SCHEMA = ? AND TRIGGER_NAME = ?`,
      [databaseName, triggerName]
    );
    const staleTrigger = existing[0]
      && !String(existing[0].ACTION_STATEMENT).includes('@tax_schema_migration_context');
    if (staleTrigger) await connection.query(`DROP TRIGGER \`${triggerName}\``);
    else if (existing.length) continue;
    await connection.query(
      `CREATE TRIGGER \`${triggerName}\` BEFORE ${operation} ON \`${tableName}\`
       FOR EACH ROW BEGIN ${body} END`
    );
  }
}

async function prepareTenantTriggersForSchemaMigration(connection, databaseName) {
  for (const tableName of TENANT_TABLES) {
    if (await hasColumn(connection, databaseName, tableName, 'company_id')) {
      await ensureTenantWriteTriggers(connection, databaseName, tableName);
    }
  }
}

async function ensureCompanySupportTables(connection) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS categories (
       id BIGINT AUTO_INCREMENT PRIMARY KEY,
       company_id BIGINT NOT NULL,
       name VARCHAR(120) NOT NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uq_categories_company_name (company_id, name),
       INDEX idx_categories_company (company_id),
       CONSTRAINT fk_categories_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT
     ) ENGINE=InnoDB`
  );
  await connection.query(
    `CREATE TABLE IF NOT EXISTS company_tax_rates (
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
     ) ENGINE=InnoDB`
  );
  await connection.query(
    `CREATE TABLE IF NOT EXISTS company_settings (
       company_id BIGINT NOT NULL,
       setting_key VARCHAR(80) NOT NULL,
       setting_value JSON NOT NULL,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (company_id, setting_key),
       CONSTRAINT fk_company_settings_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT
     ) ENGINE=InnoDB`
  );
}

async function migrateTenantSchema(connection, databaseName) {
  await ensureCompanySupportTables(connection);
  if (!await hasColumn(connection, databaseName, 'users', 'is_owner')) {
    await connection.query('ALTER TABLE users ADD COLUMN is_owner TINYINT(1) NOT NULL DEFAULT 0');
  }

  const legacyCompanyId = await getOrCreateLegacyCompany(connection);
  await connection.query('UPDATE users SET company_id = NULL, is_owner = 0 WHERE LOWER(role) = \'superadmin\'');
  await assignUnlinkedUsers(connection, legacyCompanyId);
  await connection.query(
    `INSERT IGNORE INTO company_settings (company_id, setting_key, setting_value)
     SELECT ?, 'company', setting_value FROM settings WHERE setting_key = 'company'`,
    [legacyCompanyId]
  );
  for (const tableName of TENANT_TABLES) {
    await ensureTenantColumn(connection, databaseName, tableName, legacyCompanyId);
  }
  for (const [tableName, columnName, indexName] of TENANT_UNIQUE_KEYS) {
    await replaceUniqueKey(connection, databaseName, tableName, columnName, indexName);
  }
  for (const [tableName, columns, indexName] of TENANT_COMPOSITE_UNIQUE_KEYS) {
    await replaceCompositeUniqueKey(connection, databaseName, tableName, columns, indexName);
  }
  await ensureAccountingCompositeForeignKeys(connection, databaseName);
  for (const tableName of TENANT_TABLES) {
    await ensureTenantWriteTriggers(connection, databaseName, tableName);
  }
  return legacyCompanyId;
}

module.exports = {
  assignUnlinkedUsers,
  ensureAccountingCompositeForeignKeys,
  ensureTenantWriteTriggers,
  getOrCreateLegacyCompany,
  migrateTenantSchema,
  prepareTenantTriggersForSchemaMigration,
  TENANT_COMPOSITE_FOREIGN_KEYS,
  TENANT_COMPOSITE_UNIQUE_KEYS,
  TENANT_TABLES,
  TENANT_UNIQUE_KEYS,
};