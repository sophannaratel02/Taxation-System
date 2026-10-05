<template>
  <Transition name="dialog-fade">
    <div v-if="dialog.open" class="global-dialog-backdrop" @click.self="closeDialog(false)">
      <div class="global-dialog" role="dialog" aria-modal="true" :aria-labelledby="dialogTitleId">
        <div class="global-dialog-icon" :class="`tone-${dialog.variant}`">
          <i :class="dialog.icon" aria-hidden="true"></i>
        </div>
        <h2 :id="dialogTitleId" class="global-dialog-title">{{ dialog.title }}</h2>
        <p class="global-dialog-message">{{ dialog.message }}</p>
        <div class="global-dialog-actions">
          <button v-if="dialog.showCancel" type="button" class="btn btn-light border" @click="closeDialog(false)">
            {{ dialog.cancelText }}
          </button>
          <button type="button" class="btn" :class="confirmButtonClass" @click="closeDialog(true)">
            {{ dialog.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <RouterView v-if="route.meta.public" />

  <div v-else class="d-flex flex-column vh-100 app-shell">
    <!-- Top Executive Navigation Bar -->
    <nav class="top-navbar px-3 px-lg-4 no-print">
      <div class="d-flex align-items-center justify-content-between w-100">
        <!-- Left: Mobile Toggle & Brand Identity -->
        <div class="d-flex align-items-center gap-3">
          <button
            class="btn btn-icon d-lg-none"
            type="button"
            aria-label="Toggle navigation"
            @click.stop="sidebarOpen = !sidebarOpen"
          >
            <i class="bi bi-list fs-5"></i>
          </button>

          <router-link to="/" class="brand-link d-flex align-items-center text-decoration-none">
            <div class="brand-logo-wrapper">
              <img :src="logoUrl" class="brand-logo" alt="Logo" />
            </div>
            <div class="d-flex flex-column ms-2 leading-tight">
              <span class="brand-title">AXIS CONSULTING</span>
              <span class="brand-subtitle">TAX &amp; INVENTORY ERP</span>
            </div>
          </router-link>
        </div>

        <!-- Right: Real-time Context & Controls -->
        <div class="d-flex align-items-center gap-2 gap-md-3">
          <!-- Live Telemetry Status Pills -->
          <div class="d-none d-md-flex align-items-center gap-2">
            <!-- Active Branch Pill -->
            <div class="meta-pill" :title="language.isKhmer ? 'សាខាប្រតិបត្តិការបច្ចុប្បន្ន' : 'Active operating branch'">
              <span class="status-indicator"></span>
              <span class="text-secondary small me-1">{{ language.isKhmer ? 'សាខា:' : 'Branch:' }}</span>
              <span class="fw-semibold text-light">{{ tax.settings?.branch || 'Head Quarter' }}</span>
            </div>

            <!-- Currency Rate Pill -->
            <div class="meta-pill currency-pill" :title="language.isKhmer ? 'អត្រាប្តូរប្រាក់ផ្លូវការ' : 'Current exchange rate'">
              <i class="bi bi-currency-exchange text-warning me-1"></i>
              <span class="fw-medium text-light">1$ =</span>
              <span class="fw-bold text-amber ms-1">
                {{ (Number(tax.settings?.exchangeRate) || 4000).toLocaleString() }} ៛
              </span>
            </div>
          </div>

          <!-- Language Switcher -->
          <button
            class="language-toggle shadow-xs"
            type="button"
            :aria-label="`${language.t('language')}: ${language.isKhmer ? language.t('khmer') : language.t('english')}`"
            @click="language.toggleLanguage"
          >
            <i class="bi bi-translate text-info"></i>
            <span>{{ language.isKhmer ? 'ខ្មែរ' : 'EN' }}</span>
          </button>

          <div class="vr d-none d-md-block opacity-25 text-white my-2"></div>

          <!-- User Profile Dropdown -->
          <div ref="profileDropdownRef" class="dropdown position-relative">
            <button
              class="user-profile-btn d-flex align-items-center gap-2"
              type="button"
              :aria-expanded="profileOpen"
              @click.stop="profileOpen = !profileOpen"
            >
              <div class="avatar-circle">
                {{ currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U' }}
              </div>

              <div class="d-none d-sm-flex flex-column text-start me-1">
                <span class="user-name text-truncate" style="max-width: 140px;">
                  {{ currentUser?.name || 'Staff Member' }}
                </span>
                <span class="user-role">
                  {{ isAdmin ? language.t('administrator') : language.t('staffUser') }}
                </span>
              </div>

              <i class="bi bi-chevron-down toggle-arrow" :class="{ 'rotate-180': profileOpen }"></i>
            </button>

            <!-- Menu Card -->
            <Transition name="dropdown-fade">
              <ul v-if="profileOpen" class="dropdown-menu dropdown-menu-end custom-dropdown shadow-lg show">
                <li class="dropdown-header px-3 py-2">
                  <div class="fw-bold text-dark text-truncate">{{ currentUser?.name || 'User' }}</div>
                  <small class="text-muted d-block">
                    {{ language.t('signedInAs') }} 
                    <span class="text-primary fw-semibold">
                      {{ isAdmin ? language.t('administrator') : language.t('staffUser') }}
                    </span>
                  </small>
                </li>
                <li><hr class="dropdown-divider my-1" /></li>
                <li>
                  <router-link to="/settings/users" class="dropdown-item py-2" @click="profileOpen = false">
                    <i class="bi bi-person-gear me-2 text-primary"></i>
                    {{ language.t('accessUsers') }}
                  </router-link>
                </li>
                <li>
                  <router-link to="/settings/company" class="dropdown-item py-2" @click="profileOpen = false">
                    <i class="bi bi-sliders me-2 text-secondary"></i>
                    {{ language.t('companyShops') }}
                  </router-link>
                </li>
                <li><hr class="dropdown-divider my-1" /></li>
                <li>
                  <button class="dropdown-item py-2 text-danger" type="button" @click="logout">
                    <i class="bi bi-box-arrow-right me-2"></i>
                    {{ language.t('logout') }}
                  </button>
                </li>
              </ul>
            </Transition>
          </div>
        </div>
      </div>
    </nav>

    <!-- Workspace Viewport -->
    <div class="d-flex flex-grow-1 overflow-hidden position-relative">
      <!-- Backdrop for small screens -->
      <div
        v-if="sidebarOpen"
        class="sidebar-backdrop position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50 d-lg-none"
        style="z-index: 1040;"
        @click="sidebarOpen = false"
      ></div>

      <!-- Sidebar -->
      <aside
        :class="[
          'sidebar-wrapper',
          'bg-white',
          'border-end',
          'shadow-xs',
          'd-flex',
          'flex-column',
          'overflow-y-auto',
          'no-print',
          { 'is-open': sidebarOpen }
        ]"
      >
        <div class="sidebar-top-caption p-3 border-bottom d-flex justify-content-between align-items-center">
          <small class="text-uppercase fw-bold text-muted tracking-wider">
            {{ language.t('navigation') }}
          </small>
          <span class="badge bg-light text-secondary border font-monospace small">v1.2.0</span>
        </div>

        <div class="list-group list-group-flush small flex-grow-1 py-2 custom-scroll">
          <!-- Main Dashboard -->
          <router-link
            :to="isAdmin ? '/admin' : '/user'"
            class="list-group-item list-group-item-action d-flex align-items-center py-2"
            active-class="active"
          >
            <i class="bi bi-speedometer2 me-3 fs-6"></i>
            <span>{{ language.t('dashboard') }}</span>
          </router-link>

          <!-- Regular User Workspace -->
          <template v-if="!isAdmin">
            <div class="menu-header">{{ language.t('workspace') }}</div>
            <router-link to="/user/files" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-file-earmark-arrow-up me-2 text-secondary"></i> {{ language.isKhmer ? 'ឯកសាររបស់ខ្ញុំ' : 'My Files' }}
            </router-link>
            <router-link to="/user/leave" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-calendar2-check me-2 text-secondary"></i> {{ language.t('leaveRequest') }}
            </router-link>
            <router-link to="/notifications" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-bell me-2 text-secondary"></i> {{ language.t('notifications') }}
            </router-link>
            <router-link to="/settings/policy-notes" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-file-earmark-lock me-2 text-secondary"></i> {{ language.t('policyControls') }}
            </router-link>
          </template>

          <!-- Admin Workspace -->
          <template v-if="isAdmin">
            <!-- Approval Center -->
            <router-link to="/admin/approvals" class="list-group-item list-group-item-action d-flex align-items-center py-2 text-danger fw-semibold" active-class="active">
              <i class="bi bi-check2-square me-3 fs-6"></i>
              <span>{{ language.t('approvalCenter') }}</span>
            </router-link>

            <!-- POS Terminal Fast Action -->
            <router-link
              to="/pos"
              class="list-group-item list-group-item-action d-flex align-items-center py-2 text-success fw-bold pos-highlight my-1"
              active-class="active"
            >
              <i class="bi bi-cart4 me-3 fs-6"></i>
              <span>{{ language.isKhmer ? 'លក់ទំនិញ (POS)' : 'Open POS ' }}</span>
              <span class="badge bg-success-subtle text-success ms-auto small">LIVE</span>
            </router-link>

            <!-- Customer & Sales -->
            <div class="menu-header">{{ language.t('customerSales') }}</div>
            <router-link to="/sales/invoices" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-receipt me-2 text-secondary"></i> {{ language.t('salesHistory') }}
            </router-link>
            <router-link to="/sales/customers" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-people me-2 text-secondary"></i> {{ language.t('customers') }}
            </router-link>
            <router-link to="/sales/ar" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-wallet2 me-2 text-secondary"></i> {{ language.t('accountsReceivable') }}
            </router-link>

            <!-- Inventory Management -->
            <div class="menu-header">{{ language.t('inventory') }}</div>
            <router-link to="/inventory/items" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-box-seam me-2 text-secondary"></i> {{ language.t('items') }}
            </router-link>
            <router-link to="/inventory/adjustments" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-sliders me-2 text-secondary"></i> {{ language.t('stockAdjustment') }}
            </router-link>
            <router-link to="/inventory/history" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-clock-history me-2 text-secondary"></i> {{ language.t('transactionHistory') }}
            </router-link>

            <!-- Vendor & Purchase -->
            <div class="menu-header">{{ language.t('vendorPurchase') }}</div>
            <router-link to="/purchase/vendors" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-truck me-2 text-secondary"></i> {{ language.t('vendors') }}
            </router-link>
            <router-link to="/purchase/orders" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-file-earmark-plus me-2 text-secondary"></i> {{ language.t('purchaseOrders') }}
            </router-link>
            <router-link to="/purchase/ap" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-receipt-cutoff me-2 text-secondary"></i> {{ language.t('accountsPayable') }}
            </router-link>

            <!-- Reports & Analytics -->
            <div class="menu-header">{{ language.t('reports') }}</div>
            <router-link to="/reports/sales-by-staff" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-person-lines-fill me-2 text-secondary"></i> {{ language.t('salesByStaff') }}
            </router-link>
            <router-link to="/reports/sales-by-vendor" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-shop-window me-2 text-secondary"></i> {{ language.t('salesByVendor') }}
            </router-link>
            <router-link to="/reports/inventory-summary" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-pie-chart me-2 text-secondary"></i> {{ language.t('inventorySummary') }}
            </router-link>
            <router-link to="/reports/tax-vat" class="list-group-item list-group-item-action py-2 ps-4 fw-semibold"active-class="active text-success"
          :class="$route.path.includes('/reports/tax-vat') ? '' : 'text-danger'">
          <i  class="bi bi-percent me-2" :class="$route.path.includes('/reports/tax-vat') ? 'text-success' : 'text-danger'"></i>  {{ language.t('taxReport') }}
            </router-link>
            <router-link to="/tax/declaration" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-journal-text me-2 text-secondary"></i> {{ language.isKhmer ? 'ប្រកាសពន្ធប្រចាំខែ' : 'M-Tax Declaration' }}
            </router-link>
            <router-link to="/tax/annual-filing" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-file-earmark-spreadsheet me-2 text-secondary"></i> {{ language.isKhmer ? 'ប្រកាសពន្ធលើប្រាក់ចំណូលប្រចាំឆ្នាំ' : 'Annual Tax Filing (TOI)' }}
            </router-link>

            <!-- System Settings -->
            <div class="menu-header">{{ language.t('settings') }}</div>
            <router-link to="/settings/company" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-building me-2 text-secondary"></i> {{ language.t('companyShops') }}
            </router-link>
            <router-link to="/settings/policy" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-file-earmark-lock me-2 text-secondary"></i> {{ language.t('policyControls') }}
            </router-link>
            <router-link to="/settings/users" class="list-group-item list-group-item-action py-2 ps-4" active-class="active">
              <i class="bi bi-shield-lock me-2 text-secondary"></i> {{ language.t('accessUsers') }}
            </router-link>
          </template>
        </div>

        <div class="p-3 border-top text-center text-muted small bg-light d-flex justify-content-between align-items-center">
          <span class="font-monospace">INKLUSIVITY ERP</span>
          <span class="status-dot bg-success rounded-circle" title="System Online"></span>
        </div>
      </aside>

      <!-- Main Dynamic Workspace View -->
      <main class="flex-grow-1 overflow-y-auto page-canvas">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLanguageStore } from './stores/language';
import { useTaxStore } from './stores/tax';
import { closeDialog, dialogState } from './utils/dialog';
import logoUrl from './assets/logo.svg';

const route = useRoute();
const router = useRouter();
const language = useLanguageStore();
const tax = useTaxStore();

const sidebarOpen = ref(false);
const profileOpen = ref(false);
const profileDropdownRef = ref(null);
const dialog = dialogState;
const dialogTitleId = 'app-global-dialog-title';
const confirmButtonClass = computed(() => {
  if (dialog.variant === 'success') return 'btn-success';
  if (dialog.variant === 'danger') return 'btn-danger';
  return 'btn-primary';
});

function getSafeStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('tax_user') || 'null');
  } catch {
    return null;
  }
}

const currentUser = ref(getSafeStoredUser());
const isAdmin = computed(() => String(currentUser.value?.role || '').toLowerCase() === 'admin');

// Auto close dropdown & menu when clicking outside
function handleClickOutside(event) {
  if (profileDropdownRef.value && !profileDropdownRef.value.contains(event.target)) {
    profileOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// Sync route changes
watch(
  () => route.fullPath,
  () => {
    currentUser.value = getSafeStoredUser();
    sidebarOpen.value = false;
    profileOpen.value = false;
  }
);

function logout() {
  localStorage.removeItem('tax_token');
  localStorage.removeItem('tax_user');
  currentUser.value = null;
  router.push('/login');
}
</script>

<style scoped>
.app-shell {
  background-color: #f8fafc;
  color: #1e293b;
}

/* 1. Top Navbar */
.top-navbar {
  height: 64px;
  background: #0b1329; /* High-grade deep slate navy */
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  position: relative;
  z-index: 1030;
}

.brand-link {
  transition: opacity 0.2s ease;
}
.brand-link:hover {
  opacity: 0.9;
}

.brand-logo-wrapper {
  width: 36px;
  height: 36px;
  background: #ffffff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.leading-tight {
  line-height: 1.15;
}

.brand-title {
  color: #f8fafc;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.brand-subtitle {
  color: #fbbf24;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}

/* 2. Operational Metadata Pills */
.meta-pill {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 0.78rem;
  backdrop-filter: blur(4px);
}

.status-indicator {
  width: 7px;
  height: 7px;
  background-color: #10b981;
  border-radius: 50%;
  margin-right: 8px;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
  }
  70% {
    box-shadow: 0 0 0 5px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

.text-amber {
  color: #f59e0b;
}

/* 3. Controls & Profile */
.language-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 0.35rem 0.65rem;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  transition: all 0.2s ease;
}

.language-toggle:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.btn-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.user-profile-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 3px 10px 3px 3px;
  border-radius: 9999px;
  color: #f8fafc;
  cursor: pointer;
  transition: all 0.2s ease;
}

.user-profile-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.avatar-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: #f1f5f9;
  line-height: 1.15;
}

.user-role {
  font-size: 0.65rem;
  color: #94a3b8;
}

.toggle-arrow {
  font-size: 0.7rem;
  color: #94a3b8;
  transition: transform 0.2s ease;
}

.rotate-180 {
  transform: rotate(180deg);
}

/* 4. Dropdown */
.custom-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  min-width: 220px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 6px;
  z-index: 1060;
}

.custom-dropdown .dropdown-item {
  border-radius: 8px;
  font-size: 0.85rem;
  color: #334155;
  transition: background 0.15s;
}

.custom-dropdown .dropdown-item:hover {
  background: #f1f5f9;
}

.custom-dropdown .dropdown-item.text-danger:hover {
  background: #fef2f2;
  color: #dc2626 !important;
}

/* 5. Sidebar Layout */
.sidebar-wrapper {
  width: 270px;
  min-width: 270px;
  transition: transform 0.25s ease-in-out;
}

@media (max-width: 991.98px) {
  .sidebar-wrapper {
    position: fixed;
    top: 64px;
    bottom: 0;
    left: 0;
    z-index: 1045;
    transform: translateX(-100%);
  }

  .sidebar-wrapper.is-open {
    transform: translateX(0);
  }
}

.sidebar-top-caption {
  background-color: #f8fafc;
}

.tracking-wider {
  letter-spacing: 0.05em;
  font-size: 0.68rem;
}

.menu-header {
  padding: 14px 16px 4px;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #94a3b8;
  letter-spacing: 0.06em;
}

.sidebar-wrapper .list-group-item {
  border: none;
  border-left: 3px solid transparent;
  color: #475569;
  font-weight: 500;
  transition: background-color 0.15s, color 0.15s;
}

.sidebar-wrapper .list-group-item:hover {
  background-color: #f8fafc;
  color: #0d6efd;
}

.sidebar-wrapper .list-group-item.active {
  background-color: #eff6ff;
  color: #0d6efd;
  font-weight: 600;
  border-left-color: #0d6efd;
}

.pos-highlight {
  background-color: #f0fdf4;
}

.status-dot {
  width: 8px;
  height: 8px;
}

/* Transitions */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 420px) {
  .top-navbar {
    padding-inline: 0.65rem !important;
  }

  .brand-link .leading-tight {
    display: none !important;
  }
}

.global-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.52);
  backdrop-filter: blur(4px);
}

.global-dialog {
  width: min(100%, 420px);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
  padding: 2rem 1.5rem 1.25rem;
  text-align: center;
}

.global-dialog-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  font-size: 1.85rem;
  margin: 0 auto 1rem;
}

.global-dialog-icon.tone-warning { background: #fff7ed; color: #d97706; }
.global-dialog-icon.tone-danger { background: #fef2f2; color: #dc2626; }
.global-dialog-icon.tone-success { background: #ecfdf5; color: #16a34a; }
.global-dialog-icon.tone-info { background: #eff6ff; color: #2563eb; }

.global-dialog-title {
  margin: 0;
  font-size: 1.28rem;
  font-weight: 700;
  color: #0f172a;
}

.global-dialog-message {
  margin: 0.75rem 0 1.25rem;
  color: #475569;
  line-height: 1.6;
  white-space: pre-line;
}

.global-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.dialog-fade-enter-to,
.dialog-fade-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

@media print {
  .no-print {
    display: none !important;
  }
}
</style>