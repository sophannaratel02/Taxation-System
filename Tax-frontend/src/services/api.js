const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  const token = localStorage.getItem('tax_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem('tax_token');
    localStorage.removeItem('tax_user');
  }
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

async function downloadFile(id) {
  const headers = {};
  const token = localStorage.getItem('tax_token');
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}/files/${encodeURIComponent(id)}/download`, { headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Download failed (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `document-${id}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  forgotPassword: (emailOrUsername) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ emailOrUsername }) }),
  verifyOtp: (email, otp) => request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) }),
  resetPassword: (payload) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }),
  users: () => request('/users'),
  saveUser: (payload) => request('/users', { method: 'POST', body: JSON.stringify(payload) }),
  settings: () => request('/settings'),
  saveSettings: (settings) => request('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  policyNotes: () => request('/policy-notes'),
  savePolicyNotes: (notes) => request('/admin/policy-notes', { method: 'PUT', body: JSON.stringify({ notes }) }),
  deletePolicyNotes: () => request('/admin/policy-notes', { method: 'DELETE' }),
  items: (search = '') => request(`/items?search=${encodeURIComponent(search)}`),
  saveItem: (item) => request('/items', { method: 'POST', body: JSON.stringify(item) }),
  updateItem: (id, item) => request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
  deleteItem: (id) => request(`/items/${id}`, { method: 'DELETE' }),
  vendors: () => request('/vendors'),
  saveVendor: (vendor) => request('/vendors', { method: 'POST', body: JSON.stringify(vendor) }),
  updateVendor: (id, vendor) => request(`/vendors/${id}`, { method: 'PUT', body: JSON.stringify(vendor) }),
  deleteVendor: (id) => request(`/vendors/${id}`, { method: 'DELETE' }),
  customers: () => request('/customers'),
  saveCustomer: (customer) => request('/customers', { method: 'POST', body: JSON.stringify(customer) }),
  updateCustomer: (id, customer) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(customer) }),
  deleteCustomer: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
  purchaseOrders: () => request('/purchase-orders'),
  savePurchaseOrder: (order) => request('/purchase-orders', { method: 'POST', body: JSON.stringify(order) }),
  purchaseOrder: (id) => request(`/purchase-orders/${id}`),
  updatePurchaseOrder: (id, order) => request(`/purchase-orders/${id}`, { method: 'PUT', body: JSON.stringify(order) }),
  deletePurchaseOrder: (id) => request(`/purchase-orders/${id}`, { method: 'DELETE' }),
  receivePurchaseOrder: (id, payload = {}) => request(`/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify(payload) }),
  projects: () => request('/projects'),
  saveProject: (project) => request('/projects', { method: 'POST', body: JSON.stringify(project) }),
  projectFiles: (projectId) => request(`/projects/${projectId}/files`),
  userFiles: () => request('/files'),
  uploadUserFile: (file) => {
    const body = new FormData();
    body.append('file', file);
    return request('/files', { method: 'POST', body });
  },
  downloadFile,
  leaveRequests: () => request('/leave-requests'),
  saveLeaveRequest: (leave) => request('/leave-requests', { method: 'POST', body: JSON.stringify(leave) }),
  notifications: () => request('/notifications'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  adminUsers: () => request('/admin/users'),
  updateAdminUser: (id, changes) => request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteAdminUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  adminActivity: () => request('/admin/activity'),
  adminFiles: () => request('/admin/files'),
  reviewProject: (id, decision) => request(`/admin/projects/${id}/review`, { method: 'PATCH', body: JSON.stringify(decision) }),
  reviewFile: (id, decision) => request(`/admin/files/${id}/review`, { method: 'PATCH', body: JSON.stringify(decision) }),
  reviewLeave: (id, decision) => request(`/admin/leave-requests/${id}/review`, { method: 'PATCH', body: JSON.stringify(decision) }),
  invoices: () => request('/invoices'),
  invoice: (identifier) => request(`/invoices/${encodeURIComponent(identifier)}`),
  salesByStaff: (from = '', to = '') => request(`/reports/sales-by-staff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  transactions: () => request('/transactions'),
  adjustStock: (payload) => request('/stock/adjustments', { method: 'POST', body: JSON.stringify(payload) }),
  completeSale: (payload) => request('/sales', { method: 'POST', body: JSON.stringify(payload) }),
  createKhqrIntent: (payload) => request('/khqr/intents', { method: 'POST', body: JSON.stringify(payload) }),
  verifyKhqrIntent: (id) => request(`/khqr/intents/${encodeURIComponent(id)}/verify`, { method: 'POST', body: JSON.stringify({}) }),
  currentRegister: (branch) => request(`/register/current?branch=${encodeURIComponent(branch || '')}`),
  openRegister: (payload) => request('/register/open', { method: 'POST', body: JSON.stringify(payload) }),
  closeRegister: (payload) => request('/register/close', { method: 'POST', body: JSON.stringify(payload) }),
  registerReport: (id) => request(`/register/report?registerId=${encodeURIComponent(id)}`),
  collectArPayment: (payload) => request('/ar/payments', { method: 'POST', body: JSON.stringify(payload) }),
  arSummary: () => request('/ar/summary'),
  apSummary: () => request('/ap/summary'),
  payAp: (payload) => request('/ap/payments', { method: 'POST', body: JSON.stringify(payload) }),
  taxExportUrl: (kind, from = '', to = '') => `${API_URL}/reports/tax-export?kind=${encodeURIComponent(kind)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  batches: () => request('/inventory/batches'),
  saveBatch: (payload) => request('/inventory/batches', { method: 'POST', body: JSON.stringify(payload) }),
  transfers: () => request('/inventory/transfers'),
  saveTransfer: (payload) => request('/inventory/transfers', { method: 'POST', body: JSON.stringify(payload) }),
  managerOverride: (payload) => request('/manager/override', { method: 'POST', body: JSON.stringify(payload) }),
};
