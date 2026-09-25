<template>
  <section class="container-fluid p-4 page-canvas dashboard-view">
    <!-- Executive Header Banner -->
    <div class="dash-hero p-4 mb-4 rounded-4 position-relative overflow-hidden shadow-sm">
      <div class="row align-items-center position-relative z-1">
        <div class="col-lg-8">
          <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-white bg-opacity-75 border text-primary small fw-semibold mb-2">
            <i class="bi bi-shield-check"></i>
            <span>{{ language.t('operationsOverview') }}</span>
            <span class="text-muted">·</span>
            <span class="text-dark">{{ tax.settings?.branch || 'Downtown Shop' }}</span>
          </div>
          <h1 class="h2 fw-bold text-dark mb-1 tracking-tight">
            {{ language.t('dashboard') }}
          </h1>
          <p class="text-muted mb-0">
            {{ language.t('dashboardDescription') }}
            <span class="fw-semibold text-dark">{{ tax.settings?.branch || 'Downtown Shop' }}</span>.
          </p>
        </div>

        <div class="col-lg-4 text-lg-end mt-3 mt-lg-0">
          <div class="d-inline-flex gap-2">
            <router-link to="/sales/invoices" class="btn btn-outline-secondary btn-hover-success bg-white px-2 py-2 rounded-3 ">
              <i class="bi bi-clock-history me-1"></i>
              {{ language.isKhmer ? 'ប្រវត្តិលក់' : 'History' }}
            </router-link>
            <router-link to="/pos" class="btn btn-primary px-2 py-2 rounded-3 shadow-sm pulse-btn">
              <i class="bi bi-cart-plus me-2"></i>
              {{ language.t('openPos') }}
            </router-link>
          </div>
        </div>
      </div>
      <div class="hero-decoration-circle"></div>
    </div>

    <!-- Bento Metric Cards Grid -->
    <div class="row g-3 mb-4">
      <div v-for="metric in metrics" :key="metric.label" class="col-sm-6 col-xl-3">
        <div class="card metric-card border-0 shadow-sm h-100 rounded-4">
          <div class="card-body p-4 d-flex flex-column justify-content-between">
            <div class="d-flex justify-content-between align-items-start mb-3">
              <div>
                <span class="text-muted small fw-semibold text-uppercase tracking-wider">
                  {{ metric.label }}
                </span>
                <h3 class="fw-bold text-dark mt-2 mb-0 metric-value">
                  {{ metric.value }}
                </h3>
              </div>
              <div :class="['metric-icon-box rounded-3 d-flex align-items-center justify-content-center', metric.bg]">
                <i :class="[metric.icon, metric.tone, 'fs-4']"></i>
              </div>
            </div>

            <div class="d-flex align-items-center justify-content-between pt-2 border-top border-light-subtle">
              <span class="small" :class="metric.tone">
                <i class="bi bi-dot fs-5 align-middle"></i>{{ metric.note }}
              </span>
              <span v-if="metric.subValue" class="badge text-bg-light border small">
                {{ metric.subValue }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tables & Side Panel -->
    <div class="row g-4">
      <!-- Recent Invoices Table (8 Cols) -->
      <div class="col-xl-8">
        <div class="card border-0 shadow-sm h-100 rounded-4 overflow-hidden">
          <div class="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
            <div>
              <strong class="fs-6 text-dark d-block">{{ language.t('recentInvoices') }}</strong>
              <small class="text-muted">{{ language.isKhmer ? 'ប្រតិបត្តិការ ៥ លើកចុងក្រោយ' : 'Latest completed sales transactions' }}</small>
            </div>
            <router-link to="/sales/invoices" class="btn btn-sm btn-light border px-3 rounded-pill">
              {{ language.t('viewAll') }} <i class="bi bi-arrow-right ms-1"></i>
            </router-link>
          </div>

          <div class="table-responsive">
            <table class="table align-middle table-hover mb-0 modern-table">
              <thead class="table-light border-0">
                <tr>
                  <th class="ps-4">{{ language.t('invoice') }}</th>
                  <th>{{ language.t('customer') }}</th>
                  <th>{{ language.t('payment') }}</th>
                  <th class="text-end">{{ language.t('grandTotal') }}</th>
                  <th class="text-center pe-4">{{ language.t('status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="invoice in (tax.invoices || []).slice(0, 5)" :key="invoice.id">
                  <td class="ps-4 fw-bold">
                    <router-link :to="{ name: 'InvoiceDetail', params: { id: invoice.id } }" class="text-primary text-decoration-none">
                      #{{ invoice.id }}
                    </router-link>
                  </td>
                  <td>
                    <div class="d-flex align-items-center gap-2">
                      <div class="avatar-circle">
                        {{ (invoice.customer || 'W').charAt(0).toUpperCase() }}
                      </div>
                      <span class="fw-medium text-dark">{{ invoice.customer || language.t('walkInCustomer') }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="badge text-bg-light border text-capitalize px-2 py-1">
                      <i :class="getPaymentIcon(invoice.paymentMethod)" class="me-1 text-secondary"></i>
                      {{ invoice.paymentMethod.replace('_', ' ') }}
                    </span>
                  </td>
                  <td class="text-end fw-bold text-dark fs-6">${{ Number(invoice.total || 0).toFixed(2) }}</td>
                  <td class="text-center pe-4">
                    <span class="badge rounded-pill bg-success-subtle text-success px-3 py-1">
                      {{ invoice.status || 'Paid' }}
                    </span>
                  </td>
                </tr>

                <tr v-if="!(tax.invoices || []).length">
                  <td colspan="5" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                    {{ language.t('noRecords') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Low Stock Alerts Panel (4 Cols) -->
      <div class="col-xl-4">
        <div class="card border-0 shadow-sm h-100 rounded-4">
          <div class="card-header bg-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
            <div>
              <strong class="fs-6 text-dark d-block">{{ language.t('lowStockAlerts') }}</strong>
              <small class="text-muted">{{ language.isKhmer ? 'ស្តុកដែលត្រូវបញ្ជាទិញថែម' : 'Items needing immediate reorder' }}</small>
            </div>
            <router-link to="/inventory/items" class="btn btn-sm btn-light border px-3 rounded-pill">
              {{ language.t('manage') }}
            </router-link>
          </div>

          <div class="card-body pt-0 px-4">
            <div
              v-for="item in tax.lowStockItems"
              :key="item.id"
              class="stock-alert-item d-flex justify-content-between align-items-center py-3 border-bottom border-light-subtle"
            >
              <div class="pe-2">
                <div class="fw-semibold text-dark item-title text-truncate">
                  {{ language.isKhmer && item.nameKm ? item.nameKm : item.nameEn }}
                </div>
                <small class="text-muted d-block">
                  {{ language.t('reorderAt') }}: <strong>{{ item.reorderQty }} {{ item.baseUnit || 'unit' }}</strong>
                </small>
              </div>

              <span
                :class="item.qtyOnHand === 0 ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning-emphasis'"
                class="badge rounded-pill px-3 py-2 text-nowrap"
              >
                <i :class="item.qtyOnHand === 0 ? 'bi bi-x-circle me-1' : 'bi bi-exclamation-triangle me-1'"></i>
                {{ item.qtyOnHand }} {{ language.t('left') }}
              </span>
            </div>

            <div v-if="!tax.lowStockItems?.length" class="text-center py-5 text-muted">
              <i class="bi bi-shield-check fs-1 text-success d-block mb-2"></i>
              <strong class="d-block text-dark">{{ language.t('stockHealthy') }}</strong>
              <small>{{ language.isKhmer ? 'កម្រិតស្តុកគ្រប់គ្រាន់សម្រាប់លក់' : 'All inventory counts are in healthy range.' }}</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();

const money = (value) =>
  `$${(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const exchangeRate = computed(() => Number(tax.settings?.exchangeRate) || 4000);

const metrics = computed(() => [
  {
    label: language.t('todaySales'),
    value: money(tax.todaySales),
    subValue: `${Math.round((tax.todaySales || 0) * exchangeRate.value).toLocaleString()} ៛`,
    note: `${tax.todayInvoices?.length || 0} ${language.t('invoicesToday')}`,
    icon: 'bi bi-wallet2',
    bg: 'bg-primary-subtle',
    tone: 'text-primary',
  },
  {
    label: language.t('inventoryValue'),
    value: money(tax.inventoryValue),
    subValue: `${(tax.items?.length || 0).toLocaleString()} ${language.isKhmer ? 'មុខ' : 'SKUs'}`,
    note: `${tax.items?.length || 0} ${language.t('activeItems')}`,
    icon: 'bi bi-box-seam',
    bg: 'bg-info-subtle',
    tone: 'text-info-emphasis',
  },
  {
    label: language.t('vatCollected'),
    value: money(tax.totalVat),
    subValue: `Rate: ${tax.settings?.vatRate || 10}%`,
    note: `${tax.settings?.vatRate || 10}% ${language.t('outputVat')}`,
    icon: 'bi bi-receipt',
    bg: 'bg-success-subtle',
    tone: 'text-success',
  },
  {
    label: language.t('lowStock'),
    value: (tax.lowStockItems?.length || 0).toString(),
    subValue: language.isKhmer ? 'បន្ទាន់' : 'Alert',
    note: language.t('needsAttention'),
    icon: 'bi bi-bell',
    bg: 'bg-danger-subtle',
    tone: 'text-danger',
  },
]);

function getPaymentIcon(method) {
  if (method === 'cash') return 'bi bi-cash-stack';
  if (method === 'bank' || method === 'card') return 'bi bi-qr-code-scan';
  return 'bi bi-person-badge';
}
</script>

<style scoped>
.dashboard-view {
  min-height: 100vh;
  background: #f1f5f5;
}

.dash-hero {
  min-height: 150px;
  display: flex;
  align-items: center;
  background: linear-gradient(118deg, #102a43 0%, #08282b 58%, #263937 100%);
  border: 1px solid rgba(16, 42, 67, 0.25);
  box-shadow: 0 18px 38px rgba(16, 42, 67, 0.16) !important;
}

.hero-decoration-circle {
  position: absolute;
  right: -60px;
  bottom: -58px;
  width: 440px;
  height: 145px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  transform: rotate(-12deg);
  background: repeating-linear-gradient(135deg, transparent 0 18px, rgba(255, 255, 255, 0.045) 19px 20px);
  pointer-events: none;
}

.dash-hero h1,
.dash-hero .text-dark {
  color: #ffffff !important;
}

.dash-hero p,
.dash-hero .text-muted {
  color: rgba(255, 255, 255, 0.72) !important;
}

.dash-hero .bg-white {
  background: rgba(255, 255, 255, 0.94) !important;
}

.tracking-tight {
  letter-spacing: -0.02em;
  
}

.tracking-wider {
  letter-spacing: 0.04em;
}


.btn-hover-success {
  border: 1px solid #cbd5e1;
  color: #334155;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-hover-success:hover {
  background-color: #ecfdf5 !important;
  border-color: #10b981 !important;
  color: #047857 !important;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
  transform: translateY(-1px);
}

.btn-hover-success:hover i {
  color: #10b981;
}
/* Metric Cards */
.metric-card {
  position: relative;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #dfe8e8 !important;
  box-shadow: 0 7px 20px rgba(16, 42, 67, 0.055) !important;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.metric-card:hover {
  transform: translateY(-4px);
  border-color: #b8d7d3 !important;
  box-shadow: 0 14px 28px rgba(16, 42, 67, 0.11) !important;
}

.metric-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: #08ffc5;
}

.metric-card:nth-child(2)::before { background: #2c7da0; }
.metric-card:nth-child(3)::before { background: #d28a2e; }
.metric-card:nth-child(4)::before { background: #c94c4c; }

.metric-icon-box {
  width: 48px;
  height: 48px;
}

.metric-value {
  font-size: clamp(1.45rem, 2vw, 1.8rem);
  letter-spacing: -0.02em;
}

.metric-icon-box {
  box-shadow: inset 0 0 0 1px rgba(16, 42, 67, 0.05);
}

/* Modern Tables & Badges */
.modern-table thead th {
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #527078;
  background: #f4f8f8;
}

.modern-table tbody td {
  padding-top: 1rem;
  padding-bottom: 1rem;
  border-color: #edf2f2;
}

.modern-table tbody tr {
  transition: background-color 0.15s ease;
}

.modern-table tbody tr:hover {
  background: #f4f9f8;
}

.avatar-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #334155;
  font-size: 0.85rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-title {
  max-width: 200px;
}

.stock-alert-item:last-child {
  border-bottom: 0 !important;
}

.dashboard-view > .row > [class*='col-'] > .card {
  border: 1px solid #dfe8e8 !important;
  box-shadow: 0 7px 20px rgba(16, 42, 67, 0.055) !important;
}

.pulse-btn {
  box-shadow: 0 7px 18px rgba(5, 35, 52, 0.25);
}

@media (max-width: 575.98px) {
  .dashboard-view {
    padding: 1rem !important;
  }

  .dash-hero {
    min-height: 0;
    padding: 1.25rem !important;
  }

  .dash-hero .d-inline-flex.gap-2 {
    width: 100%;
  }

  .dash-hero .d-inline-flex.gap-2 .btn {
    flex: 1;
  }

  .metric-card .card-body {
    padding: 1.1rem !important;
  }
}
</style>