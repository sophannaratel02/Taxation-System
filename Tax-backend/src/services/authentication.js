async function findUserForLogin(database, identifier) {
  const normalizedIdentifier = String(identifier || '').trim();
  if (!normalizedIdentifier || normalizedIdentifier.length > 254) return null;

  const [users] = await database.query(
    `SELECT id, name, username, email, company_id, is_owner, permissions, created_by_user_id,
       is_verified, status, password_hash, role, active, approval_status
     FROM users
     WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
     LIMIT 2`,
    [normalizedIdentifier, normalizedIdentifier]
  );

  return users.length === 1 ? users[0] : null;
}

function effectiveAccountRole(user) {
  const role = String(user?.role || '').toLowerCase();
  if (role !== 'superadmin' && (role === 'owner' || Number(user?.is_owner) === 1)) return 'owner';
  if (role === 'admin' || role === 'user') return 'staff';
  return role;
}

module.exports = { effectiveAccountRole, findUserForLogin };
