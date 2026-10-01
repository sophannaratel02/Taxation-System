const API_URL = (import.meta.env?.VITE_API_URL || '/api').replace(/\/$/, '');

// ============================================================================
// Core Helpers
// ============================================================================

const param = (val) => encodeURIComponent(String(val));

function getAuthHeader() {
  const token = localStorage.getItem('tax_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
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
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (err) {
    throw new Error('Cannot connect to the API. Check your network or API server availability.', { cause: err });
  }

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    localStorage.removeItem('tax_token');
    localStorage.removeItem('tax_user');
  }

  if (!response.ok) {
    const errorMsg = payload.message || payload.error || `Request failed (${response.status})`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  return payload;
}

// REST shorthand utilities
const get   = (path, query)         => request(`${path}${buildQuery(query)}`);
const post  = (path, body, headers) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body), headers });
const put   = (path, body)          => request(path, { method: 'PUT', body: JSON.stringify(body) });
const patch = (path, body)          => request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
const del   = (path)                => request(path, { method: 'DELETE' });

// ============================================================================
// File Download Handler
// ============================================================================

async function downloadFile(id) {
  const response = await fetch(`${API_URL}/files/${param(id)}/download`, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Download failed (${response.status})`);
  }

  let filename = `document-${id}`;
  const disposition = response.headers.get('Content-Disposition');
  if (disposition) {
    // Matches filename*="utf-8''..." or filename="..."
    const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^;"'\n]+)["']?/i);
    if (match?.[1]) filename = decodeURIComponent(match[1].trim());
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
  login: (username, password) => post('/auth/login', { username, password }),
  register: (payload) => post('/auth/register', payload),
  forgotPassword: (emailOrUsername) => post('/auth/forgot-password', { emailOrUsername }),
  verifyOtp: (email, otp) => post('/auth/verify-otp', { email, otp }),
  resetPassword: (payload) => post('/auth/reset-password', payload),

  // User & Settings
  users: () => get('/users'),
  saveUser: (payload) => post('/users', payload),
  settings: () => get('/settings'),
  saveSettings: (settings) => put('/settings', settings),
  policyNotes: () => get('/policy-notes'),
  savePolicyNotes: (notes) => put('/admin/policy-notes', { notes }),
  deletePolicyNotes: () => del('/admin/policy-notes'),

  // Catalog & Entities
  items: (search = '') => get('/items', { search }),
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
  batches: () => get('/inventory/batches'),
  saveBatch: (payload) => post('/inventory/batches', payload),
  transfers: () => get('/inventory/transfers'),
  saveTransfer: (payload) => post('/inventory/transfers', payload),
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
  transactions: () => get('/transactions'),
  collectArPayment: (payload) => post('/ar/payments', payload),
  arSummary: () => get('/ar/summary'),
  apSummary: () => get('/ap/summary'),
  payAp: (payload) => post('/ap/payments', payload),
  taxExportUrl: (kind, from = '', to = '') => `${API_URL}/reports/tax-export${buildQuery({ kind, from, to })}`,
  taxPeriods: () => get('/tax-periods'),
  createTaxPeriod: (payload) => post('/tax-periods', payload),
  updateTaxPeriod: (id, payload) => put(`/tax-periods/${param(id)}`, payload),
  taxSummary: (periodId) => get(`/tax-periods/${param(periodId)}/summary`),
  taxRecords: (periodId, kind) => get(`/tax-periods/${param(periodId)}/${param(kind)}`),
  monthlyWhtItems: (returnId) => get('/taxes/monthly/wht-items', { return_id: returnId }),
  saveMonthlyWhtItems: (payload) => post('/taxes/monthly/wht-items', payload),
  createTaxRecord: (periodId, kind, payload) => post(`/tax-periods/${param(periodId)}/${param(kind)}`, payload),
  updateTaxRecord: (periodId, kind, recordId, payload) => put(`/tax-periods/${param(periodId)}/${param(kind)}/${param(recordId)}`, payload),
  deleteTaxRecord: (periodId, kind, recordId) => del(`/tax-periods/${param(periodId)}/${param(kind)}/${param(recordId)}`),
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
  adminUsers: () => get('/admin/users'),
  updateAdminUser: (id, changes) => patch(`/admin/users/${param(id)}`, changes),
  deleteAdminUser: (id) => del(`/admin/users/${param(id)}`),
  adminActivity: () => get('/admin/activity'),
  adminFiles: () => get('/admin/files'),
  reviewProject: (id, decision) => patch(`/admin/projects/${param(id)}/review`, decision),
  reviewFile: (id, decision) => patch(`/admin/files/${param(id)}/review`, decision),
  reviewLeave: (id, decision) => patch(`/admin/leave-requests/${param(id)}/review`, decision),
};