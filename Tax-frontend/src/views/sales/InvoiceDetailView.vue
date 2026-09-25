<template>
  <section class="container-fluid p-4 page-canvas">
    <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4 no-print">
      <div>
        <router-link :to="backRoute" class="btn btn-sm btn-light border mb-3">
          <i class="bi bi-arrow-left me-1"></i>{{ language.isKhmer ? 'ត្រឡប់' : 'Back to invoices' }}
        </router-link>
        <div class="eyebrow text-primary text-uppercase small fw-bold mb-1">{{ language.t('invoice') }}</div>
        <h1 class="h3 fw-bold mb-1">#{{ invoice?.id || route.params.id }}</h1>
        <p class="text-muted mb-0">{{ language.isKhmer ? 'ព័ត៌មានលម្អិតដូចវិក្កយបត្របោះពុម្ព' : 'Invoice detail and print preview' }}</p>
      </div>
      <button v-if="invoice" type="button" class="btn btn-primary" @click="printInvoice">
        <i class="bi bi-printer me-2"></i>{{ language.isKhmer ? 'បោះពុម្ពវិក្កយបត្រ' : 'Print invoice' }}
      </button>
    </div>

    <div v-if="loading" class="card border-0 shadow-sm p-5 text-center text-muted">
      <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
      {{ language.isKhmer ? 'កំពុងទាញយក...' : 'Loading invoice...' }}
    </div>

    <div v-else-if="error" class="alert alert-danger d-flex justify-content-between align-items-center">
      <span>{{ error }}</span>
      <button type="button" class="btn btn-sm btn-outline-danger" @click="loadInvoice">{{ language.isKhmer ? 'ព្យាយាមម្តងទៀត' : 'Retry' }}</button>
    </div>

    <template v-else-if="invoice">
      <div class="invoice-detail-layout">
        <div class="receipt-panel">
          <ThermalReceipt40Col
            :company="receiptCompany"
            :receipt-no="invoice.id"
            :issue-date="invoice.issueDate"
            :cashier-name="invoice.staff"
            :customer-name="invoice.customerDetails?.name || invoice.customer"
            :items="receiptItems"
            :net-sale="Number(invoice.subtotal ?? invoice.netSale)"
            :total-vat="Number(invoice.tax ?? invoice.vat)"
            :vat-rate="vatRate"
            :grand-total="Number(invoice.total)"
            :tendered-u-s-d="Number(invoice.receivedUSD)"
            :change-u-s-d="Number(invoice.changeUSD)"
            :exchange-rate="Number(tax.settings.exchangeRate || 4000)"
          />
        </div>
        
        <aside class="card border-0 shadow-sm detail-summary no-print">
          <div class="card-body p-4">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h2 class="h6 text-uppercase text-muted mb-0">{{ language.isKhmer ? 'សេចក្តីសង្ខេប' : 'Invoice summary' }}</h2>
              <span class="badge rounded-pill text-uppercase " :class="statusClass">{{ invoice.status || 'Paid' }}</span>
            </div>
            <div class="summary-row"><span>{{ language.isKhmer ? 'អតិថិជន' : 'Customer' }}</span><strong>{{ invoice.customerDetails?.name || invoice.customer || language.t('walkInCustomer') }}</strong></div>
            <div v-if="invoice.customerDetails?.phone" class="summary-row"><span>{{ language.isKhmer ? 'ទូរស័ព្ទ' : 'Phone' }}</span><span>{{ invoice.customerDetails.phone }}</span></div>
            <div class="summary-row"><span>{{ language.isKhmer ? 'កាលបរិច្ឆេទចេញ' : 'Issue date' }}</span><span>{{ formatDate(invoice.issueDate || invoice.date) }}</span></div>
            <div class="summary-row"><span>{{ language.isKhmer ? 'ការទូទាត់' : 'Payment' }}</span><span class="text-capitalize">{{ formatPaymentMethod(invoice.paymentMethod) }}</span></div>
            <hr>
            <div class="summary-row"><span>{{ language.isKhmer ? 'បឋមសរុប' : 'Subtotal' }}</span><strong>${{ money(invoice.subtotal ?? invoice.netSale) }}</strong></div>
            <div class="summary-row"><span>{{ language.isKhmer ? 'ពន្ធ' : 'Tax' }}</span><strong class="text-danger">${{ money(invoice.tax ?? invoice.vat) }}</strong></div>
            <div class="summary-row fs-5"><span>{{ language.t('grandTotal') }}</span><strong>${{ money(invoice.total) }}</strong></div>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';
import ThermalReceipt40Col from '@/components/receipt/ThermalReceipt40Col.vue';

const route = useRoute();
const tax = useTaxStore();
const language = useLanguageStore();
const invoice = ref(null);
const loading = ref(true);
const error = ref('');
const backRoute = computed(() => {
  const allowedRoutes = ['/inventory/history', '/inventory/adjustments', '/reports/tax-vat', '/sales/ar', '/sales/invoices'];
  const requestedRoute = String(route.query.from || '');
  return allowedRoutes.includes(requestedRoute) ? requestedRoute : '/sales/invoices';
});

const money = (value) => Number(value || 0).toFixed(2);
const formatDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const formatPaymentMethod = (value) => value ? value.replaceAll('_', ' ') : '—';
const statusClass = computed(() => String(invoice.value?.status || '').toLowerCase() === 'paid' ? 'text-bg-success' : 'text-bg-secondary');
const vatRate = computed(() => invoice.value?.lineItems?.[0]?.vatRate || tax.settings.vatRate || 10);
const receiptCompany = computed(() => ({
  nameEn: tax.settings.companyName || 'Axis Investment Consulting',
  nameKh: tax.settings.companyNameKh || '',
  address: tax.settings.address || '',
  phone: tax.settings.phone || '',
  vatTin: invoice.value?.vatTin || '',
}));
const receiptItems = computed(() => (invoice.value?.lineItems || []).map((line) => ({
  nameEn: line.name,
  qty: line.quantity,
  unitPrice: line.unitPrice,
  discount: line.discount,
  unit: line.unit,
})));

async function loadInvoice() {
  loading.value = true;
  error.value = '';
  try {
    invoice.value = await tax.fetchInvoice(route.params.id);
  } catch (requestError) {
    error.value = requestError.message || 'Unable to load invoice';
  } finally {
    loading.value = false;
  }
}

function printInvoice() {
  window.print();
}

onMounted(loadInvoice);
</script>

<style scoped>
.invoice-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 1.5rem;
  align-items: start;
}

.receipt-panel {
  min-height: 100%;
  padding: 1.5rem;
  background: #e9edf2;
  border: 1px solid #dce2e8;
  border-radius: 0.75rem;
}

.detail-summary {
  position: sticky;
  top: 1rem;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.45rem 0;
}
.table th {
  font-size: 0.78rem;
  text-transform: uppercase;
}

@media (max-width: 991.98px) {
  .invoice-detail-layout {
    grid-template-columns: 1fr;
  }

  .detail-summary {
    position: static;
  }
}

@media print {
  .page-canvas {
    padding: 0 !important;
    background: #ffffff !important;
  }

  .invoice-detail-layout {
    display: block;
  }

  .receipt-panel {
    padding: 0;
    background: #ffffff;
    border: 0;
  }
}
</style>
