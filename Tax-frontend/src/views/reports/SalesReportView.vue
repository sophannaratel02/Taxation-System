<template>
  <section class="container-fluid p-4 page-canvas">
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <div class="eyebrow mb-2">{{ language.t('reports') }}</div>
        <h1 class="h3 fw-bold mb-1">{{ language.isKhmer ? 'របាយការណ៍លក់តាមបុគ្គលិក' : 'Sales Report by Staff' }}</h1>
        <p class="text-muted mb-0">{{ language.isKhmer ? 'សង្ខេបការលក់ ចំណាយដើម និងប្រាក់ចំណេញតាមអ្នកលក់។' : 'Compare sales, cost of goods, and gross profit by cashier.' }}</p>
      </div>
      <button class="btn btn-outline-primary" type="button" :disabled="loading" @click="loadReport">
        <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
        <i v-else class="bi bi-arrow-clockwise me-2"></i>{{ language.isKhmer ? 'ធ្វើបច្ចុប្បន្នភាព' : 'Refresh report' }}
      </button>
    </div>

    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body d-flex flex-wrap align-items-end gap-3">
        <div><label class="form-label small fw-semibold">{{ language.isKhmer ? 'ចាប់ពី' : 'From' }}</label><input v-model="filter.from" type="date" class="form-control" /></div>
        <div><label class="form-label small fw-semibold">{{ language.isKhmer ? 'ដល់' : 'To' }}</label><input v-model="filter.to" type="date" class="form-control" /></div>
        <button class="btn btn-primary" type="button" :disabled="loading" @click="loadReport"><i class="bi bi-funnel me-2"></i>{{ language.isKhmer ? 'អនុវត្ត' : 'Apply filters' }}</button>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div class="row g-3 mb-4">
      <div v-for="stat in summary" :key="stat.label" class="col-sm-6 col-xl-3"><div class="card metric-card h-100"><div class="card-body"><small class="text-muted">{{ stat.label }}</small><div class="h4 fw-bold mt-2 mb-0">{{ stat.value }}</div></div></div></div>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light"><tr><th class="ps-3">{{ language.isKhmer ? 'បុគ្គលិក' : 'Staff' }}</th><th>{{ language.isKhmer ? 'វិក្កយបត្រ' : 'Invoices' }}</th><th class="text-end">{{ language.t('grandTotal') }}</th><th class="text-end">VAT</th><th class="text-end">{{ language.isKhmer ? 'ថ្លៃដើម' : 'Cost of goods' }}</th><th class="text-end">{{ language.isKhmer ? 'ប្រាក់ចំណេញ' : 'Gross profit' }}</th><th class="text-end pe-3">{{ language.isKhmer ? 'រឹមចំណេញ' : 'Margin' }}</th></tr></thead>
          <tbody>
            <tr v-for="row in reportData" :key="`${row.staffId}-${row.staffName}`">
              <td class="ps-3 fw-semibold"><i class="bi bi-person me-2 text-primary"></i>{{ row.staffName }}</td>
              <td>{{ row.invoiceCount }}</td>
              <td class="text-end">${{ money(row.grandTotal) }}</td>
              <td class="text-end text-muted">${{ money(row.vat) }}</td>
              <td class="text-end text-secondary">${{ money(row.exitCosts) }}</td>
              <td class="text-end fw-semibold text-success">${{ money(grossProfit(row)) }}</td>
              <td class="text-end pe-3"><span class="badge text-bg-success">{{ margin(row) }}%</span></td>
            </tr>
            <tr v-if="!loading && !reportData.length"><td colspan="7" class="text-center text-muted py-5"><i class="bi bi-bar-chart fs-2 d-block mb-2"></i>{{ language.t('noRecords') }}</td></tr>
          </tbody>
          <tfoot v-if="reportData.length" class="table-light fw-bold"><tr><td class="ps-3">{{ language.isKhmer ? 'សរុបរួម' : 'TOTAL' }}</td><td>{{ totalInvoices }}</td><td class="text-end">${{ money(totalGrandTotal) }}</td><td class="text-end">${{ money(totalVat) }}</td><td class="text-end">${{ money(totalCosts) }}</td><td class="text-end text-success">${{ money(totalProfit) }}</td><td class="text-end pe-3">{{ totalMargin }}%</td></tr></tfoot>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';

const language = useLanguageStore();
const filter = reactive({ from: '', to: '' });
const reportData = ref([]);
const loading = ref(false);
const error = ref('');

function money(value) { return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function grossProfit(row) { return (Number(row.grandTotal) - Number(row.vat)) - Number(row.exitCosts); }
function margin(row) { const net = Number(row.grandTotal) - Number(row.vat); return net > 0 ? ((grossProfit(row) / net) * 100).toFixed(2) : '0.00'; }

const totalInvoices = computed(() => reportData.value.reduce((sum, row) => sum + Number(row.invoiceCount || 0), 0));
const totalGrandTotal = computed(() => reportData.value.reduce((sum, row) => sum + Number(row.grandTotal || 0), 0));
const totalVat = computed(() => reportData.value.reduce((sum, row) => sum + Number(row.vat || 0), 0));
const totalCosts = computed(() => reportData.value.reduce((sum, row) => sum + Number(row.exitCosts || 0), 0));
const totalProfit = computed(() => (totalGrandTotal.value - totalVat.value) - totalCosts.value);
const totalMargin = computed(() => { const net = totalGrandTotal.value - totalVat.value; return net > 0 ? ((totalProfit.value / net) * 100).toFixed(2) : '0.00'; });
const summary = computed(() => [
  { label: language.isKhmer ? 'វិក្កយបត្រសរុប' : 'Total invoices', value: totalInvoices.value },
  { label: language.t('grandTotal'), value: `$${money(totalGrandTotal.value)}` },
  { label: language.isKhmer ? 'ថ្លៃដើមសរុប' : 'Total cost', value: `$${money(totalCosts.value)}` },
  { label: language.isKhmer ? 'ប្រាក់ចំណេញសរុប' : 'Gross profit', value: `$${money(totalProfit.value)}` },
]);

async function loadReport() {
  loading.value = true;
  error.value = '';
  try { reportData.value = await api.salesByStaff(filter.from, filter.to); }
  catch (requestError) { error.value = requestError.message || 'Failed to load sales report.'; }
  finally { loading.value = false; }
}

watch(() => language.language, loadReport);
onMounted(loadReport);
</script>
