const { requestError } = require('./accountingLedger');

const STARTER_ACCOUNTS = [
  ['1000', 'Cash and cash equivalents', 'asset'],
  ['1100', 'Accounts receivable', 'asset'],
  ['1200', 'Inventory', 'asset'],
  ['2000', 'Accounts payable', 'liability'],
  ['3000', 'Owner equity', 'equity'],
  ['4000', 'Sales revenue', 'revenue'],
  ['5000', 'Cost of goods sold', 'expense'],
  ['6000', 'Operating expenses', 'expense'],
];

const STARTER_ASSET_CLASSES = [
  ['INTANGIBLE', 'Intangible assets', 'Default straight-line class; review the tax/accounting rate before use.', 'straight_line', 0.1],
  ['TANGIBLE_1', 'Tangible asset class 1', 'Building and infrastructure.', 'straight_line', 0.05],
  ['FIXED_2', 'Fixed assets class 2', 'Declining-balance class.', 'declining', 0.5],
  ['FIXED_3', 'Fixed assets class 3', 'Declining-balance class.', 'declining', 0.25],
  ['FIXED_4', 'Fixed assets class 4', 'Declining-balance class.', 'declining', 0.2],
];

async function seedCompanyAssetClasses(connection, companyId) {
  const tenantId = Number(companyId);
  if (!Number.isSafeInteger(tenantId) || tenantId < 1) {
    throw requestError(400, 'A valid company is required to seed fixed-asset classes.');
  }

  for (const [classCode, className, description, depreciationMethod, annualRate] of STARTER_ASSET_CLASSES) {
    await connection.query(
      `INSERT IGNORE INTO fixed_asset_classes
        (company_id, class_code, class_name, description, depreciation_method, annual_rate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, classCode, className, description, depreciationMethod, annualRate]
    );
  }
}

async function seedDefaultBranchAccess(connection, companyId, branch) {
  const tenantId = Number(companyId);
  if (!Number.isSafeInteger(tenantId) || tenantId < 1) {
    throw new Error('A valid startup company is required to seed default branch access.');
  }

  await connection.query(
    `INSERT IGNORE INTO user_branch_access (user_id, branch, company_id)
     SELECT id, ?, ? FROM users WHERE company_id = ? AND LOWER(role) = 'staff'`,
    [branch, tenantId, tenantId]
  );
}

async function provisionCompany(connection, companyId, userId, enterpriseName) {
  const tenantId = Number(companyId);
  const ownerId = Number(userId);
  if (!Number.isSafeInteger(tenantId) || tenantId < 1 || !Number.isSafeInteger(ownerId) || ownerId < 1) {
    throw requestError(400, 'A valid company and owner are required to provision a workspace.');
  }

  const branch = 'Main Branch';
  await connection.query(
    'INSERT INTO user_branch_access (user_id, branch, company_id) VALUES (?, ?, ?)',
    [ownerId, branch, tenantId]
  );
  await connection.query(
    'INSERT INTO company_settings (company_id, setting_key, setting_value) VALUES (?, ?, ?)',
    [tenantId, 'company', JSON.stringify({
      companyName: String(enterpriseName || '').trim() || 'New Company',
      address: '',
      phone: '',
      baseCurrency: 'USD',
      exchangeRate: 4000,
      vatRate: 10,
      branch,
    })]
  );
}

module.exports = {
  provisionCompany,
  seedCompanyAssetClasses,
  seedDefaultBranchAccess,
  STARTER_ACCOUNTS,
  STARTER_ASSET_CLASSES,
};