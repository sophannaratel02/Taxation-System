<template>
  <section class="container-fluid p-4 page-canvas transaction-page">
    <!-- Header -->
    <div class="transaction-hero p-4 mb-4 rounded-4 position-relative overflow-hidden bg-white border-0 shadow-sm">
      <div class="position-relative z-1 d-flex flex-wrap justify-content-between align-items-end gap-3">
        <div>
          <div class="eyebrow text-primary text-uppercase small fw-bold mb-1">
            <i class="bi bi-clock-history me-1"></i>{{ language.t('inventory') }}
          </div>
          <h1 class="h3 fw-bold text-dark mb-1">
            {{ language.isKhmer ? 'ប្រវត្តិចលនាស្តុក' : 'Transaction History' }}
          </h1>
          <p class="text-muted mb-0">
            {{ language.isKhmer 
              ? 'តាមដានរាល់ការទទួល ការលក់ និងការកែសម្រួលស្តុក។' 
              : 'A complete audit trail of every stock movement across the operation.' 
            }}
          </p>
        </div>
      </div>
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

    <!-- Filters & Table Card (Styled like Sales History Ledger) -->
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white border-0 py-3">
        <div class="row g-2 align-items-end">
          <div class="col-lg-3 col-md-6">
            <div class="input-group">
              <span class="input-group-text bg-light border-end-0 text-muted">
                <i class="bi bi-search"></i>
              </span>
              <input
                v-model.trim="search"
                type="text"
                class="form-control border-start-0 ps-0"
                maxlength="120"
                :placeholder="language.isKhmer ? 'ស្វែងរកទំនិញ ចលនា សាខា កាលបរិច្ឆេទ ឬលេខយោង...' : 'Search item, movement, branch, date or reference...'"
                @input="page = 1"
              />
            </div>
          </div>

          <div class="col-lg-2 col-md-3">
            <select v-model="movementFilter" class="form-select" @change="page = 1">
              <option value="">{{ language.isKhmer ? 'ចលនាទាំងអស់' : 'All movements' }}</option>
              <option value="Sale">{{ language.t('stockIssued') }}</option>
              <option value="Purchase">{{ language.t('stockReceived') }}</option>
              <option value="Return">{{ language.isKhmer ? 'ត្រឡប់ទំនិញ' : 'Return' }}</option>
              <option value="Adjustment">{{ language.t('stockAdjustment') }}</option>
              <option value="Transfer">{{ language.isKhmer ? 'ផ្ទេរ' : 'Transfer' }}</option>
            </select>
          </div>

          <div class="col-lg-2 col-md-3">
            <select v-model="itemFilter" class="form-select" @change="page = 1">
              <option value="">{{ language.isKhmer ? 'ទំនិញទាំងអស់' : 'All items' }}</option>
              <option v-for="item in tax.items" :key="item.id" :value="item.id">{{ item.nameEn }}</option>
            </select>
          </div>
          <div class="col-lg-2 col-md-4">
            <input
              v-model.trim="branchFilter"
              class="form-control"
              :placeholder="language.isKhmer ? 'សាខា' : 'Branch'"
              @input="page = 1"
            />
          </div>
          <div class="col-lg-1 col-md-4">
            <label class="form-label small mb-1">{{ language.isKhmer ? 'ចាប់ពី' : 'From' }}</label>
            <input v-model="startDate" type="date" class="form-control" @change="page = 1" />
          </div>
          <div class="col-lg-1 col-md-4">
            <label class="form-label small mb-1">{{ language.isKhmer ? 'ដល់' : 'To' }}</label>
            <input v-model="endDate" type="date" class="form-control" @change="page = 1" />
          </div>
        </div>
        <div v-if="movementError" class="alert alert-danger mt-3 mb-0" role="alert">{{ movementError }}</div>
      </div>

      <!-- Invoices / Transactions Table -->
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-3">{{ language.t('date') }}</th>
              <th>{{ language.t('item') }}</th>
              <th>{{ language.t('movement') }}</th>
              <th>{{ language.isKhmer ? 'សាខា' : 'Branch' }}</th>
              <th class="text-end">{{ language.t('quantity') }}</th>
              <th class="text-end">{{ language.t('balance') }}</th>
              <th class="text-center pe-3">{{ language.t('reference') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in movements" :key="entry.id">
              <td class="ps-3 text-nowrap">
                {{ formatShortDate(entry.date || entry.createdAt) }}
                <small class="text-muted d-block">{{ formatTime(entry.date || entry.createdAt) }}</small>
              </td>
              <td class="fw-semibold text-dark">
                {{ entry.item || entry.itemName || '-' }}
              </td>
              <td>
                <span class="badge text-capitalize border" :class="movementBadgeClass(entry)">
                  {{ formatMovement(entry) }}
                </span>
              </td>
              <td>{{ entry.branch }}</td>
              <td 
                class="text-end fw-medium"
                :class="Number(entry.qty) < 0 ? 'text-danger' : 'text-success'"
              >
                {{ formatQty(entry.qty) }}
              </td>
              <td class="text-end fw-bold">
                {{ numberFormatter.format(Number(entry.balanceAfter ?? entry.balance_after ?? 0)) }}
              </td>
              <td class="text-center pe-3">
                <router-link
                  v-if="isInvoiceReference(entry.reference || entry.note)"
                  :to="{ name: 'InvoiceDetail', params: { id: entry.reference || entry.note }, query: { from: '/inventory/history' } }"
                  class="text-primary text-decoration-none fw-semibold"
                >
                  #{{ entry.reference || entry.note }}
                </router-link>
                <span v-else class="text-muted">
                  {{ entry.reference || entry.note || '—' }}
                </span>
              </td>
            </tr>

            <!-- Empty Search State -->
            <tr v-if="loading">
              <td colspan="7" class="text-center py-4 text-muted">{{ language.t('loading') }}</td>
            </tr>
            <tr v-else-if="!movements.length">
              <td colspan="7" class="text-center py-5 text-muted">
                <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                <div>{{ language.t('noRecords') }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
        <small class="text-muted">
          {{ language.isKhmer ? 'សរុប' : 'Total' }}: {{ numberFormatter.format(total) }}
          · {{ language.isKhmer ? 'ទំព័រ' : 'Page' }} {{ page }} / {{ totalPages }}
        </small>
        <div class="d-flex align-items-center gap-2">
          <select v-model.number="limit" class="form-select form-select-sm" style="width: auto" @change="page = 1">
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="250">250</option>
            <option :value="500">500</option>
          </select>
          <button class="btn btn-sm btn-outline-secondary" type="button" :disabled="page <= 1 || loading" @click="page--">
            {{ language.isKhmer ? 'មុន' : 'Previous' }}
          </button>
          <button class="btn btn-sm btn-outline-secondary" type="button" :disabled="page >= totalPages || loading" @click="page++">
            {{ language.isKhmer ? 'បន្ទាប់' : 'Next' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { api } from '@/services/api';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();
const search = ref('');
const movementFilter = ref('');
const itemFilter = ref('');
const branchFilter = ref('');
const startDate = ref('');
const endDate = ref('');
const page = ref(1);
const limit = ref(50);
const total = ref(0);
const totalPages = ref(0);
const loading = ref(false);
const movementError = ref('');
const movementData = ref([]);
let requestSequence = 0;

const movements = computed(() => movementData.value);

const numberFormatter = new Intl.NumberFormat(language.isKhmer ? 'km-KH' : 'en-US');
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeMovementData = (rows = []) => {
  if (!Array.isArray(rows)) return [];
  return rows.map((entry = {}) => ({
    ...entry,
    qty: toNumber(entry.qty),
    balanceAfter: toNumber(entry.balanceAfter ?? entry.balance_after),
  }));
};

async function loadMovements() {
  const sequence = ++requestSequence;
  loading.value = true;
  movementError.value = '';

  if (startDate.value && endDate.value && startDate.value > endDate.value) {
    if (sequence === requestSequence) {
      movementError.value = language.isKhmer ? 'ថ្ងៃចាប់ផ្តើមមិនអាចនៅក្រោយថ្ងៃបញ្ចប់ទេ។' : 'Start date cannot be later than end date.';
      movementData.value = [];
      total.value = 0;
      totalPages.value = 1;
      loading.value = false;
    }
    return;
  }

  try {
    const response = await api.transactions({
      page: page.value,
      limit: limit.value,
      item_id: itemFilter.value,
      branch: branchFilter.value,
      startDate: startDate.value,
      endDate: endDate.value,
      type: movementFilter.value,
      search: search.value,
    });
    if (sequence !== requestSequence) return;
    movementData.value = normalizeMovementData(response?.data || []);
    total.value = toNumber(response?.total, 0);
    totalPages.value = Math.max(1, toNumber(response?.totalPages, 1));
  } catch (requestError) {
    if (sequence === requestSequence) movementError.value = requestError?.message || (language.isKhmer ? 'មិនអាចទាញយកប្រវត្តិចលនាស្តុកបានទេ។' : 'Failed to load stock movements.');
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

watch([page, limit, itemFilter, branchFilter, startDate, endDate, movementFilter, search], loadMovements, { immediate: true });

function formatShortDate(value) {
  if (!value) return '—';
  const parsed = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(language.isKhmer ? 'km-KH' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '';
  const parsed = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isInvoiceReference(reference) {
  return /^INV-[A-Z0-9-]+$/i.test(String(reference || '').trim());
}

function movementBadgeClass(entry) {
  const type = String(entry.type || '').toLowerCase();
  if (type.includes('sale') || Number(entry.qty) < 0) {
    return 'text-bg-danger-subtle text-danger border-danger-subtle';
  }
  if (type.includes('purchase') || Number(entry.qty) > 0) {
    return 'text-bg-success-subtle text-success border-success-subtle';
  }
  return 'text-bg-light text-secondary border';
}

function formatMovement(entry) {
  const qty = Number(entry.qty) || 0;
  const knownTypes = {
    Return: language.isKhmer ? 'ត្រឡប់ទំនិញ' : 'Return',
    Sale: language.isKhmer ? 'លក់' : 'Sale',
    Purchase: language.isKhmer ? 'ទិញចូល' : 'Purchase',
    Adjustment: language.isKhmer ? 'កែតម្រូវស្តុក' : 'Adjustment',
    Transfer: language.isKhmer ? 'ផ្ទេរ' : 'Transfer',
  };
  if (Object.prototype.hasOwnProperty.call(knownTypes, entry.type)) return knownTypes[entry.type];
  if (entry.type) return entry.type;
  if (qty > 0) return language.t('stockReceived') || 'Received';
  if (qty < 0) return language.t('stockIssued') || 'Issued';
  return language.t('noChange') || 'Adjustment';
}

function formatQty(qty) {
  const n = Number(qty) || 0;
  const formatted = numberFormatter.format(Math.abs(n));
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `-${formatted}`;
  return formatted;
}

const stats = computed(() => {
  const list = movements.value;
  const incoming = list.filter((e) => Number(e.qty) > 0).reduce((sum, e) => sum + Number(e.qty), 0);
  const outgoing = list.filter((e) => Number(e.qty) < 0).reduce((sum, e) => sum + Math.abs(Number(e.qty)), 0);
  const net = incoming - outgoing;

  return [
    { 
      label: language.t('recentMovements'), 
      value: numberFormatter.format(total.value),
      colorClass: 'text-dark'
    },
    { 
      label: language.t('stockReceived'), 
      value: `+${numberFormatter.format(incoming)}`, 
      colorClass: 'text-success' 
    },
    { 
      label: language.t('stockIssued'), 
      value: `-${numberFormatter.format(outgoing)}`, 
      colorClass: 'text-danger' 
    },
    {
      label: language.t('netChange') || 'Net change',
      value: `${net >= 0 ? '+' : ''}${numberFormatter.format(net)}`, 
      colorClass: 'text-primary'
    },
  ];
});
</script>

<style scoped>
.page-canvas {
  min-height: 100vh;
  background-color: #f8fafc;
}

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