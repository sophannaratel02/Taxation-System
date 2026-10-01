<template>
  <div class="sales-journal">
    <section class="entry-panel mb-3">
      <div class="section-heading d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h2 class="h6 fw-bold mb-1">{{ editingId ? text('កែប្រែកំណត់ត្រា', 'Edit journal entry') : text('កំណត់ត្រាលក់', 'Sales journal entry') }}</h2>
          <p class="small text-muted mb-0">{{ text('តម្លៃដុល្លារបម្លែងតាមអត្រា NBC ប្រចាំខែនេះ។', 'USD entries convert using this period’s NBC exchange rate.') }}</p>
        </div>
        <span class="small text-muted">{{ records.length }} {{ text('កំណត់ត្រា', 'entries') }}</span>
      </div>

      <form class="entry-form" @submit.prevent="saveRecord">
        <div class="field-grid">
          <label class="form-field">
            <span>{{ text('ថ្ងៃទី ខែ ឆ្នាំ', 'Date') }}</span>
            <input v-model="form.invoice_date" class="form-control" type="date" required :disabled="!isDraft" />
          </label>
          <label class="form-field">
            <span>{{ text('លេខវិក្កយបត្រ', 'Invoice No') }}</span>
            <input v-model.trim="form.invoice_no" class="form-control" type="text" :disabled="!isDraft" />
          </label>
          <label class="form-field">
            <span>{{ text('អ្នកទិញ', 'Buyer') }}</span>
            <input v-model.trim="form.customer_name" class="form-control" type="text" required :disabled="!isDraft" />
          </label>
          <label class="form-field">
            <span>{{ text('លេខអត្តសញ្ញាណកម្មសារពើពន្ធ', 'VAT TIN') }}</span>
            <input v-model.trim="form.customer_tin" class="form-control" type="text" :disabled="!isDraft" />
          </label>
          <label class="form-field wide-field">
            <span>{{ text('បរិយាយ', 'Description') }}</span>
            <input v-model.trim="form.description" class="form-control" type="text" :disabled="!isDraft" />
          </label>
          <label class="form-field">
            <span>{{ text('បរិមាណ', 'Quantity') }}</span>
            <input v-model.number="form.quantity" class="form-control" type="number" min="0" step="0.001" required :disabled="!isDraft" />
          </label>
          <label class="form-field">
            <span>{{ text('ការលក់មិនជាប់អាករ (USD)', 'Non-Taxable Sale (USD)') }}</span>
            <input v-model.number="form.non_taxable_sale_usd" class="form-control" type="number" min="0" step="0.01" required :disabled="!isDraft" />
          </label>
          <label class="form-field">
            <span>{{ text('ការនាំចេញ (USD)', 'Exports (USD)') }}</span>
            <input v-model.number="form.export_sale_usd" class="form-control" type="number" min="0" step="0.01" required :disabled="!isDraft" />
          </label>
          <label class="form-field">
            <span>{{ text('តម្លៃជាប់អាករ បុគ្គលជាប់អាករ (USD)', 'Taxable Person Value (USD)') }}</span>
            <input v-model.number="form.taxable_person_value_usd" class="form-control" type="number" min="0" step="0.01" required :disabled="!isDraft" />
          </label>
          <label class="form-field">
            <span>{{ text('VAT បុគ្គលជាប់អាករ (USD)', 'Taxable Person VAT (USD)') }}</span>
            <input class="form-control calculated-input" type="number" :value="taxablePersonVatUsd.toFixed(2)" readonly aria-readonly="true" />
          </label>
          <label class="form-field">
            <span>{{ text('តម្លៃជាប់អាករ លក់ក្នុងស្រុក (USD)', 'Taxable Value in Local Sale (USD)') }}</span>
            <input v-model.number="form.local_sale_value_usd" class="form-control" type="number" min="0" step="0.01" required :disabled="!isDraft" />
          </label>
          <label class="form-field">
            <span>{{ text('VAT លក់ក្នុងស្រុក (USD)', 'VAT in Local Sale (USD)') }}</span>
            <input class="form-control calculated-input" type="number" :value="localSaleVatUsd.toFixed(2)" readonly aria-readonly="true" />
          </label>
        </div>

        <div class="calculation-preview" aria-live="polite">
          <span>{{ text('ការគណនាបច្ចុប្បន្ន', 'Live calculation') }}</span>
          <strong>{{ text('មូលដ្ឋានជាប់ពន្ធ', 'Taxable base') }} $ {{ moneyUsd(standardTaxableUsd) }} / {{ money(standardTaxableKhr) }} KHR · VAT $ {{ moneyUsd(vatUsd) }} / {{ money(vatKhr) }} KHR · {{ text('សរុបលក់', 'Total sales') }} $ {{ moneyUsd(totalUsd) }} / {{ money(totalKhr) }} KHR</strong>
        </div>

        <div class="form-actions d-flex flex-wrap justify-content-end gap-2">
          <button v-if="editingId" class="btn btn-outline-secondary" type="button" @click="resetForm">{{ text('បោះបង់', 'Cancel edit') }}</button>
          <button class="btn btn-primary" type="submit" :disabled="saving || !isDraft">
            <i class="bi bi-plus-lg me-1"></i>{{ saving ? text('កំពុងរក្សាទុក...', 'Saving...') : editingId ? text('ធ្វើបច្ចុប្បន្នភាព', 'Update entry') : text('បន្ថែមកំណត់ត្រា', 'Add entry') }}
          </button>
        </div>
      </form>
    </section>

    <section class="journal-panel">
      <div class="table-responsive">
        <table class="table sales-table align-middle mb-0">
          <thead>
            <tr>
              <th colspan="6" class="text-center">{{ text('វិក្កយបត្រ', 'Invoice') }}</th>
              <th colspan="6" class="text-center">{{ text('ការលក់', 'Sale') }}</th>
              <th rowspan="3" class="text-center">{{ text('សរុបការលក់ក្នុងស្រុករួមអាករ (USD)', 'Total Local Sales Incl. VAT (USD)') }}</th>
              <th rowspan="3" class="text-end no-print">{{ text('សកម្មភាព', 'Actions') }}</th>
            </tr>
            <tr>
              <th rowspan="2">{{ text('ថ្ងៃទី ខែ ឆ្នាំ', 'Date') }}</th>
              <th rowspan="2">{{ text('លេខវិក្កយបត្រ', 'Invoice No') }}</th>
              <th rowspan="2">{{ text('អ្នកទិញ', 'Buyer') }}</th>
              <th rowspan="2">{{ text('VAT TIN', 'VAT TIN') }}</th>
              <th rowspan="2">{{ text('បរិយាយ', 'Description') }}</th>
              <th rowspan="2" class="text-end">{{ text('បរិមាណ', 'Quantity') }}</th>
              <th rowspan="2" class="text-end">{{ text('ការលក់មិនជាប់អាករ', 'Non-Taxable Sale') }}</th>
              <th rowspan="2" class="text-end">{{ text('ការនាំចេញ', 'Exports') }}</th>
              <th colspan="2" class="text-center">{{ text('បុគ្គលជាប់អាករ', 'Taxable Person') }}</th>
              <th colspan="2" class="text-center">{{ text('ការលក់ក្នុងស្រុក', 'Local Sale') }}</th>
            </tr>
            <tr>
              <th class="text-end">{{ text('តម្លៃជាប់អាករ', 'Taxable Value') }}</th>
              <th class="text-end">VAT</th>
              <th class="text-end">{{ text('តម្លៃជាប់អាករ', 'Taxable Value') }}</th>
              <th class="text-end">VAT</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in records" :key="row.id">
              <td class="text-nowrap">{{ formatDate(row.invoice_date) }}</td>
              <td class="text-nowrap">{{ row.invoice_no || '-' }}</td>
              <td>{{ row.customer_name || '-' }}</td>
              <td>{{ row.customer_tin || '-' }}</td>
              <td>{{ row.description || '-' }}</td>
              <td class="text-end">{{ Number(row.quantity ?? 1) }}</td>
              <td class="text-end text-nowrap">{{ categoryUsd(row, 'non_taxable') }}</td>
              <td class="text-end text-nowrap">{{ categoryUsd(row, 'export_0') }}</td>
              <td class="text-end text-nowrap">{{ categoryTaxableUsd(row, 'taxable_person_10') }}</td>
              <td class="text-end text-nowrap">{{ categoryVatUsd(row, 'taxable_person_10') }}</td>
              <td class="text-end text-nowrap">{{ categoryTaxableUsd(row, 'local_consumer_10') }}</td>
              <td class="text-end text-nowrap">{{ categoryVatUsd(row, 'local_consumer_10') }}</td>
              <td class="text-end text-nowrap fw-semibold">{{ moneyUsd(localTotalUsd(row)) }}</td>
              <td class="text-end text-nowrap no-print">
                <button class="btn btn-sm btn-light me-1" type="button" :disabled="!isDraft" :title="text('កែប្រែ', 'Edit')" @click="editRecord(row)"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-light text-danger" type="button" :disabled="!isDraft" :title="text('លុប', 'Delete')" @click="deleteRecord(row)"><i class="bi bi-trash3"></i></button>
              </td>
            </tr>
            <tr v-if="!records.length"><td colspan="14" class="empty-row">{{ text('មិនទាន់មានកំណត់ត្រាលក់', 'No sales entries for this period.') }}</td></tr>
          </tbody>
          <tfoot v-if="records.length">
            <tr class="total-row">
              <th colspan="12" class="text-end">{{ text('សរុបថ្លៃទិញដុល្លារអាមេរិក Total (US$)', 'Total (US$)') }}</th>
              <th class="text-end">$ {{ moneyUsd(summaryTotalUsd) }}</th>
              <th class="no-print"></th>
            </tr>
            <tr class="total-row">
              <th colspan="12" class="text-end">{{ text('សរុបថ្លៃទិញជារៀល Total (Riels)', 'Total (Riels)') }}</th>
              <th class="text-end">៛ {{ money(summaryTotalKhr) }}</th>
              <th class="no-print"></th>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';

const props = defineProps({
  records: { type: Array, default: () => [] },
  nbcExchangeRate: { type: Number, default: 0 },
  periodMonth: { type: Number, required: true },
  periodYear: { type: Number, required: true },
  isDraft: { type: Boolean, default: false },
  isKhmer: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['save-record', 'delete-record']);
const editingId = ref(null);

function initialForm() {
  return {
    invoice_date: `${props.periodYear}-${String(props.periodMonth).padStart(2, '0')}-01`,
    invoice_no: '',
    customer_name: '',
    customer_tin: '',
    description: '',
    quantity: 1,
    non_taxable_sale_usd: 0,
    export_sale_usd: 0,
    taxable_person_value_usd: 0,
    local_sale_value_usd: 0,
  };
}

const form = reactive(initialForm());
const records = computed(() => props.records || []);
const nonTaxableUsd = computed(() => Math.max(0, Number(form.non_taxable_sale_usd) || 0));
const exportUsd = computed(() => Math.max(0, Number(form.export_sale_usd) || 0));
const taxablePersonUsd = computed(() => Math.max(0, Number(form.taxable_person_value_usd) || 0));
const localSaleUsd = computed(() => Math.max(0, Number(form.local_sale_value_usd) || 0));
const exchangeRate = computed(() => Number(props.nbcExchangeRate) || 0);
const taxablePersonVatUsd = computed(() => roundMoney(taxablePersonUsd.value * 0.1));
const localSaleVatUsd = computed(() => roundMoney(localSaleUsd.value * 0.1));
const standardTaxableUsd = computed(() => taxablePersonUsd.value + localSaleUsd.value);
const taxablePersonKhr = computed(() => Math.round(taxablePersonUsd.value * exchangeRate.value));
const localSaleKhr = computed(() => Math.round(localSaleUsd.value * exchangeRate.value));
const standardTaxableKhr = computed(() => taxablePersonKhr.value + localSaleKhr.value);
const vatUsd = computed(() => taxablePersonVatUsd.value + localSaleVatUsd.value);
const vatKhr = computed(() => Math.round(taxablePersonVatUsd.value * exchangeRate.value) + Math.round(localSaleVatUsd.value * exchangeRate.value));
const totalUsd = computed(() => nonTaxableUsd.value + exportUsd.value + standardTaxableUsd.value + vatUsd.value);
const totalKhr = computed(() => Math.round(nonTaxableUsd.value * exchangeRate.value)
  + Math.round(exportUsd.value * exchangeRate.value)
  + standardTaxableKhr.value + vatKhr.value);
const summaryTotalUsd = computed(() => records.value.reduce((sum, row) => sum + saleAmounts(row).totalUsd, 0));
const summaryTotalKhr = computed(() => records.value.reduce((sum, row) => sum + saleAmounts(row).totalKhr, 0));

function text(khmer, english) { return props.isKhmer ? khmer : english; }
function money(value) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0)); }
function moneyUsd(value) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0); }
function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }

function saleAmounts(row) {
  const legacyAmount = Math.max(0, Number(row.taxable_amount_usd) || 0);
  const legacyCategory = row.sale_type;
  const getUsd = (key, category) => row[key] !== undefined && row[key] !== null
    ? Math.max(0, Number(row[key]) || 0)
    : (legacyCategory === category ? legacyAmount : 0);
  const nonTaxableUsdValue = getUsd('non_taxable_sale_usd', 'non_taxable');
  const exportUsdValue = getUsd('export_sale_usd', 'export_0');
  const taxablePersonUsdValue = getUsd('taxable_person_value_usd', 'taxable_person_10');
  const localSaleUsdValue = getUsd('local_sale_value_usd', 'local_consumer_10');
  const taxablePersonVatUsdValue = row.taxable_person_vat_usd == null ? roundMoney(taxablePersonUsdValue * 0.1) : Number(row.taxable_person_vat_usd) || 0;
  const localSaleVatUsdValue = row.local_sale_vat_usd == null ? roundMoney(localSaleUsdValue * 0.1) : Number(row.local_sale_vat_usd) || 0;
  const toKhr = (usd) => Math.round(usd * exchangeRate.value);
  const taxablePersonKhrValue = row.taxable_person_value_khr == null ? toKhr(taxablePersonUsdValue) : Number(row.taxable_person_value_khr) || 0;
  const localSaleKhrValue = row.local_sale_value_khr == null ? toKhr(localSaleUsdValue) : Number(row.local_sale_value_khr) || 0;
  const taxablePersonVatKhrValue = row.taxable_person_vat_khr == null ? toKhr(taxablePersonVatUsdValue) : Number(row.taxable_person_vat_khr) || 0;
  const localSaleVatKhrValue = row.local_sale_vat_khr == null ? toKhr(localSaleVatUsdValue) : Number(row.local_sale_vat_khr) || 0;
  const baseUsd = nonTaxableUsdValue + exportUsdValue + taxablePersonUsdValue + localSaleUsdValue;
  const baseKhr = (row.non_taxable_sale_khr == null ? toKhr(nonTaxableUsdValue) : Number(row.non_taxable_sale_khr) || 0)
    + (row.export_sale_khr == null ? toKhr(exportUsdValue) : Number(row.export_sale_khr) || 0)
    + taxablePersonKhrValue + localSaleKhrValue;
  const amountVatUsd = taxablePersonVatUsdValue + localSaleVatUsdValue;
  const amountVatKhr = taxablePersonVatKhrValue + localSaleVatKhrValue;
  return {
    nonTaxableUsd: nonTaxableUsdValue,
    exportUsd: exportUsdValue,
    taxablePersonUsd: taxablePersonUsdValue,
    localSaleUsd: localSaleUsdValue,
    taxablePersonVatUsd: taxablePersonVatUsdValue,
    localSaleVatUsd: localSaleVatUsdValue,
    amountUsd: baseUsd,
    amountKhr: baseKhr,
    vatUsd: amountVatUsd,
    vatKhr: amountVatKhr,
    totalUsd: baseUsd + amountVatUsd,
    totalKhr: baseKhr + amountVatKhr,
  };
}

function categoryUsd(row, category) {
  const values = saleAmounts(row);
  const amount = category === 'non_taxable' ? values.nonTaxableUsd : values.exportUsd;
  return amount ? `$ ${moneyUsd(amount)}` : '-';
}

function categoryTaxableUsd(row, category) {
  const values = saleAmounts(row);
  const amount = category === 'taxable_person_10' ? values.taxablePersonUsd : values.localSaleUsd;
  return amount ? `$ ${moneyUsd(amount)}` : '-';
}

function categoryVatUsd(row, category) {
  const values = saleAmounts(row);
  const amount = category === 'taxable_person_10' ? values.taxablePersonVatUsd : values.localSaleVatUsd;
  return amount ? `$ ${moneyUsd(amount)}` : '-';
}

function localTotalUsd(row) {
  const values = saleAmounts(row);
  return values.nonTaxableUsd + values.taxablePersonUsd + values.taxablePersonVatUsd + values.localSaleUsd + values.localSaleVatUsd;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function syncCurrency() {
  form.quantity = Math.max(0, Number(form.quantity) || 0);
  for (const key of ['non_taxable_sale_usd', 'export_sale_usd', 'taxable_person_value_usd', 'local_sale_value_usd']) {
    form[key] = Math.max(0, Number(form[key]) || 0);
  }
}

function resetForm() {
  editingId.value = null;
  Object.assign(form, initialForm());
}

function saveRecord() {
  syncCurrency();
  const baseKhr = Math.round(nonTaxableUsd.value * exchangeRate.value)
    + Math.round(exportUsd.value * exchangeRate.value)
    + Math.round(taxablePersonUsd.value * exchangeRate.value)
    + Math.round(localSaleUsd.value * exchangeRate.value);
  emit('save-record', {
    id: editingId.value,
    payload: {
      ...form,
      quantity: Number(form.quantity) || 0,
      sale_type: 'local_consumer_10',
      taxable_amount_usd: nonTaxableUsd.value + exportUsd.value + standardTaxableUsd.value,
      taxable_amount_khr: baseKhr,
      vat_rate: standardTaxableUsd.value > 0 ? 0.1 : 0,
      vat_amount_khr: vatKhr.value,
    },
  });
}

function editRecord(row) {
  editingId.value = row.id;
  const legacyAmount = Number(row.taxable_amount_usd) || 0;
  const categoryValue = (key, category) => row[key] == null
    ? (row.sale_type === category ? legacyAmount : 0)
    : Number(row[key]) || 0;
  Object.assign(form, initialForm(), {
    invoice_date: row.invoice_date ? String(row.invoice_date).slice(0, 10) : initialForm().invoice_date,
    invoice_no: row.invoice_no || '',
    customer_name: row.customer_name || '',
    customer_tin: row.customer_tin || '',
    description: row.description || '',
    quantity: Number(row.quantity ?? 1),
    non_taxable_sale_usd: categoryValue('non_taxable_sale_usd', 'non_taxable'),
    export_sale_usd: categoryValue('export_sale_usd', 'export_0'),
    taxable_person_value_usd: categoryValue('taxable_person_value_usd', 'taxable_person_10'),
    local_sale_value_usd: categoryValue('local_sale_value_usd', 'local_consumer_10'),
  });
  syncCurrency();
}

function deleteRecord(row) {
  emit('delete-record', row);
}

defineExpose({ editingId, resetForm, editRecord, deleteRecord, syncCurrency });
</script>

<style scoped>
.entry-panel, .journal-panel { background: #fff; border: 1px solid #d9e0e4; border-radius: 6px; }
.section-heading { padding: 1rem 1.15rem; border-bottom: 1px solid #e4e8eb; }
.entry-form { padding: 1rem 1.15rem; }
.field-grid { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: .85rem; }
.wide-field { grid-column: span 2; }
.form-field { display: flex; flex-direction: column; gap: .35rem; min-width: 0; }
.form-field > span { color: #5d6872; font-size: .76rem; font-weight: 650; }
.form-field .form-control, .form-field .form-select { min-height: 38px; border-color: #d3dbe0; border-radius: 4px; }
.calculation-preview { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem 1rem; margin-top: .9rem; padding: .75rem .8rem; color: #15585a; background: #eef6f4; border-left: 3px solid #287e79; font-size: .85rem; }
.calculation-preview strong { text-align: right; }
.form-actions { margin-top: 1rem; }
.sales-table { min-width: 1450px; }
.sales-table th { vertical-align: middle; white-space: nowrap; }
.sales-table thead th { color: #384752; background: #f4f6f7; font-size: .76rem; }
.sales-table tbody td { font-size: .82rem; }
.sales-table tfoot th { border-top: 2px solid #d9e0e4; background: #f5f7f8; }
.empty-row { padding: 2rem !important; color: #7b858e; text-align: center; }
@media (max-width: 850px) { .field-grid { grid-template-columns: repeat(2, minmax(130px, 1fr)); } }
@media (max-width: 520px) { .field-grid { grid-template-columns: 1fr; } .wide-field { grid-column: auto; } .calculation-preview strong { text-align: left; } }
</style>