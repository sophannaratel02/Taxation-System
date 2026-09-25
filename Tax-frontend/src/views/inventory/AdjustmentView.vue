<template>
  <section class="container-fluid p-4 page-canvas adjustment-page">
    <!-- Executive Header Hero -->
    <div class="adjustment-hero p-4 mb-4 rounded-4 shadow-sm bg-white border position-relative overflow-hidden">
      <div class="hero-glow"></div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 position-relative z-1">
        <div>
          <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-primary-subtle text-primary small fw-semibold mb-2">
            <i class="bi bi-box-arrow-in-down-right"></i>
            <span>{{ language.isKhmer ? 'ការគ្រប់គ្រងស្តុក' : 'Inventory & Stock Control' }}</span>
            <span class="text-muted">·</span>
            <span>Audit Trail Engine</span>
          </div>
          <h1 class="h3 fw-bold text-dark mb-1 tracking-tight">
            {{ language.t('stockAdjustment') }}
          </h1>
          <p class="text-muted mb-0">
            {{ language.isKhmer 
              ? 'កត់ត្រាការកែតម្រូវបរិមាណស្តុកជាក់ស្តែង រក្សាទុក Audit Trail និងតាមដានចលនាស្តុក។' 
              : 'Post physical inventory variances, reconcile counts, and maintain an auditable transaction trail.' 
            }}
          </p>
        </div>

        <div class="d-flex align-items-center gap-2">
          <span class="badge rounded-pill bg-light text-secondary border px-3 py-2">
            <i class="bi bi-shield-check text-success me-1"></i>Strict Audit Mode
          </span>
        </div>
      </div>
    </div>

    <!-- Main Adjustment Form & History Grid -->
    <div class="row g-4">
      <!-- 1. Left: Adjustment Execution Form (5 Cols) -->
      <div class="col-lg-5">
        <form class="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white" @submit.prevent="submit">
          <div class="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
            <div class="form-title-icon bg-primary-subtle text-primary rounded-3">
              <i class="bi bi-sliders"></i>
            </div>
            <div>
              <h6 class="fw-bold mb-0 text-dark">
                {{ language.isKhmer ? 'បែបបទកែតម្រូវស្តុក' : 'Post Stock Variance' }}
              </h6>
              <small class="text-muted">
                {{ language.isKhmer ? 'បញ្ចូលទិន្នន័យជាក់ស្តែង' : 'Adjust physical count up or down' }}
              </small>
            </div>
          </div>

          <!-- Item Select -->
          <div class="mb-3">
            <label class="form-label small fw-semibold text-secondary">
              {{ language.t('item') }} <span class="text-danger">*</span>
            </label>
            <div class="input-group">
              <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-box-seam"></i></span>
              <select v-model="form.itemId" class="form-select border-start-0" required>
                <option disabled value="">
                  {{ language.isKhmer ? '-- សូមជ្រើសរើសមុខទំនិញ --' : '-- Select an item --' }}
                </option>
                <option v-for="item in tax.items" :key="item.id" :value="item.id">
                  {{ getItemDisplayName(item) }}
                  ({{ language.isKhmer ? 'នៅសល់' : 'Stock' }}: {{ item.qtyOnHand ?? 0 }} {{ item.baseUnit || item.unit || '' }})
                </option>
              </select>
            </div>
          </div>

          <!-- Live Count Preview Card -->
          <div v-if="selectedItem" class="p-3 mb-3 bg-light rounded-3 border">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="small text-muted">{{ language.isKhmer ? 'ស្តុកបច្ចុប្បន្ន' : 'Current On Hand' }}:</span>
              <strong class="font-monospace text-dark fs-6">{{ selectedItem.qtyOnHand ?? 0 }} {{ selectedItemUnit }}</strong>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="small text-muted">{{ language.isKhmer ? 'បំរែបំរួល' : 'Adjustment' }}:</span>
              <span 
                class="font-monospace fw-bold"
                :class="form.quantity > 0 ? 'text-success' : form.quantity < 0 ? 'text-danger' : 'text-muted'"
              >
                {{ form.quantity > 0 ? '+' : '' }}{{ form.quantity || 0 }} {{ selectedItemUnit }}
              </span>
            </div>
            <div class="d-flex justify-content-between align-items-center pt-2 mt-2 border-top">
              <span class="small fw-semibold text-dark">{{ language.isKhmer ? 'ស្តុកថ្មីក្រោយកែសម្រួល' : 'Projected Stock' }}:</span>
              <span 
                class="font-monospace fw-bold fs-6"
                :class="projectedQty < 0 ? 'text-danger' : 'text-primary'"
              >
                {{ projectedQty }} {{ selectedItemUnit }}
              </span>
            </div>
          </div>

          <!-- Quantity Input -->
          <div class="mb-3">
            <label class="form-label small fw-semibold text-secondary">
              {{ language.isKhmer ? 'បរិមាណកែតម្រូវ (+ / -)' : 'Adjustment Quantity (+ / -)' }}
              <span class="text-danger">*</span>
            </label>
            <div class="input-group">
              <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-plus-slash-minus"></i></span>
              <input
                v-model.number="form.quantity"
                type="number"
                class="form-control border-start-0 font-monospace fw-semibold"
                :placeholder="language.isKhmer ? 'ឧ. +5 ឬ -3' : 'e.g. +5 or -3'"
                required
              />
              <span class="input-group-text bg-light text-muted small">
                {{ selectedItemUnit }}
              </span>
            </div>
            <div class="form-text small text-muted mt-1">
              {{ language.isKhmer 
                ? 'បញ្ចូលលេខវិជ្ជមាន (+) ដើម្បីបន្ថែមស្តុក ឬលេខអវិជ្ជមាន (-) ដើម្បីបន្ថយស្តុក។' 
                : 'Use positive (+) to increment stock, negative (-) to write-off/deduct.' 
              }}
            </div>
          </div>

          <!-- Reason / Reference & Quick Presets -->
          <div class="mb-4">
            <label class="form-label small fw-semibold text-secondary">
              {{ language.isKhmer ? 'មូលហេតុ ឬលេខយោង' : 'Reason / Reference Note' }}
              <span class="text-danger">*</span>
            </label>
            <input
              v-model.trim="form.note"
              type="text"
              class="form-control mb-2"
              :placeholder="language.isKhmer ? 'ឧ. ខូចខាត, រាប់លើស, ផុតកំណត់...' : 'e.g. Damaged, count variance, expired...'"
              required
            />

            <!-- Preset Buttons -->
            <div class="d-flex flex-wrap gap-1">
              <button
                v-for="preset in reasonPresets"
                :key="preset.en"
                type="button"
                class="btn btn-sm btn-light border small-preset"
                @click="form.note = (language.isKhmer ? preset.kh : preset.en)"
              >
                {{ language.isKhmer ? preset.kh : preset.en }}
              </button>
            </div>
          </div>

          <!-- Action Button -->
          <button
            class="btn btn-primary w-100 py-2 fw-semibold rounded-3 shadow-sm pulse-btn mt-auto"
            type="submit"
            :disabled="isSubmitting || !form.quantity || !form.itemId"
          >
            <span
              v-if="isSubmitting"
              class="spinner-border spinner-border-sm me-2"
              role="status"
              aria-hidden="true"
            ></span>
            <i v-else class="bi bi-check2-circle me-1"></i>
            {{ isSubmitting 
              ? (language.isKhmer ? 'កំពុងកត់ត្រា...' : 'Saving...') 
              : (language.isKhmer ? 'កត់ត្រាការកែសម្រួល' : 'Post Adjustment') 
            }}
          </button>

          <!-- Feedback Alerts -->
          <div v-if="success" class="alert alert-success mt-3 mb-0 py-2 d-flex align-items-center rounded-3">
            <i class="bi bi-check-circle-fill me-2 fs-5"></i>
            <div>{{ language.isKhmer ? 'បានកែសម្រួលស្តុកជោគជ័យ!' : 'Stock adjusted successfully!' }}</div>
          </div>
          <div v-if="errorMessage" class="alert alert-danger mt-3 mb-0 py-2 d-flex align-items-center rounded-3">
            <i class="bi bi-exclamation-triangle-fill me-2 fs-5"></i>
            <div>{{ errorMessage }}</div>
          </div>
        </form>
      </div>

      <!-- 2. Right: Movement Audit Table (7 Cols) -->
      <div class="col-lg-7">
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden h-100 bg-white">
          <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
            <div>
              <strong class="fs-6 text-dark d-block">
                {{ language.t('transactionHistory') }}
              </strong>
              <small class="text-muted">
                {{ language.isKhmer ? 'កំណត់ហេតុចលនាស្តុក និងការកែសម្រួល' : 'Immutable inventory movement ledger' }}
              </small>
            </div>
            <span class="badge bg-light text-dark border px-3 py-2">
              {{ (tax.transactions || []).length }} {{ language.isKhmer ? 'ប្រតិបត្តិការ' : 'Records' }}
            </span>
          </div>

          <div class="table-responsive">
            <table class="table align-middle table-hover mb-0 modern-table">
              <thead class="table-light border-0">
                <tr>
                  <th class="ps-4">{{ language.isKhmer ? 'កាលបរិច្ឆេទ' : 'Date' }}</th>
                  <th>{{ language.t('item') }}</th>
                  <th>{{ language.isKhmer ? 'ប្រភេទ' : 'Type' }}</th>
                  <th class="text-end">{{ language.t('quantity') }}</th>
                  <th class="pe-4">{{ language.isKhmer ? 'យោង / មូលហេតុ' : 'Reference Note' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in (tax.transactions || []).slice(0, 10)" :key="row.id">
                  <td class="ps-4 text-nowrap small text-muted font-monospace">
                    {{ formatDate(row.date) }}
                  </td>
                  <td>
                    <span class="fw-bold text-dark d-block">{{ row.item || row.itemName || '-' }}</span>
                  </td>
                  <td>
                    <span
                      class="badge rounded-pill px-3 py-1 font-monospace small"
                      :class="row.type === 'ADJUSTMENT' ? 'bg-warning-subtle text-warning-emphasis' : 'bg-light text-secondary border'"
                    >
                      {{ row.type || 'Movement' }}
                    </span>
                  </td>
                  <td class="text-end font-monospace fw-bold fs-6">
                    <span :class="(row.qty || 0) < 0 ? 'text-danger' : 'text-success'">
                      {{ (row.qty || 0) > 0 ? '+' : '' }}{{ row.qty }}
                    </span>
                  </td>
                  <td class="pe-4 small text-muted text-truncate" style="max-width: 170px;" :title="row.reference || row.note">
                    <i class="bi bi-chat-left-text me-1 text-secondary opacity-75"></i>
                    <router-link
                      v-if="isInvoiceReference(row.reference || row.note)"
                      :to="{ name: 'InvoiceDetail', params: { id: row.reference || row.note }, query: { from: '/inventory/adjustments' } }"
                      class="text-primary text-decoration-none font-monospace fw-semibold"
                    >
                      #{{ row.reference || row.note }}
                    </router-link>
                    <template v-else>{{ row.reference || row.note || '-' }}</template>
                  </td>
                </tr>

                <tr v-if="!(tax.transactions || []).length">
                  <td colspan="5" class="text-center text-muted py-5">
                    <div class="my-4">
                      <i class="bi bi-clock-history fs-1 text-secondary opacity-50 d-block mb-2"></i>
                      <h6 class="fw-bold text-dark">{{ language.t('noRecords') }}</h6>
                      <p class="small text-muted mb-0">
                        {{ language.isKhmer ? 'មិនទាន់មានកំណត់ត្រាចលនាស្តុកនៅឡើយទេ។' : 'No stock movements recorded yet.' }}
                      </p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();

const success = ref(false);
const errorMessage = ref('');
const isSubmitting = ref(false);

const form = reactive({
  itemId: '',
  quantity: null,
  note: ''
});

const reasonPresets = [
  { en: 'Damaged item', kh: 'ទំនិញខូចខាត' },
  { en: 'Physical count variance', kh: 'រាប់ស្តុកជាក់ស្តែងឃើញខុស' },
  { en: 'Expired product', kh: 'ទំនិញផុតកំណត់' },
  { en: 'Return to vendor', kh: 'បង្វិលសងអ្នកផ្គត់ផ្គង់' }
];

const selectedItem = computed(() => {
  return (tax.items || []).find((i) => String(i.id) === String(form.itemId));
});

const selectedItemUnit = computed(() => {
  return selectedItem.value?.baseUnit || selectedItem.value?.unit || (language.isKhmer ? 'ឯកតា' : 'units');
});

const projectedQty = computed(() => {
  const current = Number(selectedItem.value?.qtyOnHand || 0);
  const delta = Number(form.quantity || 0);
  return current + delta;
});

function getItemDisplayName(item) {
  if (language.isKhmer && (item.nameKh || item.nameKm)) {
    return item.nameKh || item.nameKm;
  }
  return item.nameEn || item.name || 'Unnamed item';
}

function formatDate(val) {
  if (!val) return '-';
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? val : d.toLocaleDateString('en-GB');
}

function isInvoiceReference(reference) {
  return /^INV-[A-Z0-9-]+$/i.test(String(reference || '').trim());
}

// Auto-select first item when store items finish loading
watch(
  () => tax.items,
  (newItems) => {
    if (newItems && newItems.length > 0 && !form.itemId) {
      form.itemId = newItems[0].id;
    }
  },
  { immediate: true }
);

async function submit() {
  const qty = Number(form.quantity);

  if (!qty || qty === 0) {
    errorMessage.value = language.isKhmer
      ? 'បរិមាណកែតម្រូវមិនអាចស្មើ 0 បានទេ!'
      : 'Adjustment quantity cannot be 0.';
    return;
  }

  const targetItem = selectedItem.value;

  // Validate to prevent unintended negative stock
  if (targetItem && qty < 0 && (targetItem.qtyOnHand || 0) + qty < 0) {
    errorMessage.value = language.isKhmer
      ? `មិនអាចកាត់ស្តុកលើសពីចំនួនដែលមានទេ (នៅសល់: ${targetItem.qtyOnHand || 0})!`
      : `Cannot reduce stock below 0 (Current on hand: ${targetItem.qtyOnHand || 0}).`;
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    if (typeof tax.adjustStock === 'function') {
      await tax.adjustStock(form.itemId, qty, form.note);
    } else {
      // Local reactive fallback
      if (targetItem) {
        targetItem.qtyOnHand = (targetItem.qtyOnHand || 0) + qty;
      }
      if (Array.isArray(tax.transactions)) {
        tax.transactions.unshift({
          id: Date.now(),
          date: new Date().toISOString().split('T')[0],
          item: getItemDisplayName(targetItem),
          type: 'ADJUSTMENT',
          qty: qty,
          reference: form.note
        });
      }
    }

    // Reset Form
    form.quantity = null;
    form.note = '';
    success.value = true;

    window.clearTimeout(submit.timer);
    submit.timer = window.setTimeout(() => {
      success.value = false;
    }, 2500);
  } catch (err) {
    errorMessage.value = err?.message || (
      language.isKhmer 
        ? 'មានបញ្ហាបច្ចេកទេសក្នុងការកែតម្រូវស្តុក!' 
        : 'Failed to record stock adjustment.'
    );
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.adjustment-page {
  min-height: 100vh;
  background-color: #f8fafc;
}

.adjustment-hero {
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

.pulse-btn {
  box-shadow: 0 4px 14px rgba(13, 110, 253, 0.28);
}

.form-title-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
}

.small-preset {
  font-size: 0.75rem;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
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
</style>