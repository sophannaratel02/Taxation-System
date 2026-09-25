<template>
  <section class="container-fluid p-4 page-canvas report-page">
    <!-- Executive Header Hero -->
    <div class="report-hero p-4 mb-4 rounded-4 shadow-sm bg-white border position-relative overflow-hidden">
      <div class="hero-glow"></div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 position-relative z-1">
        <div>
          <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-primary-subtle text-primary small fw-semibold mb-2">
            <i class="bi bi-pie-chart-fill"></i>
            <span>{{ language.t('reports') }}</span>
            <span class="text-muted">·</span>
            <span>ERP Valuation Engine</span>
          </div>
          <h1 class="h3 fw-bold text-dark mb-1 tracking-tight">
            {{ language.isKhmer ? 'របាយការណ៍ស្តុកសង្ខេប' : 'Inventory Valuation & Summary Report' }}
          </h1>
          <p class="text-muted mb-0">
            {{ language.isKhmer 
              ? 'បរិមាណស្តុកជាក់ស្តែង តម្លៃដើមមធ្យម តម្លៃស្តុកសរុប និងតម្លៃលក់រាយតាមប្រភេទនីមួយៗ។' 
              : 'Real-time quantity on hand, average weighted cost, asset valuation, and retail margin breakdown.' 
            }}
          </p>
        </div>

        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary bg-white px-3 py-2 rounded-3 shadow-xs" type="button" @click="printReport">
            <i class="bi bi-printer me-2"></i>{{ language.isKhmer ? 'បោះពុម្ព' : 'Print' }}
          </button>
          <button class="btn btn-primary px-3 py-2 rounded-3 shadow-sm pulse-btn" type="button" @click="exportCSV">
            <i class="bi bi-download me-2"></i>{{ language.isKhmer ? 'ទាញយក CSV' : 'Export CSV' }}
          </button>
        </div>
      </div>
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
              <h3 class="fw-bold text-dark mb-1 metric-value">{{ stat.value }}</h3>
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

    <!-- Inventory Valuation Table Card -->
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div class="card-header bg-white py-3 px-4 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <strong class="fs-6 text-dark d-block">
            {{ language.isKhmer ? 'ការវាយតម្លៃស្តុកតាមប្រភេទ' : 'Category Valuation Breakdown' }}
          </strong>
          <small class="text-muted">
            {{ language.isKhmer ? 'ការបែងចែកសមាមាត្រថ្លៃដើម និងប្រាក់ចំណេញសក្តានុពល' : 'Asset valuation distribution and gross margin forecast' }}
          </small>
        </div>

        <div class="d-flex align-items-center gap-2">
          <div class="input-group input-group-sm search-group">
            <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-search"></i></span>
            <input
              v-model.trim="search"
              class="form-control border-start-0 shadow-none"
              :placeholder="language.isKhmer ? 'ស្វែងរកប្រភេទ...' : 'Filter categories...'"
            />
            <button v-if="search" class="btn btn-outline-secondary border-start-0 border-end" type="button" @click="search = ''">
              <i class="bi bi-x"></i>
            </button>
          </div>

          <span class="badge rounded-pill bg-light text-secondary border px-3 py-2 text-nowrap">
            {{ filteredRows.length }} {{ language.isKhmer ? 'ប្រភេទ' : 'Categories' }}
          </span>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table align-middle table-hover mb-0 modern-table">
          <thead class="table-light border-0">
            <tr>
              <th class="ps-4">{{ language.isKhmer ? 'ប្រភេទមុខទំនិញ' : 'Category Name' }}</th>
              <th class="text-end">{{ language.t('items') }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ចំនួនក្នុងស្តុក' : 'Qty on Hand' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ថ្លៃដើមមធ្យម' : 'Avg Cost' }}</th>
              <th class="text-end">{{ language.t('inventoryValue') }} (Cost)</th>
              <th class="text-end">{{ language.isKhmer ? 'តម្លៃលក់រាយសរុប' : 'Retail Value' }}</th>
              <th class="text-end pe-4" style="min-width: 170px;">{{ language.isKhmer ? 'ចំណែក (%)' : '% Share' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.category">
              <!-- Category Name + Badge -->
              <td class="ps-4">
                <div class="d-flex align-items-center gap-3">
                  <div class="category-icon-avatar rounded-3">
                    <i class="bi bi-tag-fill text-primary"></i>
                  </div>
                  <div>
                    <span class="fw-bold text-dark d-block">{{ row.category }}</span>
                    <small class="text-muted">
                      {{ (row.retail - row.value) > 0 ? 'Margin: +$' + formatCurrency(row.retail - row.value) : 'Standard' }}
                    </small>
                  </div>
                </div>
              </td>

              <!-- Items count -->
              <td class="text-end fw-semibold text-secondary">
                {{ row.items.toLocaleString() }}
              </td>

              <!-- Qty on hand -->
              <td class="text-end fw-bold text-dark">
                {{ row.qty.toLocaleString() }}
              </td>

              <!-- Avg Cost -->
              <td class="text-end text-muted font-monospace">
                ${{ formatCurrency(row.avgCost) }}
              </td>

              <!-- Total Inventory Cost Value -->
              <td class="text-end fw-bold text-primary fs-6 font-monospace">
                ${{ formatCurrency(row.value) }}
              </td>

              <!-- Total Retail Value -->
              <td class="text-end fw-semibold text-success font-monospace">
                ${{ formatCurrency(row.retail) }}
              </td>

              <!-- % Share with Visual Progress Bar -->
              <td class="text-end pe-4">
                <div class="d-flex align-items-center justify-content-end gap-2">
                  <div class="progress flex-grow-1 custom-progress" style="height: 6px; max-width: 90px;">
                    <div
                      class="progress-bar bg-primary"
                      role="progressbar"
                      :style="{ width: `${Math.min(100, Number(row.valueShare))}%` }"
                      :aria-valuenow="row.valueShare"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    ></div>
                  </div>
                  <span class="badge text-bg-light border small font-monospace">
                    {{ row.valueShare }}%
                  </span>
                </div>
              </td>
            </tr>

            <!-- Empty State -->
            <tr v-if="!filteredRows.length">
              <td colspan="7" class="text-center text-muted py-5">
                <div class="my-4">
                  <i class="bi bi-box-seam fs-1 text-secondary opacity-50 d-block mb-2"></i>
                  <h6 class="fw-bold text-dark">{{ language.t('noRecords') }}</h6>
                  <p class="small text-muted mb-0">
                    {{ search 
                      ? (language.isKhmer ? 'គ្មានប្រភេទដែលត្រូវនឹងពាក្យស្វែងរកឡើយ។' : 'No categories match your search.') 
                      : (language.isKhmer ? 'មិនទាន់មានទិន្នន័យទំនិញក្នុងស្តុកនៅឡើយទេ។' : 'No inventory items recorded yet.') 
                    }}
                  </p>
                </div>
              </td>
            </tr>
          </tbody>

          <!-- Table Footer Total -->
          <tfoot v-if="filteredRows.length" class="table-light border-top">
            <tr class="fw-bold">
              <td class="ps-4 text-dark">{{ language.isKhmer ? 'សរុបរួម' : 'Total Valuation' }}</td>
              <td class="text-end">{{ totalItemsCount.toLocaleString() }}</td>
              <td class="text-end">{{ totalQtyCount.toLocaleString() }}</td>
              <td class="text-end text-muted">-</td>
              <td class="text-end text-primary font-monospace fs-6">${{ formatCurrency(totalInventoryCost) }}</td>
              <td class="text-end text-success font-monospace fs-6">${{ formatCurrency(totalRetailValue) }}</td>
              <td class="text-end pe-4">100.0%</td>
            </tr>
          </tfoot>
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
const formatCurrency = (val) => Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const exchangeRate = computed(() => Number(tax.settings?.exchangeRate) || 4000);

const rows = computed(() => {
  const items = tax.items || [];
  const uncategorizedLabel = language.isKhmer ? 'មិនបានចាត់ថ្នាក់' : 'Uncategorized';

  const groupMap = new Map();
  let totalCalculatedValue = 0;

  for (const item of items) {
    const category = item.category || uncategorizedLabel;
    const qty = Math.max(0, Number(item.qtyOnHand || 0));
    const cost = Math.max(0, Number(item.averageCost || item.purchaseCost || 0));
    const retail = Math.max(0, Number(item.retailPrice || item.price || 0));

    const lineCostValue = qty * cost;
    const lineRetailValue = qty * retail;

    totalCalculatedValue += lineCostValue;

    if (!groupMap.has(category)) {
      groupMap.set(category, {
        category,
        items: 0,
        qty: 0,
        value: 0,
        retail: 0
      });
    }

    const group = groupMap.get(category);
    group.items += 1;
    group.qty += qty;
    group.value += lineCostValue;
    group.retail += lineRetailValue;
  }

  const denominator = totalCalculatedValue || tax.inventoryValue || 0;

  return Array.from(groupMap.values()).map((group) => {
    const avgCost = group.qty > 0 ? group.value / group.qty : 0;
    const valueShare = denominator > 0
      ? ((group.value / denominator) * 100).toFixed(1)
      : '0.0';

    return {
      ...group,
      avgCost,
      valueShare
    };
  });
});

const filteredRows = computed(() => {
  if (!search.value) return rows.value;
  const q = search.value.toLowerCase();
  return rows.value.filter((r) => r.category.toLowerCase().includes(q));
});

const totalItemsCount = computed(() => filteredRows.value.reduce((acc, r) => acc + r.items, 0));
const totalQtyCount = computed(() => filteredRows.value.reduce((acc, r) => acc + r.qty, 0));
const totalInventoryCost = computed(() => filteredRows.value.reduce((acc, r) => acc + r.value, 0));
const totalRetailValue = computed(() => filteredRows.value.reduce((acc, r) => acc + r.retail, 0));

const stats = computed(() => [
  {
    label: language.t('inventoryValue'),
    value: `$${formatCurrency(tax.inventoryValue)}`,
    subLabel: `${Math.round((tax.inventoryValue || 0) * exchangeRate.value).toLocaleString()} ៛`,
    extra: 'Asset Cost',
    icon: 'bi bi-box-seam',
    bg: 'bg-primary-subtle',
    tone: 'text-primary'
  },
  {
    label: language.isKhmer ? 'តម្លៃលក់រាយសរុប' : 'Total Retail Value',
    value: `$${formatCurrency(tax.retailValue)}`,
    subLabel: `${Math.round((tax.retailValue || 0) * exchangeRate.value).toLocaleString()} ៛`,
    extra: 'Revenue Target',
    icon: 'bi bi-cash-stack',
    bg: 'bg-success-subtle',
    tone: 'text-success'
  },
  {
    label: language.t('items'),
    value: (tax.items || []).length.toLocaleString(),
    subLabel: `${rows.value.length} ${language.isKhmer ? 'ប្រភេទ' : 'Categories'}`,
    extra: 'Active SKUs',
    icon: 'bi bi-tags',
    bg: 'bg-info-subtle',
    tone: 'text-info-emphasis'
  },
  {
    label: language.t('lowStock'),
    value: (tax.lowStockItems || []).length.toLocaleString(),
    subLabel: language.isKhmer ? 'ត្រូវការបំពេញបន្ថែម' : 'Needs attention',
    extra: 'Alert',
    icon: 'bi bi-exclamation-triangle',
    bg: 'bg-danger-subtle',
    tone: 'text-danger'
  }
]);

function printReport() {
  window.print();
}

function exportCSV() {
  if (!rows.value.length) return;
  const headers = ['Category', 'Item Count', 'Qty on Hand', 'Avg Cost', 'Inventory Value', 'Retail Value', 'Share (%)'];
  const csvRows = rows.value.map((r) => [
    `"${r.category}"`,
    r.items,
    r.qty,
    r.avgCost.toFixed(2),
    r.value.toFixed(2),
    r.retail.toFixed(2),
    r.valueShare
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `inventory_valuation_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
</script>

<style scoped>
.report-page {
  min-height: 100vh;
  background-color: #f8fafc;
}

.report-hero {
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

.pulse-btn {
  box-shadow: 0 4px 14px rgba(13, 110, 253, 0.28);
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
  width: 220px;
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

.category-icon-avatar {
  width: 36px;
  height: 36px;
  background-color: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-progress {
  background-color: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}

@media print {
  .report-hero button,
  .search-group,
  .badge {
    display: none !important;
  }
  .report-page {
    background: #fff;
    padding: 0 !important;
  }
}
</style>