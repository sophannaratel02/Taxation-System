<template>
  <section class="container-fluid p-4 page-canvas">
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <div class="eyebrow text-primary text-uppercase small fw-bold mb-1">{{ language.t('reports') }}</div>
        <h1 class="h3 fw-bold mb-1">{{ language.isKhmer ? 'របាយការណ៍តម្លៃស្តុក និងប្រាក់ចំណេញ' : 'Inventory Valuation & Income Summary' }}</h1>
        <p class="text-muted mb-0">{{ language.isKhmer ? 'គណនាតាមថ្លៃដើមមធ្យមថ្លឹងតាមបរិមាណ៖ ថ្លៃដើមទិញដល់ឃ្លាំង ថ្លៃដើមលក់ពេលប្រតិបត្តិការ និងតម្លៃស្តុកនៅសល់។' : 'Perpetual moving weighted-average costing: landed purchase cost, sale-time COGS, and remaining inventory value.' }}</p>
      </div>
      <div class="d-flex flex-wrap align-items-end gap-2">
        <label class="small text-muted">
          {{ language.isKhmer ? 'ចាប់ពីថ្ងៃ' : 'Start date' }}
          <input v-model="startDate" type="date" class="form-control form-control-sm" />
        </label>
        <label class="small text-muted">
          {{ language.isKhmer ? 'ដល់ថ្ងៃ' : 'End date' }}
          <input v-model="endDate" type="date" class="form-control form-control-sm" />
        </label>
        <button class="btn btn-outline-primary" type="button" :disabled="loading" @click="loadReport">
          <i class="bi bi-arrow-clockwise me-2"></i>{{ language.isKhmer ? 'ធ្វើបច្ចុប្បន្នភាព' : 'Refresh' }}
        </button>
        <router-link to="/purchase/orders" class="btn btn-primary">
          <i class="bi bi-box-arrow-in-down me-2"></i>{{ language.isKhmer ? 'ការបញ្ជាទិញ' : 'Purchase orders' }}
        </router-link>
      </div>
    </div>

    <div v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</div>
    <div v-if="loading" class="alert alert-info" role="status">{{ language.isKhmer ? 'កំពុងផ្ទុករបាយការណ៍...' : 'Loading valuation report...' }}</div>

    <div v-if="summary" class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-white py-3">
        <strong>{{ language.isKhmer ? 'សង្ខេបប្រតិបត្តិការ' : 'Executive Summary' }}</strong>
      </div>
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>{{ language.isKhmer ? 'សូចនាករ' : 'Metric' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'បរិមាណ' : 'Quantity' }}</th>
              <th class="text-end">USD</th>
              <th class="text-end pe-4">KHR</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{{ language.isKhmer ? 'បរិមាណទិញសរុប' : 'Total Purchased Quantity' }}</td>
              <td class="text-end">{{ quantity(summary.total_purchased_qty) }}</td><td class="text-end">—</td><td class="text-end pe-4">—</td>
            </tr>
            <tr>
              <td>{{ language.isKhmer ? 'ថ្លៃដើមទិញដល់ឃ្លាំងសរុប' : 'Total Landed Cost' }}</td>
              <td class="text-end">—</td><td class="text-end">{{ usd(summary.total_landed_cost) }}</td><td class="text-end pe-4">{{ khr(summary.total_landed_cost) }}</td>
            </tr>
            <tr v-if="summary.is_balanced !== null">
              <td>{{ language.isKhmer ? 'ថ្លៃដើមទំនិញដែលអាចលក់បាន' : 'Total Available Goods Cost' }}</td>
              <td class="text-end">—</td><td class="text-end">{{ usd(summary.total_available_goods_cost) }}</td><td class="text-end pe-4">{{ khr(summary.total_available_goods_cost) }}</td>
            </tr>
            <tr v-if="summary.is_balanced !== null">
              <td>{{ language.isKhmer ? 'ថ្លៃដើមបង្វិលចេញផ្សេងៗ' : 'Other Stock Outflows' }}</td>
              <td class="text-end">—</td><td class="text-end">{{ usd(summary.other_stock_outflow_cost) }}</td><td class="text-end pe-4">{{ khr(summary.other_stock_outflow_cost) }}</td>
            </tr>
            <tr>
              <td>{{ language.isKhmer ? 'ចំនួនលក់សរុប' : 'Total Sold Quantity' }}</td>
              <td class="text-end">{{ quantity(summary.total_sold_qty) }}</td><td class="text-end">—</td><td class="text-end pe-4">—</td>
            </tr>
            <tr>
              <td>{{ language.isKhmer ? 'ប្រាក់ចំណូលសរុប' : 'Gross Revenue' }}</td>
              <td class="text-end">—</td><td class="text-end">{{ usd(summary.gross_revenue) }}</td><td class="text-end pe-4">{{ khr(summary.gross_revenue) }}</td>
            </tr>
            <tr>
              <td>{{ language.isKhmer ? 'ថ្លៃដើមទំនិញលក់ (COGS)' : 'Cost of Goods Sold (COGS)' }}</td>
              <td class="text-end">—</td><td class="text-end">{{ usd(summary.cogs) }}</td><td class="text-end pe-4">{{ khr(summary.cogs) }}</td>
            </tr>
            <tr>
              <td>{{ language.isKhmer ? 'បរិមាណស្តុកចុងក្រោយ' : 'Ending Stock Quantity' }}</td>
              <td class="text-end">{{ quantity(summary.ending_stock_qty) }}</td><td class="text-end">—</td><td class="text-end pe-4">—</td>
            </tr>
            <tr>
              <td>{{ language.isKhmer ? 'តម្លៃស្តុកចុងក្រោយ' : 'Ending Inventory Value' }}</td>
              <td class="text-end">—</td><td class="text-end">{{ usd(summary.ending_stock_value) }}</td><td class="text-end pe-4">{{ khr(summary.ending_stock_value) }}</td>
            </tr>
            <tr class="table-primary fw-bold">
              <td>{{ language.isKhmer ? 'ប្រាក់ចំណេញដុល' : 'Gross Profit' }}</td>
              <td class="text-end">—</td><td class="text-end">{{ usd(summary.gross_profit) }}</td><td class="text-end pe-4">{{ khr(summary.gross_profit) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card-footer bg-light">
        <div v-if="summary.is_balanced !== null" class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <strong>{{ language.isKhmer ? 'សមីការត្រួតពិនិត្យស្តុក' : 'Inventory Audit Balance' }}</strong>
          <span class="font-monospace">
            {{ usd(summary.total_available_goods_cost) }} = {{ usd(summary.cogs) }} + {{ usd(summary.other_stock_outflow_cost) }} + {{ usd(summary.ending_stock_value) }}
          </span>
          <span class="badge" :class="isBalanced ? 'text-bg-success' : 'text-bg-danger'">
            {{ isBalanced ? (language.isKhmer ? 'មានតុល្យភាព' : 'Balanced') : (language.isKhmer ? 'មិនមានតុល្យភាព' : 'Out of balance') }}
          </span>
        </div>
        <span v-else class="small text-muted">
          {{ language.isKhmer ? 'សមីការតុល្យភាពបង្ហាញសម្រាប់ប្រវត្តិទាំងមូលប៉ុណ្ណោះ ព្រោះស្តុកចុងក្រោយបង្ហាញបរិមាណបច្ចុប្បន្ន។' : 'The audit balance is shown for all-time totals only; ending inventory remains the current balance when dates are filtered.' }}
        </span>
      </div>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white py-3">
        <strong>{{ language.isKhmer ? 'តម្លៃស្តុកតាមទំនិញ' : 'Inventory Valuation by Item' }}</strong>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-4">{{ language.t('item') }}</th>
              <th class="text-end">{{ language.isKhmer ? 'បានទិញ' : 'Purchased' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ថ្លៃដល់ឃ្លាំង' : 'Landed Cost' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'លក់បាន' : 'Sold' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ប្រាក់ចំណូល' : 'Revenue' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ថ្លៃដើមទំនិញលក់' : 'COGS' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ប្រាក់ចំណេញដុល' : 'Gross Profit' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ថ្លៃដើមមធ្យម' : 'Moving Avg Cost' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'បរិមាណចុងក្រោយ' : 'Ending Qty' }}</th>
              <th class="text-end pe-4">{{ language.isKhmer ? 'តម្លៃចុងក្រោយ' : 'Ending Value' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.item_id">
              <td class="ps-4 fw-semibold">{{ item.item_name }}</td>
              <td class="text-end">{{ quantity(item.total_purchased_qty) }}</td>
              <td class="text-end font-monospace">{{ usd4(item.total_landed_cost) }}</td>
              <td class="text-end">{{ quantity(item.total_qty_sold) }}</td>
              <td class="text-end font-monospace">{{ usd(item.sales_amount) }}</td>
              <td class="text-end font-monospace">{{ usd(item.cogs_amount) }}</td>
              <td class="text-end font-monospace" :class="Number(item.gross_profit) >= 0 ? 'text-success' : 'text-danger'">{{ usd(item.gross_profit) }}</td>
              <td class="text-end font-monospace">{{ usd4(item.moving_avg_cost) }}</td>
              <td class="text-end">{{ quantity(item.qty_on_hand) }}</td>
              <td class="text-end pe-4 font-monospace">{{ usd(item.total_stock_value) }}</td>
            </tr>
            <tr v-if="!items.length && !loading && !errorMessage">
              <td colspan="10" class="text-center text-muted py-4">{{ language.t('noRecords') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card border-0 shadow-sm mt-4">
      <div class="card-header bg-white py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <strong>{{ language.isKhmer ? 'ចលនាថ្លៃដើមស្តុក' : 'Stock Cost Movements' }}</strong>
          <small class="d-block text-muted">{{ language.isKhmer ? 'ថ្លៃដើមមធ្យមថ្លឹងតាមបរិមាណសម្រាប់ការទិញ ការលក់ ការកែតម្រូវ ការផ្ទេរ និងការបង្វិលត្រឡប់។' : 'Perpetual moving-average costs for purchases, sales, adjustments, transfers, and returns.' }}</small>
        </div>
        <span class="badge text-bg-light border">{{ language.isKhmer ? 'បង្ហាញចុងក្រោយ ៥០០ ប្រតិបត្តិការ' : 'Latest 500 costed stock movements' }}</span>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-4">{{ language.isKhmer ? 'កាលបរិច្ឆេទ' : 'Date' }}</th>
              <th>{{ language.t('item') }}</th>
              <th>{{ language.isKhmer ? 'ប្រភេទ' : 'Type' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'បរិមាណចលនា' : 'Qty Change' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'សមតុល្យបន្ទាប់' : 'Balance After' }}</th>
              <th class="text-end">{{ language.isKhmer ? 'ថ្លៃដើមក្នុងមួយឯកតា' : 'Unit Cost' }}</th>
              <th class="text-end pe-4">{{ language.isKhmer ? 'ថ្លៃដើមចលនា' : 'Movement Cost' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="movement in movements" :key="movement.id">
              <td class="ps-4 text-nowrap">{{ movement.date }}</td>
              <td class="fw-semibold">{{ movement.item_name }}</td>
              <td>
                <span class="badge" :class="movement.type === 'Purchase' ? 'text-bg-primary-subtle text-primary-emphasis' : movement.type === 'Return' ? (Number(movement.qty) >= 0 ? 'text-bg-success-subtle text-success-emphasis' : 'text-bg-danger-subtle text-danger-emphasis') : 'text-bg-warning-subtle text-warning-emphasis'">
                  {{ movementTypeLabel(movement.type) }}
                </span>
              </td>
              <td class="text-end">{{ quantity(movement.qty) }}</td>
              <td class="text-end">{{ quantity(movement.balance_after) }}</td>
              <td class="text-end font-monospace">{{ usd4(movement.unit_cost) }}</td>
              <td class="text-end pe-4 font-monospace">{{ usd(movement.movement_cost) }}</td>
            </tr>
            <tr v-if="!movements.length && !loading && !errorMessage">
              <td colspan="7" class="text-center text-muted py-4">{{ language.t('noRecords') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '@/services/api';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();
const summary = ref(null);
const items = ref([]);
const movements = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const startDate = ref('');
const endDate = ref('');
const exchangeRate = computed(() => Number(tax.settings?.exchangeRate) || 4000);
const isBalanced = computed(() => Boolean(summary.value?.is_balanced));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSummary = (rawSummary = {}) => {
  if (!rawSummary || typeof rawSummary !== 'object') return {};
  return {
    ...rawSummary,
    total_purchased_qty: toNumber(rawSummary.total_purchased_qty),
    total_landed_cost: toNumber(rawSummary.total_landed_cost),
    total_available_goods_cost: toNumber(rawSummary.total_available_goods_cost),
    other_stock_outflow_cost: toNumber(rawSummary.other_stock_outflow_cost),
    total_sold_qty: toNumber(rawSummary.total_sold_qty),
    gross_revenue: toNumber(rawSummary.gross_revenue),
    cogs: toNumber(rawSummary.cogs),
    ending_stock_qty: toNumber(rawSummary.ending_stock_qty),
    ending_stock_value: toNumber(rawSummary.ending_stock_value),
    gross_profit: toNumber(rawSummary.gross_profit),
    is_balanced: rawSummary.is_balanced ?? null,
  };
};

const normalizeItems = (rawItems = []) => {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item = {}) => ({
    ...item,
    purchased_qty: toNumber(item.purchased_qty),
    landed_cost: toNumber(item.landed_cost),
    sold_qty: toNumber(item.sold_qty),
    sales_amount: toNumber(item.sales_amount),
    cogs_amount: toNumber(item.cogs_amount),
    ending_stock_qty: toNumber(item.ending_stock_qty),
    ending_stock_value: toNumber(item.ending_stock_value),
    gross_profit: toNumber(item.gross_profit),
  }));
};

const normalizeMovements = (rawMovements = []) => {
  if (!Array.isArray(rawMovements)) return [];
  return rawMovements.map((movement = {}) => ({
    ...movement,
    qty: toNumber(movement.qty),
    balance_after: toNumber(movement.balance_after),
    unit_cost: toNumber(movement.unit_cost),
    movement_cost: toNumber(movement.movement_cost),
  }));
};

function usd(value) {
  return `$${toNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function movementTypeLabel(type) {
  if (!language.isKhmer) return type;
  const labels = {
    Purchase: 'ការទិញ',
    Sale: 'ការលក់',
    Return: 'ការត្រឡប់',
    Adjustment: 'ការកែតម្រូវ',
    Transfer: 'ការផ្ទេរ',
  };
  return labels[type] || type;
}

function usd4(value) {
  return `$${toNumber(value).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function khr(value) {
  return `${Math.round(toNumber(value) * exchangeRate.value).toLocaleString()} ៛`;
}

function quantity(value) {
  return toNumber(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

async function loadReport() {
  loading.value = true;
  errorMessage.value = '';

  if (startDate.value && endDate.value && startDate.value > endDate.value) {
    errorMessage.value = language.isKhmer ? 'ថ្ងៃចាប់ផ្តើមមិនអាចនៅក្រោយថ្ងៃបញ្ចប់ទេ។' : 'Start date cannot be later than end date.';
    loading.value = false;
    summary.value = null;
    items.value = [];
    movements.value = [];
    return;
  }

  try {
    const result = await api.inventoryValuation({
      branch: tax.settings?.branch || '',
      ...(startDate.value ? { startDate: startDate.value } : {}),
      ...(endDate.value ? { endDate: endDate.value } : {}),
    });
    const payload = result && typeof result === 'object' ? result : {};
    summary.value = normalizeSummary(payload.summary);
    items.value = normalizeItems(payload.items);
    movements.value = normalizeMovements(payload.movements);
  } catch (error) {
    errorMessage.value = error?.message || (language.isKhmer ? 'មិនអាចផ្ទុករបាយការណ៍បានទេ។' : 'Could not load the inventory valuation report.');
  } finally {
    loading.value = false;
  }
}

onMounted(loadReport);
</script>
