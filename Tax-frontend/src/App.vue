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
            {{ dialog.cancelText === 'Cancel' ? language.t('cancel') : dialog.cancelText }}
          </button>
          <button type="button" class="btn" :class="confirmButtonClass" @click="closeDialog(true)">
            {{ dialog.confirmText === 'Confirm' ? language.t('confirm') : dialog.confirmText === 'OK' ? language.t('ok') : dialog.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <RouterView v-slot="{ Component }">
    <Transition v-if="route.meta.public" name="route-fade" mode="out-in">
      <component :is="Component" />
    </Transition>

  <div v-else class="d-flex flex-column vh-100 app-shell">
    <!-- Top Executive Navigation Bar -->
    <nav class="top-navbar px-3 px-lg-4 no-print">
      <div class="d-flex align-items-center justify-content-between w-100">
        <!-- Left: Mobile Toggle & Brand Identity -->
        <div class="d-flex align-items-center gap-3">
          <button
            class="btn btn-icon d-lg-none"
            type="button"
            :aria-label="language.t('toggleNavigation')"
            @click.stop="sidebarOpen = !sidebarOpen"
          >
            <i class="bi bi-list fs-5"></i>
          </button>

          <router-link to="/" class="brand-link d-flex align-items-center text-decoration-none">
            <div class="brand-logo-wrapper">
              <img :src="logoUrl" class="brand-logo" :alt="language.isKhmer ? 'និមិត្តសញ្ញា' : 'Logo'" />
            </div>
            <div class="d-flex flex-column ms-2 leading-tight">
              <span class="brand-title">AXIS CONSULTING</span>
              <span class="brand-subtitle">{{ language.isKhmer ? 'ប្រព័ន្ធគ្រប់គ្រងពន្ធ និងសារពើភណ្ឌ' : 'TAX & INVENTORY ERP' }}</span>
            </div>
          </router-link>
        </div>

        <!-- Right: Real-time Context & Controls -->
        <div class="d-flex align-items-center gap-2 gap-md-3">
          <!-- Live Telemetry Status Pills -->
          <div v-if="!isSuperAdmin" class="d-none d-md-flex align-items-center gap-2">
            <!-- Active Branch Pill -->
            <div class="meta-pill" :title="language.t('operatingBranch')">
              <span class="status-indicator"></span>
              <span class="text-secondary small me-1">{{ language.t('branch') }}:</span>
              <span class="fw-semibold text-light">{{ tax.settings?.branch || language.t('headOffice') }}</span>
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
          <div ref="languageDropdownRef" class="dropdown position-relative">
            <button
              class="language-toggle shadow-xs"
              type="button"
              aria-haspopup="menu"
              :aria-expanded="languageMenuOpen"
              :aria-label="language.t('language')"
              @click.stop="languageMenuOpen = !languageMenuOpen"
            >
              <i class="bi bi-translate text-info" aria-hidden="true"></i>
              <span>{{ language.isKhmer ? language.t('khmer') : language.t('english') }}</span>
              <i class="bi bi-chevron-down language-chevron" :class="{ 'rotate-180': languageMenuOpen }" aria-hidden="true"></i>
            </button>

            <Transition name="dropdown-fade">
              <ul v-if="languageMenuOpen" class="dropdown-menu dropdown-menu-end custom-dropdown language-menu show" role="menu">
                <li>
                  <button
                    class="dropdown-item language-option"
                    :class="{ 'is-selected': !language.isKhmer }"
                    type="button"
                    role="menuitemradio"
                    :aria-checked="!language.isKhmer"
                    @click="selectLanguage('en')"
                  >
                    <span class="language-option-code">EN</span>
                    <span>{{ language.t('english') }}</span>
                    <i v-if="!language.isKhmer" class="bi bi-check2 ms-auto text-primary" aria-hidden="true"></i>
                  </button>
                </li>
                <li>
                  <button
                    class="dropdown-item language-option"
                    :class="{ 'is-selected': language.isKhmer }"
                    type="button"
                    role="menuitemradio"
                    :aria-checked="language.isKhmer"
                    @click="selectLanguage('km')"
                  >
                    <span class="language-option-code">ខ្មែរ</span>
                    <span>{{ language.t('khmer') }}</span>
                    <i v-if="language.isKhmer" class="bi bi-check2 ms-auto text-primary" aria-hidden="true"></i>
                  </button>
                </li>
              </ul>
            </Transition>
          </div>

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
                    {{ currentUser?.name || language.t('staffMember') }}
                </span>
                <span class="user-role">{{ profileRoleLabel }}</span>
              </div>

              <i class="bi bi-chevron-down toggle-arrow" :class="{ 'rotate-180': profileOpen }"></i>
            </button>

            <!-- Menu Card -->
            <Transition name="dropdown-fade">
              <ul v-if="profileOpen" class="dropdown-menu dropdown-menu-end custom-dropdown shadow-lg show">
                <li class="dropdown-header px-3 py-2">
                  <div class="fw-bold text-dark text-truncate">{{ currentUser?.name || language.t('user') }}</div>
                  <small class="text-muted d-block">
                    {{ language.t('signedInAs') }} 
                    <span class="text-primary fw-semibold">
                      {{ profileRoleLabel }}
                    </span>
                  </small>
                </li>

                <li><hr class="dropdown-divider my-1" /></li>
                <li v-if="hasAdminAccess && !displayAsStandardUser && !isSuperAdmin">
                  <router-link to="/settings/users" class="dropdown-item py-2" @click="profileOpen = false">
                    <i class="bi bi-person-gear me-2 text-primary"></i>
                    {{ language.t('accessUsers') }}
                  </router-link>
                </li>
                <li v-if="hasAdminAccess && !isSuperAdmin">
                  <router-link to="/settings/company" class="dropdown-item py-2" @click="profileOpen = false">
                    <i class="bi bi-sliders me-2 text-secondary"></i>
                    {{ language.t('companyShops') }}
                  </router-link>
                  <router-link to="/company/profile" class="dropdown-item py-2" @click="profileOpen = false">
                    <i class="bi bi-sliders me-2 text-secondary"></i>
                    {{ language.t('companyProfile') }}
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

        <nav class="sidebar-menu flex-grow-1 py-2 custom-scroll" :aria-label="language.t('navigation')">
          <router-link
            :to="isSuperAdmin ? '/superadmin' : isAdmin ? '/admin' : '/user'"
            class="sidebar-link sidebar-dashboard"
            active-class="active"
          >
            <i class="bi bi-speedometer2 sidebar-link-icon"></i>
            <span>{{ isSuperAdmin ? (language.isKhmer ? 'ទិដ្ឋភាពទូទៅប្រព័ន្ធ' : 'Platform Overview') : language.t('dashboard') }}</span>
          </router-link>

          <router-link v-if="!isSuperAdmin" to="/pos" class="sidebar-link sidebar-pos" active-class="active">
            <i class="bi bi-cart4 sidebar-link-icon"></i>
            <span>{{ language.isKhmer ? 'លក់ទំនិញ (POS)' : 'Open POS' }}</span>
            <span class="sidebar-live-badge">{{ language.t('live') }}</span>
          </router-link>

          <section
            v-for="section in menuSections"
            :key="section.id"
            class="sidebar-section"
          >
            <button
              :id="`sidebar-toggle-${section.id}`"
              class="sidebar-section-toggle"
              :class="{ 'is-expanded': expandedMenu === section.id, 'has-active-route': isSectionActive(section) }"
              type="button"
              :aria-expanded="expandedMenu === section.id"
              :aria-controls="`sidebar-panel-${section.id}`"
              @click="toggleMenu(section.id)"
            >
              <i :class="['sidebar-section-icon', 'bi', section.icon]" aria-hidden="true"></i>
              <span class="sidebar-section-label">{{ section.label }}</span>
              <i class="bi bi-chevron-down sidebar-chevron" aria-hidden="true"></i>
            </button>
            <Transition name="sidebar-collapse">
              <div
                v-show="expandedMenu === section.id"
                :id="`sidebar-panel-${section.id}`"
                class="sidebar-submenu"
                :aria-labelledby="`sidebar-toggle-${section.id}`"
              >
                <router-link
                  v-for="item in section.items"
                  :key="item.to"
                  :to="item.to"
                  class="sidebar-link sidebar-submenu-link"
                  active-class="active"
                >
                  <i :class="['sidebar-link-icon', 'bi', item.icon]" aria-hidden="true"></i>
                  <span>{{ item.label }}</span>
                </router-link>
              </div>
            </Transition>
          </section>
        </nav>

        <div class="p-3 border-top text-center text-muted small bg-light d-flex justify-content-between align-items-center">
          <span class="font-monospace">INKLUSIVITY ERP</span>
          <span class="status-dot bg-success rounded-circle" :title="language.t('systemOnline')"></span>
        </div>
      </aside>

      <!-- Main Dynamic Workspace View -->
      <main class="flex-grow-1 overflow-y-auto page-canvas route-shell">
        <Transition name="route-fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </main>
    </div>
  </div>
  </RouterView>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { permissionForPath, userHasPermission } from '@/router/permissionAccess';
import { useRoute, useRouter } from 'vue-router';
import { useLanguageStore } from './stores/language';
import { useTaxStore } from './stores/tax';
import { useAuthStore } from './stores/auth';
import { usePosStore } from './stores/pos';
import { useFixedAssetsStore } from './stores/fixedAssets';
import { closeDialog, dialogState } from './utils/dialog';
import logoUrl from './assets/logo.svg';

const route = useRoute();
const router = useRouter();
const language = useLanguageStore();
const tax = useTaxStore();
const auth = useAuthStore();
const pos = usePosStore();
const fixedAssets = useFixedAssetsStore();

function resetWorkspaceState() {
  auth.reset();
  tax.reset();
  pos.reset();
  fixedAssets.reset();
}

function handleUnauthorized() {
  resetWorkspaceState();
  currentUser.value = null;
  router.push('/login');
}

const sidebarOpen = ref(false);
const expandedMenu = ref('');
const profileOpen = ref(false);
const profileDropdownRef = ref(null);
const languageMenuOpen = ref(false);
const languageDropdownRef = ref(null);
const dialog = dialogState;
const dialogTitleId = 'app-global-dialog-title';
const confirmButtonClass = computed(() => {
  if (dialog.variant === 'success') return 'btn-success';
  if (dialog.variant === 'danger') return 'btn-danger';
  return 'btn-primary';
});

function getSafeStoredUser() {
  try {
    const storedUser = globalThis.localStorage?.getItem('tax_user');
    return storedUser ? JSON.parse(storedUser) : null;
  } catch {
    return null;
  }
}

const currentUser = ref(getSafeStoredUser());
const isSuperAdmin = computed(() => String(currentUser.value?.role || '').toLowerCase() === 'superadmin');
const isAdmin = computed(() => String(currentUser.value?.role || '').toLowerCase() === 'owner');
const isCompanyOwner = computed(() => String(currentUser.value?.role || '').toLowerCase() === 'owner');
const displayAsStandardUser = computed(() => String(currentUser.value?.role || '').toLowerCase() === 'staff');
const hasAdminAccess = computed(() => isCompanyOwner.value);
const profileRoleLabel = computed(() => {
  if (isSuperAdmin.value) return 'Super Admin';
  if (isCompanyOwner.value) return language.t('administrator');
  if (!displayAsStandardUser.value) return language.t('user');

  let permissions = currentUser.value?.permissions;
  if (typeof permissions === 'string') {
    try {
      permissions = JSON.parse(permissions);
    } catch {
      permissions = null;
    }
  }
  const preset = Array.isArray(permissions)
    ? 'custom'
    : permissions?.preset || permissions?.role || 'cashier';
  const labels = {
    manager: language.isKhmer ? 'អ្នកគ្រប់គ្រងប្រតិបត្តិការ' : 'Manager',
    cashier: language.isKhmer ? 'អ្នកគិតលុយ' : 'Cashier',
    inventory: language.isKhmer ? 'ស្តុក' : 'Inventory',
    accountant: language.isKhmer ? 'គណនេយ្យ' : 'Accountant',
    custom: language.isKhmer ? 'កំណត់ផ្ទាល់ខ្លួន' : 'Custom',
  };
  return labels[preset] || `${preset.charAt(0).toUpperCase()}${preset.slice(1)}`;
});

const baseMenuSections = computed(() => [
  {
    id: 'sales',
    label: language.t('customerSales'),
    icon: 'bi-people',
    items: [
      { to: '/sales', icon: 'bi-graph-up-arrow', label: language.isKhmer ? 'របាយការណ៍លក់' : 'Sales' },
      { to: '/sales/invoices', icon: 'bi-receipt', label: language.t('salesHistory') },
      { to: '/sales/customers', icon: 'bi-people', label: language.t('customers') },
      { to: '/sales/ar', icon: 'bi-wallet2', label: language.t('accountsReceivable') },
    ],
  },
  {
    id: 'inventory',
    label: language.t('inventory'),
    icon: 'bi-box-seam',
    items: [
      { to: '/inventory/items', icon: 'bi-box-seam', label: language.t('items') },
      { to: '/inventory/adjustments', icon: 'bi-sliders', label: language.t('stockAdjustment') },
      { to: '/inventory/history', icon: 'bi-clock-history', label: language.t('transactionHistory') },
      { to: '/inventory/stock-costs', icon: 'bi-currency-dollar', label: language.isKhmer ? 'ថ្លៃដើមស្តុក' : 'Stock Costs' },
      { to: '/inventory/transfers', icon: 'bi-arrow-left-right', label: language.isKhmer ? 'ផ្ទេរស្តុក' : 'Stock transfers' },
    ],
  },
  {
    id: 'purchases',
    label: language.t('vendorPurchase'),
    icon: 'bi-truck',
    items: [
      { to: '/purchase/vendors', icon: 'bi-truck', label: language.t('vendors') },
      { to: '/purchase/orders', icon: 'bi-file-earmark-plus', label: language.t('purchaseOrders') },
      { to: '/purchase/ap', icon: 'bi-receipt-cutoff', label: language.t('accountsPayable') },
    ],
  },
  {
    id: 'reports',
    label: language.t('reports'),
    icon: 'bi-bar-chart-line',
    items: [
      { to: '/reports/sales-by-vendor', icon: 'bi-shop-window', label: language.t('salesByVendor') },
      { to: '/reports/inventory-summary', icon: 'bi-pie-chart', label: language.t('inventorySummary') },
      { to: '/reports/tax-vat', icon: 'bi-percent', label: language.t('taxReport') },
      { to: '/tax/declaration', icon: 'bi-journal-text', label: language.isKhmer ? 'ប្រកាសពន្ធប្រចាំខែ' : 'M-Tax Declaration' },
      { to: '/tax/annual-filing', icon: 'bi-file-earmark-spreadsheet', label: language.isKhmer ? 'ប្រកាសពន្ធលើប្រាក់ចំណូលប្រចាំឆ្នាំ' : 'Annual Tax Filing (TOI)' },
    ],
  },
  {
    id: 'settings',
    label: language.t('settings'),
    icon: 'bi-gear',
    items: [
      { to: '/company/profile', icon: 'bi-building', label: language.isKhmer ? 'ព័ត៌មានក្រុមហ៊ុន' : 'Company data profile' },
      { to: '/settings/company', icon: 'bi-building', label: language.t('companyShops') },
      { to: '/settings/users', icon: 'bi-shield-lock', label: language.t('accessUsers') },
    ],
  },
]);

const filterMenuItems = (items) => items.filter(({ to }) => {
  const permission = permissionForPath(to);
  return permission !== 'staff.manage'
    ? userHasPermission(currentUser.value, permission)
    : isCompanyOwner.value;
});

const userMenuSections = computed(() => [
  ...baseMenuSections.value
    .map((section) => ({
      ...section,
      items: filterMenuItems(section.items),
    }))
    .filter((section) => section.items.length),
]);

const platformMenuSections = computed(() => [
  {
    id: 'platform',
    label: language.isKhmer ? 'គ្រប់គ្រងប្រព័ន្ធ' : 'Platform',
    icon: 'bi-building-gear',
    items: [
      { to: '/superadmin', icon: 'bi-speedometer2', label: language.isKhmer ? 'ទិដ្ឋភាពទូទៅប្រព័ន្ធ' : 'Platform overview' },
    ],
  },
]);

const menuSections = computed(() => {
  if (isSuperAdmin.value) return platformMenuSections.value;
  return userMenuSections.value;
});

const routeMatchesPath = (targetPath, currentPath = route.path) => currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);

function isSectionActive(section) {
  return section.items.some(({ to }) => routeMatchesPath(to));
}

function sectionForPath(path) {
  return menuSections.value.find((section) => section.items.some(({ to }) => routeMatchesPath(to, path)));
}

function toggleMenu(sectionId) {
  expandedMenu.value = expandedMenu.value === sectionId ? '' : sectionId;
}

function selectLanguage(nextLanguage) {
  language.setLanguage(nextLanguage);
  languageMenuOpen.value = false;
}

function handleClickOutside(event) {
  if (profileDropdownRef.value && !profileDropdownRef.value.contains(event.target)) {
    profileOpen.value = false;
  }
  if (languageDropdownRef.value && !languageDropdownRef.value.contains(event.target)) {
    languageMenuOpen.value = false;
  }
}

function syncCurrentUserState() {
  currentUser.value = getSafeStoredUser();
  expandedMenu.value = sectionForPath(route.path)?.id || '';
  sidebarOpen.value = false;
  profileOpen.value = false;
  languageMenuOpen.value = false;
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  window.addEventListener('auth:unauthorized', handleUnauthorized);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  window.removeEventListener('auth:unauthorized', handleUnauthorized);
});

watch(
  () => route.fullPath,
  () => {
    syncCurrentUserState();
  },
  { immediate: true }
);

function logout() {
  resetWorkspaceState();
  currentUser.value = null;
  router.push('/login');
}
</script>

<style scoped>
.app-shell {
  background: linear-gradient(180deg, #f8fafc 0%, #eef5fb 100%);
  color: #1e293b;
}

.page-canvas {
  scroll-behavior: smooth;
}

.route-shell {
  position: relative;
  isolation: isolate;
}

.route-fade-enter-active,
.route-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.route-fade-enter-from,
.route-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.route-fade-enter-to,
.route-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

/* 1. Top Navbar */
.top-navbar {
  height: 64px;
  background: linear-gradient(180deg, #0b1329 0%, #101d33 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  position: relative;
  z-index: 1030;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.16);
}

.brand-link {
  transition: opacity 0.2s ease, transform 0.2s ease;
  will-change: transform, opacity;
}
.brand-link:hover {
  opacity: 0.94;
  transform: translateY(-1px);
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
  transition: transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
  will-change: transform, background-color, border-color;
}

.language-toggle:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.28);
  transform: translateY(-1px);
  color: #fff;
}

.language-chevron {
  font-size: 0.62rem;
  color: #94a3b8;
  transition: transform 0.2s ease;
}

.language-menu {
  min-width: 190px;
  margin-top: 8px;
}

.language-option {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 40px;
  padding: 0.55rem 0.65rem;
}

.language-option.is-selected {
  background: #eff6ff;
  color: #174db5;
  font-weight: 600;
}

.language-option-code {
  display: inline-grid;
  width: 30px;
  height: 24px;
  place-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  background: #f8fafc;
  color: #475569;
  font-size: 0.68rem;
  font-weight: 700;
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
  transition: transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
  will-change: transform, background-color, border-color;
}

.user-profile-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
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

.sidebar-menu {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-inline: 10px;
}

.sidebar-link,
.sidebar-section-toggle {
  min-height: 42px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  border-radius: 9px;
  padding: 9px 12px;
  background: transparent;
  color: #475569;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 550;
  line-height: 1.35;
  text-align: left;
  text-decoration: none;
  transition: color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease;
}

.sidebar-link:hover,
.sidebar-section-toggle:hover {
  background: #f1f5f9;
  color: #123b66;
}

.sidebar-link:focus-visible,
.sidebar-section-toggle:focus-visible {
  outline: 3px solid rgba(13, 110, 253, 0.28);
  outline-offset: 1px;
}

.sidebar-dashboard,
.sidebar-standalone {
  margin-bottom: 3px;
}

.sidebar-link-icon,
.sidebar-section-icon {
  flex: 0 0 20px;
  width: 20px;
  color: #8492a6;
  font-size: 1rem;
  text-align: center;
  transition: color 0.16s ease;
}

.sidebar-link.active {
  background: #eaf2ff;
  box-shadow: inset 3px 0 #2463eb;
  color: #174db5;
  font-weight: 650;
}

.sidebar-link.active .sidebar-link-icon,
.sidebar-section-toggle.has-active-route .sidebar-section-icon {
  color: #2463eb;
}

.sidebar-section {
  margin-top: 3px;
}

.sidebar-section-toggle {
  cursor: pointer;
  color: #334155;
  font-weight: 650;
}

.sidebar-section-toggle.is-expanded {
  background: #f8fafc;
}

.sidebar-section-toggle.has-active-route:not(.is-expanded) {
  color: #174db5;
}

.sidebar-section-label {
  flex: 1;
  min-width: 0;
}

.sidebar-chevron {
  color: #94a3b8;
  font-size: 0.72rem;
  transition: transform 0.18s ease, color 0.18s ease;
}

.sidebar-section-toggle.is-expanded .sidebar-chevron {
  transform: rotate(180deg);
  color: #64748b;
}

.sidebar-submenu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 3px 0 7px 12px;
  padding: 3px 0 3px 8px;
  border-left: 1px solid #e2e8f0;
}

.sidebar-submenu-link {
  min-height: 38px;
  padding: 8px 10px;
  font-size: 0.79rem;
}

.sidebar-submenu-link .sidebar-link-icon {
  font-size: 0.94rem;
}

.sidebar-pos {
  margin: 4px 0 8px;
  background: #ecfdf5;
  color: #047857;
  font-weight: 700;
}

.sidebar-pos .sidebar-link-icon {
  color: #059669;
}

.sidebar-pos:hover {
  background: #d1fae5;
  color: #065f46;
}

.sidebar-pos.active {
  background: #d1fae5;
  box-shadow: inset 3px 0 #059669;
  color: #065f46;
}

.sidebar-live-badge {
  margin-left: auto;
  border-radius: 999px;
  padding: 3px 7px;
  background: #d1fae5;
  color: #047857;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.sidebar-collapse-enter-active,
.sidebar-collapse-leave-active {
  max-height: 420px;
  overflow: hidden;
  transition: max-height 0.2s ease, opacity 0.16s ease, transform 0.16s ease;
}

.sidebar-collapse-enter-from,
.sidebar-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-link,
  .sidebar-section-toggle,
  .sidebar-chevron,
  .sidebar-collapse-enter-active,
  .sidebar-collapse-leave-active,
  .route-fade-enter-active,
  .route-fade-leave-active,
  .dropdown-fade-enter-active,
  .dropdown-fade-leave-active {
    transition: none;
  }
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