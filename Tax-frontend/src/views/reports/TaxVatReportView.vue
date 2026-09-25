<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Header -->
    <div class="mb-4">
      <div class="eyebrow mb-2">{{ language.t('taxCompliance') }}</div>
      <h1 class="h3 fw-bold mb-1">{{ language.isKhmer ? 'របាយការណ៍ពន្ធអាករ' : language.t('taxReport') }}</h1>
      <p class="text-muted mb-0">
        {{ language.t('vatSummary') }}
      </p>
    </div>

    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body py-3">
        <div class="row g-3 align-items-end">
          <div class="col-sm-5 col-md-3">
            <label class="form-label small fw-semibold" for="vat-from">{{ language.isKhmer ? 'ចាប់ពីថ្ងៃ' : 'From date' }}</label>
            <input id="vat-from" v-model="fromDate" class="form-control" type="date" />
          </div>
          <div class="col-sm-5 col-md-3">
            <label class="form-label small fw-semibold" for="vat-to">{{ language.isKhmer ? 'ដល់ថ្ងៃ' : 'To date' }}</label>
            <input id="vat-to" v-model="toDate" class="form-control" type="date" />
          </div>
          <div class="col-sm-2 col-md-auto">
            <button class="btn btn-outline-secondary" type="button" @click="resetDates">
              <i class="bi bi-arrow-counterclockwise me-1"></i>{{ language.isKhmer ? 'ខែនេះ' : 'This month' }}
            </button>
          </div>
          <div class="col-md text-md-end text-muted small">
            {{ filteredInvoices.length }} {{ language.isKhmer ? 'វិក្កយបត្រ' : 'sales invoices' }}
          </div>
        </div>
        <div v-if="dateError" class="text-danger small mt-2">{{ dateError }}</div>
      </div>
    </div>

    <!-- Summary KPI Cards -->
    <div class="row g-3 mb-4">
      <div v-for="stat in stats" :key="stat.label" class="col-sm-6 col-xl-3">
        <div class="card metric-card h-100">
          <div class="card-body">
            <small class="text-muted">{{ stat.label }}</small>
            <div class="h4 fw-bold mt-2 mb-0">{{ stat.value }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- VAT Summary Table -->
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
        <strong>{{ language.t('vatSummary') }}</strong>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary" type="button" @click="exportTaxBook('sales')"><i class="bi bi-download me-1"></i>{{ language.isKhmer ? 'សៀវភៅលក់ CSV' : 'Sales book CSV' }}</button>
          <button class="btn btn-sm btn-outline-secondary" type="button" @click="exportTaxBook('purchases')"><i class="bi bi-download me-1"></i>{{ language.isKhmer ? 'សៀវភៅទិញ CSV' : 'Purchase book CSV' }}</button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>{{ language.t('period') }}</th>
              <th class="text-end">{{ language.t('outputVatTable') }}</th>
              <th class="text-end">{{ language.t('inputVat') }}</th>
              <th class="text-end">{{ language.t('netPayableCredit') }}</th>
              <th>{{ language.t('status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{{ periodLabel }}</td>
              <td class="text-end">${{ outputVat.toFixed(2) }}</td>
              <td class="text-end">${{ inputVat.toFixed(2) }}</td>
              <td
                class="text-end fw-bold"
                :class="netPayable >= 0 ? 'text-danger' : 'text-success'"
              >
                {{ netPayable >= 0 ? `$${netPayable.toFixed(2)}` : `($${Math.abs(netPayable).toFixed(2)})` }}
              </td>
              <td>
                <span class="badge text-bg-success">{{ language.t('readyToFile') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card border-0 shadow-sm mt-4">
      <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
        <strong>{{ language.isKhmer ? 'លម្អិត VAT តាមវិក្កយបត្រ' : 'VAT Detail by Invoice' }}</strong>
        <span class="badge bg-light text-muted border">{{ filteredInvoices.length }}</span>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>{{ language.isKhmer ? 'កាលបរិច្ឆេទ' : 'Date' }}</th>
              <th>{{ language.t('invoice') }}</th>
              <th>{{ language.t('customer') }}</th>
              <th class="text-end">{{ language.t('netSale') }}</th>
              <th class="text-end">VAT</th>
              <th class="text-end">{{ language.t('grandTotal') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="invoice in filteredInvoices" :key="invoice.invoiceId || invoice.id">
              <td class="text-nowrap">{{ formatDate(invoice.date) }}</td>
              <td class="fw-medium">
                <router-link :to="{ name: 'InvoiceDetail', params: { id: invoice.id }, query: { from: '/reports/tax-vat' } }" class="text-primary text-decoration-none">
                  #{{ invoice.id }}
                </router-link>
              </td>
              <td>{{ invoice.customer }}</td>
              <td class="text-end">${{ money(invoice.netSale) }}</td>
              <td class="text-end text-danger">${{ money(invoice.vat) }}</td>
              <td class="text-end fw-semibold">${{ money(invoice.total) }}</td>
            </tr>
            <tr v-if="!filteredInvoices.length">
              <td colspan="6" class="text-center text-muted py-4">{{ language.t('noRecords') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';
import { api } from '@/services/api';

const tax = useTaxStore();
const language = useLanguageStore();

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const today = new Date();
const fromDate = ref(localDateString(new Date(today.getFullYear(), today.getMonth(), 1)));
const toDate = ref(localDateString(today));

function resetDates() {
  const now = new Date();
  fromDate.value = localDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  toDate.value = localDateString(now);
}

const dateError = computed(() => fromDate.value && toDate.value && fromDate.value > toDate.value
  ? 'From date cannot be after To date.'
  : '');

function inDateRange(value) {
  const date = String(value || '').slice(0, 10);
  return !dateError.value && date >= fromDate.value && date <= toDate.value;
}

function money(value) {
  return (Number(value) || 0).toFixed(2);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString('en-GB');
}

async function exportTaxBook(kind) {
  if (dateError.value) return;
  const response = await fetch(api.taxExportUrl(kind, fromDate.value, toDate.value), { headers: { Authorization: `Bearer ${localStorage.getItem('tax_token') || ''}` } });
  if (!response.ok) throw new Error('Tax export failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${kind}-tax-book.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const periodLabel = computed(() => `${formatDate(fromDate.value)} - ${formatDate(toDate.value)}`);

const filteredInvoices = computed(() => (tax.invoices || []).filter((invoice) => inDateRange(invoice.date)));

const filteredTransactions = computed(() => (tax.transactions || []).filter((row) => inDateRange(row.date)));

const vatRate = computed(() => Number(tax.settings?.vatRate || 10));

const outputVat = computed(() =>
  filteredInvoices.value.reduce((sum, inv) => sum + Number(inv.vat || 0), 0)
);

const inputVat = computed(() =>
  filteredTransactions.value
    .filter((row) => row.type === 'Purchase')
    .reduce((sum, row) => {
      // If purchase item has dedicated vat recorded, use it; otherwise fallback to cost * vatRate
      if (row.vat !== undefined) {
        return sum + Number(row.vat || 0);
      }
      const unitCost = Number(row.cost || row.unitCost || 0.25);
      const qty = Math.abs(Number(row.qty || 0));
      return sum + qty * unitCost * (vatRate.value / 100);
    }, 0)
);

const netPayable = computed(() => outputVat.value - inputVat.value);

const stats = computed(() => [
  { label: language.t('outputVatTable'), value: `$${outputVat.value.toFixed(2)}` },
  { label: language.t('inputVat'), value: `$${inputVat.value.toFixed(2)}` },
  {
    label: netPayable.value >= 0 ? language.t('netPayable') : language.t('vatCredit'),
    value: `$${Math.abs(netPayable.value).toFixed(2)}`
  },
  { label: language.t('taxRate'), value: `${vatRate.value}%` }
]);
</script>