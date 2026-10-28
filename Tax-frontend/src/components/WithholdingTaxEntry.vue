<template>
  <section class="wht-workspace">
    <header class="wht-header">
      <div>
        <div class="eyebrow">GDT FORM WT 003</div>
        <h2 class="h5 mb-1">{{ text('Withholding tax items', 'ធាតុពន្ធកាត់ទុក') }}</h2>
        <p class="text-muted small mb-0">
          {{ text('Choose the payment object. The statutory rate is applied automatically.', 'ជ្រើសរើសប្រភេទការទូទាត់។ អត្រាពន្ធតាមច្បាប់នឹងត្រូវបានអនុវត្តដោយស្វ័យប្រវត្តិ។') }}
        </p>
      </div>
      <button 
        class="btn btn-outline-primary btn-sm" 
        type="button" 
        :disabled="!isDraft || saving" 
        @click="addRow"
      >
        <i class="bi bi-plus-lg me-1"></i>{{ text('Add row', 'បន្ថែមជួរ') }}
      </button>
    </header>

    <div v-if="validationError" class="alert alert-danger py-2 m-3 mb-0" role="alert">
      {{ validationError }}
    </div>

    <form @submit.prevent="submitRows">
      <datalist id="wt003-payment-object-options">
        <option 
          v-for="option in objects" 
          :key="option.object_code" 
          :value="option.description"
        >
          {{ option.category ? option.category.replace('_', ' ') : '' }} · {{ rateLabel(option.default_tax_rate) }}
        </option>
      </datalist>

      <div class="table-responsive wht-table-wrap">
        <table class="table align-middle wht-table mb-0">
          <thead>
            <tr>
              <th>{{ text('Object of payment', 'ប្រភេទការទូទាត់') }}</th>
              <th class="text-end">{{ text('Base amount (KHR)', 'មូលដ្ឋានគិតពន្ធ (KHR)') }}</th>
              <th class="text-end">{{ text('Tax rate (%)', 'អត្រាពន្ធ (%)') }}</th>
              <th class="text-end">{{ text('Withholding tax (KHR)', 'ពន្ធកាត់ទុក (KHR)') }}</th>
              <th>{{ text('Remarks / recipient TIN / reference', 'កំណត់សម្គាល់ / លេខអត្តសញ្ញាណពន្ធ / ឯកសារយោង') }}</th>
              <th class="text-end actions-column">{{ text('Actions', 'សកម្មភាព') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in draftRows" :key="row._key">
              <td class="object-cell">
                <input 
                  v-model.trim="row.object_label" 
                  class="form-control form-control-sm" 
                  type="text" 
                  list="wt003-payment-object-options" 
                  :disabled="!isDraft || saving" 
                  required 
                  :aria-label="`${text('Object of payment', 'ប្រភេទការទូទាត់')}, ${text('row', 'ជួរ')} ${index + 1}`" 
                  :placeholder="text('Type or choose a GDT payment object', 'វាយ ឬជ្រើសរើសប្រភេទការទូទាត់របស់ GDT')" 
                  @input="syncObject(row)" 
                />
              </td>
              <td>
                <input 
                  v-model.number="row.base_amount" 
                  class="form-control form-control-sm amount-input" 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  inputmode="decimal" 
                  required 
                  :disabled="!isDraft || saving" 
                  :aria-label="`${text('Base amount', 'មូលដ្ឋានគិតពន្ធ')}, ${text('row', 'ជួរ')} ${index + 1}`" 
                  @input="validationError = ''" 
                />
              </td>
              <td>
                <input 
                  v-model.number="row.tax_rate_percent" 
                  class="form-control form-control-sm rate-input" 
                  type="number" 
                  min="0" 
                  max="100" 
                  step="0.01" 
                  required 
                  :disabled="!isDraft || saving" 
                  :aria-label="`${text('Tax rate percent', 'អត្រាពន្ធជាភាគរយ')}, ${text('row', 'ជួរ')} ${index + 1}`" 
                  @input="validationError = ''"
                />
              </td>
              <td class="text-end tax-cell">{{ money(withholdingFor(row)) }}</td>
              <td>
                <input 
                  v-model.trim="row.remarks" 
                  class="form-control form-control-sm" 
                  type="text" 
                  maxlength="5000" 
                  :disabled="!isDraft || saving" 
                  :aria-label="`${text('Remarks', 'កំណត់សម្គាល់')}, ${text('row', 'ជួរ')} ${index + 1}`" 
                  :placeholder="text('TIN, invoice or note', 'លេខអត្តសញ្ញាណពន្ធ វិក្កយបត្រ ឬកំណត់សម្គាល់')" 
                />
              </td>
              <td class="text-end text-nowrap actions-column">
                <button 
                  class="btn btn-sm btn-light" 
                  type="button" 
                  :disabled="!isDraft || saving" 
                  :title="text('Duplicate row', 'ចម្លងជួរ')" 
                  :aria-label="`${text('Duplicate row', 'ចម្លងជួរ')} ${index + 1}`" 
                  @click="duplicateRow(index)"
                >
                  <i class="bi bi-copy"></i>
                </button>
                <button 
                  class="btn btn-sm btn-light text-danger ms-1" 
                  type="button" 
                  :disabled="!isDraft || saving" 
                  :title="text('Delete row', 'លុបជួរ')" 
                  :aria-label="`${text('Delete row', 'លុបជួរ')} ${index + 1}`" 
                  @click="deleteRow(index)"
                >
                  <i class="bi bi-trash3"></i>
                </button>
              </td>
            </tr>
            <tr v-if="draftRows.length === 0">
              <td colspan="6" class="empty-state">
                {{ text('No WHT payment rows. Add a row to enter a withholding item.', 'មិនមានជួរការទូទាត់ពន្ធកាត់ទុកទេ។ បន្ថែមជួរដើម្បីបញ្ចូលធាតុពន្ធកាត់ទុក។') }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th>{{ text('Total', 'សរុប') }}</th>
              <th class="text-end">{{ money(totalBase) }}</th>
              <th></th>
              <th class="text-end total-tax">{{ money(totalTax) }}</th>
              <th colspan="2">KHR</th>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer class="wht-footer">
        <div class="small text-muted">
          {{ draftRows.length }} {{ draftRows.length === 1 ? text('line item', 'ធាតុ') : text('line items', 'ធាតុ') }}
        </div>
        <button class="btn btn-primary" type="submit" :disabled="!isDraft || saving">
          <i class="bi bi-floppy me-1"></i>
          {{ saving ? text('Saving rows...', 'កំពុងរក្សាទុកជួរ...') : text('Save WHT items', 'រក្សាទុកធាតុពន្ធកាត់ទុក') }}
        </button>
      </footer>
    </form>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useLanguageStore } from '../stores/language.js';

const language = useLanguageStore();
const text = (english, khmer) => (language.isKhmer ? khmer : english);

const props = defineProps({
  rows: { type: Array, default: () => [] },
  objects: { type: Array, default: () => [] },
  isDraft: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['save-items']);

const draftRows = ref([]);
const validationError = ref('');
let rowSequence = 0;

function makeRow(item = {}) {
  let rate = '';
  if (item.tax_rate_percent !== undefined && item.tax_rate_percent !== null && item.tax_rate_percent !== '') {
    rate = Number(item.tax_rate_percent);
  } else if (item.tax_rate !== undefined && item.tax_rate !== null && item.tax_rate !== '') {
    rate = Number((Number(item.tax_rate) * 100).toFixed(2));
  }

  return {
    _key: `wht-row-${++rowSequence}`,
    id: item.id || null,
    object_label: item.object_description || item.object_label || '',
    tax_object_code: item.tax_object_code || '',
    tax_rate_percent: rate,
    base_amount: item.base_amount !== undefined && item.base_amount !== null ? item.base_amount : '',
    remarks: item.remarks || '',
  };
}

watch(
  () => props.rows,
  (rows) => {
    draftRows.value = rows?.length ? rows.map((row) => makeRow(row)) : [makeRow()];
  },
  { immediate: true }
);

function selectedObject(row) {
  return props.objects.find((item) => item.object_code === row.tax_object_code);
}

function rateFor(row) {
  const ratePercent = Number(row.tax_rate_percent);
  return Number.isFinite(ratePercent) ? ratePercent / 100 : 0;
}

function rateLabel(rate) {
  return `${Number((Number(rate || 0) * 100).toFixed(2))}%`;
}

function withholdingFor(row) {
  const base = Number(row.base_amount);
  const rate = rateFor(row);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return Math.round(base * rate * 100) / 100;
}

function syncObject(row) {
  validationError.value = '';
  const query = (row.object_label || '').trim().toLowerCase();
  if (!query) {
    row.tax_object_code = '';
    return;
  }

  const match = props.objects.find(
    (item) =>
      item.description.trim().toLowerCase() === query ||
      item.object_code.trim().toLowerCase() === query
  );

  if (match) {
    row.tax_object_code = match.object_code;
    row.object_label = match.description;
    row.tax_rate_percent = Number((Number(match.default_tax_rate) * 100).toFixed(2));
  } else {
    row.tax_object_code = '';
  }
}

const totalBase = computed(() => {
  const sumCents = draftRows.value.reduce((total, row) => {
    const val = Number(row.base_amount);
    return total + (Number.isFinite(val) && val > 0 ? Math.round(val * 100) : 0);
  }, 0);
  return sumCents / 100;
});

const totalTax = computed(() => {
  const sumCents = draftRows.value.reduce((total, row) => {
    return total + Math.round(withholdingFor(row) * 100);
  }, 0);
  return sumCents / 100;
});

function money(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function addRow() {
  validationError.value = '';
  draftRows.value.push(makeRow());
}

function duplicateRow(index) {
  validationError.value = '';
  const row = draftRows.value[index];
  draftRows.value.splice(index + 1, 0, makeRow({ ...row, id: null }));
}

function deleteRow(index) {
  validationError.value = '';
  draftRows.value.splice(index, 1);
}

function submitRows() {
  validationError.value = '';

  if (draftRows.value.length === 0) {
    validationError.value = text(
      'Please add at least one line item.',
      'សូមបន្ថែមយ៉ាងហោចណាស់ធាតុមួយ។'
    );
    return;
  }

  const invalidIndex = draftRows.value.findIndex((row) => {
    const amountText = String(row.base_amount ?? '').trim();
    const baseNum = Number(amountText);
    const rateNum = Number(row.tax_rate_percent);

    return (
      !row.tax_object_code ||
      !selectedObject(row) ||
      !/^\d{1,16}(?:\.\d{1,2})?$/.test(amountText) ||
      !Number.isFinite(baseNum) ||
      baseNum < 0 ||
      !Number.isFinite(rateNum) ||
      rateNum < 0 ||
      rateNum > 100
    );
  });

  if (invalidIndex !== -1) {
    validationError.value = text(
      `Complete the payment object, valid amount (up to 2 decimals), and rate (0–100%) on row ${invalidIndex + 1}.`,
      `សូមបំពេញប្រភេទការទូទាត់ ចំនួនទឹកប្រាក់ត្រឹមត្រូវ (រហូតដល់ខ្ទង់ទសភាគពីរ) និងអត្រា (0–100%) នៅជួរ ${invalidIndex + 1}។`
    );
    return;
  }

  emit(
    'save-items',
    draftRows.value.map(({ id, tax_object_code, base_amount, tax_rate_percent, remarks }) => ({
      id,
      tax_object_code,
      base_amount: Number(base_amount),
      tax_rate_percent: Number(tax_rate_percent),
      remarks: (remarks || '').trim(),
    }))
  );
}
</script>

<style scoped>
.wht-workspace {
  border: 1px solid #dce5df;
  background: #fff;
  border-radius: 4px;
}
.wht-header,
.wht-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
}
.wht-header {
  border-bottom: 1px solid #e2e9e4;
}
.eyebrow {
  color: #19724f;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.wht-table-wrap {
  max-height: min(62vh, 680px);
}
.wht-table {
  min-width: 980px;
}
.wht-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f3f7f4;
  color: #53635a;
  font-size: 0.72rem;
  white-space: nowrap;
}
.wht-table tbody td {
  padding: 0.55rem 0.5rem;
}
.wht-table tfoot th {
  padding: 0.8rem 0.5rem;
  background: #edf4ef;
  border-top: 1px solid #d5e2d8;
  font-size: 0.86rem;
}
.object-cell {
  min-width: 290px;
}
.amount-input {
  min-width: 145px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rate-input {
  min-width: 95px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.tax-cell,
.total-tax {
  color: #155e41;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.actions-column {
  min-width: 92px;
}
.empty-state {
  padding: 2.4rem !important;
  color: #718077;
  text-align: center;
}
.wht-footer {
  border-top: 1px solid #e2e9e4;
}
@media (max-width: 600px) {
  .wht-header,
  .wht-footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .wht-header .btn,
  .wht-footer .btn {
    width: 100%;
  }
}
</style>