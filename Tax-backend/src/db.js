const mysql = require('mysql2/promise');
const fs = require('fs/promises');
const path = require('path');
const { backfillZeroCostAdjustments } = require('./services/stockCost');
const { getTenantCompanyId } = require('./services/tenantContext');
const {
  migrateTenantSchema,
  prepareTenantTriggersForSchemaMigration,
} = require('./services/tenantMigration');
const { seedCompanyAssetClasses, seedDefaultBranchAccess } = require('./services/companyProvisioning');
const { ensureBootstrapAdmin } = require('./services/adminBootstrap');
const { STAFF_PRESETS } = require('./services/permissions');

const QUANTITY_ROUNDING_TOLERANCE = 0.005;
let startupTenantCompanyId = null;
let schemaMigrationInProgress = false;

const dbConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'taxation_system',
};

// 1. Initial pool export
const databasePool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  multipleStatements: true,
});
const pool = new Proxy(databasePool, {
  get(target, property) {
    if (Object.prototype.hasOwnProperty.call(target, property)) {
      return Reflect.get(target, property, target);
    }
    if (property === 'query' || property === 'execute') {
      return async (...args) => {
        const connection = await target.getConnection();
        try {
          await connection.query(
            'SET @tax_company_id = ?, @tax_schema_migration_context = ?',
            [getTenantCompanyId(startupTenantCompanyId), schemaMigrationInProgress ? 1 : 0]
          );
          return await connection[property](...args);
        } finally {
          connection.release();
        }
      };
    }
    if (property === 'getConnection') {
      return async (...args) => {
        const connection = await target.getConnection(...args);
        try {
          await connection.query(
            'SET @tax_company_id = ?, @tax_schema_migration_context = ?',
            [getTenantCompanyId(startupTenantCompanyId), schemaMigrationInProgress ? 1 : 0]
          );
          return connection;
        } catch (error) {
          connection.release();
          throw error;
        }
      };
    }
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
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

async function loadStartupTenantCompanyId() {
  const [userTables] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
    [dbConfig.database]
  );
  if (!Number(userTables[0].count)) return;

  const [companyColumns] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'company_id'`,
    [dbConfig.database]
  );
  if (!Number(companyColumns[0].count)) return;

  const [admins] = await pool.query(
    `SELECT company_id FROM users
     WHERE LOWER(role) = 'superadmin' AND company_id IS NOT NULL
     ORDER BY id LIMIT 1`
  );
  if (!admins.length) return;

  const companyId = Number(admins[0].company_id);
  if (!Number.isSafeInteger(companyId) || companyId < 1) {
    throw new Error('The Super Admin account has an invalid startup company ID.');
  }
  startupTenantCompanyId = companyId;
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

async function addIndexIfMissing(tableName, indexName, columns) {
  const [indexes] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbConfig.database, tableName, indexName]
  );
  if (Number(indexes[0].count) === 0) {
    await pool.query(
      `ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columns.map((column) => `\`${column}\``).join(', ')})`
    );
  }
}

async function ensureUniqueUserEmailIndex(database = pool, ensureIndex = addUniqueIndexIfMissing, logger = console) {
  const [duplicates] = await database.query(
    `SELECT LOWER(email) AS normalized_email, COUNT(*) AS account_count
     FROM users WHERE email IS NOT NULL AND TRIM(email) <> ''
     GROUP BY LOWER(email) HAVING COUNT(*) > 1 LIMIT 1`
  );
  if (duplicates.length) {
    logger.warn(
      `Unique user email index was not added: a legacy email is shared by ${duplicates[0].account_count} accounts. ` +
      'Existing accounts were left unchanged. Resolve duplicate email values to enable the database uniqueness constraint.'
    );
    return false;
  }

  await ensureIndex('users', 'uq_users_email', 'email');
  return true;
}

async function addForeignKeyIfMissing(tableName, constraintName, clause) {
  const [constraints] = await pool.query(
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [dbConfig.database, tableName, constraintName]
  );
  if (Number(constraints[0].count) === 0) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` ${clause}`);
  }
}

async function migrateUserRoleModel() {
  await pool.query(
    `UPDATE companies company
     JOIN users platform_admin ON platform_admin.id = company.owner_user_id
     SET company.owner_user_id = NULL
     WHERE LOWER(platform_admin.role) = 'superadmin'`
  );
  await pool.query(
    `UPDATE users
     SET is_owner = 0
     WHERE LOWER(role) = 'superadmin'`
  );
  await pool.query(
    `UPDATE companies company
     JOIN users tenant_owner
       ON tenant_owner.company_id = company.id
      AND tenant_owner.is_owner = 1
      AND LOWER(tenant_owner.role) <> 'superadmin'
     SET company.owner_user_id = tenant_owner.id
     WHERE company.owner_user_id IS NULL`
  );
  await pool.query(
    `UPDATE users tenant_user
     JOIN companies company ON company.id = tenant_user.company_id
     SET tenant_user.is_owner = 0
     WHERE tenant_user.is_owner = 1
       AND LOWER(tenant_user.role) <> 'superadmin'
       AND company.owner_user_id IS NOT NULL
       AND company.owner_user_id <> tenant_user.id`
  );

  const [unownedCompanies] = await pool.query(
    `SELECT company.id
     FROM companies company
     WHERE company.owner_user_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM users owner
         WHERE owner.company_id = company.id AND owner.is_owner = 1
           AND LOWER(owner.role) <> 'superadmin'
       )
     ORDER BY company.id`
  );
  const ownerlessNames = [];
  for (const company of unownedCompanies) {
    const [candidates] = await pool.query(
      `SELECT id FROM users
       WHERE company_id = ? AND LOWER(role) = 'admin'
         AND active = 1 AND status = 'ACTIVE' AND approval_status = 'approved'
       ORDER BY id LIMIT 1`,
      [company.id]
    );
    if (!candidates.length) {
      ownerlessNames.push(Number(company.id));
      continue;
    }

    await pool.query('UPDATE companies SET owner_user_id = ? WHERE id = ?', [candidates[0].id, company.id]);
    await pool.query('UPDATE users SET is_owner = 1 WHERE id = ?', [candidates[0].id]);
  }

  await pool.query(
    `UPDATE users user
     SET user.role = 'owner', user.is_owner = 1, user.permissions = NULL
     WHERE LOWER(user.role) <> 'superadmin'
       AND (
         user.is_owner = 1
         OR EXISTS (SELECT 1 FROM companies company WHERE company.owner_user_id = user.id)
       )`
  );
  await pool.query(
    `UPDATE users
     SET role = 'staff', permissions = ?
     WHERE LOWER(role) = 'admin'`,
    [JSON.stringify({ preset: 'manager', grants: STAFF_PRESETS.manager })]
  );
  await pool.query(
    `UPDATE users
     SET role = 'staff', permissions = ?
     WHERE LOWER(role) = 'user' AND permissions IS NULL`,
    [JSON.stringify({ preset: 'cashier', grants: STAFF_PRESETS.cashier })]
  );
  await pool.query(
    `UPDATE users
     SET role = 'staff', permissions = ?
     WHERE LOWER(role) NOT IN ('superadmin', 'owner', 'staff')`,
    [JSON.stringify({ preset: 'cashier', grants: STAFF_PRESETS.cashier })]
  );
  await pool.query("ALTER TABLE users MODIFY COLUMN role ENUM('superadmin','owner','staff') NOT NULL DEFAULT 'staff'");

  if (ownerlessNames.length) {
    console.warn(
      `[database] Company workspace(s) ${ownerlessNames.join(', ')} have no active Admin to promote as owner. ` +
      'Assign an owner account before granting access to these workspaces.'
    );
  }
}

async function ensureUserReferenceSetNull(tableName, columnName, database = pool) {
  const identifiers = [tableName, columnName];
  if (identifiers.some((identifier) => !/^[a-z_]+$/i.test(identifier))) {
    throw new Error('Invalid user-reference migration identifier.');
  }

  const [references] = await database.query(
    `SELECT k.CONSTRAINT_NAME, r.DELETE_RULE, c.IS_NULLABLE
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
       AND r.TABLE_NAME = k.TABLE_NAME
       AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     JOIN information_schema.COLUMNS c
       ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
       AND c.TABLE_NAME = k.TABLE_NAME
       AND c.COLUMN_NAME = k.COLUMN_NAME
     WHERE k.CONSTRAINT_SCHEMA = ? AND k.TABLE_NAME = ? AND k.COLUMN_NAME = ?
       AND k.REFERENCED_TABLE_NAME = 'users'
     LIMIT 1`,
    [dbConfig.database, tableName, columnName]
  );
  const reference = references[0];

  if (reference?.DELETE_RULE !== 'SET NULL') {
    const constraintName = reference?.CONSTRAINT_NAME || `fk_${tableName}_${columnName}_user`;
    if (!/^[a-z0-9_]+$/i.test(constraintName)) {
      throw new Error('Invalid user-reference migration constraint name.');
    }
    if (reference) {
      await database.query(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\``);
    }
    await database.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` INT NULL`);
    await database.query(
      `ALTER TABLE \`${tableName}\`
       ADD CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${columnName}\`)
       REFERENCES users(id) ON DELETE SET NULL`
    );
    return;
  }

  if (reference.IS_NULLABLE !== 'YES') {
    await database.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` INT NULL`);
  }
}

async function migrateQuantitiesToIntegers(database = pool) {
  const quantityColumns = [
    ['items', 'qty_on_hand'],
    ['items', 'reorder_qty'],
    ['item_branch_stock', 'qty_on_hand'],
    ['invoice_lines', 'qty'],
    ['invoice_lines', 'qty_base'],
    ['sales_return_lines', 'qty_returned'],
    ['sales_return_lines', 'qty_base'],
    ['stock_transactions', 'qty'],
    ['stock_transactions', 'balance_after'],
    ['purchase_order_items', 'qty'],
    ['purchase_return_lines', 'qty_returned'],
    ['inventory_batches', 'qty_received'],
    ['inventory_batches', 'qty_remaining'],
    ['stock_transfer_items', 'qty'],
    ['stock_transfer_batches', 'quantity'],
    ['purchase_records', 'quantity'],
    ['sale_records', 'quantity'],
  ];
  const fractionalValues = [];
  const roundingCandidates = [];
  const columnsToMigrate = [];

  for (const [tableName, columnName] of quantityColumns) {
    const rowKeyColumns = tableName === 'item_branch_stock' ? ['item_id', 'branch'] : ['id'];
    const [columns] = await database.query(
      `SELECT DATA_TYPE, NUMERIC_SCALE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [dbConfig.database, tableName, columnName]
    );
    if (!columns.length) continue;

    const [fractionalRows] = await database.query(
      `SELECT ${rowKeyColumns.map((key) => `\`${key}\``).join(', ')}, \`${columnName}\` AS quantity
       FROM \`${tableName}\`
       WHERE \`${columnName}\` <> TRUNCATE(\`${columnName}\`, 0)
         AND ABS(\`${columnName}\` - ROUND(\`${columnName}\`, 0)) >= ?
       LIMIT 5`,
      [QUANTITY_ROUNDING_TOLERANCE]
    );
    if (fractionalRows.length) {
      fractionalValues.push(
        `${tableName}.${columnName}: ${fractionalRows.map((row) => (
          `${rowKeyColumns.map((key) => `${key}=${row[key]}`).join(', ')}=${row.quantity}`
        )).join(', ')}`
      );
    }

    const [roundingCounts] = await database.query(
      `SELECT COUNT(*) AS count
       FROM \`${tableName}\`
       WHERE \`${columnName}\` <> TRUNCATE(\`${columnName}\`, 0)
         AND ABS(\`${columnName}\` - ROUND(\`${columnName}\`, 0)) < ?`,
      [QUANTITY_ROUNDING_TOLERANCE]
    );
    const roundingCount = Number(roundingCounts[0]?.count || 0);
    if (roundingCount) roundingCandidates.push([tableName, columnName, roundingCount]);

    const integerTypes = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint']);
    if (!integerTypes.has(String(columns[0].DATA_TYPE).toLowerCase())
      && (String(columns[0].DATA_TYPE).toLowerCase() !== 'decimal'
        || Number(columns[0].NUMERIC_SCALE || 0) > 0)) {
      columnsToMigrate.push([tableName, columnName]);
    }
  }

  if (fractionalValues.length) {
    throw new Error(
      `Integer quantity migration was stopped because fractional quantities exceed the ` +
      `${QUANTITY_ROUNDING_TOLERANCE} rounding tolerance. Values were found (up to 5 examples per column): ` +
      `${fractionalValues.join('; ')}. Correct these records explicitly, then restart the backend.`
    );
  }

  let roundedValueCount = 0;
  for (const [tableName, columnName, count] of roundingCandidates) {
    const [result] = await database.query(
      `UPDATE \`${tableName}\`
       SET \`${columnName}\` = ROUND(\`${columnName}\`, 0)
       WHERE \`${columnName}\` <> TRUNCATE(\`${columnName}\`, 0)
         AND ABS(\`${columnName}\` - ROUND(\`${columnName}\`, 0)) < ?`,
      [QUANTITY_ROUNDING_TOLERANCE]
    );
    roundedValueCount += Number(result.affectedRows || count);
  }

  if (roundedValueCount) {
    console.warn(
      `[database] Rounded ${roundedValueCount} quantity value(s) less than ` +
      `${QUANTITY_ROUNDING_TOLERANCE} from a whole unit to the nearest whole unit.`
    );
  }

  for (const [tableName, columnName] of columnsToMigrate) {
    await database.query(
      `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` DECIMAL(14,0) NOT NULL`
    );
  }
}

async function initializeInventoryBalances(defaultBranch, migrateLegacyBatchBranch, companyId) {
  if (migrateLegacyBatchBranch) {
    await pool.query('UPDATE inventory_batches SET branch = ? WHERE company_id = ?', [defaultBranch, companyId]);
  }
  await pool.query(
    `INSERT IGNORE INTO item_branch_stock (company_id, item_id, branch, qty_on_hand, avg_cost)
     SELECT i.company_id, i.id, ?, i.qty_on_hand, i.average_cost
     FROM items i
     WHERE i.company_id = ? AND NOT EXISTS (
       SELECT 1 FROM item_branch_stock b WHERE b.company_id = i.company_id AND b.item_id = i.id
     )`,
    [defaultBranch, companyId]
  );
  await pool.query(
    `UPDATE items i
     SET qty_on_hand = (
       SELECT COALESCE(SUM(b.qty_on_hand), 0)
       FROM item_branch_stock b
       WHERE b.company_id = i.company_id AND b.item_id = i.id
     )
     WHERE i.company_id = ?`,
    [companyId]
  );

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [stockRows] = await connection.query(
      'SELECT item_id, branch, qty_on_hand FROM item_branch_stock WHERE company_id = ? ORDER BY item_id, branch FOR UPDATE',
      [companyId]
    );
    const [batchRows] = await connection.query(
      'SELECT id, item_id, branch, batch_no, qty_remaining FROM inventory_batches WHERE company_id = ? AND qty_remaining > 0 ORDER BY item_id, branch, expiry_date IS NULL, expiry_date, created_at, id FOR UPDATE',
      [companyId]
    );
    const batchesByStock = new Map();
    for (const batch of batchRows) {
      const key = `${batch.item_id}:${batch.branch}`;
      if (!batchesByStock.has(key)) batchesByStock.set(key, []);
      batchesByStock.get(key).push(batch);
    }

    for (const stock of stockRows) {
      const key = `${stock.item_id}:${stock.branch}`;
      const batches = batchesByStock.get(key) || [];
      let batchTotal = batches.reduce((sum, batch) => sum + Number(batch.qty_remaining), 0);
      let difference = Number(stock.qty_on_hand) - batchTotal;

      if (difference > 0) {
        const [items] = await connection.query('SELECT average_cost FROM items WHERE id = ? AND company_id = ?', [stock.item_id, companyId]);
        await connection.query(
          'INSERT INTO inventory_batches (company_id, item_id, branch, batch_no, qty_received, qty_remaining, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [companyId, stock.item_id, stock.branch, `RECONCILED-${stock.item_id}`, difference, difference, Number(items[0]?.average_cost || 0)]
        );
      } else if (difference < 0) {
        let excess = Math.abs(difference);
        for (const batch of batches) {
          if (excess <= 0) break;
          const reduction = Math.min(excess, Number(batch.qty_remaining));
          await connection.query(
            'UPDATE inventory_batches SET qty_remaining = qty_remaining - ? WHERE id = ? AND company_id = ?',
            [reduction, batch.id, companyId]
          );
          excess -= reduction;
        }
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function initializeDatabase() {
  const isProd = process.env.NODE_ENV === 'production';
  const allowAutoMigration = String(process.env.ALLOW_DB_AUTOMIGRATION || '').trim().toLowerCase();
  const isMigrationAllowed = allowAutoMigration === 'true' || allowAutoMigration === '1' || !isProd;

  if (isProd && !isMigrationAllowed) {
    throw new Error('Production database auto-migration is disabled. Set ALLOW_DB_AUTOMIGRATION=true once to apply required schema updates.');
  }

  schemaMigrationInProgress = true;
  try {
    await initializeDatabaseSchema();
  } finally {
    schemaMigrationInProgress = false;
    startupTenantCompanyId = null;
  }
}

async function initializeDatabaseSchema() {
  // Ensure DB exists before running the schema on the pool
  await ensureDatabaseExists();
  await loadStartupTenantCompanyId();
  await prepareTenantTriggersForSchemaMigration(pool, dbConfig.database);

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
  for (const [tableName, columnName] of [
    ['projects', 'submitted_by'],
    ['project_files', 'submitted_by'],
    ['leave_requests', 'submitted_by'],
    ['cash_registers', 'opened_by'],
    ['stock_transfers', 'created_by'],
  ]) {
    await ensureUserReferenceSetNull(tableName, columnName);
  }
  const userColumns = [
    ['first_name', 'VARCHAR(100) NULL'],
    ['last_name', 'VARCHAR(100) NULL'],
    ['position', 'VARCHAR(160) NULL'],
    ['official_address', 'TEXT NULL'],
    ['website', 'VARCHAR(255) NULL'],
    ['enterprise_name', 'VARCHAR(180) NULL'],
    ['office_phone', 'VARCHAR(60) NULL'],
    ['company_id', 'BIGINT NULL'],
    ['created_by_user_id', 'INT NULL'],
    ['permissions', 'JSON NULL'],
    ['verification_token', 'CHAR(64) NULL'],
    ['token_expires_at', 'DATETIME NULL'],
    ['is_verified', 'TINYINT(1) NOT NULL DEFAULT 1'],
    ['status', "ENUM('PENDING_VERIFICATION','ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE'"],
    ['updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
  ];
  for (const [columnName, definition] of userColumns) {
    await addColumnIfMissing('users', columnName, definition);
  }
  await pool.query(
    `UPDATE users
     SET status = 'INACTIVE'
     WHERE is_verified = 1 AND active = 0 AND approval_status = 'approved' AND status = 'ACTIVE'`
  );
  await pool.query(
    `UPDATE users
     SET active = CASE
           WHEN status = 'PENDING_VERIFICATION' AND approval_status = 'approved' THEN 1
           ELSE active
         END,
         status = CASE WHEN status = 'PENDING_VERIFICATION' THEN 'ACTIVE' ELSE status END,
         is_verified = 1,
         verification_token = NULL,
         token_expires_at = NULL
     WHERE is_verified = 0`
  );
  await pool.query('ALTER TABLE users MODIFY username VARCHAR(254) NOT NULL');
  await ensureUniqueUserEmailIndex();
  await addIndexIfMissing('users', 'idx_users_tenant_role', ['company_id', 'role']);
  await addForeignKeyIfMissing(
    'companies',
    'fk_companies_owner',
    'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL'
  );
  await addForeignKeyIfMissing(
    'users',
    'fk_users_company',
    'FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL'
  );
  await pool.query(
    `ALTER TABLE journal_entry_lines
     MODIFY debit DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
     MODIFY credit DECIMAL(18,4) NOT NULL DEFAULT 0.0000`
  );

  await addColumnIfMissing(
    'cash_registers',
    'open_branch',
    "VARCHAR(120) GENERATED ALWAYS AS (CASE WHEN status = 'Open' THEN branch ELSE NULL END) STORED"
  );

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

  await addColumnIfMissing('sale_records', 'quantity', 'DECIMAL(14,0) NOT NULL DEFAULT 1');
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
  await addColumnIfMissing('vendors', 'contact_name', 'VARCHAR(180) NULL');
  await addColumnIfMissing('vendors', 'address', 'TEXT NULL');
  await addColumnIfMissing('vendors', 'alternate_phone', 'VARCHAR(60) NULL');
  await addColumnIfMissing('vendors', 'email', 'VARCHAR(255) NULL');
  await addColumnIfMissing('users', 'email', 'VARCHAR(255) NULL');
  await addColumnIfMissing('users', 'active', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing('project_files', 'file_size', 'BIGINT NULL');
  await addColumnIfMissing('project_files', 'mime_type', 'VARCHAR(120) NULL');
  await pool.query('ALTER TABLE project_files MODIFY COLUMN project_id BIGINT NULL');
  await addColumnIfMissing('vendors', 'active', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing('customers', 'address', 'TEXT NULL');
  await addColumnIfMissing('customers', 'representative', 'VARCHAR(180) NULL');
  await addColumnIfMissing('customers', 'email', 'VARCHAR(255) NULL');
  await addColumnIfMissing('customers', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await addColumnIfMissing('customers', 'vat_tin', 'VARCHAR(50) NULL');
  await addColumnIfMissing('customers', 'credit_limit', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('items', 'vat_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 10.00');
  await addColumnIfMissing('items', 'active', 'TINYINT(1) NOT NULL DEFAULT 1');
  const addBranchAverageCost = !(await columnExists('item_branch_stock', 'avg_cost'));
  await addColumnIfMissing('item_branch_stock', 'avg_cost', 'DECIMAL(12,6) NOT NULL DEFAULT 0.000000');
  await pool.query('ALTER TABLE item_branch_stock MODIFY COLUMN avg_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000');
  if (addBranchAverageCost) {
    await pool.query(
      'UPDATE item_branch_stock stock JOIN items item ON item.id = stock.item_id SET stock.avg_cost = item.average_cost'
    );
  }
  const migrateLegacyBatchBranch = !(await columnExists('inventory_batches', 'branch'));
  await addColumnIfMissing('inventory_batches', 'branch', "VARCHAR(120) NOT NULL DEFAULT 'Head Quarter'");
  await addColumnIfMissing('invoices', 'invoice_type', "ENUM('TaxInvoice','CommercialInvoice') NOT NULL DEFAULT 'CommercialInvoice'");
  await addColumnIfMissing('invoices', 'user_id', 'INT NULL');
  await addColumnIfMissing('invoices', 'received_usd', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('invoices', 'received_khr', 'DECIMAL(14,0) NOT NULL DEFAULT 0');
  await addColumnIfMissing('invoices', 'change_usd', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('invoices', 'payment_reference', 'VARCHAR(120) NULL');
  await addColumnIfMissing('invoices', 'khqr_payload', 'TEXT NULL');
  await addColumnIfMissing('invoices', 'vat_tin', 'VARCHAR(50) NULL');
  const migrateLegacyInvoiceBranch = !(await columnExists('invoices', 'branch'));
  await addColumnIfMissing('invoices', 'branch', "VARCHAR(120) NOT NULL DEFAULT 'Head Quarter'");
  await addColumnIfMissing('users', 'approval_status', "ENUM('pending','approved') NOT NULL DEFAULT 'approved'");
  if (migrateLegacyInvoiceBranch) {
    const [companyRows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['company']);
    const companySettings = companyRows[0]
      ? (typeof companyRows[0].setting_value === 'string' ? JSON.parse(companyRows[0].setting_value) : companyRows[0].setting_value)
      : {};
    await pool.query('UPDATE invoices SET branch = ?', [companySettings.branch || 'Head Quarter']);
  }
  await addColumnIfMissing('invoice_lines', 'cost_price', 'DECIMAL(14,6) NOT NULL DEFAULT 0.000000');
  await addColumnIfMissing('invoice_lines', 'qty_base', 'DECIMAL(14,0) NOT NULL DEFAULT 0');
  await addColumnIfMissing('invoice_lines', 'unit_cost_at_sale', 'DECIMAL(14,6) NOT NULL DEFAULT 0.000000');
  await addColumnIfMissing('invoice_lines', 'cogs_unit_cost', 'DECIMAL(14,6) NOT NULL DEFAULT 0.000000');
  const addInvoiceLineTotalCogs = !(await columnExists('invoice_lines', 'total_cogs'));
  await addColumnIfMissing('invoice_lines', 'total_cogs', 'DECIMAL(14,6) NOT NULL DEFAULT 0.000000');
  if (addInvoiceLineTotalCogs) {
    await pool.query(
      'UPDATE invoice_lines SET total_cogs = ROUND((CASE WHEN qty_base > 0 THEN qty_base * COALESCE(NULLIF(cogs_unit_cost, 0), unit_cost_at_sale) ELSE qty * cost_price END), 6)'
    );
  }
  await addColumnIfMissing('invoice_lines', 'vat_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 10.00');
  await addColumnIfMissing('invoice_lines', 'vat_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('invoice_lines', 'line_total', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  const migrateTransferItemUnitCost = !(await columnExists('stock_transfer_items', 'unit_cost'));
  await addColumnIfMissing('stock_transfer_items', 'unit_cost', 'DECIMAL(14,6) NOT NULL DEFAULT 0.000000');
  if (migrateTransferItemUnitCost) {
    await pool.query(
      `UPDATE stock_transfer_items transfer_item
       JOIN (
         SELECT transfer_item_id, SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS unit_cost
         FROM stock_transfer_batches
         GROUP BY transfer_item_id
       ) batches ON batches.transfer_item_id = transfer_item.id
       SET transfer_item.unit_cost = batches.unit_cost`
    );
  }
  await addColumnIfMissing('stock_transactions', 'balance_after', 'DECIMAL(14,0) NOT NULL DEFAULT 0');
  await addColumnIfMissing('stock_transactions', 'unit_cost_at_sale', 'DECIMAL(14,6) NOT NULL DEFAULT 0.000000');
  await addColumnIfMissing('stock_transactions', 'unit_cost', 'DECIMAL(14,6) NOT NULL DEFAULT 0.000000');
  await backfillZeroCostAdjustments(pool);
  if (migrateTransferItemUnitCost) {
    await pool.query(
      `UPDATE stock_transactions movement
       JOIN stock_transfers transfer ON transfer.transfer_no = movement.reference
       JOIN stock_transfer_items transfer_item
         ON transfer_item.transfer_id = transfer.id
        AND transfer_item.item_id = movement.item_id
       SET movement.unit_cost = transfer_item.unit_cost
       WHERE movement.type = 'Transfer'`
    );
  }
  await migrateQuantitiesToIntegers();
  const [stockTransactionTypeColumns] = await pool.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'stock_transactions' AND COLUMN_NAME = 'type'`,
    [dbConfig.database]
  );
  if (stockTransactionTypeColumns[0] && !stockTransactionTypeColumns[0].COLUMN_TYPE.includes("'Return'")) {
    await pool.query(
      "ALTER TABLE stock_transactions MODIFY COLUMN type ENUM('Sale','Purchase','Adjustment','Transfer','Reversed','Return') NOT NULL"
    );
  }
  const hasMarkupAmount = await columnExists('items', 'markup_amount');
  const hasMarkupPercent = await columnExists('items', 'markup_percent');
  if (!hasMarkupAmount) {
    await addColumnIfMissing('items', 'markup_amount', 'DECIMAL(14,4) NOT NULL DEFAULT 0.0000');
  }
  if (hasMarkupPercent) {
    await pool.query(
      `UPDATE items
       SET markup_amount = ROUND(COALESCE(NULLIF(average_cost, 0), purchase_cost) * markup_percent / 100, 4)`
    );
    await pool.query('ALTER TABLE items DROP COLUMN markup_percent');
  }
  await addColumnIfMissing('items', 'auto_recalculate_price', 'TINYINT(1) NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE items MODIFY COLUMN purchase_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000, MODIFY COLUMN average_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000');
  await addColumnIfMissing('purchase_orders', 'subtotal', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('purchase_orders', 'order_date', 'DATE NULL');
  await pool.query('UPDATE purchase_orders SET order_date = DATE(created_at) WHERE order_date IS NULL');
  await addColumnIfMissing('purchase_orders', 'delivery_total', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('purchase_orders', 'handling_cost', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('purchase_orders', 'documentation_cost', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('purchase_orders', 'tax_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 10.00');
  await addColumnIfMissing('purchase_orders', 'tax_amount', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('purchase_orders', 'grand_total', 'DECIMAL(14,2) NOT NULL DEFAULT 0.00');
  await addColumnIfMissing('purchase_orders', 'branch', 'VARCHAR(120) NULL');
  await addColumnIfMissing('purchase_orders', 'received_branch', 'VARCHAR(120) NULL');
  await pool.query(
    `UPDATE purchase_orders po
     JOIN (
       SELECT reference, MIN(branch) AS branch
       FROM stock_transactions
       WHERE type = 'Purchase'
       GROUP BY reference
       HAVING COUNT(DISTINCT branch) = 1
     ) received ON received.reference = po.order_no
     SET po.received_branch = received.branch
     WHERE po.status = 'Received' AND po.received_branch IS NULL`
  );
  const [purchaseBranchSettings] = await pool.query(
    'SELECT setting_value FROM settings WHERE setting_key = ?',
    ['company']
  );
  const purchaseSettings = purchaseBranchSettings[0]
    ? (typeof purchaseBranchSettings[0].setting_value === 'string'
      ? JSON.parse(purchaseBranchSettings[0].setting_value)
      : purchaseBranchSettings[0].setting_value)
    : {};
  await pool.query(
    `UPDATE purchase_orders
     SET branch = COALESCE(NULLIF(received_branch, ''), ?)
     WHERE branch IS NULL`,
    [String(purchaseSettings.branch || 'Head Quarter').trim()]
  );
  await addColumnIfMissing('purchase_orders', 'created_by', 'INT NULL');
  await addColumnIfMissing('purchase_orders', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await addColumnIfMissing('purchase_order_items', 'merchandise_cost', 'DECIMAL(12,4) NOT NULL DEFAULT 0.0000');
  await addColumnIfMissing('purchase_order_items', 'unit_handling_cost', 'DECIMAL(12,6) NOT NULL DEFAULT 0.000000');
  await addColumnIfMissing('purchase_order_items', 'unit_doc_cost', 'DECIMAL(12,6) NOT NULL DEFAULT 0.000000');
  await addColumnIfMissing('purchase_order_items', 'effective_unit_cost', 'DECIMAL(12,6) NOT NULL DEFAULT 0.000000');
  await pool.query('ALTER TABLE purchase_orders MODIFY COLUMN handling_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00, MODIFY COLUMN documentation_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00');
  await pool.query('ALTER TABLE purchase_order_items MODIFY COLUMN merchandise_cost DECIMAL(12,4) NOT NULL DEFAULT 0.0000, MODIFY COLUMN unit_handling_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000, MODIFY COLUMN unit_doc_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000, MODIFY COLUMN effective_unit_cost DECIMAL(12,6) NOT NULL DEFAULT 0.000000');
  await pool.query('UPDATE purchase_order_items SET merchandise_cost = unit_price WHERE merchandise_cost = 0');
  await pool.query('ALTER TABLE invoice_lines MODIFY COLUMN cost_price DECIMAL(14,6) NOT NULL DEFAULT 0.000000');
  await pool.query('ALTER TABLE inventory_batches MODIFY COLUMN unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0.000000');
  await pool.query('ALTER TABLE stock_transfer_batches MODIFY COLUMN unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0.000000');
  await pool.query('ALTER TABLE ar_payments MODIFY COLUMN customer_id INT NULL');
  await pool.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL DEFAULT 'staff'");

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

  // 2. Bootstrap the platform admin only on a fresh install or with explicit credentials.
  await ensureBootstrapAdmin(pool);
  startupTenantCompanyId = await migrateTenantSchema(pool, dbConfig.database);
  await migrateUserRoleModel();
  await seedCompanyAssetClasses(pool, startupTenantCompanyId);
  const [starterTaxPeriods] = await pool.query(
    'SELECT id FROM tax_periods WHERE company_id = ? AND period_month = ? AND period_year = ? LIMIT 1',
    [startupTenantCompanyId, 2, 2020]
  );
  if (!starterTaxPeriods.length) {
    await pool.query(
      `INSERT INTO tax_periods
        (company_id, company_name, vat_tin, period_month, period_year, nbc_exchange_rate, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [startupTenantCompanyId, 'Axis Investment Consulting', 'K002-107004771', 2, 2020, 4070, 'draft']
    );
  }

  // 3. Seed Vendors
  const [vendors] = await pool.query('SELECT id, name FROM vendors WHERE company_id = ?', [startupTenantCompanyId]);
  let vendorMap = new Map(vendors.map(v => [v.name, v.id]));

  if (vendors.length === 0) {
    const defaultVendors = [
      ['Cambodia Beverage Co.', '023 555 019', 5000, 'Main beverage supplier'],
      ['Local Foods Supply', '012 888 220', 3000, 'Weekly delivery'],
      ['Coffee Distribution KH', '010 222 445', 2500, ''],
    ];

    for (const v of defaultVendors) {
      const [res] = await pool.query(
        'INSERT INTO vendors (name, phone, credit_limit, note, company_id) VALUES (?, ?, ?, ?, ?)',
        [...v, startupTenantCompanyId]
      );
      vendorMap.set(v[0], res.insertId);
    }
  }

  // 4. Seed Customers
  const [customers] = await pool.query('SELECT id FROM customers WHERE company_id = ? LIMIT 1', [startupTenantCompanyId]);
  if (customers.length === 0) {
    await pool.query(
      `INSERT INTO customers (name, phone, deposit, reward_points, balance, company_id) VALUES 
       (?, ?, ?, ?, ?, ?), 
       (?, ?, ?, ?, ?, ?)`,
      ['Walk-in customer', '-', 0, 0, 0, startupTenantCompanyId, 'Sok Dara', '012 345 678', 25, 420, 120, startupTenantCompanyId]
    );
  }

  // 5. Seed Items (Safely mapping vendor IDs from vendorMap)
  const [items] = await pool.query('SELECT id FROM items WHERE company_id = ? LIMIT 1', [startupTenantCompanyId]);
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
      (barcode, name_kh, name_en, department, category, brand, base_unit, qty_on_hand, reorder_qty, retail_price, purchase_cost, average_cost, vendor_id, units, company_id) 
      VALUES ?
    `;

    // Bulk insert using nested array syntax supported by mysql2
    await pool.query(insertItemQuery, [defaultItems.map((item) => [...item, startupTenantCompanyId])]);
  }

  const [companySettingsRows] = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'company'");
  const companySettings = companySettingsRows[0]
    ? (typeof companySettingsRows[0].setting_value === 'string'
      ? JSON.parse(companySettingsRows[0].setting_value)
      : companySettingsRows[0].setting_value)
    : {};
  const defaultBranch = String(companySettings.branch || 'Head Quarter').trim();
  await seedDefaultBranchAccess(pool, startupTenantCompanyId, defaultBranch);
  await initializeInventoryBalances(defaultBranch, migrateLegacyBatchBranch, startupTenantCompanyId);
  startupTenantCompanyId = null;
}

module.exports = { ensureUniqueUserEmailIndex, ensureUserReferenceSetNull, migrateQuantitiesToIntegers, pool, initializeDatabase };