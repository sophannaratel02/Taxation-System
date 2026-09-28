<template>
  <section class="container-fluid p-4 page-canvas dashboard-view">
    <!-- Header -->
    <header class="dashboard-header">
      <div class="dashboard-heading">
        <div class="dashboard-eyebrow">
          <span class="status-pip"></span>
          <span>{{ language.t('operationsOverview') }}</span>
          <span class="eyebrow-divider">/</span>
          <span class="text-truncate">{{ tax.settings?.branch || 'Head Quarter' }}</span>
        </div>
        <h1>{{ language.t('dashboard') }}</h1>
        <p>
          {{ language.t('dashboardDescription') }}
          <strong>{{ tax.settings?.branch || 'Head Quarter' }}</strong>.
        </p>
      </div>

      <nav class="dashboard-actions" :aria-label="language.isKhmer ? 'សកម្មភាពរហ័ស' : 'Quick actions'">
        <router-link to="/sales/invoices" class="dashboard-btn dashboard-btn-secondary">
          <i class="bi bi-clock-history" aria-hidden="true"></i>
          <span>{{ language.isKhmer ? 'ប្រវត្តិលក់' : 'History' }}</span>
        </router-link>
        <router-link to="/pos" class="dashboard-btn dashboard-btn-primary">
          <i class="bi bi-cart-plus" aria-hidden="true"></i>
          <span>{{ language.t('openPos') }}</span>
          <i class="bi bi-arrow-up-right" aria-hidden="true"></i>
        </router-link>
      </nav>
    </header>

    <!-- Sales Hero Overview Card -->
    <section class="sales-overview" :aria-label="language.isKhmer ? 'សង្ខេបការលក់' : 'Sales overview'">
      <div class="sales-total">
        <div class="sales-kicker">
          <span class="sales-kicker-icon">
            <i class="bi bi-graph-up-arrow" aria-hidden="true"></i>
          </span>
          <span>{{ language.t('todaySales') }}</span>
        </div>

        <strong class="sales-amount">{{ money(tax.todaySales) }}</strong>

        <div class="sales-context">
          <span class="sales-count">{{ tax.todayInvoices?.length || 0 }}</span>
          <span>{{ language.t('invoicesToday') }}</span>
          <span class="sales-context-divider"></span>
          <span>{{ tax.settings?.branch || 'Head Quarter' }}</span>
        </div>

        <div class="sales-conversion">
          <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
          <span>{{ Math.round((tax.todaySales || 0) * exchangeRate).toLocaleString() }} ៛</span>
          <span class="conversion-note">
            ({{ language.isKhmer ? 'តាមអត្រាប្តូរប្រាក់បច្ចុប្បន្ន' : 'at current exchange rate' }})
          </span>
        </div>
      </div>

      <div class="sales-trend">
        <div class="trend-heading">
          <div>
            <span class="trend-title">{{ language.isKhmer ? 'និន្នាការ ៧ ថ្ងៃ' : 'Seven-Day Sales' }}</span>
            <strong>{{ money(weeklySalesTotal) }}</strong>
          </div>
          <span class="trend-period">{{ language.isKhmer ? '៧ ថ្ងៃចុងក្រោយ' : 'Last 7 days' }}</span>
        </div>

        <div class="trend-chart" role="img" :aria-label="trendAriaLabel">
          <div
            v-for="point in salesTrend"
            :key="point.key"
            class="trend-day"
            :title="`${point.label}: ${money(point.total)}`"
          >
            <div class="trend-track">
              <div
                class="trend-bar"
                :class="{ 'trend-bar-today': point.isToday }"
                :style="{ height: `${point.height}%` }"
              ></div>
            </div>
            <span class="trend-day-label">{{ point.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Key Metrics Grid -->
    <div class="metrics-grid">
      <article v-for="metric in metrics" :key="metric.label" class="metric-card">
        <div class="metric-card-heading">
          <span class="metric-icon" :class="metric.tone">
            <i :class="metric.icon" aria-hidden="true"></i>
          </span>
          <span class="metric-label">{{ metric.label }}</span>
        </div>
        <strong class="metric-value">{{ metric.value }}</strong>
        <div class="metric-footnote">
          <span class="metric-note" :class="metric.tone">{{ metric.note }}</span>
          <span class="metric-detail">{{ metric.subValue }}</span>
        </div>
      </article>
    </div>

    <!-- Details Panels -->
    <div class="dashboard-content-grid">
      <!-- Recent Invoices Table -->
      <section class="dashboard-panel invoices-panel">
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">{{ language.isKhmer ? 'សកម្មភាព' : 'ACTIVITY' }}</span>
            <h2>{{ language.t('recentInvoices') }}</h2>
            <p>{{ language.isKhmer ? 'ប្រតិបត្តិការ ៥ លើកចុងក្រោយ' : 'Latest completed transactions' }}</p>
          </div>
          <router-link to="/sales/invoices" class="panel-link">
            <span>{{ language.t('viewAll') }}</span>
            <i class="bi bi-arrow-up-right" aria-hidden="true"></i>
          </router-link>
        </div>

        <div class="table-responsive invoice-table-wrap">
          <table class="table align-middle table-hover mb-0 invoice-table">
            <thead>
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
                  <router-link
                    :to="{ name: 'InvoiceDetail', params: { id: invoice.id } }"
                    class="invoice-id-link"
                  >
                    #{{ invoice.id }}
                  </router-link>
                </td>
                <td>
                  <div class="d-flex align-items-center gap-2">
                    <div class="avatar-circle">
                      {{ (invoice.customer || 'W').charAt(0).toUpperCase() }}
                    </div>
                    <span class="fw-medium text-dark text-truncate" style="max-width: 170px;">
                      {{ invoice.customer || language.t('walkInCustomer') }}
                    </span>
                  </div>
                </td>
                <td>
                  <span class="badge payment-badge">
                    <i :class="getPaymentIcon(invoice.paymentMethod)" class="me-1"></i>
                    {{ (invoice.paymentMethod || 'cash').replace('_', ' ') }}
                  </span>
                </td>
                <td class="text-end fw-bold text-dark fs-6 tabular-nums">
                  ${{ Number(invoice.total || 0).toFixed(2) }}
                </td>
                <td class="text-center pe-4">
                  <span class="badge rounded-pill bg-success-subtle text-success px-2.5 py-1">
                    {{ invoice.status || 'Paid' }}
                  </span>
                </td>
              </tr>

              <tr v-if="!(tax.invoices || []).length">
                <td colspan="5" class="text-center py-5 text-muted empty-state">
                  <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                  <span>{{ language.t('noRecords') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Low Stock Alerts Panel -->
      <section class="dashboard-panel stock-panel">
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">{{ language.isKhmer ? 'សារពើភ័ណ្ឌ' : 'INVENTORY' }}</span>
            <h2>{{ language.t('lowStockAlerts') }}</h2>
            <p>{{ language.isKhmer ? 'ស្តុកដែលត្រូវបញ្ជាទិញថែម' : 'Items needing immediate reorder' }}</p>
          </div>
          <router-link to="/inventory/items" class="panel-link">
            <span>{{ language.t('manage') }}</span>
            <i class="bi bi-arrow-up-right" aria-hidden="true"></i>
          </router-link>
        </div>

        <div class="stock-list">
          <div
            v-for="item in (tax.lowStockItems || []).slice(0, 5)"
            :key="item.id"
            class="stock-alert-item d-flex justify-content-between align-items-center py-3 border-bottom"
          >
            <div class="pe-2 text-truncate">
              <div class="fw-semibold text-dark text-truncate item-title">
                {{ language.isKhmer && item.nameKm ? item.nameKm : item.nameEn }}
              </div>
              <small class="text-muted d-block">
                {{ language.t('reorderAt') }}: <strong>{{ item.reorderQty }} {{ item.baseUnit || 'unit' }}</strong>
              </small>
            </div>

            <span
              :class="item.qtyOnHand === 0 ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning-emphasis'"
              class="badge rounded-pill px-2.5 py-1.5 text-nowrap fw-semibold"
            >
              <i :class="item.qtyOnHand === 0 ? 'bi bi-x-circle me-1' : 'bi bi-exclamation-triangle me-1'"></i>
              {{ item.qtyOnHand }} {{ language.t('left') }}
            </span>
          </div>

          <div v-if="!tax.lowStockItems?.length" class="text-center py-5 text-muted empty-state">
            <i class="bi bi-shield-check fs-1 text-success d-block mb-2"></i>
            <strong class="d-block text-dark">{{ language.t('stockHealthy') }}</strong>
            <small>{{ language.isKhmer ? 'កម្រិតស្តុកគ្រប់គ្រាន់សម្រាប់លក់' : 'All inventory counts are in healthy range.' }}</small>
          </div>
        </div>
      </section>
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

const salesTrend = computed(() => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const totalsByDate = new Map();
  for (const invoice of tax.invoices || []) {
    if (invoice.date) {
      totalsByDate.set(invoice.date, (totalsByDate.get(invoice.date) || 0) + Number(invoice.total || 0));
    }
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: new Intl.DateTimeFormat(language.isKhmer ? 'km-KH' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(date),
      total: totalsByDate.get(key) || 0,
      isToday: index === 6,
    };
  });

  const maxTotal = Math.max(...days.map((day) => day.total), 1);
  return days.map((day) => ({
    ...day,
    height: day.total ? Math.max((day.total / maxTotal) * 100, 10) : 4
  }));
});

const weeklySalesTotal = computed(() => salesTrend.value.reduce((sum, day) => sum + day.total, 0));
const trendAriaLabel = computed(() => salesTrend.value.map((day) => `${day.label}: ${money(day.total)}`).join(', '));

const metrics = computed(() => [
  {
    label: language.t('inventoryValue'),
    value: money(tax.inventoryValue),
    subValue: `${(tax.items?.length || 0).toLocaleString()} ${language.isKhmer ? 'មុខ' : 'SKUs'}`,
    note: `${tax.items?.length || 0} ${language.t('activeItems')}`,
    icon: 'bi bi-box-seam',
    tone: 'tone-teal',
  },
  {
    label: language.t('vatCollected'),
    value: money(tax.totalVat),
    subValue: `Rate: ${tax.settings?.vatRate || 10}%`,
    note: `${tax.settings?.vatRate || 10}% ${language.t('outputVat')}`,
    icon: 'bi bi-receipt',
    tone: 'tone-amber',
  },
  {
    label: language.t('lowStock'),
    value: (tax.lowStockItems?.length || 0).toString(),
    subValue: language.isKhmer ? 'បន្ទាន់' : 'Alert',
    note: language.t('needsAttention'),
    icon: 'bi bi-bell',
    tone: 'tone-red',
  },
]);

function getPaymentIcon(method) {
  if (method === 'cash') return 'bi bi-cash-stack';
  if (method === 'bank' || method === 'card') return 'bi bi-qr-code-scan';
  return 'bi bi-credit-card-2-front';
}
</script>

<style scoped>
/* Design System Variables */
.dashboard-view {
  --dash-bg: #f8fafc;
  --dash-surface: #ffffff;
  --dash-text: #0f172a;
  --dash-muted: #64748b;
  --dash-border: #e2e8f0;
  --dash-primary: #0f766e;
  --dash-primary-hover: #115e59;
  
  /* Hero Card Dark Theme */
  --sales-bg: #0b132b;
  --sales-border: rgba(255, 255, 255, 0.08);
  --sales-shadow: 0 10px 25px -5px rgba(11, 19, 43, 0.35);
  --sales-accent: #f59e0b;
  --sales-accent-light: #fbbf24;
  --sales-accent-soft: rgba(245, 158, 11, 0.12);

  min-height: 100vh;
  background-color: var(--dash-bg);
  color: var(--dash-text);
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}

/* Header */
.dashboard-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin: 0 auto 1.5rem;
  max-width: 1600px;
}

.dashboard-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--dash-primary);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.status-pip {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

.eyebrow-divider {
  color: var(--dash-muted);
  opacity: 0.5;
}

.dashboard-heading h1 {
  margin: 0.35rem 0 0.2rem;
  color: var(--dash-text);
  font-size: 1.85rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.dashboard-heading p {
  margin: 0;
  color: var(--dash-muted);
  font-size: 0.88rem;
}

.dashboard-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.dashboard-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 40px;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.dashboard-btn-secondary {
  color: var(--dash-text);
  background: var(--dash-surface);
  border: 1px solid var(--dash-border);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.dashboard-btn-secondary:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  transform: translateY(-1px);
}

.dashboard-btn-primary {
  color: #ffffff;
  background: var(--dash-primary);
  border: 1px solid transparent;
  box-shadow: 0 2px 4px rgba(15, 118, 110, 0.2);
}

.dashboard-btn-primary:hover {
  background: var(--dash-primary-hover);
  transform: translateY(-1px);
}

/* Sales Hero Card */
.sales-overview {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(330px, 1.1fr);
  max-width: 1600px;
  margin: 0 auto 1.5rem;
  border-radius: 12px;
  border: 1px solid var(--sales-border);
  background: var(--sales-bg);
  box-shadow: var(--sales-shadow);
  overflow: hidden;
}

.sales-total {
  padding: 1.75rem;
}

.sales-kicker {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--sales-accent);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sales-kicker-icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 6px;
  background: var(--sales-accent-soft);
  color: var(--sales-accent-light);
}

.sales-amount {
  display: block;
  margin-top: 0.85rem;
  color: #ffffff;
  font-size: 2.6rem;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.sales-context {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.85rem;
  color: #94a3b8;
  font-size: 0.82rem;
}

.sales-count {
  color: #ffffff;
  font-weight: 700;
}

.sales-context-divider {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.2);
}

.sales-conversion {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 1.25rem;
  color: var(--sales-accent-light);
  font-size: 0.85rem;
  font-weight: 600;
}

.conversion-note {
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 400;
}

.sales-trend {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.75rem;
  border-left: 1px solid var(--sales-border);
  background: rgba(255, 255, 255, 0.015);
}

.trend-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.trend-title {
  display: block;
  color: #94a3b8;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.trend-heading strong {
  color: #ffffff;
  font-size: 1.25rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.trend-period {
  padding: 0.25rem 0.55rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #cbd5e1;
  font-size: 0.72rem;
  font-weight: 500;
}

.trend-chart {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.75rem;
  height: 110px;
  align-items: end;
  margin-top: 1.25rem;
}

.trend-day {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 0.5rem;
  height: 100%;
  text-align: center;
}

.trend-track {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 100%;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 2px;
}

.trend-bar {
  width: 100%;
  max-width: 28px;
  border-radius: 4px 4px 0 0;
  background: #334155;
  transition: height 350ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms ease;
}

.trend-day:hover .trend-bar {
  background: #475569;
}

.trend-bar-today {
  background: var(--sales-accent) !important;
}

.trend-day-label {
  color: #94a3b8;
  font-size: 0.72rem;
  font-weight: 500;
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  max-width: 1600px;
  margin: 0 auto 1.5rem;
}

.metric-card {
  padding: 1.25rem;
  border-radius: 10px;
  background: var(--dash-surface);
  border: 1px solid var(--dash-border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px -4px rgba(0, 0, 0, 0.08);
}

.metric-card-heading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.metric-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 8px;
  font-size: 1rem;
}

.tone-teal { color: #0d9488; background: #ccfbf1; }
.tone-amber { color: #d97706; background: #fef3c7; }
.tone-red { color: #e11d48; background: #ffe4e6; }

.metric-label {
  color: var(--dash-muted);
  font-size: 0.82rem;
  font-weight: 600;
}

.metric-value {
  display: block;
  margin: 0.75rem 0 0.5rem;
  color: var(--dash-text);
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}

.metric-footnote {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.65rem;
  border-top: 1px solid #f1f5f9;
  font-size: 0.75rem;
}

.metric-note {
  font-weight: 600;
  background: transparent !important;
}

.metric-detail {
  color: var(--dash-muted);
}

/* Dashboard Bottom Content Grid */
.dashboard-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(320px, 1fr);
  gap: 1.25rem;
  max-width: 1600px;
  margin: 0 auto;
}

.dashboard-panel {
  border-radius: 10px;
  background: var(--dash-surface);
  border: 1px solid var(--dash-border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.15rem 1.35rem;
  border-bottom: 1px solid var(--dash-border);
}

.panel-kicker {
  color: var(--dash-primary);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.panel-heading h2 {
  margin: 0.2rem 0 0.1rem;
  color: var(--dash-text);
  font-size: 1.05rem;
  font-weight: 700;
}

.panel-heading p {
  margin: 0;
  color: var(--dash-muted);
  font-size: 0.78rem;
}

.panel-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--dash-primary);
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
}

.panel-link:hover {
  text-decoration: underline;
}

/* Invoices Table */
.invoice-table {
  font-size: 0.82rem;
}

.invoice-table thead th {
  padding: 0.8rem 0.85rem;
  background: #f8fafc;
  border-bottom: 1px solid var(--dash-border);
  color: var(--dash-muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.invoice-table tbody td {
  padding: 0.85rem;
  border-bottom: 1px solid #f1f5f9;
}

.invoice-table tbody tr:hover {
  background-color: #f8fafc;
}

.invoice-id-link {
  color: var(--dash-primary);
  text-decoration: none;
}

.invoice-id-link:hover {
  text-decoration: underline;
}

.avatar-circle {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border-radius: 50%;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.75rem;
  font-weight: 700;
}

.payment-badge {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.3rem 0.55rem;
}

/* Stock List */
.stock-list {
  padding: 0.25rem 1.35rem;
}

.stock-alert-item {
  border-color: #f1f5f9 !important;
}

.item-title {
  font-size: 0.82rem;
}

.empty-state {
  color: var(--dash-muted);
}

/* Responsiveness */
@media (max-width: 1080px) {
  .dashboard-content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 840px) {
  .sales-overview {
    grid-template-columns: 1fr;
  }

  .sales-trend {
    border-left: 0;
    border-top: 1px solid var(--sales-border);
    min-height: 200px;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .dashboard-header {
    flex-direction: column;
    align-items: stretch;
  }

  .dashboard-actions {
    width: 100%;
  }

  .dashboard-btn {
    flex: 1;
  }

  .sales-amount {
    font-size: 2.1rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-btn,
  .metric-card,
  .trend-bar {
    transition: none !important;
  }
}
</style>