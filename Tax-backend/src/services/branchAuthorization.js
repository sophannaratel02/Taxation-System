function isSystemAdministrator(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'owner' || (role !== 'superadmin' && Number(user?.is_owner) === 1);
}

async function getAuthorizedBranches(connection, user) {
  if (isSystemAdministrator(user)) return null;
  const [rows] = await connection.query(
    'SELECT branch FROM user_branch_access WHERE user_id = ? AND company_id = ? ORDER BY branch',
    [user.id, user.company_id]
  );
  return rows.map((row) => String(row.branch));
}

async function assertBranchAccess(connection, user, branch) {
  if (isSystemAdministrator(user)) return;

  const branches = await getAuthorizedBranches(connection, user);
  const allowed = branches.some((assigned) => assigned.trim().toLowerCase() === branch.trim().toLowerCase());
  if (!allowed) {
    const error = new Error('Forbidden: Unauthorized branch access');
    error.status = 403;
    throw error;
  }
}

function invoiceCustomerMismatch(invoice, customerId) {
  return Boolean(invoice && customerId && Number(invoice.customer_id) !== Number(customerId));
}

module.exports = {
  assertBranchAccess,
  getAuthorizedBranches,
  invoiceCustomerMismatch,
  isSystemAdministrator,
};
