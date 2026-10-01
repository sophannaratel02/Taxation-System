<template>
  <section class="wht-workspace">
    <header class="wht-header">
      <div>
        <div class="eyebrow">GDT FORM WT 003</div>
        <h2 class="h5 mb-1">Withholding tax items</h2>
        <p class="text-muted small mb-0">Choose the payment object. The statutory rate is applied automatically.</p>
      </div>
      <button class="btn btn-outline-primary btn-sm" type="button" :disabled="!isDraft" @click="addRow">
        <i class="bi bi-plus-lg me-1"></i>Add row
      </button>
    </header>

    <div v-if="validationError" class="alert alert-danger py-2" role="alert">{{ validationError }}</div>
    <form @submit.prevent="submitRows">
      <datalist id="wt003-payment-object-options">
        <option v-for="option in objects" :key="option.object_code" :value="option.description">{{ option.category.replace('_', ' ') }} · {{ rateLabel(option.default_tax_rate) }}</option>
      </datalist>
      <div class="table-responsive wht-table-wrap">
        <table class="table align-middle wht-table mb-0">
          <thead>
            <tr>
              <th>Object of payment</th>
              <th class="text-end">Base amount (KHR)</th>
              <th class="text-end">Tax rate (%)</th>
              <th class="text-end">Withholding tax (KHR)</th>
              <th>Remarks / recipient TIN / reference</th>
              <th class="text-end actions-column">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in draftRows" :key="row._key">
              <td class="object-cell">
                <input v-model.trim="row.object_label" class="form-control form-control-sm" type="text" list="wt003-payment-object-options" :disabled="!isDraft" required :aria-label="`Object of payment, row ${index + 1}`" placeholder="Type or choose a GDT payment object" @input="syncObject(row)" />
              </td>
              <td>
                <input v-model.number="row.base_amount" class="form-control form-control-sm amount-input" type="number" min="0" step="0.01" inputmode="decimal" required :disabled="!isDraft" :aria-label="`Base amount, row ${index + 1}`" @input="validationError = ''" />
              </td>
              <td><input v-model.number="row.tax_rate_percent" class="form-control form-control-sm rate-input" type="number" min="0" max="100" step="0.01" required :disabled="!isDraft" :aria-label="`Tax rate percent, row ${index + 1}`" /></td>
              <td class="text-end tax-cell">{{ money(withholdingFor(row)) }}</td>
              <td><input v-model.trim="row.remarks" class="form-control form-control-sm" type="text" maxlength="5000" :disabled="!isDraft" :aria-label="`Remarks, row ${index + 1}`" placeholder="TIN, invoice or note" /></td>
              <td class="text-end text-nowrap actions-column">
                <button class="btn btn-sm btn-light" type="button" :disabled="!isDraft" title="Duplicate row" :aria-label="`Duplicate row ${index + 1}`" @click="duplicateRow(index)"><i class="bi bi-copy"></i></button>
                <button class="btn btn-sm btn-light text-danger ms-1" type="button" :disabled="!isDraft" title="Delete row" :aria-label="`Delete row ${index + 1}`" @click="deleteRow(index)"><i class="bi bi-trash3"></i></button>
              </td>
            </tr>
            <tr v-if="draftRows.length === 0"><td colspan="6" class="empty-state">No WHT payment rows. Add a row to enter a withholding item.</td></tr>
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th class="text-end">{{ money(totalBase) }}</th>
              <th></th>
              <th class="text-end total-tax">{{ money(totalTax) }}</th>
              <th colspan="2">KHR</th>
            </tr>
          </tfoot>
        </table>
      </div>
      <footer class="wht-footer">
        <div class="small text-muted">{{ draftRows.length }} {{ draftRows.length === 1 ? 'line item' : 'line items' }}</div>
        <button class="btn btn-primary" type="submit" :disabled="!isDraft || saving">
          <i class="bi bi-floppy me-1"></i>{{ saving ? 'Saving rows...' : 'Save WHT items' }}
        </button>
      </footer>
    </form>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

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
  return {
    _key: `wht-row-${++rowSequence}`,
    id: item.id || null,
    object_label: item.object_description || item.object_label || '',
    tax_object_code: item.tax_object_code || '',
    tax_rate_percent: item.tax_rate_percent === undefined
      ? (item.tax_rate === undefined ? '' : Number((Number(item.tax_rate) * 100).toFixed(2)))
      : Number(item.tax_rate_percent),
    base_amount: item.base_amount === undefined ? '' : Number(item.base_amount),
    remarks: item.remarks || '',
  };
}

watch(() => props.rows, (rows) => {
  draftRows.value = rows.length ? rows.map((row) => makeRow(row)) : [makeRow()];
}, { immediate: true });

function selectedObject(row) {
  return props.objects.find((item) => item.object_code === row.tax_object_code);
}

function rateFor(row) {
  const ratePercent = Number(row.tax_rate_percent);
  return Number.isFinite(ratePercent) ? ratePercent / 100 : 0;
}

function rateLabel(rate) {
  return `${Number((Number(rate) * 100).toFixed(2))}%`;
}

function withholdingFor(row) {
  const base = Number(row.base_amount);
  const rate = rateFor(row);
  if (!Number.isFinite(base) || base < 0) return 0;
  return Math.round(base * rate * 100) / 100;
}

function syncObject(row) {
  validationError.value = '';
  const label = row.object_label.trim().toLowerCase();
  const match = props.objects.find((item) => item.description.toLowerCase() === label || item.object_code.toLowerCase() === label);
  row.tax_object_code = match?.object_code || '';
  if (match) row.tax_rate_percent = Number((Number(match.default_tax_rate) * 100).toFixed(2));
}

function centsTotal(field) {
  return draftRows.value.reduce((total, row) => total + Math.round(Number(field === 'base_amount' ? row.base_amount : withholdingFor(row) || 0) * 100), 0) / 100;
}

const totalBase = computed(() => centsTotal('base_amount'));
const totalTax = computed(() => centsTotal('withholding_tax'));

function money(value) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
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
  const invalidIndex = draftRows.value.findIndex((row) => {
    const amountText = String(row.base_amount ?? '').trim();
    return !row.tax_object_code
      || !/^\d{1,16}(?:\.\d{1,2})?$/.test(amountText)
      || !Number.isFinite(Number(amountText))
      || Number(amountText) < 0
      || !Number.isFinite(Number(row.tax_rate_percent))
      || Number(row.tax_rate_percent) < 0
      || Number(row.tax_rate_percent) > 100
      || !selectedObject(row);
  });
  if (invalidIndex !== -1) {
    validationError.value = `Complete the payment object, amount (up to two decimals), and rate (0–100%) on row ${invalidIndex + 1}.`;
    return;
  }
  emit('save-items', draftRows.value.map(({ id, tax_object_code, base_amount, tax_rate_percent, remarks }) => ({
    id,
    tax_object_code,
    base_amount: Number(base_amount),
    tax_rate_percent: Number(tax_rate_percent),
    remarks,
  })));
}
</script>

<style scoped>
.wht-workspace { border: 1px solid #dce5df; background: #fff; }
.wht-header, .wht-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; }
.wht-header { border-bottom: 1px solid #e2e9e4; }
.eyebrow { color: #19724f; font-size: .7rem; font-weight: 800; letter-spacing: .08em; }
.wht-table-wrap { max-height: min(62vh, 680px); }
.wht-table { min-width: 980px; }
.wht-table thead th { position: sticky; top: 0; z-index: 1; background: #f3f7f4; color: #53635a; font-size: .72rem; white-space: nowrap; }
.wht-table tbody td { padding: .55rem .5rem; }
.wht-table tfoot th { padding: .8rem .5rem; background: #edf4ef; border-top: 1px solid #d5e2d8; font-size: .86rem; }
.object-cell { min-width: 290px; }
.amount-input { min-width: 145px; text-align: right; font-variant-numeric: tabular-nums; }
.rate-cell { min-width: 85px; color: #40564a; font-weight: 700; white-space: nowrap; }
.tax-cell, .total-tax { color: #155e41; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.actions-column { min-width: 92px; }
.empty-state { padding: 2.4rem !important; color: #718077; text-align: center; }
.wht-footer { border-top: 1px solid #e2e9e4; }
@media (max-width: 600px) {
  .wht-header, .wht-footer { align-items: flex-start; flex-direction: column; }
  .wht-header .btn, .wht-footer .btn { width: 100%; }
}
</style>
