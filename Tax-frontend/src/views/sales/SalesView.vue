<template>
  <section class="container-fluid p-4 page-canvas">
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <div class="eyebrow text-primary text-uppercase small fw-bold mb-1">{{ language.t('customerSales') }}</div>
        <h1 class="h3 fw-bold mb-1">{{ language.isKhmer ? 'របាយការណ៍លក់' : 'Sales' }}</h1>
        <p class="text-muted mb-0">
          {{ language.isKhmer
            ? 'សង្ខេបបរិមាណលក់ តម្លៃលក់ ថ្លៃដើម និងប្រាក់ចំណេញពីវិក្កយបត្រដែលបានបង់។'
            : 'Review quantities sold, selling prices, AVCO cost, and profit from completed sales.' }}
        </p>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <router-link to="/sales/invoices" class="btn btn-outline-secondary">
          <i class="bi bi-receipt me-2"></i>{{ language.isKhmer ? 'ប្រវត្តិវិក្កយបត្រ' : 'Sales history' }}
        </router-link>
        <router-link to="/pos" class="btn btn-primary">
          <i class="bi bi-cart-plus me-2"></i>{{ language.t('openPos') }}
        </router-link>
      </div>
    </div>

    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body d-flex flex-wrap align-items-end gap-3">
        <label class="small text-muted">
          {{ language.isKhmer ? 'ចាប់ពីថ្ងៃ' : 'Start date' }}
          <input v-model="startDate" type="date" class="form-control" />
        </label>
        <label class="small text-muted">
          {{ language.isKhmer ? 'ដល់ថ្ងៃ' : 'End date' }}
          <input v-model="endDate" type="date" class="form-control" />
        </label>
        <button class="btn btn-outline-primary" type="button" :disabled="loading" @click="loadSales">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          <i v-else class="bi bi-funnel me-2" aria-hidden="true"></i>
          {{ language.isKhmer ? 'អនុវត្ត' : 'Apply filters' }}
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</div>

    <div class="row g-3 mb-4">
      <div v-for="metric in metrics" :key="metric.label" class="col-sm-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <small class="text-muted text-uppercase fw-semibold">{{ metric.label }}</small>
            <div class="h4 fw-bold mt-2 mb-0" :class="metric.colorClass">{{ metric.value }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <strong>{{ language.isKhmer ? 'ការលក់តាមទំនិញ' : 'Sales by item' }}</strong>
          <small class="d-block text-muted">
            {{ language.isKhmer ? 'ចំនួនលក់ និងប្រាក់ចំណូលមិនរាប់បញ្ចូល VAT។ ថ្លៃដើមប្រើ AVCO នៅពេលលក់។' : 'Sales exclude VAT; COGS uses the AVCO cost captured when each sale was completed.' }}
          </small>
        </div>
        <router-link to="/inventory/stock-costs" class="btn btn-sm btn-outline-secondary">
          <i class="bi bi-box-seam me-1"></i>{{ language.isKhmer ? 'មើលថ្លៃដើមស្តុក' : 'View stock costs' }}
        </router-link>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-4">{{ language.t('item') }}</th>
              <th class="text-end">{{ language.isKhmer ? 'បរិមាណលក់' : 'Qty sold' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'តម្លៃលក់មធ្យម' : 'Avg. sale price' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ចំណូលសុទ្ធ' : 'Net sales' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ថ្លៃដើមលក់' : 'COGS' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ប្រាក់ចំណេញដុល' : 'Gross profit' }}</th>
              <th class="text-end pe-4">{{ language.isKhmer ? 'រឹមចំណេញ' : 'Margin' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in soldItems" :key="item.item_id">
              <td class="ps-4 fw-semibold">{{ item.item_name }}</td>
              <td class="text-end">{{ quantity(item.total_qty_sold) }}</td>
              <td class="text-end font-monospace">{{ usd(averageSalePrice(item)) }}</td>
              <td class="text-end font-monospace">{{ usd(item.sales_amount) }}</td>
              <td class="text-end font-monospace">{{ usd(item.cogs_amount) }}</td>
              <td class="text-end fw-semibold font-monospace" :class="Number(item.gross_profit) >= 0 ? 'text-success' : 'text-danger'">
                {{ usd(item.gross_profit) }}
              </td>
              <td class="text-end pe-4">{{ margin(item) }}%</td>
            </tr>
            <tr v-if="loading">
              <td colspan="7" class="text-center text-muted py-4">{{ language.isKhmer ? 'កំពុងផ្ទុក...' : 'Loading sales...' }}</td>
            </tr>
            <tr v-else-if="!soldItems.length && !errorMessage">
              <td colspan="7" class="text-center text-muted py-5">
                <i class="bi bi-inbox fs-2 d-block mb-2"></i>{{ language.t('noRecords') }}
              </td>
            </tr>
          </tbody>
          <tfoot v-if="soldItems.length" class="table-light fw-bold">
            <tr>
              <td class="ps-4">{{ language.isKhmer ? 'សរុប' : 'TOTAL' }}</td>
              <td class="text-end">{{ quantity(summary.total_sold_qty) }}</td>
              <td></td>
              <td class="text-end font-monospace">{{ usd(summary.gross_revenue) }}</td>
              <td class="text-end font-monospace">{{ usd(summary.cogs) }}</td>
              <td class="text-end text-success font-monospace">{{ usd(summary.gross_profit) }}</td>
              <td class="text-end pe-4">{{ totalMargin }}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '@/services/api';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();
const startDate = ref('');
const endDate = ref('');
const summary = ref({ total_sold_qty: 0, gross_revenue: 0, cogs: 0, gross_profit: 0 });
const items = ref([]);
const loading = ref(false);
const errorMessage = ref('');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSummary(rawSummary = {}) {
  const safeSummary = rawSummary && typeof rawSummary === 'object' ? rawSummary : {};
  return {
    total_sold_qty: toNumber(safeSummary.total_sold_qty),
    gross_revenue: toNumber(safeSummary.gross_revenue),
    cogs: toNumber(safeSummary.cogs),
    gross_profit: toNumber(safeSummary.gross_profit),
  };
}

function normalizeItems(rawItems = []) {
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item = {}) => ({
    ...item,
    total_qty_sold: toNumber(item.total_qty_sold),
    sales_amount: toNumber(item.sales_amount),
    cogs_amount: toNumber(item.cogs_amount),
    gross_profit: toNumber(item.gross_profit),
  }));
}

const soldItems = computed(() => items.value.filter((item) => toNumber(item.total_qty_sold) > 0));
const totalMargin = computed(() => {
  const revenue = toNumber(summary.value.gross_revenue);
  return revenue > 0 ? ((toNumber(summary.value.gross_profit) / revenue) * 100).toFixed(2) : '0.00';
});
const metrics = computed(() => [
  {
    label: language.isKhmer ? 'ចំនួនលក់សរុប' : 'Total quantity sold',
    value: quantity(summary.value.total_sold_qty),
    colorClass: 'text-primary',
  },
  {
    label: language.isKhmer ? 'ចំណូលសរុប' : 'Net sales',
    value: usd(summary.value.gross_revenue),
    colorClass: 'text-dark',
  },
  {
    label: language.isKhmer ? 'ថ្លៃដើមលក់សរុប' : 'Total COGS',
    value: usd(summary.value.cogs),
    colorClass: 'text-secondary',
  },
  {
    label: language.isKhmer ? 'ប្រាក់ចំណេញដុល' : 'Gross profit',
    value: usd(summary.value.gross_profit),
    colorClass: toNumber(summary.value.gross_profit) >= 0 ? 'text-success' : 'text-danger',
  },
]);

function usd(value) {
  return `$${toNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function quantity(value) {
  return toNumber(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function averageSalePrice(item) {
  const qty = toNumber(item.total_qty_sold);
  return qty > 0 ? toNumber(item.sales_amount) / qty : 0;
}

function margin(item) {
  const revenue = toNumber(item.sales_amount);
  return revenue > 0 ? ((toNumber(item.gross_profit) / revenue) * 100).toFixed(2) : '0.00';
}

async function loadSales() {
  loading.value = true;
  errorMessage.value = '';

  if (startDate.value && endDate.value && startDate.value > endDate.value) {
    errorMessage.value = language.isKhmer
      ? 'ថ្ងៃចាប់ផ្ដើមមិនអាចលើសពីថ្ងៃបញ្ចប់បានទេ'
      : 'Start date cannot be later than end date.';
    loading.value = false;
    return;
  }

  try {
    const result = await api.inventoryValuation({
      branch: tax.settings?.branch || '',
      ...(startDate.value ? { startDate: startDate.value } : {}),
      ...(endDate.value ? { endDate: endDate.value } : {}),
    });

    summary.value = normalizeSummary(result?.summary);
    items.value = normalizeItems(result?.items);
  } catch (requestError) {
    errorMessage.value = requestError?.message || (language.isKhmer ? 'មិនអាចផ្ទុកទិន្នន័យលក់បានទេ។' : 'Could not load sales data.');
  } finally {
    loading.value = false;
  }
}

onMounted(loadSales);
</script>
