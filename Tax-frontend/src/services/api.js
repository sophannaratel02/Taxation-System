const API_URL = (import.meta.env?.VITE_API_URL || '/api').replace(/\/$/, '');

// ============================================================================
// Core Helpers
// ============================================================================

const param = (val) => encodeURIComponent(String(val ?? ''));

function getAuthHeader() {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('tax_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchResponse(url, options) {
  try {
    return await fetch(url, options);
  } catch (cause) {
    const error = new Error('Cannot connect to the API. Check your network or API server availability.');
    error.cause = cause;
    throw error;
  }
}

function handleUnauthorized(response) {
  if (response.status !== 401 || typeof window === 'undefined') return;
  localStorage.removeItem('tax_token');
  localStorage.removeItem('tax_user');
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
}

async function responseError(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  const details = payload && typeof payload === 'object' ? payload : {};
  const error = new Error(
    details.message || details.error || `${fallbackMessage} with status ${response.status}`
  );
  error.status = response.status;
  error.data = payload;
  return error;
}

function buildQuery(params = {}) {
  const filtered = Object.entries(params).filter(
    ([, val]) => val !== undefined && val !== null && val !== ''
  );
  return filtered.length ? `?${new URLSearchParams(filtered).toString()}` : '';
}

async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...getAuthHeader(),
    ...(options.headers || {})
  };

  const response = await fetchResponse(`${API_URL}${path}`, { ...options, headers });

  handleUnauthorized(response);

  if (!response.ok) throw await responseError(response, 'Request failed');

  return response.json().catch(() => ({}));
}

// REST shorthand utilities
const get = (path, query, headers) =>
  request(`${path}${buildQuery(query)}`, { method: 'GET', headers });

const sendWithBody = (method, path, body, headers = {}) => {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  return request(path, {
    method,
    body: isFormData || body === undefined ? body : JSON.stringify(body),
    headers
  });
};

const post = (path, body, headers) => sendWithBody('POST', path, body, headers);
const put = (path, body, headers) => sendWithBody('PUT', path, body, headers);
const patch = (path, body, headers) => sendWithBody('PATCH', path, body, headers);
const del = (path, headers) => request(path, { method: 'DELETE', headers });

// ============================================================================
// File Download Handler
// ============================================================================

async function downloadFile(id) {
  const response = await fetchResponse(`${API_URL}/files/${param(id)}/download`, {
    headers: getAuthHeader()
  });
  handleUnauthorized(response);

  if (!response.ok) {
    throw await responseError(response, 'Download failed');
  }

  let filename = `document-${id}`;
  const disposition = response.headers.get('Content-Disposition');
  if (disposition) {
    const rfcMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const standardMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (rfcMatch?.[1]) {
      filename = decodeURIComponent(rfcMatch[1].trim());
    } else if (standardMatch?.[1]) {
      filename = standardMatch[1].trim();
    }
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

// ============================================================================
// API Client Interface
// ============================================================================

export const api = {
  // Authentication
  login: (email, password) => post('/auth/login', { email, password }),
  me: () => get('/me'),
  registrationPolicy: () => get('/auth/registration-policy'),
  register: (payload) => post('/auth/register', payload),
  verifyEmail: (token) => get('/auth/verify-email', { token }),
  resendVerification: (email) => post('/auth/resend-verification', { email }),
  companyProfile: () => get('/company/profile'),
  updateCompanyProfile: (payload) => put('/company/profile', payload),
  forgotPassword: (emailOrUsername) => post('/auth/forgot-password', { emailOrUsername }),
  verifyOtp: (email, otp) => post('/auth/verify-otp', { email, otp }),
  resetPassword: (payload) => post('/auth/reset-password', payload),

  // User & Settings
  users: () => get('/users'),
  saveUser: (payload) => post('/users', payload),
  settings: () => get('/settings'),
  saveSettings: (settings) => put('/settings', settings),
  // Catalog & Entities
  items: (search = '', branch = '') => get('/items', { search, branch }),
  saveItem: (item) => post('/items', item),
  updateItem: (id, item) => put(`/items/${param(id)}`, item),
  deleteItem: (id) => del(`/items/${param(id)}`),

  vendors: () => get('/vendors'),
  saveVendor: (vendor) => post('/vendors', vendor),
  updateVendor: (id, vendor) => put(`/vendors/${param(id)}`, vendor),
  deleteVendor: (id) => del(`/vendors/${param(id)}`),

  customers: () => get('/customers'),
  saveCustomer: (customer) => post('/customers', customer),
  updateCustomer: (id, customer) => put(`/customers/${param(id)}`, customer),
  deleteCustomer: (id) => del(`/customers/${param(id)}`),

  // Purchasing & Inventory
  purchaseOrders: () => get('/purchase-orders'),
  savePurchaseOrder: (order) => post('/purchase-orders', order),
  purchaseOrder: (id) => get(`/purchase-orders/${param(id)}`),
  updatePurchaseOrder: (id, order) => put(`/purchase-orders/${param(id)}`, order),
  deletePurchaseOrder: (id) => del(`/purchase-orders/${param(id)}`),
  receivePurchaseOrder: (id, payload = {}) => post(`/purchase-orders/${param(id)}/receive`, payload),
  returnPurchaseOrder: (id, payload) => post(`/purchase-orders/${param(id)}/returns`, payload),
  batches: (filters = {}) => get('/inventory/batches', filters),
  inventoryValuation: (filters = {}) =>
    get('/reports/inventory-valuation', typeof filters === 'string' ? { branch: filters } : filters),
  saveBatch: (payload) => post('/inventory/batches', payload),
  transfers: () => get('/inventory/transfers'),
  saveTransfer: (payload) => post('/inventory/transfers', payload),
  receiveTransfer: (id) => post(`/inventory/transfers/${param(id)}/receive`, {}),
  adjustStock: (payload) => post('/stock/adjustments', payload),

  // POS & Sales
  completeSale: (payload) => post('/sales', payload),
  createKhqrIntent: (payload) => post('/khqr/intents', payload),
  verifyKhqrIntent: (id) => post(`/khqr/intents/${param(id)}/verify`, {}),
  currentRegister: (branch = '') => get('/register/current', { branch }),
  openRegister: (payload) => post('/register/open', payload),
  closeRegister: (payload) => post('/register/close', payload),
  registerReport: (registerId) => get('/register/report', { registerId }),
  managerOverride: (payload) => post('/manager/override', payload),

  // Billing & Accounting
  invoices: () => get('/invoices'),
  invoice: (identifier) => get(`/invoices/${param(identifier)}`),
  returnSale: (identifier, payload) => post(`/invoices/${param(identifier)}/returns`, payload),
  transactions: (filters = {}) => get('/transactions', filters),
  collectArPayment: (payload) => post('/ar/payments', payload),
  arSummary: () => get('/ar/summary'),
  apSummary: () => get('/ap/summary'),
  payAp: (payload) => post('/ap/payments', payload),
  taxExportUrl: (kind, from = '', to = '') => `${API_URL}/reports/tax-export${buildQuery({ kind, from, to })}`,
  accountingAccounts: () => get('/accounting/accounts'),
  saveAccountingAccount: (payload) => post('/accounting/accounts', payload),
  updateAccountingAccount: (id, payload) => put(`/accounting/accounts/${param(id)}`, payload),
  deactivateAccountingAccount: (id) => del(`/accounting/accounts/${param(id)}`),
  activateAccountingAccount: (id) => post(`/accounting/accounts/${param(id)}/activate`, {}),
  accountingJournalEntries: (filters = {}) => get('/accounting/journal-entries', filters),
  saveAccountingJournal: (payload) => post('/accounting/journal-entries', payload),
  updateAccountingJournal: (id, payload) => put(`/accounting/journal-entries/${param(id)}`, payload),
  postAccountingJournal: (id) => post(`/accounting/journal-entries/${param(id)}/post`, {}),
  deleteAccountingJournal: (id) => del(`/accounting/journal-entries/${param(id)}`),
  accountingTrialBalance: (asOf, currency) => get('/accounting/trial-balance', { asOf, currency }),
  accountingFinancialStatements: (filters = {}) => get('/accounting/financial-statements', filters),
  fixedAssetClasses: () => get('/fixed-assets/asset-classes'),
  createFixedAssetClass: (payload) => post('/fixed-assets/asset-classes', payload),
  updateFixedAssetClass: (id, payload) => put(`/fixed-assets/asset-classes/${param(id)}`, payload),
  fixedAssets: (filters = {}) => get('/fixed-assets', filters),
  saveFixedAsset: (payload) => post('/fixed-assets', payload),
  runFixedAssetDepreciation: (periodEnd) => post('/fixed-assets/run-depreciation', { periodEnd }),
  fixedAssetDepreciation: (filters = {}) => get('/fixed-assets/depreciation', filters),
  disposeFixedAsset: (id, payload) => post(`/fixed-assets/${param(id)}/dispose`, payload),
  taxPeriods: () => get('/tax-periods'),
  createTaxPeriod: (payload) => post('/tax-periods', payload),
  updateTaxPeriod: (id, payload) => put(`/tax-periods/${param(id)}`, payload),
  taxSummary: (periodId) => get(`/tax-periods/${param(periodId)}/summary`),
  taxRecords: (periodId, kind) => get(`/tax-periods/${param(periodId)}/${param(kind)}`),
  monthlyWhtItems: (returnId) => get('/taxes/monthly/wht-items', { return_id: returnId }),
  saveMonthlyWhtItems: (payload) => post('/taxes/monthly/wht-items', payload),
  createTaxRecord: (periodId, kind, payload) => post(`/tax-periods/${param(periodId)}/${param(kind)}`, payload),
  updateTaxRecord: (periodId, kind, recordId, payload) =>
    put(`/tax-periods/${param(periodId)}/${param(kind)}/${param(recordId)}`, payload),
  deleteTaxRecord: (periodId, kind, recordId) =>
    del(`/tax-periods/${param(periodId)}/${param(kind)}/${param(recordId)}`),
  annualTaxReturns: () => get('/annual-tax-returns'),
  annualTaxReturn: (id) => get(`/annual-tax-returns/${param(id)}`),
  createAnnualTaxReturn: (payload) => post('/annual-tax-returns', payload),
  updateAnnualTaxReturn: (id, payload) => put(`/annual-tax-returns/${param(id)}`, payload),
  salesByStaff: (from = '', to = '') => get('/reports/sales-by-staff', { from, to }),

  // Projects & Files
  projects: () => get('/projects'),
  saveProject: (project) => post('/projects', project),
  projectFiles: (projectId) => get(`/projects/${param(projectId)}/files`),
  userFiles: () => get('/files'),
  uploadUserFile: (file) => {
    const body = new FormData();
    body.append('file', file);
    return post('/files', body);
  },
  downloadFile,

  // HR & Notifications
  leaveRequests: () => get('/leave-requests'),
  saveLeaveRequest: (leave) => post('/leave-requests', leave),
  notifications: () => get('/notifications'),
  markNotificationRead: (id) => patch(`/notifications/${param(id)}/read`),

  // Admin
  superAdminOverview: (query) => get('/superadmin/overview', query),
  superAdminUsers: (query) => get('/superadmin/users', query),
  superAdminOwnershipTransferOptions: (id) => get(`/superadmin/users/${param(id)}/ownership-transfer-options`),
  updateSuperAdminUser: (id, changes) => patch(`/superadmin/users/${param(id)}`, changes),
  deleteSuperAdminUser: (id, transferToUserId) => sendWithBody(
    'DELETE',
    `/superadmin/users/${param(id)}`,
    transferToUserId ? { transferToUserId } : undefined
  ),
  adminUsers: () => get('/admin/users'),
  updateAdminUser: (id, changes) => patch(`/admin/users/${param(id)}`, changes),
  deleteAdminUser: (id) => del(`/admin/users/${param(id)}`),
  adminActivity: () => get('/admin/activity'),
  adminFiles: () => get('/admin/files'),
  reviewProject: (id, decision) => patch(`/admin/projects/${param(id)}/review`, decision),
  reviewFile: (id, decision) => patch(`/admin/files/${param(id)}/review`, decision),
  reviewLeave: (id, decision) => patch(`/admin/leave-requests/${param(id)}/review`, decision)
};