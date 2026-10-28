const { positiveId, requestError } = require('./accountingLedger');

async function getOrCreateOwnedCompany(connection, user, allowCompanyMembers = false) {
  if (user.company_id) {
    const companyId = positiveId(user.company_id, 'Company');
    const membershipClause = allowCompanyMembers ? ' OR id = ?' : '';
    const values = [companyId, user.id, user.is_owner ? 'owner' : String(user.role).toLowerCase(), 'owner'];
    if (allowCompanyMembers) values.push(companyId);
    const [companies] = await connection.query(
      `SELECT * FROM companies WHERE id = ? AND (owner_user_id = ? OR ? = ?${membershipClause})`,
      values
    );
    if (!companies.length) throw requestError(404, 'Company profile not found.');
    return companies[0];
  }

  const [existing] = await connection.query(
    'SELECT * FROM companies WHERE owner_user_id = ? LIMIT 1',
    [user.id]
  );
  if (existing.length) {
    await connection.query('UPDATE users SET company_id = ? WHERE id = ?', [existing[0].id, user.id]);
    return existing[0];
  }

  throw requestError(403, 'This account is not assigned to a company workspace.');
}

module.exports = { getOrCreateOwnedCompany };
