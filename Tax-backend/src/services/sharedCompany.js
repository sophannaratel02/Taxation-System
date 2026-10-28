const { positiveId, requestError } = require('./accountingLedger');

async function getSharedCompanyId(connection) {
  const [administrators] = await connection.query(
    `SELECT id, name, enterprise_name, office_phone, email, company_id
     FROM users
     WHERE LOWER(role) = 'owner'
     ORDER BY id
     LIMIT 1
     FOR UPDATE`
  );
  const administrator = administrators[0];
  if (!administrator) {
    throw requestError(503, 'The shared company is not configured. Contact the system administrator.');
  }

  if (administrator.company_id !== null && administrator.company_id !== undefined) {
    return positiveId(administrator.company_id, 'Company');
  }

  const [ownedCompanies] = await connection.query(
    'SELECT id FROM companies WHERE owner_user_id = ? ORDER BY id LIMIT 1',
    [administrator.id]
  );
  if (ownedCompanies[0]) {
    const companyId = positiveId(ownedCompanies[0].id, 'Company');
    await connection.query('UPDATE users SET company_id = ? WHERE id = ?', [companyId, administrator.id]);
    return companyId;
  }

  const [settingsRows] = await connection.query(
    'SELECT setting_value FROM settings WHERE setting_key = ?',
    ['company']
  );
  const settingsValue = settingsRows[0]?.setting_value;
  const settings = typeof settingsValue === 'string'
    ? JSON.parse(settingsValue)
    : settingsValue || {};
  const [companyResult] = await connection.query(
    `INSERT INTO companies (owner_user_id, enterprise_name, office_phone, official_email)
     VALUES (?, ?, ?, ?)`,
    [
      administrator.id,
      settings.companyName || administrator.enterprise_name || administrator.name,
      settings.phone || administrator.office_phone,
      administrator.email,
    ]
  );
  const companyId = positiveId(companyResult.insertId, 'Company');
  await connection.query('UPDATE users SET company_id = ? WHERE id = ?', [companyId, administrator.id]);
  return companyId;
}

module.exports = { getSharedCompanyId };
