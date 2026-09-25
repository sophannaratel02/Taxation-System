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
        <div class="row g-2">
          <div class="col-md-6">
            <div class="input-group">
              <span class="input-group-text bg-light border-end-0 text-muted">
                <i class="bi bi-search"></i>
              </span>
              <input
                v-model.trim="search"
                type="text"
                class="form-control border-start-0 ps-0"
                :placeholder="language.isKhmer ? 'ស្វែងរកទំនិញ ឬលេខយោង...' : 'Search item or reference...'"
              />
            </div>
          </div>

          <div class="col-md-4 col-lg-3">
            <select v-model="movementFilter" class="form-select">
              <option value="">{{ language.isKhmer ? 'ចលនាទាំងអស់' : 'All movements' }}</option>
              <option value="Sale">{{ language.t('stockIssued') }}</option>
              <option value="Purchase">{{ language.t('stockReceived') }}</option>
              <option value="Adjustment">{{ language.t('stockAdjustment') }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Invoices / Transactions Table -->
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-3">{{ language.t('date') }}</th>
              <th>{{ language.t('item') }}</th>
              <th>{{ language.t('movement') }}</th>
              <th class="text-end">{{ language.t('quantity') }}</th>
              <th class="text-end">{{ language.t('balance') }}</th>
              <th class="text-center pe-3">{{ language.t('reference') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in filteredMovements" :key="entry.id">
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
            <tr v-if="!filteredMovements.length">
              <td colspan="6" class="text-center py-5 text-muted">
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
const search = ref('');
const movementFilter = ref('');

const movements = computed(() => {
  const list = [...(tax.transactions || [])];
  return list.sort((a, b) => {
    const dateA = new Date(String(a.date || a.createdAt || '').replace(' ', 'T')).getTime() || 0;
    const dateB = new Date(String(b.date || b.createdAt || '').replace(' ', 'T')).getTime() || 0;
    return dateB - dateA;
  });
});

const numberFormatter = new Intl.NumberFormat(language.isKhmer ? 'km-KH' : 'en-US');

const filteredMovements = computed(() => {
  const query = search.value.toLowerCase();
  return movements.value.filter((entry) => {
    const matchesType = !movementFilter.value || String(entry.type || '').toLowerCase() === movementFilter.value.toLowerCase();
    const searchable = `${entry.item || entry.itemName || ''} ${entry.reference || entry.note || ''}`.toLowerCase();
    return matchesType && (!query || searchable.includes(query));
  });
});

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
      value: numberFormatter.format(list.length),
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