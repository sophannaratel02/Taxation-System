<template>
  <section class="container-fluid p-4 page-canvas vendor-report-page">
    <!-- Executive Ambient Hero -->
    <div class="report-hero p-4 mb-4 rounded-4 shadow-sm bg-white border position-relative overflow-hidden">
      <div class="hero-glow"></div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 position-relative z-1">
        <div>
          <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-primary-subtle text-primary small fw-semibold mb-2">
            <i class="bi bi-truck"></i>
            <span>{{ language.t('reports') }}</span>
            <span class="text-muted">·</span>
            <span>Vendor Analytics</span>
          </div>
          <h1 class="h3 fw-bold text-dark mb-1 tracking-tight">
            {{ language.isKhmer ? 'របាយការណ៍លក់តាមអ្នកផ្គត់ផ្គង់' : language.t('salesByVendor') }}
          </h1>
          <p class="text-muted mb-0">
            {{ language.isKhmer 
              ? 'វិភាគទិន្នន័យនៃការលក់ បរិមាណផលិតផល និងភាគរយប្រាក់ចំណេញ (Margin) តាមអ្នកផ្គត់ផ្គង់នីមួយៗ។' 
              : 'Analyze supplier sales performance, volume turnover, and profitability margins.' 
            }}
          </p>
        </div>

        <!-- Action Tools -->
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

    <!-- Vendor Sales Ledger Table Card -->
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <!-- Toolbar Header -->
      <div class="card-header bg-white py-3 px-4 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <strong class="fs-6 text-dark d-block">
            {{ language.isKhmer ? 'តារាងដំណើរការលក់តាមអ្នកផ្គត់ផ្គង់' : 'Supplier Sales Performance' }}
          </strong>
          <small class="text-muted">
            {{ language.isKhmer ? 'ការបែងចែកចំណូល និងអត្រាចំណេញតាមប្រភពផ្គត់ផ្គង់' : 'Breakdown of turnover and margin return by vendor' }}
          </small>
        </div>

        <div class="d-flex align-items-center gap-2">
          <!-- Search Field -->
          <div class="input-group input-group-sm search-group">
            <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-search"></i></span>
            <input
              v-model.trim="search"
              class="form-control border-start-0 shadow-none"
              :placeholder="language.isKhmer ? 'ស្វែងរកអ្នកផ្គត់ផ្គង់...' : 'Filter suppliers...'"
            />
            <button v-if="search" class="btn btn-outline-secondary border-start-0 border-end" type="button" @click="search = ''">
              <i class="bi bi-x"></i>
            </button>
          </div>

          <span class="badge rounded-pill bg-light text-secondary border px-3 py-2 text-nowrap">
            {{ filteredRows.length }} {{ language.isKhmer ? 'អ្នកផ្គត់ផ្គង់' : 'Suppliers' }}
          </span>
        </div>
      </div>

      <!-- Table -->
      <div class="table-responsive">
        <table class="table align-middle table-hover mb-0 modern-table">
          <thead class="table-light border-0">
            <tr>
              <th class="ps-4">{{ language.t('vendor') }}</th>
              <th class="text-end">{{ language.t('unitsSold') }}</th>
              <th class="text-end">{{ language.t('netSales') }} (USD)</th>
              <th class="text-end">{{ language.isKhmer ? 'ចំណូលជាប្រាក់រៀល' : 'Sales (KHR)' }}</th>
              <th class="text-end pe-4" style="min-width: 170px;">{{ language.t('margin') }} (%)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.vendor">
              <!-- Vendor Name & Avatar -->
              <td class="ps-4">
                <div class="d-flex align-items-center gap-3">
                  <div class="vendor-icon-avatar rounded-3">
                    <i class="bi bi-building text-primary"></i>
                  </div>
                  <div>
                    <span class="fw-bold text-dark d-block">{{ row.vendor }}</span>
                    <small class="text-muted">
                      {{ language.isKhmer ? 'ដៃគូផ្គត់ផ្គង់សកម្ម' : 'Active Supply Partner' }}
                    </small>
                  </div>
                </div>
              </td>

              <!-- Units Sold -->
              <td class="text-end fw-semibold text-secondary font-monospace">
                {{ Number(row.units).toLocaleString() }}
              </td>

              <!-- Net Sales USD -->
              <td class="text-end fw-bold text-primary font-monospace fs-6">
                ${{ formatMoney(row.sales) }}
              </td>

              <!-- Sales in KHR -->
              <td class="text-end text-muted font-monospace small">
                {{ Math.round(row.sales * exchangeRate).toLocaleString() }} ៛
              </td>

              <!-- Margin Progress Bar -->
              <td class="text-end pe-4">
                <div class="d-flex align-items-center justify-content-end gap-2">
                  <div class="progress flex-grow-1 custom-progress" style="height: 6px; max-width: 85px;">
                    <div
                      class="progress-bar"
                      :class="row.margin >= 20 ? 'bg-success' : 'bg-warning'"
                      role="progressbar"
                      :style="{ width: `${Math.min(100, row.margin)}%` }"
                      :aria-valuenow="row.margin"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    ></div>
                  </div>
                  <span 
                    class="badge rounded-pill px-2 py-1 font-monospace"
                    :class="row.margin >= 20 ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning-emphasis'"
                  >
                    {{ row.margin.toFixed(1) }}%
                  </span>
                </div>
              </td>
            </tr>

            <!-- Empty Search State -->
            <tr v-if="!filteredRows.length">
              <td colspan="5" class="text-center text-muted py-5">
                <div class="my-4">
                  <i class="bi bi-inbox fs-1 text-secondary opacity-50 d-block mb-2"></i>
                  <h6 class="fw-bold text-dark">{{ language.t('noRecords') }}</h6>
                  <p class="small text-muted mb-0">
                    {{ search 
                      ? (language.isKhmer ? 'គ្មានអ្នកផ្គត់ផ្គង់ដែលត្រូវនឹងការស្វែងរកឡើយ។' : 'No suppliers match your search filter.') 
                      : (language.isKhmer ? 'មិនទាន់មានទិន្នន័យលក់របស់អ្នកផ្គត់ផ្គង់នៅឡើយទេ។' : 'No vendor sales records available.') 
                    }}
                  </p>
                </div>
              </td>
            </tr>
          </tbody>

          <!-- Table Summary Footer -->
          <tfoot v-if="filteredRows.length" class="table-light border-top">
            <tr class="fw-bold">
              <td class="ps-4 text-dark">{{ language.isKhmer ? 'សរុបរួម' : 'Total Portfolio' }}</td>
              <td class="text-end font-monospace">{{ totalUnits.toLocaleString() }}</td>
              <td class="text-end text-primary font-monospace fs-6">${{ formatMoney(totalSales) }}</td>
              <td class="text-end text-muted font-monospace small">{{ Math.round(totalSales * exchangeRate).toLocaleString() }} ៛</td>
              <td class="text-end pe-4 text-success font-monospace">{{ avgMargin.toFixed(1) }}% (Avg)</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useLanguageStore } from '@/stores/language';
import { useTaxStore } from '@/stores/tax';

const language = useLanguageStore();
const tax = useTaxStore();

const search = ref('');
const exchangeRate = computed(() => Number(tax.settings?.exchangeRate) || 4000);

const formatMoney = (val) =>
  Number(val || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

// Data Source
const vendorList = ref([
  { vendor: 'Cambodia Beverage Co.', units: 420, sales: 3240.0, margin: 24.5 },
  { vendor: 'Local Foods Supply', units: 180, sales: 1120.0, margin: 18.2 },
  { vendor: 'Phnom Penh Dairy Distribution', units: 95, sales: 580.0, margin: 21.0 },
  { vendor: 'Angkor Bakery & Snacks', units: 140, sales: 420.0, margin: 28.4 }
]);

const filteredRows = computed(() => {
  if (!search.value) return vendorList.value;
  const q = search.value.toLowerCase();
  return vendorList.value.filter((item) =>
    item.vendor.toLowerCase().includes(q)
  );
});

const totalSales = computed(() =>
  filteredRows.value.reduce((sum, item) => sum + item.sales, 0)
);

const totalUnits = computed(() =>
  filteredRows.value.reduce((sum, item) => sum + item.units, 0)
);

const avgMargin = computed(() => {
  if (!filteredRows.value.length) return 0;
  const sum = filteredRows.value.reduce((acc, item) => acc + item.margin, 0);
  return sum / filteredRows.value.length;
});

const stats = computed(() => [
  {
    label: language.t('netSales'),
    value: `$${formatMoney(totalSales.value)}`,
    subLabel: `${Math.round(totalSales.value * exchangeRate.value).toLocaleString()} ៛`,
    extra: 'Gross Revenue',
    icon: 'bi bi-cash-stack',
    bg: 'bg-primary-subtle',
    tone: 'text-primary'
  },
  {
    label: language.t('unitsSold'),
    value: totalUnits.value.toLocaleString(),
    subLabel: `${filteredRows.value.length} ${language.isKhmer ? 'ដៃគូ' : 'Vendors'}`,
    extra: 'Volume',
    icon: 'bi bi-boxes',
    bg: 'bg-info-subtle',
    tone: 'text-info-emphasis'
  },
  {
    label: language.isKhmer ? 'ចំនួនអ្នកផ្គត់ផ្គង់' : language.t('suppliers'),
    value: filteredRows.value.length.toString(),
    subLabel: language.isKhmer ? 'ដៃគូផ្គត់ផ្គង់សកម្ម' : 'Active suppliers',
    extra: 'Partners',
    icon: 'bi bi-truck',
    bg: 'bg-secondary-subtle',
    tone: 'text-secondary'
  },
  {
    label: language.t('grossProfit'),
    value: `$${formatMoney(totalSales.value * (avgMargin.value / 100))}`,
    subLabel: `Avg Margin: ${avgMargin.value.toFixed(1)}%`,
    extra: 'Net Margin',
    icon: 'bi bi-graph-up-arrow',
    bg: 'bg-success-subtle',
    tone: 'text-success'
  }
]);

function printReport() {
  window.print();
}

function exportCSV() {
  if (!vendorList.value.length) return;
  const headers = ['Vendor Name', 'Units Sold', 'Net Sales (USD)', 'Margin (%)'];
  const csvRows = vendorList.value.map((v) => [
    `"${v.vendor}"`,
    v.units,
    v.sales.toFixed(2),
    `${v.margin}%`
  ]);

  const csvContent =
    'data:text/csv;charset=utf-8,' +
    [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute(
    'download',
    `sales_by_vendor_${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
</script>

<style scoped>
.vendor-report-page {
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
  width: 230px;
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

.vendor-icon-avatar {
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
  .vendor-report-page {
    background: #fff;
    padding: 0 !important;
  }
}
</style>