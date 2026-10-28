import { createRouter, createWebHistory } from 'vue-router';
import { canAccessRoles, canAccessRoute, homeRouteName } from './roleAccess';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return { ...savedPosition, behavior: 'smooth' };
    }

    if (to.hash) {
      return {
        el: to.hash,
        behavior: 'smooth',
      };
    }

    return {
      top: 0,
      left: 0,
      behavior: 'smooth',
    };
  },
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
    { path: '/admin', name: 'AdminDashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { roles: ['owner'], title: 'Company Owner Dashboard' } },
    { path: '/user', name: 'UserDashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { roles: ['owner', 'staff'], title: 'Company Workspace' } },
    { path: '/superadmin', name: 'SuperAdminDashboard', component: () => import('@/views/admin/SuperAdminDashboardView.vue'), meta: { roles: ['superadmin'], title: 'Platform Overview | Super Admin' } },

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
      meta: { roles: ['owner', 'staff'], title: 'Register & Cash Drawer' },
    },
    {
      path: '/sales',
      name: 'Sales',
      component: () => import('@/views/sales/SalesView.vue'),
      meta: { title: 'ការលក់ | Sales' },
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
      meta: { roles: ['owner', 'staff'], title: 'Edit Item' },
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
      path: '/inventory/transfers',
      name: 'BranchStockTransfers',
      component: () => import('@/views/inventory/InventoryTransferView.vue'),
      meta: { roles: ['owner', 'staff'], title: 'ផ្ទេរស្តុករវាងសាខា | Branch Stock Transfers' },
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
      path: '/reports/sales-by-vendor',
      name: 'SalesByVendor',
      component: () => import('@/views/reports/SalesByVendorReportView.vue'),
      meta: { title: 'របាយការណ៍លក់តាមអ្នកផ្គត់ផ្គង់ | Sales by Vendor' },
    },
    {
      path: '/inventory/stock-costs',
      name: 'StockCosts',
      component: () => import('@/views/reports/InventoryValuationReportView.vue'),
      meta: { title: 'ថ្លៃដើមស្តុក | Stock Costs' },
    },
    {
      path: '/reports/inventory-summary',
      name: 'InventoryValuation',
      component: () => import('@/views/reports/InventoryValuationReportView.vue'),
      meta: { title: 'របាយការណ៍តម្លៃស្តុក | Inventory Valuation' },
    },
    {
      path: '/reports/tax-vat',
      name: 'TaxVatReport',
      component: () => import('@/views/reports/TaxVatReportView.vue'),
      meta: { title: 'របាយការណ៍ពន្ធអាករ | Tax Report (VAT)' },
    },
    {
      path: '/tax/declaration',
      name: 'TaxDeclaration',
      component: () => import('@/views/tax/TaxDeclarationView.vue'),
      meta: { title: 'Monthly Tax Declaration | Tax System' },
    },
    {
      path: '/tax/annual-filing',
      name: 'AnnualTaxFiling',
      component: () => import('@/views/tax/AnnualTaxFilingView.vue'),
      meta: { roles: ['owner', 'staff'], title: 'Annual Tax Filing | Tax System' },
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
      meta: { roles: ['owner'], title: 'ការកំណត់ក្រុមហ៊ុន និងសាខា | Company & Shops' },
    },
    {
      path: '/company/profile',
      name: 'CompanyProfile',
      component: () => import('@/views/settings/CompanyProfileView.vue'),
      meta: { title: 'Company Data Profile | Tax System' },
    },
    {
      path: '/settings/users',
      name: 'UserSettings',
      component: () => import('@/views/settings/UserAccessView.vue'),
      meta: { roles: ['owner'], title: 'អ្នកប្រើប្រាស់ និងសិទ្ធិ | Users & Roles' },
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

let refreshedToken = '';
let refreshPromise = null;

router.beforeEach(async (to) => {
  let token = localStorage.getItem('tax_token');
  const authenticated = Boolean(token);
  if (!to.meta.public && !authenticated) return { name: 'Login', query: { redirect: to.fullPath } };
  if (to.meta.public && authenticated && !['ForgotPassword', 'VerifyEmail'].includes(to.name)) return { name: 'Dashboard' };
  let user;
  try {
    user = JSON.parse(localStorage.getItem('tax_user') || 'null');
  } catch {
    user = null;
  }
  if (token && refreshedToken !== token) {
    refreshedToken = token;
    const auth = useAuthStore();
    refreshPromise = auth.refreshUser().catch((error) => {
      if (error.status !== 401) console.error('Unable to refresh the authenticated account.', error);
      return error.status === 401 ? null : user;
    });
  }
  if (token && refreshPromise) user = await refreshPromise;
  token = localStorage.getItem('tax_token');
  if (authenticated && !token) return { name: 'Login', query: { redirect: to.fullPath } };
  if (token && !user) {
    useAuthStore().reset();
    refreshedToken = '';
    refreshPromise = null;
    return { name: 'Login', query: { redirect: to.fullPath } };
  }
  const destination = homeRouteName(user);
  if (to.name === 'Dashboard' && user) return { name: destination };
  if (user && !to.meta.public && !canAccessRoute(user, to.name, to.meta.roles, to.path)) return { name: destination };
  if (to.meta.roles && !canAccessRoles(user, to.meta.roles)) return { name: destination };
  document.title = to.meta.title
    ? `${to.meta.title} - Tax System`
    : 'Tax System - Inventory & Sales';
});

export default router
