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
      <section v-if="String(invoice.status || '').toLowerCase() === 'paid'" class="card border-0 shadow-sm mb-4 no-print">
        <div class="card-body p-4">
          <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <div>
              <h2 class="h5 mb-1">{{ language.isKhmer ? 'ត្រឡប់ទំនិញចូលស្តុក' : 'Return items to inventory' }}</h2>
              <p class="small text-muted mb-0">{{ language.isKhmer ? 'ការត្រឡប់នេះប៉ះពាល់តែស្តុកប៉ុណ្ណោះ។ មិនមានការសងប្រាក់ ឬកែប្រែចំណូលទេ។' : 'Inventory only: this does not issue a refund or change recorded revenue.' }}</p>
            </div>
            <span v-if="invoice.returns?.length" class="badge text-bg-secondary">{{ invoice.returns.length }} {{ language.isKhmer ? 'ការត្រឡប់' : 'previous return(s)' }}</span>
          </div>

          <div v-if="returnError" class="alert alert-danger py-2" role="alert">{{ returnError }}</div>
          <div v-if="returnSuccess" class="alert alert-success py-2" role="status">{{ returnSuccess }}</div>

          <form @submit.prevent="submitReturn">
            <div v-if="returnableLines.length" class="table-responsive mb-3">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>{{ language.isKhmer ? 'ទំនិញ' : 'Item' }}</th>
                    <th class="text-end">{{ language.isKhmer ? 'បានលក់' : 'Sold' }}</th>
                    <th class="text-end">{{ language.isKhmer ? 'បានត្រឡប់' : 'Already returned' }}</th>
                    <th class="text-end">{{ language.isKhmer ? 'នៅសល់សម្រាប់ត្រឡប់' : 'Available to return' }}</th>
                    <th class="return-quantity-column">{{ language.isKhmer ? 'ចំនួនត្រឡប់' : 'Return quantity' }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in returnableLines" :key="line.id">
                    <td>{{ line.name }} <span class="text-muted">{{ line.unit }}</span></td>
                    <td class="text-end">{{ quantity(line.quantity) }}</td>
                    <td class="text-end">{{ quantity(line.returnedQuantity) }}</td>
                    <td class="text-end">{{ quantity(line.returnableQuantity) }}</td>
                    <td>
                      <input
                        v-model.number="returnQuantities[line.id]"
                        class="form-control form-control-sm"
                        type="number"
                        min="1"
                        :max="line.returnableQuantity"
                        step="1"
                        :aria-label="`${language.isKhmer ? 'ចំនួនត្រឡប់' : 'Return quantity'} ${line.name}`"
                        :disabled="submittingReturn"
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-muted mb-3">{{ language.isKhmer ? 'ទំនិញទាំងអស់ត្រូវបានត្រឡប់រួចហើយ។' : 'All invoice items have already been returned.' }}</p>

            <div class="row g-3 align-items-end">
              <div class="col-12 col-lg-8">
                <label for="sales-return-reason" class="form-label">{{ language.isKhmer ? 'មូលហេតុត្រឡប់' : 'Reason for return' }} <span class="text-danger">*</span></label>
                <textarea
                  id="sales-return-reason"
                  v-model="returnReason"
                  class="form-control"
                  rows="2"
                  maxlength="500"
                  required
                  :disabled="submittingReturn || !returnableLines.length"
                ></textarea>
              </div>
              <div class="col-12 col-lg-4 d-flex justify-content-lg-end">
                <button type="submit" class="btn btn-warning" :disabled="submittingReturn || !returnableLines.length || !hasReturnQuantity">
                  <span v-if="submittingReturn" class="spinner-border spinner-border-sm me-2" role="status"></span>
                  <i v-else class="bi bi-box-arrow-in-down me-2"></i>
                  {{ submittingReturn ? (language.isKhmer ? 'កំពុងរក្សាទុក...' : 'Processing...') : (language.isKhmer ? 'បញ្ជាក់ការត្រឡប់' : 'Return to stock') }}
                </button>
              </div>
            </div>
          </form>

          <div v-if="invoice.returns?.length" class="border-top mt-4 pt-3">
            <h3 class="h6 mb-3">{{ language.isKhmer ? 'ប្រវត្តិត្រឡប់' : 'Return history' }}</h3>
            <div v-for="record in invoice.returns" :key="record.returnNo" class="return-history-row border rounded p-3 mb-2">
              <div class="d-flex flex-wrap justify-content-between gap-2 mb-1">
                <strong>{{ record.returnNo }}</strong>
                <span class="small text-muted">{{ formatDate(record.createdAt) }}<span v-if="record.createdBy"> · {{ record.createdBy }}</span></span>
              </div>
              <div>{{ record.reason }}</div>
              <div class="small text-muted mt-1">{{ record.items.map((item) => `${lineName(item.invoiceLineId)}: ${quantity(item.quantity)}`).join(', ') }}</div>
            </div>
          </div>
        </div>
      </section>

      <div class="invoice-detail-layout">
        <div class="receipt-panel receipt-print-host">
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
            :tendered-k-h-r="Number(invoice.receivedKHR)"
            :change-u-s-d="Number(invoice.changeUSD)"
            :exchange-rate="Number(tax.settings.exchangeRate || 4000)"
          />
        </div>
        
        <aside class="card border-0 shadow-sm detail-summary no-print">
          <div class="card-body p-4">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h2 class="h6 text-uppercase text-muted mb-0">{{ language.isKhmer ? 'សេចក្តីសង្ខេប' : 'Invoice summary' }}</h2>
              <span class="badge rounded-pill text-uppercase " :class="statusClass">{{ formatInvoiceStatus(invoice.status || 'Paid') }}</span>
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
import { api } from '@/services/api';
import ThermalReceipt40Col from '@/components/receipt/ThermalReceipt40Col.vue';
import { printThermalReceipt } from '@/utils/thermalPrint';

const route = useRoute();
const tax = useTaxStore();
const language = useLanguageStore();
const invoice = ref(null);
const loading = ref(true);
const error = ref('');
const returnQuantities = ref({});
const returnReason = ref('');
const returnError = ref('');
const returnSuccess = ref('');
const submittingReturn = ref(false);
const backRoute = computed(() => {
  const allowedRoutes = ['/inventory/history', '/inventory/adjustments', '/reports/tax-vat', '/sales/ar', '/sales/invoices'];
  const requestedRoute = String(route.query.from || '');
  return allowedRoutes.includes(requestedRoute) ? requestedRoute : '/sales/invoices';
});

const money = (value) => Number(value || 0).toFixed(2);
const formatDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const formatPaymentMethod = (value) => {
  if (!value) return '—';
  const method = String(value).toLowerCase();
  if (method === 'cash') return language.t('cash');
  if (method === 'bank') return language.t('bank');
  if (['card', 'qr', 'khqr'].includes(method)) return language.t('cardQr');
  if (method === 'customer_account') return language.t('account');
  return String(value).replaceAll('_', ' ');
};
const formatInvoiceStatus = (status) => {
  const value = String(status || '');
  const labels = {
    paid: ['បានបង់', 'Paid'],
    pending: ['កំពុងរង់ចាំ', 'Pending'],
    partial: ['បានបង់មួយផ្នែក', 'Partially paid'],
    'partially paid': ['បានបង់មួយផ្នែក', 'Partially paid'],
    overdue: ['ហួសកំណត់', 'Overdue'],
    draft: ['ព្រាង', 'Draft'],
    cancelled: ['បានបោះបង់', 'Cancelled'],
  };
  const localized = labels[value.toLowerCase()];
  return localized ? localized[language.isKhmer ? 0 : 1] : value;
};
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
const returnableLines = computed(() => (invoice.value?.lineItems || [])
  .filter((line) => Number(line.returnableQuantity || 0) > 0));
const hasReturnQuantity = computed(() => returnableLines.value.some((line) => {
  const quantity = Number(returnQuantities.value[line.id] || 0);
  return Number.isFinite(quantity) && quantity > 0 && quantity <= Number(line.returnableQuantity);
}));

function quantity(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function lineName(invoiceLineId) {
  return invoice.value?.lineItems?.find((line) => Number(line.id) === Number(invoiceLineId))?.name || 'Item';
}

async function loadInvoice() {
  loading.value = true;
  error.value = '';
  try {
    invoice.value = await tax.fetchInvoice(route.params.id);
  } catch (requestError) {
    error.value = requestError.message || (language.isKhmer ? 'មិនអាចផ្ទុកវិក្កយបត្របានទេ។' : 'Unable to load invoice');
  } finally {
    loading.value = false;
  }
}

async function submitReturn() {
  returnError.value = '';
  returnSuccess.value = '';
  const lines = returnableLines.value
    .map((line) => ({ invoiceLineId: line.id, quantity: Number(returnQuantities.value[line.id] || 0) }))
    .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
  if (!lines.length) {
    returnError.value = language.isKhmer ? 'សូមបញ្ចូលចំនួនទំនិញដែលត្រូវត្រឡប់។' : 'Enter a quantity for at least one item.';
    return;
  }
  if (!returnReason.value.trim()) {
    returnError.value = language.isKhmer ? 'សូមបញ្ចូលមូលហេតុត្រឡប់។' : 'Enter a reason for the return.';
    return;
  }

  submittingReturn.value = true;
  try {
    const response = await api.returnSale(route.params.id, { reason: returnReason.value.trim(), lines });
    returnSuccess.value = response.message || (language.isKhmer ? 'បានបញ្ចូលទំនិញចូលស្តុក។' : 'Items returned to inventory.');
    returnReason.value = '';
    returnQuantities.value = {};
    await loadInvoice();
  } catch (requestError) {
    returnError.value = requestError.message || (language.isKhmer ? 'មិនអាចដំណើរការការត្រឡប់ទំនិញនេះបានទេ។' : 'Unable to process this return');
  } finally {
    submittingReturn.value = false;
  }
}

function printInvoice() {
  printThermalReceipt();
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

.return-quantity-column {
  width: 150px;
}

.return-history-row {
  background: #f8f9fa;
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
