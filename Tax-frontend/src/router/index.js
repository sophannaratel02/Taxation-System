import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/Authentication/Login.vue'),
      meta: { public: true, title: 'Sign in | Tax System' },
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/views/Authentication/Register.vue'),
      meta: { public: true, title: 'Create account | Tax System' },
    },
    {
      path: '/forgot-password',
      name: 'ForgotPassword',
      component: () => import('@/views/Authentication/Forgotpassword.vue'),
      meta: { public: true, title: 'Password recovery | Tax System' },
    },
    {
      path: '/',
      name: 'Dashboard',
      component: () => import('@/views/dashboard/DashboardView.vue'),
      meta: { title: 'ផ្ទាំងគ្រប់គ្រងទូទៅ | Dashboard' },
    },
    { path: '/admin', name: 'AdminDashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { roles: ['admin'], title: 'Admin Dashboard' } },
    { path: '/user', name: 'UserDashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { roles: ['user'], title: 'User Dashboard' } },
    { path: '/user/projects', name: 'UserProjects', component: () => import('@/views/role/UserProjectsView.vue'), meta: { roles: ['user'], title: 'My Projects' } },
    { path: '/user/leave', name: 'UserLeave', component: () => import('@/views/role/UserLeaveView.vue'), meta: { roles: ['user'], title: 'Leave Requests' } },
    { path: '/notifications', name: 'Notifications', component: () => import('@/views/role/NotificationsView.vue'), meta: { title: 'Notifications' } },
    { path: '/admin/approvals', name: 'AdminApprovals', component: () => import('@/views/admin/AdminApprovalsView.vue'), meta: { roles: ['admin'], title: 'Approval Center' } },
    {
      path: '/pos',
      name: 'POS',
      component: () => import('@/views/pos/PosCheckoutView.vue'),
      meta: { title: 'លក់ទំនិញ | Point of Sale' },
    },
    {
      path: '/pos/register',
      name: 'RegisterManagement',
      component: () => import('@/views/pos/RegisterManagementView.vue'),
      meta: { roles: ['admin'], title: 'Register & Cash Drawer' },
    },
    {
      path: '/sales/invoices',
      name: 'SalesInvoices',
      component: () => import('@/views/sales/SalesHistoryView.vue'),
      meta: { title: 'ប្រវត្តិវិក្កយបត្រលក់ | Sales History' },
    },
    {
      path: '/sales/invoices/:id',
      name: 'InvoiceDetail',
      component: () => import('@/views/sales/InvoiceDetailView.vue'),
      meta: { title: 'Invoice details | Sales Invoice' },
    },
    {
      path: '/sales/customers',
      name: 'Customers',
      component: () => import('@/views/sales/CustomerListView.vue'),
      meta: { title: 'បញ្ជីអតិថិជន | Customers' },
    },
    {
      path: '/sales/ar',
      name: 'AccountsReceivable',
      component: () => import('@/views/sales/AccountsReceivableView.vue'),
      meta: { title: 'គណនីត្រូវទារ | Accounts Receivable (AR)' },
    },
    {
      path: '/inventory/items',
      name: 'ItemsList',
      component: () => import('@/views/inventory/ItemListView.vue'),
      meta: { title: 'បញ្ជីទំនិញ និងខ្នាត | Item List & UOM' },
    },
    {
      path: '/inventory/items/new',
      name: 'CreateItem',
      component: () => import('@/views/inventory/ItemFormView.vue'),
      meta: { title: 'បង្កើតទំនិញថ្មី | Create New Item' },
    },
    {
      path: '/inventory/items/:id/edit',
      name: 'EditItem',
      component: () => import('@/views/inventory/ItemFormView.vue'),
      meta: { roles: ['admin'], title: 'Edit Item' },
    },
    {
      path: '/inventory/adjustments',
      name: 'StockAdjustment',
      component: () => import('@/views/inventory/AdjustmentView.vue'),
      meta: { title: 'កែសម្រួលស្តុក | Stock Adjustment' },
    },
    {
      path: '/inventory/history',
      name: 'TransactionHistory',
      component: () => import('@/views/inventory/ItemTransactionHistoryView.vue'),
      meta: { title: 'ប្រវត្តិចរន្តទំនិញ | Item Transaction History' },
    },
    {
      path: '/purchase/vendors',
      name: 'VendorsList',
      component: () => import('@/views/purchase/VendorListView.vue'),
      meta: { title: 'អ្នកផ្គត់ផ្គង់ | Vendors' },
    },
    {
      path: '/purchase/orders',
      name: 'PurchaseOrders',
      component: () => import('@/views/purchase/PurchaseOrderView.vue'),
      meta: { title: 'បញ្ជាទិញទំនិញ | Purchase Orders' },
    },
    {
      path: '/purchase/ap',
      name: 'AccountsPayable',
      component: () => import('@/views/purchase/AccountsPayableView.vue'),
      meta: { title: 'គណនីត្រូវសង | Accounts Payable (AP)' },
    },
    {
      path: '/reports/sales-by-staff',
      name: 'SalesByStaff',
      component: () => import('@/views/reports/SalesReportView.vue'),
      meta: { title: 'របាយការណ៍លក់តាមបុគ្គលិក | Sales by Staff' },
    },
    {
      path: '/reports/sales-by-vendor',
      name: 'SalesByVendor',
      component: () => import('@/views/reports/SalesByVendorReportView.vue'),
      meta: { title: 'របាយការណ៍លក់តាមអ្នកផ្គត់ផ្គង់ | Sales by Vendor' },
    },
    {
      path: '/reports/inventory-summary',
      name: 'InventorySummary',
      component: () => import('@/views/reports/InventorySummaryReportView.vue'),
      meta: { title: 'របាយការណ៍ស្តុកសង្ខេប | Inventory Summary' },
    },
    {
      path: '/reports/tax-vat',
      name: 'TaxVatReport',
      component: () => import('@/views/reports/TaxVatReportView.vue'),
      meta: { title: 'របាយការណ៍ពន្ធអាករ | Tax Report (VAT)' },
    },
    {
      path: '/reports/sales-by-customer',
      name: 'SalesByCustomer',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'Sales by Customer' },
    },
    {
      path: '/reports/sales-by-category',
      name: 'SalesByCategory',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'Sales by Category' },
    },
    {
      path: '/reports/sales-by-item',
      name: 'SalesByItem',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'Sales by Item' },
    },
    {
      path: '/reports/payment-methods',
      name: 'SalesByPaymentMethod',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'Sales by Payment Method' },
    },
    {
      path: '/reports/inventory-detail',
      name: 'InventoryDetail',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'Inventory Detail Report' },
    },
    {
      path: '/reports/inventory-transfers',
      name: 'InventoryTransfers',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'Inventory Transfer Report' },
    },
    {
      path: '/reports/aging/ar',
      name: 'AccountsReceivableAging',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'AR Aging Report' },
    },
    {
      path: '/reports/aging/ap',
      name: 'AccountsPayableAging',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'AP Aging Report' },
    },
    {
      path: '/reports/purchases/by-vendor',
      name: 'PurchasesByVendor',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'Purchase by Vendor' },
    },
    {
      path: '/reports/purchases/multi-vendor',
      name: 'MultiVendorItems',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'Items Supplied by Multiple Vendors' },
    },
    {
      path: '/reports/purchases/best-selling',
      name: 'BestSellingItems',
      component: () => import('@/views/reports/AdditionalReportsView.vue'),
      meta: { title: 'Best Selling Items' },
    },
    {
      path: '/settings/company',
      name: 'CompanySettings',
      component: () => import('@/views/settings/CompanyShopsView.vue'),
      meta: { title: 'ការកំណត់ក្រុមហ៊ុន និងសាខា | Company & Shops' },
    },
    {
      path: '/settings/policy',
      name: 'PolicySettings',
      component: () => import('@/views/settings/PolicySettingsView.vue'),
      meta: { roles: ['admin'], title: 'Policy & Controls | System Settings' },
    },
    {
      path: '/settings/policy-notes',
      name: 'PolicyNotes',
      component: () => import('@/views/settings/PolicyNotesView.vue'),
      meta: { roles: ['admin', 'user'], title: 'Policy Notes | System Settings' },
    },
    {
      path: '/settings/users',
      name: 'UserSettings',
      component: () => import('@/views/settings/UserAccessView.vue'),
      meta: { roles: ['admin'], title: 'អ្នកប្រើប្រាស់ និងសិទ្ធិ | Users & Roles' },
    },
    {
      path: '/thermal-receipt',
      name: 'ThermalReceipt',
      component: () => import('@/components/receipt/ThermalReceipt40Col.vue'),
      meta: { title: 'វិក្កយបត្រកំដៅ | Thermal Receipt' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('@/views/errors/NotFoundView.vue'),
      meta: { title: 'រកមិនឃើញទំព័រ | 404 Not Found' },
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach((to) => {
  const authenticated = Boolean(localStorage.getItem('tax_token'));
  if (!to.meta.public && !authenticated) return { name: 'Login', query: { redirect: to.fullPath } };
  if (to.meta.public && authenticated && to.name !== 'ForgotPassword') return { name: 'Dashboard' };
  const user = JSON.parse(localStorage.getItem('tax_user') || 'null');
  const role = String(user?.role || '').toLowerCase();
  const allowedRoles = (to.meta.roles || []).map((allowedRole) => String(allowedRole).toLowerCase());
  if (to.name === 'Dashboard' && user) return { name: role === 'admin' ? 'AdminDashboard' : 'UserDashboard' };
  if (to.meta.roles && (!user || !allowedRoles.includes(role))) return { name: role === 'admin' ? 'AdminDashboard' : 'UserDashboard' };
  document.title = to.meta.title
    ? `${to.meta.title} - Tax System`
    : 'Tax System - Inventory & Sales';
});

export default router
