<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Header -->
    <header class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <div class="eyebrow mb-2">{{ t('Register & cash drawer', 'វេនលក់ និងថតប្រាក់') }}</div>
        <h1 class="h3 fw-bold mb-1">{{ t('Open / close register', 'បើក និងបិទវេនលក់') }}</h1>
        <p class="text-muted mb-0">
          {{ t('Record starting cash and reconcile the drawer at close.', 'រាប់សាច់ប្រាក់ដើម និងផ្ទៀងផ្ទាត់សាច់ប្រាក់ចុងវេន។') }}
        </p>
      </div>

      <span
        class="badge rounded-pill px-3 py-2"
        :class="isRegisterOpen ? 'text-bg-success' : 'text-bg-secondary'"
      >
        <i class="bi me-1" :class="isRegisterOpen ? 'bi-check-circle-fill' : 'bi-dash-circle'"></i>
        {{ isRegisterOpen ? t('Register open', 'កំពុងបើក') : t('Register closed', 'បិទ') }}
      </span>
    </header>

    <!-- Alerts -->
    <div
      v-if="error"
      class="alert alert-danger alert-dismissible fade show d-flex align-items-center"
      role="alert"
    >
      <i class="bi bi-exclamation-triangle-fill me-2 flex-shrink-0"></i>
      <div class="flex-grow-1">{{ error }}</div>
      <button type="button" class="btn-close" :aria-label="t('Close', 'បិទ')" @click="error = ''"></button>
    </div>

    <div
      v-if="result"
      class="alert alert-success alert-dismissible fade show d-flex align-items-center"
      role="status"
    >
      <i class="bi bi-check-circle-fill me-2 flex-shrink-0"></i>
      <div class="flex-grow-1">{{ result }}</div>
      <button type="button" class="btn-close" :aria-label="t('Close', 'បិទ')" @click="result = ''"></button>
    </div>

    <!-- Main Content -->
    <div class="row g-4">
      <!-- Drawer Action Panel -->
      <div class="col-lg-5">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body p-4">
            <h2 class="h5 fw-bold mb-3 d-flex align-items-center">
              <i class="bi bi-safe2 me-2 text-primary"></i>
              {{ isRegisterOpen ? t('Close cash drawer', 'បិទថតប្រាក់') : t('Open cash drawer', 'បើកថតប្រាក់') }}
            </h2>

            <div class="mb-3">
              <label class="form-label fw-semibold">{{ t('Branch', 'សាខា') }}</label>
              <select
                v-model="selectedBranch"
                class="form-select"
                :disabled="saving || !hasBranches"
                @change="onBranchChange"
              >
                <option v-for="option in branchOptions" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </div>

            <div v-if="!hasBranches" class="alert alert-warning py-2 small mb-3">
              <i class="bi bi-exclamation-circle me-1"></i>
              {{ t('No authorized branches are assigned to this account.', 'គណនីនេះមិនទាន់មានសាខាដែលបានអនុញ្ញាតទេ។') }}
            </div>

            <div class="mb-4">
              <label class="form-label fw-semibold">
                {{ isRegisterOpen ? t('Counted cash', 'សាច់ប្រាក់រាប់បាន') : t('Starting cash', 'សាច់ប្រាក់ដើម') }}
              </label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <input
                  v-model.number="cashAmount"
                  class="form-control"
                  type="number"
                  min="0"
                  step="0.01"
                  inputmode="decimal"
                  :placeholder="t('0.00', '0.00')"
                  :disabled="saving || !hasBranches"
                  @focus="$event.target.select()"
                />
              </div>
            </div>

            <button
              class="btn w-100 py-2 fw-semibold"
              :class="isRegisterOpen ? 'btn-danger' : 'btn-primary'"
              :disabled="isActionDisabled"
              @click="handleRegisterAction"
            >
              <span v-if="saving" class="spinner-border spinner-border-sm me-2" role="status"></span>
              {{ actionButtonText }}
            </button>
          </div>
        </div>
      </div>

      <!-- Current Shift Status -->
      <div class="col-lg-7">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body p-4 d-flex flex-column">
            <h2 class="h5 fw-bold mb-3">{{ t('Current shift status', 'ស្ថានភាពវេនបច្ចុប្បន្ន') }}</h2>

            <div v-if="loading" class="text-center py-5 text-muted">
              <span class="spinner-border spinner-border-sm me-2"></span>
              {{ t('Loading register status...', 'កំពុងផ្ទុកស្ថានភាពវេន...') }}
            </div>

            <div v-else-if="isRegisterOpen" class="row g-3">
              <div class="col-sm-6">
                <div class="border rounded-3 p-3 bg-light-subtle">
                  <small class="text-muted d-block mb-1">{{ t('Opened at', 'បើកនៅ') }}</small>
                  <div class="fw-semibold text-dark">{{ formatDate(register.opened_at) }}</div>
                </div>
              </div>
              <div class="col-sm-6">
                <div class="border rounded-3 p-3 bg-light-subtle">
                  <small class="text-muted d-block mb-1">{{ t('Starting cash', 'សាច់ប្រាក់ដើម') }}</small>
                  <div class="fw-semibold text-dark">${{ formatMoney(register.starting_cash) }}</div>
                </div>
              </div>
            </div>

            <div v-else class="text-muted py-4 d-flex align-items-center">
              <i class="bi bi-info-circle fs-5 me-2 text-primary"></i>
              <span>{{ t('Open a register before processing sales.', 'សូមបើកវេនមុនពេលលក់។') }}</span>
            </div>

            <hr class="mt-auto mb-3" />
            <p class="small text-muted mb-0">
              {{ t(
                'X-Report shows the current shift totals. Z-Report is created when the drawer is closed and records any cash variance.',
                'របាយការណ៍ X បង្ហាញចំនួនសរុបនៃវេនបច្ចុប្បន្ន។ របាយការណ៍ Z ត្រូវបានបង្កើតនៅពេលបិទថតប្រាក់ និងកត់ត្រាភាពខុសគ្នានៃសាច់ប្រាក់។'
              ) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '@/services/api';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';
import { confirmDialog } from '@/utils/dialog';

const taxStore = useTaxStore();
const languageStore = useLanguageStore();

// Localization helper
const t = (english, khmer) => (languageStore.isKhmer ? khmer : english);

// Branch options computed
const branchOptions = computed(() => {
  const branches = taxStore.settings?.availableBranches;
  if (Array.isArray(branches) && branches.length > 0) return branches;
  return taxStore.settings?.branch ? [taxStore.settings.branch] : ['Head Quarter'];
});

const hasBranches = computed(() => branchOptions.value.length > 0);

// Component State
const selectedBranch = ref(taxStore.settings?.branch || branchOptions.value[0] || '');
const cashAmount = ref(0);
const register = ref(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const result = ref('');

let activeRequestId = 0;

// Computed Properties
const isRegisterOpen = computed(() => Boolean(register.value));

const isActionDisabled = computed(() => {
  return saving.value || loading.value || !selectedBranch.value || !hasBranches.value;
});

const actionButtonText = computed(() => {
  if (isRegisterOpen.value) {
    return t('Close & create Z-Report', 'បិទវេន និងបង្កើត Z-Report');
  }
  return t('Open register', 'បើកវេនលក់');
});

// Utilities
function formatMoney(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function sanitizeAmount(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : 0;
}

// Data Fetching
async function fetchCurrentRegister(branchName) {
  if (!branchName) {
    register.value = null;
    return;
  }

  const requestId = ++activeRequestId;
  loading.value = true;
  error.value = '';

  try {
    const current = await api.currentRegister(branchName);
    if (requestId === activeRequestId) {
      register.value = current;
    }
  } catch (err) {
    if (requestId === activeRequestId) {
      error.value = err.message || t('Failed to load register state.', 'មិនអាចទាញយកស្ថានភាពវេនលក់បានទេ។');
      register.value = null;
    }
  } finally {
    if (requestId === activeRequestId) {
      loading.value = false;
    }
  }
}

// User Actions
function onBranchChange() {
  cashAmount.value = 0;
  result.value = '';
  error.value = '';
  fetchCurrentRegister(selectedBranch.value);
}

async function handleRegisterAction() {
  if (isRegisterOpen.value) {
    await closeRegister();
  } else {
    await openRegister();
  }
}

async function openRegister() {
  saving.value = true;
  error.value = '';
  result.value = '';

  const cleanCash = sanitizeAmount(cashAmount.value);

  try {
    const response = await api.openRegister({
      branch: selectedBranch.value,
      startingCash: cleanCash,
    });
    register.value = response;
    cashAmount.value = 0;
    result.value = t('Register opened successfully.', 'វេនត្រូវបានបើកដោយជោគជ័យ។');
  } catch (err) {
    error.value = err.message || t('Failed to open register.', 'មិនអាចបើកវេនបានទេ។');
  } finally {
    saving.value = false;
  }
}

async function closeRegister() {
  const confirmed = await confirmDialog({
    title: t('Close register', 'បិទវេនលក់'),
    message: t('Close this register?', 'បិទវេនលក់នេះមែនទេ?'),
    variant: 'warning',
    confirmText: t('Close', 'បិទ'),
  });

  if (!confirmed) return;

  saving.value = true;
  error.value = '';
  result.value = '';

  const cleanCash = sanitizeAmount(cashAmount.value);

  try {
    const report = await api.closeRegister({
      branch: selectedBranch.value,
      countedCash: cleanCash,
    });
    register.value = null;
    cashAmount.value = 0;
    result.value = `${t('Z-Report complete. Cash variance', 'Z-Report រួចរាល់។ ភាពខុសគ្នា')}: $${formatMoney(report?.variance)}`;
  } catch (err) {
    error.value = err.message || t('Failed to close register.', 'មិនអាចបិទវេនបានទេ។');
  } finally {
    saving.value = false;
  }
}

// Synchronize branch selection with store changes safely
watch(
  branchOptions,
  (branches) => {
    if (!branches.length) {
      selectedBranch.value = '';
      register.value = null;
      return;
    }
    if (!branches.includes(selectedBranch.value)) {
      selectedBranch.value = branches.includes(taxStore.settings?.branch)
        ? taxStore.settings.branch
        : branches[0];
      onBranchChange();
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (selectedBranch.value) {
    fetchCurrentRegister(selectedBranch.value);
  }
});
</script>

<style scoped>
.page-canvas {
  max-width: 1400px;
}

.eyebrow {
  color: #19724f;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.card {
  transition: transform 0.15s ease-in-out;
}
</style>