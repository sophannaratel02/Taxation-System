<template>
  <section class="container-fluid p-4 page-canvas dashboard-view">
    <header class="dashboard-header">
      <div class="dashboard-heading">
        <div class="dashboard-eyebrow">
          <span class="status-pip"></span>
          <span>{{ language.t('operationsOverview') }}</span>
          <span class="eyebrow-divider">/</span>
          <span>{{ tax.settings?.branch || 'Head Quarter' }}</span>
        </div>
        <h1>{{ language.t('dashboard') }}</h1>
        <p>
          {{ language.t('dashboardDescription') }}
          <strong>{{ tax.settings?.branch || 'Head Quarter' }}</strong>.
        </p>
      </div>

      <nav class="dashboard-actions" :aria-label="language.isKhmer ? 'សកម្មភាពរហ័ស' : 'Quick actions'">
        <router-link to="/sales/invoices" class="dashboard-button dashboard-button-secondary">
          <i class="bi bi-clock-history" aria-hidden="true"></i>
          <span>{{ language.isKhmer ? 'ប្រវត្តិលក់' : 'History' }}</span>
        </router-link>
        <router-link to="/pos" class="dashboard-button dashboard-button-primary">
          <i class="bi bi-cart-plus" aria-hidden="true"></i>
          <span>{{ language.t('openPos') }}</span>
          <i class="bi bi-arrow-up-right" aria-hidden="true"></i>
        </router-link>
      </nav>
    </header>

    <section class="sales-overview" :aria-label="language.isKhmer ? 'សង្ខេបការលក់' : 'Sales overview'">
      <div class="sales-total">
        <div class="sales-kicker">
          <span class="sales-kicker-icon"><i class="bi bi-graph-up-arrow" aria-hidden="true"></i></span>
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
          {{ Math.round((tax.todaySales || 0) * exchangeRate).toLocaleString() }} ៛
          <span>{{ language.isKhmer ? 'តាមអត្រាប្តូរប្រាក់បច្ចុប្បន្ន' : 'at current exchange rate' }}</span>
        </div>
      </div>

      <div class="sales-trend">
        <div class="trend-heading">
          <div>
            <span class="trend-title">{{ language.isKhmer ? 'និន្នាការ ៧ ថ្ងៃ' : 'Seven-day sales' }}</span>
            <strong>{{ money(weeklySalesTotal) }}</strong>
          </div>
          <span class="trend-period">{{ language.isKhmer ? 'ថ្ងៃចុងក្រោយ' : 'Last 7 days' }}</span>
        </div>
        <div class="trend-chart" role="img" :aria-label="trendAriaLabel">
          <div v-for="point in salesTrend" :key="point.key" class="trend-day" :title="`${point.label}: ${money(point.total)}`">
            <div class="trend-track">
              <div class="trend-bar" :class="{ 'trend-bar-today': point.isToday }" :style="{ height: `${point.height}%` }"></div>
            </div>
            <span class="trend-day-label">{{ point.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <div class="metrics-grid">
      <article v-for="metric in metrics" :key="metric.label" class="metric-card">
        <div class="metric-card-heading">
          <span class="metric-icon" :class="metric.tone"><i :class="metric.icon" aria-hidden="true"></i></span>
          <span class="metric-label">{{ metric.label }}</span>
        </div>
        <strong class="metric-value">{{ metric.value }}</strong>
        <div class="metric-footnote">
          <span :class="metric.tone">{{ metric.note }}</span>
          <span class="metric-detail">{{ metric.subValue }}</span>
        </div>
      </article>
    </div>

    <div class="dashboard-content-grid">
      <!-- Recent Invoices Table (8 Cols) -->
      <section class="dashboard-panel invoices-panel">
          <div class="panel-heading">
            <div>
              <span class="panel-kicker">{{ language.isKhmer ? 'សកម្មភាព' : 'ACTIVITY' }}</span>
              <h2>{{ language.t('recentInvoices') }}</h2>
              <p>{{ language.isKhmer ? 'ប្រតិបត្តិការ ៥ លើកចុងក្រោយ' : 'Latest completed sales transactions' }}</p>
            </div>
            <router-link to="/sales/invoices" class="panel-link">
              {{ language.t('viewAll') }} <i class="bi bi-arrow-up-right" aria-hidden="true"></i>
            </router-link>
          </div>

          <div class="table-responsive invoice-table-wrap">
            <table class="table align-middle table-hover mb-0 modern-table invoice-table">
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
                      {{ (invoice.paymentMethod || 'cash').replace('_', ' ') }}
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
      </section>

      <!-- Low Stock Alerts Panel (4 Cols) -->
      <section class="dashboard-panel stock-panel">
          <div class="panel-heading">
            <div>
              <span class="panel-kicker">{{ language.isKhmer ? 'សារពើភ័ណ្ឌ' : 'INVENTORY' }}</span>
              <h2>{{ language.t('lowStockAlerts') }}</h2>
              <p>{{ language.isKhmer ? 'ស្តុកដែលត្រូវបញ្ជាទិញថែម' : 'Items needing immediate reorder' }}</p>
            </div>
            <router-link to="/inventory/items" class="panel-link">
              {{ language.t('manage') }} <i class="bi bi-arrow-up-right" aria-hidden="true"></i>
            </router-link>
          </div>

          <div class="stock-list">
            <div
              v-for="item in (tax.lowStockItems || []).slice(0, 5)"
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
    if (invoice.date) totalsByDate.set(invoice.date, (totalsByDate.get(invoice.date) || 0) + Number(invoice.total || 0));
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
  return days.map((day) => ({ ...day, height: day.total ? Math.max((day.total / maxTotal) * 100, 8) : 3 }));
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
    tone: 'metric-tone-teal',
  },
  {
    label: language.t('vatCollected'),
    value: money(tax.totalVat),
    subValue: `Rate: ${tax.settings?.vatRate || 10}%`,
    note: `${tax.settings?.vatRate || 10}% ${language.t('outputVat')}`,
    icon: 'bi bi-receipt',
    tone: 'metric-tone-amber',
  },
  {
    label: language.t('lowStock'),
    value: (tax.lowStockItems?.length || 0).toString(),
    subValue: language.isKhmer ? 'បន្ទាន់' : 'Alert',
    note: language.t('needsAttention'),
    icon: 'bi bi-bell',
    tone: 'metric-tone-red',
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
  --dashboard-ink: #18333a;
  --dashboard-muted: #718287;
  --dashboard-line: #dce5e2;
  --dashboard-paper: #ffffff;
  min-height: 100vh;
  background: #f1f5f2;
  color: var(--dashboard-ink);
  padding: 1.75rem !important;
}

.dashboard-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin: 0 auto 1.5rem;
  max-width: 1600px;
}

.dashboard-eyebrow,
.sales-kicker,
.sales-context,
.sales-conversion,
.dashboard-actions,
.metric-card-heading,
.metric-footnote,
.panel-heading,
.trend-heading {
  display: flex;
  align-items: center;
}

.dashboard-eyebrow {
  gap: 0.55rem;
  color: #34776f;
  font-size: 0.72rem;
  font-weight: 750;
  text-transform: uppercase;
}

.status-pip {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: #2c9b76;
  box-shadow: 0 0 0 3px rgba(44, 155, 118, 0.13);
}

.eyebrow-divider { color: #a0afab; }

.dashboard-heading h1 {
  margin: 0.5rem 0 0.2rem;
  color: #1b3339;
  font-size: 1.85rem;
  font-weight: 750;
  line-height: 1.15;
}

.dashboard-heading p {
  margin: 0;
  color: var(--dashboard-muted);
  font-size: 0.9rem;
}

.dashboard-heading p strong { color: #405c5e; font-weight: 650; }

.dashboard-actions { flex: 0 0 auto; gap: 0.55rem; }

.dashboard-button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 0.65rem 0.9rem;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.84rem;
  font-weight: 650;
  transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.dashboard-button:hover { transform: translateY(-1px); }
.dashboard-button-secondary { color: #365456; background: #fff; border-color: #d5e0dc; }
.dashboard-button-secondary:hover { color: #1e6259; background: #f7fbf8; border-color: #abc9bf; }
.dashboard-button-primary { color: #fff; background: #17796d; }
.dashboard-button-primary:hover { color: #fff; background: #11685e; }
.dashboard-button-primary .bi-arrow-up-right { margin-left: 0.1rem; color: #c4e3a8; }

.sales-overview {
  display: grid;
  grid-template-columns: minmax(270px, 0.9fr) minmax(330px, 1.1fr);
  max-width: 1600px;
  min-height: 228px;
  margin: 0 auto 1rem;
  overflow: hidden;
  border-radius: 8px;
  color: #f7fbf8;
  background: #173c3a;
  box-shadow: 0 12px 28px rgba(21, 57, 53, 0.13);
}

.sales-total { padding: 1.6rem 1.75rem; }
.sales-kicker { gap: 0.65rem; color: #c0d8ce; font-size: 0.78rem; font-weight: 650; }
.sales-kicker-icon { display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid rgba(226, 243, 233, 0.2); border-radius: 6px; color: #d2e9b0; }
.sales-amount { display: block; margin-top: 1rem; color: #fff; font-size: 2.5rem; font-weight: 760; line-height: 1.05; font-variant-numeric: tabular-nums; }
.sales-context { gap: 0.5rem; margin-top: 0.8rem; color: #c0d8ce; font-size: 0.8rem; }
.sales-count { color: #fff; font-size: 0.95rem; font-weight: 700; }
.sales-context-divider { width: 1px; height: 13px; margin: 0 0.2rem; background: rgba(219, 238, 227, 0.35); }
.sales-conversion { gap: 0.4rem; margin-top: 1.25rem; color: #e2efc9; font-size: 0.84rem; font-weight: 650; }
.sales-conversion span { color: #aec8bb; font-size: 0.74rem; font-weight: 450; }

.sales-trend {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.55rem 1.75rem 1.1rem;
  border-left: 1px solid rgba(230, 242, 233, 0.15);
  background: repeating-linear-gradient(0deg, transparent 0 37px, rgba(218, 238, 226, 0.055) 38px 39px);
}

.trend-heading { align-items: flex-start; justify-content: space-between; gap: 1rem; }
.trend-heading > div { display: grid; gap: 0.2rem; }
.trend-title { color: #c2d9cd; font-size: 0.78rem; font-weight: 600; }
.trend-heading strong { color: #fff; font-size: 1.15rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.trend-period { padding: 0.35rem 0.55rem; border: 1px solid rgba(227, 242, 233, 0.18); border-radius: 4px; color: #d2e4d9; font-size: 0.68rem; white-space: nowrap; }
.trend-chart { display: grid; height: 112px; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.7rem; align-items: end; margin-top: 1rem; }
.trend-day { display: grid; height: 100%; min-width: 0; grid-template-rows: 1fr auto; gap: 0.45rem; text-align: center; }
.trend-track { display: flex; height: 100%; align-items: end; justify-content: center; border-bottom: 1px solid rgba(228, 242, 232, 0.24); }
.trend-bar { width: min(100%, 28px); min-height: 3px; border-radius: 3px 3px 0 0; background: #90b9a6; transition: height 250ms ease, background-color 160ms ease; }
.trend-bar-today { background: #e5ba63; }
.trend-day-label { overflow: hidden; color: #b8d1c4; font-size: 0.68rem; text-overflow: ellipsis; white-space: nowrap; }

.metrics-grid {
  display: grid;
  max-width: 1600px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
  margin: 0 auto 1.4rem;
}

.metric-card {
  min-width: 0;
  padding: 1.05rem 1.2rem 0.95rem;
  border: 1px solid var(--dashboard-line);
  border-radius: 7px;
  background: var(--dashboard-paper);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.metric-card:hover { border-color: #b8cec5; box-shadow: 0 6px 16px rgba(31, 68, 60, 0.07); }
.metric-card-heading { gap: 0.65rem; min-width: 0; }
.metric-icon { display: grid; width: 32px; height: 32px; flex: 0 0 32px; place-items: center; border-radius: 6px; font-size: 0.95rem; }
.metric-tone-teal { color: #16796e; background: #e5f2ed; }
.metric-tone-amber { color: #986b21; background: #f7efd9; }
.metric-tone-red { color: #a5413a; background: #f8e9e5; }
.metric-label { overflow: hidden; color: #617579; font-size: 0.77rem; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.metric-value { display: block; overflow: hidden; margin: 0.65rem 0 0.55rem; color: #1c363a; font-size: 1.4rem; font-weight: 750; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
.metric-footnote { justify-content: space-between; gap: 0.5rem; padding-top: 0.6rem; border-top: 1px solid #edf1ee; color: #708184; font-size: 0.7rem; }
.metric-footnote .metric-tone-teal { color: #328075; background: transparent; }
.metric-footnote .metric-tone-amber { color: #9b762d; background: transparent; }
.metric-footnote .metric-tone-red { color: #a95750; background: transparent; }
.metric-detail { overflow: hidden; color: #81918e; text-overflow: ellipsis; white-space: nowrap; }

.dashboard-content-grid {
  display: grid;
  max-width: 1600px;
  grid-template-columns: minmax(0, 1.7fr) minmax(310px, 0.9fr);
  align-items: start;
  gap: 1rem;
  margin: 0 auto;
}

.dashboard-panel { min-width: 0; overflow: hidden; border: 1px solid var(--dashboard-line); border-radius: 7px; background: var(--dashboard-paper); }
.panel-heading { min-height: 86px; justify-content: space-between; gap: 1rem; padding: 1rem 1.15rem; border-bottom: 1px solid #e8eeeb; }
.panel-heading > div { min-width: 0; }
.panel-kicker { color: #448077; font-size: 0.62rem; font-weight: 750; letter-spacing: 0; }
.panel-heading h2 { margin: 0.2rem 0 0.1rem; color: #213b3e; font-size: 0.98rem; font-weight: 720; }
.panel-heading p { margin: 0; color: #7b8b8c; font-size: 0.72rem; }
.panel-link { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 0.35rem; color: #28766d; font-size: 0.74rem; font-weight: 700; }
.panel-link:hover { color: #155f56; }
.invoice-table-wrap { width: 100%; }
.invoice-table { min-width: 640px; }
.invoice-table thead th { padding: 0.7rem 0.75rem; border-color: #e8eeeb; color: #758588; background: #f8faf8; font-size: 0.65rem; font-weight: 700; }
.invoice-table tbody td { padding: 0.72rem 0.75rem; border-color: #eef2ef; color: #324b4e; font-size: 0.77rem; }
.invoice-table tbody tr:hover { background: #f7faf7; }
.invoice-table .ps-4 { padding-left: 1.15rem !important; }
.invoice-table .pe-4 { padding-right: 1.15rem !important; }
.avatar-circle { display: grid; width: 29px; height: 29px; flex: 0 0 29px; place-items: center; border-radius: 50%; color: #376961; background: #e6f0eb; font-size: 0.72rem; font-weight: 700; }
.invoice-table .badge { font-size: 0.68rem; font-weight: 600; }

.stock-list { padding: 0.1rem 1.1rem 0.35rem; }
.stock-alert-item { gap: 0.6rem; min-height: 64px; border-color: #edf1ee !important; }
.stock-alert-item:last-child { border-bottom: 0 !important; }
.item-title { max-width: 190px; color: #2b4648 !important; font-size: 0.78rem; }
.stock-alert-item small { color: #82908f !important; font-size: 0.68rem; }
.stock-alert-item small strong { color: #586d6e; font-weight: 650; }
.stock-alert-item .badge { padding: 0.35rem 0.5rem !important; border-radius: 4px !important; font-size: 0.67rem; font-weight: 650; }
.stock-alert-item .bg-warning-subtle { color: #8e671f !important; background: #f7efd9 !important; }
.stock-alert-item .bg-danger-subtle { color: #a5413a !important; background: #f8e9e5 !important; }
.stock-panel > .stock-list > .text-center { padding: 1.6rem 0.5rem !important; color: #657e72 !important; }
.stock-panel > .stock-list > .text-center strong { color: #285f4e !important; font-size: 0.85rem; }
.stock-panel > .stock-list > .text-center small { color: #80908a; font-size: 0.72rem; }

@media (max-width: 1050px) {
  .dashboard-content-grid { grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.9fr); }
  .sales-overview { grid-template-columns: minmax(240px, 0.85fr) minmax(300px, 1.15fr); }
}

@media (max-width: 820px) {
  .dashboard-view { padding: 1.25rem !important; }
  .dashboard-header { align-items: flex-start; flex-direction: column; }
  .dashboard-content-grid { grid-template-columns: minmax(0, 1fr); }
  .sales-overview { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); }
}

@media (max-width: 600px) {
  .dashboard-view { padding: 1rem !important; }
  .dashboard-heading h1 { font-size: 1.55rem; }
  .dashboard-heading p { max-width: 38ch; font-size: 0.82rem; }
  .dashboard-actions { width: 100%; }
  .dashboard-button { flex: 1; padding-inline: 0.6rem; font-size: 0.77rem; }
  .sales-overview { grid-template-columns: minmax(0, 1fr); }
  .sales-total { padding: 1.25rem; }
  .sales-amount { font-size: 2.15rem; }
  .sales-trend { min-height: 195px; padding: 1.15rem 1.25rem 0.9rem; border-top: 1px solid rgba(230, 242, 233, 0.15); border-left: 0; }
  .metrics-grid { grid-template-columns: minmax(0, 1fr); gap: 0.6rem; }
  .metric-card { padding: 0.9rem 1rem; }
  .metric-value { margin: 0.45rem 0; font-size: 1.25rem; }
  .panel-heading { align-items: flex-start; padding: 0.9rem; }
  .panel-heading p { max-width: 28ch; }
  .stock-list { padding-inline: 0.85rem; }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-button,
  .metric-card,
  .trend-bar { transition: none; }
}
</style>