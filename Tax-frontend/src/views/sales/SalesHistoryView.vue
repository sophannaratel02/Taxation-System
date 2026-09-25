<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Header -->
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <div class="eyebrow text-primary text-uppercase small fw-bold mb-1">
          {{ language.t('customerSales') }}
        </div>
        <h1 class="h3 fw-bold mb-1">
          {{ language.isKhmer ? 'ប្រវត្តិវិក្កយបត្រលក់' : 'Sales History Ledger' }}
        </h1>
        <p class="text-muted mb-0">
          {{ language.isKhmer 
            ? 'ពិនិត្យវិក្កយបត្រ វិធីសាស្ត្រទូទាត់ និងការលក់ដែលត្រូវបង់ពន្ធ។' 
            : 'Review invoices, payment methods, and taxable sales.' 
          }}
        </p>
      </div>

      <router-link to="/pos" class="btn btn-primary px-3 py-2">
        <i class="bi bi-cart-plus me-2"></i>{{ language.t('openPos') }}
      </router-link>
    </div>

    <!-- Summary Metrics -->
    <div class="row g-3 mb-4">
      <div v-for="stat in stats" :key="stat.label" class="col-sm-6 col-xl-3">
        <div class="card metric-card border-0 shadow-sm h-100">
          <div class="card-body">
            <small class="text-muted text-uppercase fw-semibold">{{ stat.label }}</small>
            <div class="h4 fw-bold mt-2 mb-0" :class="stat.colorClass || ''">
              {{ stat.value }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Filters & Table Card -->
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white border-0 py-3">
        <div class="row g-2">
          <div class="col-md-6">
            <div class="input-group">
              <span class="input-group-text bg-light border-end-0 text-muted">
                <i class="bi bi-search"></i>
              </span>
              <input
                v-model="query"
                type="text"
                class="form-control border-start-0 ps-0"
                :placeholder="language.isKhmer ? 'ស្វែងរកតាមលេខវិក្កយបត្រ ឬអតិថិជន...' : 'Search invoice ID or customer...'"
              />
            </div>
          </div>

          <div class="col-md-4 col-lg-3">
            <select v-model="method" class="form-select">
              <option value="">{{ language.isKhmer ? 'វិធីទូទាត់ទាំងអស់' : 'All payment methods' }}</option>
              <option value="cash">{{ language.t('cash') }}</option>
              <option value="bank">{{ language.t('cardQr') }}</option>
              <option value="customer_account">{{ language.t('account') }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Invoices Table -->
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-3">{{ language.t('invoice') }}</th>
              <th>{{ language.isKhmer ? 'កាលបរិច្ឆេទ' : 'Date' }}</th>
              <th>{{ language.t('customer') }}</th>
              <th>{{ language.isKhmer ? 'បុគ្គលិក' : 'Staff' }}</th>
              <th>{{ language.t('payment') }}</th>
              <th class="text-end">{{ language.t('netSale') }}</th>
              <th class="text-end">VAT</th>
              <th class="text-end">{{ language.t('grandTotal') }}</th>
              <th class="text-center pe-3">{{ language.t('status') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="invoice in filteredInvoices" :key="invoice.id">
              <td class="ps-3 fw-semibold">
                <router-link :to="{ name: 'InvoiceDetail', params: { id: invoice.id } }" class="text-primary text-decoration-none">
                  #{{ invoice.id }}
                </router-link>
              </td>
              <td class="text-nowrap">{{ invoice.date || '—' }}</td>
              <td>{{ invoice.customer || language.t('walkInCustomer') }}</td>
              <td>{{ invoice.staff || '—' }}</td>
              <td>
                <span class="badge text-bg-light border text-capitalize">
                  {{ formatPaymentMethod(invoice.paymentMethod) }}
                </span>
              </td>
              <td class="text-end fw-medium">${{ money(invoice.netSale) }}</td>
              <td class="text-end text-danger fw-medium">${{ money(invoice.vat) }}</td>
              <td class="text-end fw-bold">${{ money(invoice.total) }}</td>
              <td class="text-center pe-3">
                <span
                  class="badge text-uppercase "
                  :class="invoice.status === 'paid' ? 'text-bg-success-subtle text-success' : 'text-bg-secondary-subtle text-success'"
                >
                  {{ invoice.status }}
                </span>
              </td>
            </tr>

            <!-- Empty Search State -->
            <tr v-if="!filteredInvoices.length">
              <td colspan="9" class="text-center py-5 text-muted">
                <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                <div>{{ language.t('noRecords') }}</div>
              </td>
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

const tax = useTaxStore();
const language = useLanguageStore();

const query = ref('');
const method = ref('');

const money = (val) => Number(val || 0).toFixed(2);

const formatPaymentMethod = (rawMethod) => {
  if (!rawMethod) return '—';
  if (rawMethod === 'cash') return language.t('cash');
  if (rawMethod === 'bank') return language.t('cardQr');
  if (rawMethod === 'customer_account') return language.t('account');
  return rawMethod.replace('_', ' ');
};

const filteredInvoices = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = tax.invoices || [];

  return list.filter((invoice) => {
    const matchesQuery = !q || 
      String(invoice.id).toLowerCase().includes(q) || 
      String(invoice.customer || '').toLowerCase().includes(q);

    const matchesMethod = !method.value || invoice.paymentMethod === method.value;

    return matchesQuery && matchesMethod;
  });
});

const stats = computed(() => {
  const todayCount = tax.todayInvoices?.length || 0;
  const todaySales = tax.todaySales || 0;
  const avg = todaySales / Math.max(1, todayCount);

  return [
    {
      label: language.isKhmer ? 'វិក្កយបត្រថ្ងៃនេះ' : 'Invoices today',
      value: todayCount,
    },
    {
      label: language.isKhmer ? 'ចំណូលថ្ងៃនេះ' : 'Paid today',
      value: `$${money(todaySales)}`,
      colorClass: 'text-success',
    },
    {
      label: language.isKhmer ? 'ពន្ធថ្ងៃនេះ (VAT)' : 'VAT today',
      value: `$${money(tax.totalVat)}`,
      colorClass: 'text-danger',
    },
    {
      label: language.isKhmer ? 'មធ្យមភាគ / វិក្កយបត្រ' : 'Average invoice',
      value: `$${money(avg)}`,
      colorClass: 'text-primary',
    },
  ];
});
</script>

<style scoped>
.metric-card {
  border-radius: 0.75rem;
}

.table th {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
}

.table td {
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
}
</style>