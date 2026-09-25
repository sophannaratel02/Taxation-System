<template>
  <section class="container-fluid py-4 px-md-4 page-canvas customer-page">
    <!-- Ambient Executive Header -->
    <header class="customer-hero p-4 p-md-5 mb-4 rounded-4 bg-white border position-relative overflow-hidden">
      <div class="hero-mesh"></div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 position-relative z-1">
        <div class="hero-content">
          <div class="d-inline-flex align-items-center gap-2 px-2.5 py-1 rounded-pill bg-slate-100 text-slate-700 small fw-semibold mb-2.5 border">
            <span class="status-dot"></span>
            <span>{{ language.t('customerSales') }}</span>
            <span class="text-muted">/</span>
            <span class="text-secondary">CRM & Credit Ledger</span>
          </div>
          <h1 class="h3 fw-bolder text-slate-900 mb-1 tracking-tight">
            {{ language.isKhmer ? 'បញ្ជីព័ត៌មានអតិថិជន' : 'Customer Directory & Accounts' }}
          </h1>
          <p class="text-secondary small mb-0 max-w-text">
            {{ language.isKhmer 
              ? 'គ្រប់គ្រងព័ត៌មានអតិថិជន ប្រាក់កក់ និងសមតុល្យឥណទាន (Credit Limits) ក្នុងប្រព័ន្ធតែមួយ។' 
              : 'Maintain real-time customer balances, advance security deposits, and credit term limits.' 
            }}
          </p>
        </div>

        <div class="d-flex gap-2 align-items-center">
          <button
            class="btn btn-primary px-3.5 py-2.5 rounded-3 fw-semibold shadow-sm d-inline-flex align-items-center gap-2 add-btn"
            type="button"
            @click="openCreateModal"
          >
            <i class="bi bi-plus-lg fs-6"></i>
            <span>{{ language.isKhmer ? 'បន្ថែមអតិថិជនថ្មី' : 'Add Customer' }}</span>
          </button>
        </div>
      </div>
    </header>

    <!-- KPI Metric Cards Grid -->
    <div class="row g-3 mb-4">
      <div v-for="stat in stats" :key="stat.label" class="col-sm-6 col-xl-4">
        <div class="card metric-card border bg-white h-100 rounded-4">
          <div class="card-body p-3.5 d-flex align-items-center gap-3">
            <div class="metric-icon-box rounded-3" :class="stat.tone">
              <i :class="stat.icon"></i>
            </div>
            <div class="flex-grow-1 min-w-0">
              <span class="text-uppercase tracking-wider fw-bold text-slate-500 d-block fs-xs mb-1">
                {{ stat.label }}
              </span>
              <div class="d-flex align-items-baseline gap-2">
                <strong class="fs-4 fw-bolder text-slate-900 font-monospace tracking-tight">
                  {{ stat.value }}
                </strong>
                <span v-if="stat.subtext" class="text-muted fs-xs font-monospace">
                  {{ stat.subtext }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Container -->
    <div class="card border rounded-4 bg-white overflow-hidden shadow-2xs">
      <!-- Action Toolbar -->
      <div class="card-header bg-white py-3.5 px-4 border-bottom d-flex flex-wrap gap-3 justify-content-between align-items-center">
        <!-- Filter Tabs -->
        <div class="d-flex align-items-center gap-1.5 filter-pills">
          <button 
            type="button" 
            class="filter-pill"
            :class="{ active: filterType === 'all' }"
            @click="filterType = 'all'"
          >
            {{ language.isKhmer ? 'ទាំងអស់' : 'All' }}
            <span class="counter-badge">{{ (tax.customers || []).length }}</span>
          </button>
          <button 
            type="button" 
            class="filter-pill"
            :class="{ active: filterType === 'debtors' }"
            @click="filterType = 'debtors'"
          >
            {{ language.isKhmer ? 'ជំពាក់ (AR)' : 'Outstanding AR' }}
            <span class="counter-badge text-danger-soft">{{ debtorCount }}</span>
          </button>
          <button 
            type="button" 
            class="filter-pill"
            :class="{ active: filterType === 'deposits' }"
            @click="filterType = 'deposits'"
          >
            {{ language.isKhmer ? 'មានប្រាក់កក់' : 'Has Deposits' }}
            <span class="counter-badge text-teal-soft">{{ depositCount }}</span>
          </button>
        </div>

        <!-- Search Input -->
        <div class="input-group input-group-sm search-group">
          <span class="input-group-text bg-white border-end-0 text-muted ps-3">
            <i class="bi bi-search"></i>
          </span>
          <input
            v-model.trim="search"
            class="form-control border-start-0 border-end-0 shadow-none ps-2"
            :placeholder="language.isKhmer ? 'ស្វែងរកឈ្មោះ, ទូរស័ព្ទ, TIN...' : 'Search name, phone, TIN...'"
          />
          <button v-if="search" class="btn btn-outline-light border-start-0 border text-muted" type="button" @click="search = ''">
            <i class="bi bi-x-circle-fill fs-xs"></i>
          </button>
        </div>
      </div>

      <!-- Table Section -->
      <div class="table-responsive">
        <table class="table align-middle modern-table mb-0">
          <thead>
            <tr>
              <th class="ps-4">{{ language.t('customer') }}</th>
              <th>{{ language.isKhmer ? 'លេខទូរស័ព្ទ' : 'Contact' }}</th>
              <th>VAT TIN</th>
              <th class="text-end">{{ language.isKhmer ? 'ប្រាក់កក់' : 'Deposit' }}</th>
              <th class="text-end">{{ language.t('balance') }} (AR)</th>
              <th class="text-end pe-4">{{ language.isKhmer ? 'សកម្មភាព' : 'Actions' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cust in filteredCustomers" :key="cust.id" class="customer-row">
              <!-- Customer Identity -->
              <td class="ps-4">
                <div class="d-flex align-items-center gap-3">
                  <div class="avatar-box" :style="{ backgroundColor: getAvatarColor(cust.name) }">
                    {{ getInitials(cust.name) }}
                  </div>
                  <div>
                    <span class="fw-bold text-slate-900 d-block tracking-tight text-name">
                      {{ cust.name || 'Walk-in Customer' }}
                    </span>
                    <div class="d-flex align-items-center gap-2 mt-0.5">
                      <span class="badge text-slate-600 bg-slate-100 border px-1.5 py-0.5 fw-normal font-monospace fs-xxs">
                        Limit: ${{ formatMoney(cust.creditLimit) }}
                      </span>
                    </div>
                  </div>
                </div>
              </td>

              <!-- Phone -->
              <td>
                <span v-if="cust.phone" class="font-monospace text-slate-700 text-nowrap fs-sm">
                  <i class="bi bi-telephone text-muted me-1.5 fs-xs"></i>{{ cust.phone }}
                </span>
                <span v-else class="text-muted font-monospace fs-sm">—</span>
              </td>

              <!-- VAT TIN -->
              <td>
                <span v-if="cust.vatTin" class="font-monospace fw-semibold text-uppercase text-slate-800 bg-slate-100 border px-2 py-1 rounded fs-xs">
                  {{ cust.vatTin }}
                </span>
                <span v-else class="text-muted fs-sm">—</span>
              </td>

              <!-- Advance Deposit -->
              <td class="text-end">
                <span class="font-monospace fw-bold" :class="Number(cust.deposit || 0) > 0 ? 'text-teal' : 'text-slate-400'">
                  ${{ formatMoney(cust.deposit) }}
                </span>
              </td>

              <!-- Balance (AR) -->
              <td class="text-end">
                <div v-if="Number(cust.balance || 0) > 0">
                  <span class="badge bg-danger-subtle text-danger border border-danger-subtle font-monospace fw-bold px-2 py-1">
                    ${{ formatMoney(cust.balance) }}
                  </span>
                  <small class="d-block text-muted font-monospace fs-xxs mt-0.5">
                    {{ Math.round(Number(cust.balance) * exchangeRate).toLocaleString() }} ៛
                  </small>
                </div>
                <span v-else class="badge bg-success-subtle text-success border border-success-subtle font-monospace px-2 py-1">
                  Settled
                </span>
              </td>

              <!-- Actions -->
              <td class="text-end pe-4 text-nowrap">
                <div class="action-btn-group">
                  <button
                    class="btn btn-icon btn-subtle"
                    type="button"
                    :title="language.isKhmer ? 'កែប្រែ' : 'Edit'"
                    @click="openEditModal(cust)"
                  >
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button
                    class="btn btn-icon btn-subtle-danger"
                    type="button"
                    :title="language.t('delete')"
                    @click="deleteCust(cust)"
                  >
                    <i class="bi bi-trash3"></i>
                  </button>
                </div>
              </td>
            </tr>

            <!-- Empty Search State -->
            <tr v-if="!filteredCustomers.length">
              <td colspan="6" class="text-center py-5">
                <div class="empty-state-box py-4">
                  <div class="empty-state-icon mb-3">
                    <i class="bi bi-person-x text-muted"></i>
                  </div>
                  <h6 class="fw-bold text-slate-800 mb-1">{{ language.t('noRecords') }}</h6>
                  <p class="text-muted small mb-0">
                    {{ search 
                      ? (language.isKhmer ? 'គ្មានអតិថិជនដែលត្រូវនឹងពាក្យស្វែងរកឡើយ។' : 'No customers match your search criteria.') 
                      : (language.isKhmer ? 'មិនទាន់មានទិន្នន័យអតិថិជននៅឡើយទេ។' : 'No customer accounts available.') 
                    }}
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create / Edit Customer Modal Window -->
    <Transition name="modal-fade">
      <div v-if="showModal" class="modal-backdrop-custom" @click.self="closeModal">
        <div class="card customer-modal border-0 shadow-lg rounded-4 overflow-hidden animate-scale-in">
          <div class="card-header bg-slate-900 text-white py-3.5 px-4 border-0 d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-2.5">
              <div class="modal-title-icon">
                <i :class="isEditing ? 'bi bi-person-gear' : 'bi bi-person-plus'"></i>
              </div>
              <div>
                <h6 class="fw-bold mb-0 text-white fs-6">
                  {{ isEditing 
                    ? (language.isKhmer ? 'កែប្រែព័ត៌មានអតិថិជន' : 'Edit Customer Profile') 
                    : (language.isKhmer ? 'បន្ថែមអតិថិជនថ្មី' : 'Create New Customer') 
                  }}
                </h6>
                <small class="text-slate-400 fs-xxs">Configure limits and profile data</small>
              </div>
            </div>
            <button class="btn btn-close-modal" type="button" @click="closeModal">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <form class="card-body p-4" @submit.prevent="saveForm">
            <div class="row g-3">
              <!-- Customer Name -->
              <div class="col-md-6">
                <label class="form-label fs-xs fw-bold text-slate-600">
                  {{ language.isKhmer ? 'ឈ្មោះអតិថិជន' : 'Customer Name' }}
                  <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-slate-50 border-end-0 text-muted"><i class="bi bi-person"></i></span>
                  <input
                    v-model.trim="formData.name"
                    class="form-control border-start-0"
                    placeholder="e.g. Sok Chenda"
                    required
                  />
                </div>
              </div>

              <!-- Phone Number -->
              <div class="col-md-6">
                <label class="form-label fs-xs fw-bold text-slate-600">
                  {{ language.isKhmer ? 'លេខទូរស័ព្ទ' : 'Phone Number' }}
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-slate-50 border-end-0 text-muted"><i class="bi bi-telephone"></i></span>
                  <input
                    v-model.trim="formData.phone"
                    class="form-control border-start-0 font-monospace"
                    placeholder="+855 12 888 999"
                  />
                </div>
              </div>

              <!-- VAT TIN -->
              <div class="col-md-6">
                <label class="form-label fs-xs fw-bold text-slate-600">
                  VAT TIN (ពន្ធដារ)
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-slate-50 border-end-0 text-muted font-monospace">#</span>
                  <input
                    v-model.trim="formData.vatTin"
                    class="form-control border-start-0 font-monospace text-uppercase"
                    placeholder="K001-99887766"
                  />
                </div>
              </div>

              <!-- Credit Limit -->
              <div class="col-md-6">
                <label class="form-label fs-xs fw-bold text-slate-600">
                  {{ language.t('creditLimit') }} ($)
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-slate-50 border-end-0 text-muted font-monospace">$</span>
                  <input
                    v-model.number="formData.creditLimit"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control border-start-0 font-monospace"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <!-- Deposit -->
              <div class="col-12">
                <div class="p-3 bg-slate-50 rounded-3 border">
                  <label class="form-label fs-xs fw-bold text-slate-700 mb-1">
                    {{ language.isKhmer ? 'ប្រាក់កក់ដំបូង ($)' : 'Advance Security Deposit ($)' }}
                  </label>
                  <div class="input-group">
                    <span class="input-group-text bg-white border-end-0 text-muted font-monospace">$</span>
                    <input
                      v-model.number="formData.deposit"
                      type="number"
                      min="0"
                      step="0.01"
                      class="form-control border-start-0 font-monospace"
                      placeholder="0.00"
                    />
                  </div>
                  <small class="text-slate-500 fs-xxs d-block mt-1.5">
                    {{ language.isKhmer 
                      ? 'សមតុល្យប្រាក់កក់នេះ នឹងកាត់កងដោយស្វ័យប្រវត្តិកំឡុងពេលគិតលុយនៅបញ្ជរ POS។' 
                      : 'Credit balance automatically applied as deduction at POS checkout.' 
                    }}
                  </small>
                </div>
              </div>
            </div>

            <!-- Modal Action Footer -->
            <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
              <button class="btn btn-light px-3.5 rounded-3 fw-semibold border" type="button" @click="closeModal">
                {{ language.t('cancel') }}
              </button>
              <button class="btn btn-primary px-4 rounded-3 fw-semibold shadow-sm" type="submit" :disabled="saving">
                <span v-if="saving" class="spinner-border spinner-border-sm me-2" role="status"></span>
                <i v-else class="bi bi-check-lg me-1"></i>
                {{ saving ? language.t('saving') : language.t('save') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();

const search = ref('');
const filterType = ref('all');
const showModal = ref(false);
const isEditing = ref(false);
const editingId = ref(null);
const saving = ref(false);

const formData = reactive({
  name: '',
  phone: '',
  vatTin: '',
  creditLimit: 0,
  deposit: 0,
});

const formatMoney = (val) => Number(val || 0).toFixed(2);
const exchangeRate = computed(() => Number(tax.settings?.exchangeRate) || 4000);

const debtorCount = computed(() => (tax.customers || []).filter((c) => Number(c.balance || 0) > 0).length);
const depositCount = computed(() => (tax.customers || []).filter((c) => Number(c.deposit || 0) > 0).length);

const filteredCustomers = computed(() => {
  let list = tax.customers || [];
  
  if (filterType.value === 'debtors') {
    list = list.filter((c) => Number(c.balance || 0) > 0);
  } else if (filterType.value === 'deposits') {
    list = list.filter((c) => Number(c.deposit || 0) > 0);
  }

  if (!search.value) return list;
  const q = search.value.toLowerCase();
  return list.filter(
    (c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.vatTin || '').toLowerCase().includes(q)
  );
});

function getInitials(name) {
  if (!name) return 'C';
  const parts = name.trim().split(' ');
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

function getAvatarColor(name) {
  const palette = ['#0284c7', '#0d9488', '#4f46e5', '#d97706', '#e11d48'];
  if (!name) return palette[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

const totalARBalance = computed(() =>
  (tax.customers || []).reduce((sum, c) => sum + Number(c.balance || 0), 0)
);

const totalDeposits = computed(() =>
  (tax.customers || []).reduce((sum, c) => sum + Number(c.deposit || 0), 0)
);

const stats = computed(() => [
  {
    label: language.t('customers'),
    value: (tax.customers || []).length.toLocaleString(),
    icon: 'bi bi-people-fill',
    tone: 'tone-blue',
  },
  {
    label: language.isKhmer ? 'សមតុល្យត្រូវទារ (AR)' : 'Total Receivables',
    value: `$${formatMoney(totalARBalance.value)}`,
    subtext: `${debtorCount.value} accounts`,
    icon: 'bi bi-receipt-cutoff',
    tone: 'tone-amber',
  },
  {
    label: language.isKhmer ? 'ប្រាក់កក់អតិថិជនសរុប' : 'Security Deposits',
    value: `$${formatMoney(totalDeposits.value)}`,
    subtext: `${depositCount.value} prepayments`,
    icon: 'bi bi-wallet2',
    tone: 'tone-teal',
  },
]);

function openCreateModal() {
  isEditing.value = false;
  editingId.value = null;
  Object.assign(formData, {
    name: '',
    phone: '',
    vatTin: '',
    creditLimit: 0,
    deposit: 0,
  });
  showModal.value = true;
}

function openEditModal(cust) {
  isEditing.value = true;
  editingId.value = cust.id;
  Object.assign(formData, {
    name: cust.name || '',
    phone: cust.phone || '',
    vatTin: cust.vatTin || '',
    creditLimit: Number(cust.creditLimit || 0),
    deposit: Number(cust.deposit || 0),
  });
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingId.value = null;
}

async function saveForm() {
  saving.value = true;
  try {
    const payload = {
      ...formData,
      creditLimit: Number(formData.creditLimit || 0),
      deposit: Number(formData.deposit || 0),
    };

    if (isEditing.value && editingId.value) {
      await tax.updateCustomer(editingId.value, payload);
    } else {
      await tax.saveCustomer(payload);
    }
    closeModal();
  } catch (err) {
    console.error('Error saving customer:', err);
  } finally {
    saving.value = false;
  }
}

async function deleteCust(cust) {
  const confirmText = language.isKhmer
    ? `តើអ្នកប្រាកដថាចង់លុបអតិថិជន "${cust.name}" មែនទេ?`
    : `Are you sure you want to delete "${cust.name}"?`;

  if (!window.confirm(confirmText)) return;

  try {
    await tax.deleteCustomer(cust.id);
  } catch (err) {
    console.error('Error deleting customer:', err);
  }
}
</script>

<style scoped>
/* Color tokens & utility typography */
.text-slate-900 { color: #0f172a; }
.text-slate-800 { color: #1e293b; }
.text-slate-700 { color: #334155; }
.text-slate-600 { color: #475569; }
.text-slate-500 { color: #64748b; }
.text-slate-400 { color: #94a3b8; }
.bg-slate-50 { background-color: #f8fafc; }
.bg-slate-100 { background-color: #f1f5f9; }
.bg-slate-900 { background-color: #0f172a; }
.text-teal { color: #0d9488; }
.text-danger-soft { color: #ef4444; }
.text-teal-soft { color: #14b8a6; }

.fs-xs { font-size: 0.76rem; }
.fs-xxs { font-size: 0.68rem; }
.max-w-text { max-width: 580px; }
.tracking-tight { letter-spacing: -0.025em; }
.tracking-wider { letter-spacing: 0.05em; }

.customer-page {
  min-height: 100vh;
  background-color: #f8fafc;
}

/* Hero Section */
.customer-hero {
  border-color: #e2e8f0 !important;
}
.hero-mesh {
  position: absolute;
  top: -80px;
  right: -40px;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(14, 165, 233, 0.09) 0%, rgba(255, 255, 255, 0) 70%);
  pointer-events: none;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #0284c7;
}

/* Metric KPI Cards */
.metric-card {
  border-color: #e2e8f0 !important;
  transition: all 0.2s ease;
}
.metric-card:hover {
  border-color: #cbd5e1 !important;
  transform: translateY(-2px);
  box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.04);
}
.metric-icon-box {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
}
.tone-blue { background: #f0f9ff; color: #0284c7; }
.tone-amber { background: #fffbeb; color: #d97706; }
.tone-teal { background: #f0fdfa; color: #0d9488; }

/* Filter Tabs */
.filter-pills {
  background: #f1f5f9;
  padding: 3px;
  border-radius: 10px;
}
.filter-pill {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}
.filter-pill.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.counter-badge {
  font-size: 0.68rem;
  background: #e2e8f0;
  padding: 1px 6px;
  border-radius: 6px;
}
.filter-pill.active .counter-badge {
  background: #f1f5f9;
}

.search-group {
  width: 250px;
}
.search-group .form-control {
  border-color: #e2e8f0;
}

/* Modern Table */
.modern-table thead th {
  background: #fafafa;
  color: #64748b;
  font-size: 0.72rem;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding-top: 0.8rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid #e2e8f0;
}
.modern-table tbody td {
  padding-top: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #f1f5f9;
}
.customer-row {
  transition: background-color 0.15s ease;
}
.customer-row:hover {
  background-color: #fafbfd;
}
.text-name {
  font-size: 0.88rem;
}
.avatar-box {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Action Button Micro-interactions */
.action-btn-group {
  display: inline-flex;
  gap: 4px;
}
.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 0.85rem;
  transition: all 0.15s ease;
}
.btn-subtle {
  color: #64748b;
  background: #f8fafc;
  border-color: #e2e8f0;
}
.btn-subtle:hover {
  color: #0284c7;
  background: #f0f9ff;
  border-color: #bae6fd;
}
.btn-subtle-danger {
  color: #94a3b8;
  background: #f8fafc;
  border-color: #e2e8f0;
}
.btn-subtle-danger:hover {
  color: #ef4444;
  background: #fef2f2;
  border-color: #fecaca;
}

/* Empty State */
.empty-state-box {
  color: #64748b;
}
.empty-state-icon {
  font-size: 2.2rem;
  opacity: 0.4;
}

/* Modal */
.modal-backdrop-custom {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
}
.customer-modal {
  width: min(100%, 540px);
}
.modal-title-icon {
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #38bdf8;
}
.btn-close-modal {
  border: none;
  background: transparent;
  color: #94a3b8;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}
.btn-close-modal:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

/* Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.animate-scale-in {
  animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes scaleIn {
  from {
    transform: scale(0.96);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>