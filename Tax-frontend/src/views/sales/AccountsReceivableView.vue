<template>
  <section class="container-fluid p-4 page-canvas ar-page">
    <!-- Executive Header Hero -->
    <div class="ar-hero p-4 mb-4 rounded-4 shadow-sm bg-white border position-relative overflow-hidden">
      <div class="hero-glow"></div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 position-relative z-1">
        <div>
          <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-primary-subtle text-primary small fw-semibold mb-2">
            <i class="bi bi-wallet2"></i>
            <span>{{ language.t('customerSales') }}</span>
            <span class="text-muted">·</span>
            <span>Accounts Receivable</span>
          </div>
          <h1 class="h3 fw-bold text-dark mb-1 tracking-tight">
            {{ language.isKhmer ? 'គណនីត្រូវទារ (Accounts Receivable)' : language.t('accountsReceivable') }}
          </h1>
          <p class="text-muted mb-0">
            {{ language.isKhmer 
              ? 'តាមដានសមតុល្យបំណុលអតិថិជន កាលបរិច្ឆេទដល់កំណត់ និងកត់ត្រាការទូទាត់សងប្រាក់។' 
              : 'Track customer balances, credit aging, and collect outstanding payments.' 
            }}
          </p>
        </div>

        <button
          class="btn btn-outline-primary bg-white px-4 py-2 rounded-3 shadow-xs"
          type="button"
          :disabled="loading"
          @click="load"
        >
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status"></span>
          <i v-else class="bi bi-arrow-clockwise me-2"></i>
          {{ language.isKhmer ? 'ធ្វើបច្ចុប្បន្នភាព' : 'Refresh' }}
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <div v-if="error" class="alert alert-danger alert-dismissible fade show d-flex align-items-center mb-4 rounded-3 shadow-sm" role="alert">
      <i class="bi bi-exclamation-triangle-fill me-2 fs-5"></i>
      <div>{{ error }}</div>
      <button type="button" class="btn-close ms-auto" aria-label="Close" @click="error = ''"></button>
    </div>

    <!-- Summary Metrics (Bento Grid) -->
    <div class="row g-3 mb-4">
      <div v-for="stat in stats" :key="stat.label" class="col-sm-6 col-xl-3">
        <div class="card metric-card border-0 shadow-sm h-100 rounded-4">
          <div class="card-body p-4 d-flex flex-column justify-content-between">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <span class="text-muted small fw-semibold text-uppercase tracking-wider">
                {{ stat.label }}
              </span>
              <div :class="['metric-icon-box rounded-3 d-flex align-items-center justify-content-center', stat.bg]">
                <i :class="[stat.icon, stat.tone, 'fs-4']"></i>
              </div>
            </div>

            <div>
              <h3 class="fw-bold mb-1 metric-value" :class="stat.tone">{{ stat.value }}</h3>
              <div class="d-flex align-items-center justify-content-between pt-2 border-top border-light-subtle">
                <span class="small text-muted">{{ stat.subLabel }}</span>
                <span v-if="stat.extra" class="badge text-bg-light border small">
                  {{ stat.extra }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AR Invoices Ledger Table Card -->
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div class="card-header bg-white py-3 px-4 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <strong class="fs-6 text-dark d-block">
            {{ language.isKhmer ? 'បញ្ជីវិក្កយបត្រជំពាក់' : 'Outstanding Receivables Ledger' }}
          </strong>
          <small class="text-muted">
            {{ language.isKhmer ? 'វិក្កយបត្រដែលមិនទាន់ទូទាត់ ឬទូទាត់បានមួយចំណែក' : 'Invoices awaiting settlement and credit collections' }}
          </small>
        </div>

        <div class="d-flex align-items-center gap-2">
          <!-- Search Field -->
          <div class="input-group input-group-sm search-group">
            <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-search"></i></span>
            <input
              v-model.trim="search"
              class="form-control border-start-0 shadow-none"
              :placeholder="language.isKhmer ? 'ស្វែងរកអតិថិជន, លេខវិក្កយបត្រ...' : 'Search customer or invoice...'"
            />
            <button v-if="search" class="btn btn-outline-secondary border-start-0 border-end" type="button" @click="search = ''">
              <i class="bi bi-x"></i>
            </button>
          </div>

          <span class="badge rounded-pill bg-light text-secondary border px-3 py-2 text-nowrap">
            {{ filteredRecords.length }} {{ language.isKhmer ? 'វិក្កយបត្រ' : 'Invoices' }}
          </span>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 modern-table">
          <thead class="table-light border-0">
            <tr>
              <th class="ps-4">{{ language.t('customer') }}</th>
              <th>{{ language.t('invoice') }}</th>
              <th>{{ language.isKhmer ? 'កាលបរិច្ឆេទ' : 'Due Date' }}</th>
              <th class="text-end">{{ language.t('grandTotal') }}</th>
              <th class="text-end">{{ language.isKhmer ? 'បានបង់' : 'Paid' }}</th>
              <th class="text-end">{{ language.t('balance') }}</th>
              <th class="text-center">{{ language.t('status') }}</th>
              <th class="text-end pe-4">{{ language.isKhmer ? 'សកម្មភាព' : 'Actions' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRecords" :key="row.invoiceId || row.id">
              <td class="ps-4">
                <div class="d-flex align-items-center gap-2">
                  <div class="avatar-circle">
                    {{ getInitials(row.customer) }}
                  </div>
                  <div>
                    <span class="fw-bold text-dark d-block">{{ row.customer || 'Walk-in Customer' }}</span>
                    <small class="text-muted font-monospace">ID: #{{ row.customerId || 'N/A' }}</small>
                  </div>
                </div>
              </td>
              <td>
                <router-link :to="{ name: 'InvoiceDetail', params: { id: row.invoice || row.invoiceId }, query: { from: '/sales/ar' } }" class="badge text-bg-light border font-monospace text-primary fw-semibold text-decoration-none">
                  #{{ row.invoice || row.invoiceId }}
                </router-link>
              </td>
              <td class="text-nowrap text-muted small">
                {{ formatDate(row.date) }}
              </td>
              <td class="text-end fw-semibold text-secondary font-monospace">
                ${{ money(row.total) }}
              </td>
              <td class="text-end text-success fw-semibold font-monospace">
                ${{ money(row.paid) }}
              </td>
              <td class="text-end">
                <span class="fw-bold text-danger fs-6 font-monospace d-block">
                  ${{ money(row.balance) }}
                </span>
                <small class="text-muted font-monospace small">
                  {{ Math.round(Number(row.balance || 0) * exchangeRate).toLocaleString() }} ៛
                </small>
              </td>
              <td class="text-center">
                <span
                  class="badge rounded-pill px-3 py-1"
                  :class="isOverdue(row.date) ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning-emphasis'"
                >
                  <i :class="isOverdue(row.date) ? 'bi bi-exclamation-octagon me-1' : 'bi bi-clock me-1'"></i>
                  {{ isOverdue(row.date) 
                    ? (language.isKhmer ? 'ហួសកំណត់' : 'Overdue') 
                    : (language.isKhmer ? 'មិនទាន់បង់' : 'Pending') 
                  }}
                </span>
              </td>
              <td class="text-end pe-4 text-nowrap">
                <button
                  class="btn btn-sm btn-primary px-3 py-1 rounded-3 shadow-xs"
                  type="button"
                  @click="openPayment(row)"
                >
                  <i class="bi bi-cash-coin me-1"></i>
                  {{ language.isKhmer ? 'ទទួលប្រាក់' : 'Collect' }}
                </button>
              </td>
            </tr>

            <tr v-if="!loading && !filteredRecords.length">
              <td colspan="8" class="text-center text-muted py-5">
                <div class="my-4">
                  <i class="bi bi-check2-circle fs-1 text-success opacity-75 d-block mb-2"></i>
                  <h6 class="fw-bold text-dark">
                    {{ language.isKhmer ? 'គ្មានសមតុល្យជំពាក់ឡើយ' : language.t('noRecords') }}
                  </h6>
                  <p class="small text-muted mb-0">
                    {{ search 
                      ? (language.isKhmer ? 'គ្មានទិន្នន័យត្រូវនឹងពាក្យស្វែងរកទេ។' : 'No records match your search.') 
                      : (language.isKhmer ? 'អតិថិជនទាំងអស់បានទូទាត់រួចរាល់ពេញលេញ។' : 'All customer accounts are settled.') 
                    }}
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Collect Payment Modal Window -->
    <Transition name="fade">
      <div v-if="paymentRecord" class="modal-backdrop-custom">
        <div class="card payment-modal shadow-lg border-0 rounded-4 overflow-hidden">
          <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
            <h6 class="fw-bold mb-0 text-dark d-flex align-items-center gap-2">
              <i class="bi bi-wallet2 text-primary fs-5"></i>
              <span>{{ language.isKhmer ? 'កត់ត្រាការទូទាត់បំណុល' : 'Collect AR Payment' }}</span>
            </h6>
            <button class="btn-close" type="button" @click="closePaymentModal"></button>
          </div>

          <div class="card-body p-4">
            <!-- Details summary box -->
            <div class="p-3 bg-light rounded-3 border mb-3">
              <div class="d-flex justify-content-between mb-1">
                <span class="text-muted small">{{ language.t('customer') }}:</span>
                <strong class="text-dark">{{ paymentRecord.customer }}</strong>
              </div>
              <div class="d-flex justify-content-between mb-1">
                <span class="text-muted small">{{ language.t('invoice') }}:</span>
                <router-link :to="{ name: 'InvoiceDetail', params: { id: paymentRecord.invoice || paymentRecord.invoiceId }, query: { from: '/sales/ar' } }" class="font-monospace text-primary fw-semibold text-decoration-none">
                  #{{ paymentRecord.invoice || paymentRecord.invoiceId }}
                </router-link>
              </div>
              <div class="d-flex justify-content-between border-top pt-2 mt-2">
                <span class="text-muted small">{{ language.t('balance') }}:</span>
                <div>
                  <strong class="text-danger font-monospace fs-6">${{ money(paymentRecord.balance) }}</strong>
                  <span class="text-muted small ms-1">({{ Math.round(Number(paymentRecord.balance || 0) * exchangeRate).toLocaleString() }} ៛)</span>
                </div>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label small fw-semibold text-secondary">
                {{ language.isKhmer ? 'ចំនួនទឹកប្រាក់ទទួល ($)' : 'Payment Amount ($)' }}
              </label>
              <div class="input-group">
                <span class="input-group-text bg-light text-muted">$</span>
                <input
                  v-model.number="paymentAmount"
                  class="form-control font-monospace fw-bold fs-6"
                  type="number"
                  min="0.01"
                  :max="paymentRecord.balance"
                  step="0.01"
                  required
                />
              </div>
              <div class="d-flex justify-content-between mt-1">
                <small class="text-muted">
                  ≈ {{ Math.round((paymentAmount || 0) * exchangeRate).toLocaleString() }} ៛
                </small>
                <button
                  type="button"
                  class="btn btn-link p-0 text-decoration-none small"
                  @click="paymentAmount = Number(paymentRecord.balance)"
                >
                  {{ language.isKhmer ? 'បង់ផ្ដាច់ទាំងអស់' : 'Pay Full Balance' }}
                </button>
              </div>
            </div>

            <div class="mb-4">
              <label class="form-label small fw-semibold text-secondary">
                {{ language.isKhmer ? 'វិធីទូទាត់' : 'Payment Method' }}
              </label>
              <select v-model="paymentMethod" class="form-select">
                <option value="cash">{{ language.t('cash') }}</option>
                <option value="bank">{{ language.t('cardQr') }} (Bakong/KHQR)</option>
              </select>
            </div>

            <div class="d-flex justify-content-end gap-2 pt-2 border-top">
              <button class="btn btn-light border px-4 rounded-3" type="button" @click="closePaymentModal">
                {{ language.t('cancel') }}
              </button>
              <button
                class="btn btn-success px-4 rounded-3 shadow-sm"
                type="button"
                :disabled="savingPayment || paymentAmount <= 0 || paymentAmount > Number(paymentRecord.balance)"
                @click="collectPayment"
              >
                <span v-if="savingPayment" class="spinner-border spinner-border-sm me-2" role="status"></span>
                <i v-else class="bi bi-check2-circle me-1"></i>
                {{ savingPayment ? language.t('saving') : language.t('save') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';
import { useTaxStore } from '@/stores/tax';

const language = useLanguageStore();
const tax = useTaxStore();

const records = ref([]);
const loading = ref(false);
const savingPayment = ref(false);
const error = ref('');
const search = ref('');

const paymentRecord = ref(null);
const paymentAmount = ref(0);
const paymentMethod = ref('cash');

const exchangeRate = computed(() => Number(tax.settings?.exchangeRate) || 4000);

function money(value) {
  return Number(value || 0).toFixed(2);
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB');
}

function isOverdue(dateVal) {
  if (!dateVal) return false;
  const target = new Date(dateVal);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target < today;
}

function getInitials(name) {
  if (!name) return 'C';
  const parts = name.trim().split(' ');
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

function closePaymentModal() {
  paymentRecord.value = null;
  paymentAmount.value = 0;
  paymentMethod.value = 'cash';
}

async function load() {
  loading.value = true;
  error.value = '';

  try {
    const data = await api.arSummary();
    records.value = Array.isArray(data) ? data : [];
  } catch (requestError) {
    error.value = requestError.message || (
      language.isKhmer ? 'មិនអាចទាញយកទិន្នន័យគណនីត្រូវទារបានទេ។' : 'Failed to load receivables.'
    );
  } finally {
    loading.value = false;
  }
}

function openPayment(record) {
  paymentRecord.value = record;
  paymentAmount.value = Number(record.balance || 0);
  paymentMethod.value = 'cash';
}

async function collectPayment() {
  if (!paymentRecord.value || paymentAmount.value <= 0) return;

  savingPayment.value = true;
  error.value = '';

  try {
    await api.collectArPayment({
      customerId: Number(paymentRecord.value.customerId) > 0 ? paymentRecord.value.customerId : null,
      invoiceId: paymentRecord.value.invoiceId || paymentRecord.value.id,
      amount: paymentAmount.value,
      paymentMethod: paymentMethod.value,
    });

    closePaymentModal();
    await load();
  } catch (requestError) {
    error.value = requestError.message || (
      language.isKhmer ? 'បរាជ័យក្នុងការកត់ត្រាការទូទាត់។' : 'Failed to record payment.'
    );
  } finally {
    savingPayment.value = false;
  }
}

const filteredRecords = computed(() => {
  if (!search.value) return records.value;
  const q = search.value.toLowerCase();
  return records.value.filter(
    (r) =>
      (r.customer || '').toLowerCase().includes(q) ||
      String(r.invoice || r.invoiceId || '').toLowerCase().includes(q)
  );
});

const totalOutstanding = computed(() =>
  records.value.reduce((sum, row) => sum + Number(row.balance || 0), 0)
);

const dueThisWeek = computed(() => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);

  return records.value
    .filter((row) => {
      const d = new Date(row.date);
      return d >= now && d <= weekEnd;
    })
    .reduce((sum, row) => sum + Number(row.balance || 0), 0);
});

const stats = computed(() => [
  {
    label: language.isKhmer ? 'បំណុលត្រូវទារសរុប' : 'Total Outstanding',
    value: `$${money(totalOutstanding.value)}`,
    subLabel: `${Math.round(totalOutstanding.value * exchangeRate.value).toLocaleString()} ៛`,
    extra: 'Receivable',
    icon: 'bi bi-cash-stack',
    bg: 'bg-danger-subtle',
    tone: 'text-danger',
  },
  {
    label: language.isKhmer ? 'ត្រូវទារក្នុងសប្តាហ៍នេះ' : 'Due This Week',
    value: `$${money(dueThisWeek.value)}`,
    subLabel: `${Math.round(dueThisWeek.value * exchangeRate.value).toLocaleString()} ៛`,
    extra: 'Upcoming',
    icon: 'bi bi-calendar2-week',
    bg: 'bg-warning-subtle',
    tone: 'text-warning-emphasis',
  },
  {
    label: language.t('customers'),
    value: new Set(records.value.map((row) => row.customerId)).size.toString(),
    subLabel: `${records.value.length} ${language.isKhmer ? 'វិក្កយបត្រ' : 'Invoices'}`,
    extra: 'Accounts',
    icon: 'bi bi-people-fill',
    bg: 'bg-primary-subtle',
    tone: 'text-primary',
  },
  {
    label: language.isKhmer ? 'វិក្កយបត្រហួសកាលកំណត់' : 'Overdue Invoices',
    value: records.value.filter((row) => isOverdue(row.date)).length.toString(),
    subLabel: language.isKhmer ? 'ត្រូវការទារជាបន្ទាន់' : 'Requires collection',
    extra: 'Alert',
    icon: 'bi bi-exclamation-octagon',
    bg: 'bg-danger-subtle',
    tone: 'text-danger',
  },
]);

onMounted(load);
</script>

<style scoped>
.ar-page {
  min-height: 100vh;
  background-color: #f8fafc;
}

.ar-hero {
  border: 1px solid #e2e8f0;
}

.hero-glow {
  position: absolute;
  top: -60px;
  right: -60px;
  width: 250px;
  height: 250px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(13, 110, 253, 0.08) 0%, rgba(255, 255, 255, 0) 70%);
  pointer-events: none;
}

.tracking-tight {
  letter-spacing: -0.02em;
}

.tracking-wider {
  letter-spacing: 0.04em;
  font-size: 0.72rem;
}

.metric-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06) !important;
}

.metric-icon-box {
  width: 44px;
  height: 44px;
}

.metric-value {
  font-size: 1.6rem;
  letter-spacing: -0.02em;
}

.search-group {
  width: 250px;
}

@media (max-width: 575.98px) {
  .search-group {
    width: 100%;
  }
}

.modern-table thead th {
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.modern-table tbody td {
  padding-top: 0.95rem;
  padding-bottom: 0.95rem;
}

.avatar-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #0d6efd;
  font-size: 0.8rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
}

.modal-backdrop-custom {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(3px);
}

.payment-modal {
  width: min(100%, 460px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>