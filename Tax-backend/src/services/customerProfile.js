const { requestError } = require('./accountingLedger');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalText(value, field, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) {
    throw requestError(400, `${field} cannot exceed ${maxLength} characters.`);
  }
  return text || null;
}

function prepareCustomerProfile(body = {}) {
  const name = String(body.name ?? '').trim();
  if (!name) throw requestError(400, 'Company name is required.');
  if (name.length > 160) throw requestError(400, 'Company name cannot exceed 160 characters.');

  const phone = optionalText(body.phone, 'Phone', 60);
  const address = optionalText(body.address, 'Address', 5000);
  const representative = optionalText(body.representative, 'Representative', 180);
  const email = optionalText(body.email, 'Email', 255);
  if (email && !EMAIL_PATTERN.test(email)) {
    throw requestError(400, 'Enter a valid customer email address.');
  }
  const vatTin = optionalText(body.vatTin, 'VAT TIN', 50);

  const deposit = Number(body.deposit ?? 0);
  const creditLimit = Number(body.creditLimit ?? 0);
  if (!Number.isFinite(deposit) || deposit < 0) {
    throw requestError(400, 'Deposit must be a non-negative amount.');
  }
  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    throw requestError(400, 'Credit limit must be a non-negative amount.');
  }

  return {
    name,
    phone,
    address,
    representative,
    email: email?.toLowerCase() || null,
    vatTin,
    deposit,
    creditLimit,
  };
}

function mapCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    address: row.address || '',
    representative: row.representative || '',
    email: row.email || '',
    vatTin: row.vat_tin || '',
    deposit: Number(row.deposit || 0),
    rewardPoints: Number(row.reward_points || 0),
    balance: Number(row.balance || 0),
    creditLimit: Number(row.credit_limit || 0),
  };
}

module.exports = { mapCustomer, prepareCustomerProfile };
