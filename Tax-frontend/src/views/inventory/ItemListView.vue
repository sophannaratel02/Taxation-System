<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Header & Action -->
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <div class="eyebrow mb-2">{{ language.t('inventoryMaster') }}</div>
        <h1 class="h3 fw-bold mb-1">{{ language.isKhmer ? 'បញ្ជីទំនិញ និងខ្នាត' : language.t('items') }}</h1>
        <p class="text-muted mb-0">
          {{ language.t('manageProducts') }}
        </p>
      </div>
      <router-link to="/inventory/items/new" class="btn btn-primary">
        <i class="bi bi-plus-lg me-2"></i>{{ language.t('newItem') }}
      </router-link>
    </div>

    <!-- Summary Metrics -->
    <div class="row g-3 mb-4">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="col-sm-6 col-xl-3"
      >
        <div class="card metric-card h-100 border-0 shadow-sm">
          <div class="card-body">
            <small class="text-muted">{{ stat.label }}</small>
            <div class="h4 fw-bold mt-2 mb-0">{{ stat.value }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Inventory Table Card -->
    <div class="card border-0 shadow-sm">
      <!-- Search & Filters -->
      <div class="card-header bg-white border-0 py-3">
        <div class="row g-2 align-items-center">
          <div class="col-md-6">
            <div class="input-group">
              <span class="input-group-text bg-white">
                <i class="bi bi-search text-muted"></i>
              </span>
              <input
                v-model.trim="query"
                type="text"
                class="form-control"
                :placeholder="language.t('searchItems')"
              />
            </div>
          </div>

          <div class="col-md-3">
            <select v-model="category" class="form-select">
              <option value="">{{ language.t('allCategories') }}</option>
              <option
                v-for="option in categories"
                :key="option"
                :value="option"
              >
                {{ option }}
              </option>
            </select>
          </div>

          <div class="col-md-3 text-md-end">
            <span class="small text-muted">{{ filteredItems.length }} {{ language.t('itemsShown') }}</span>
          </div>
        </div>
      </div>

      <!-- Table Body -->
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>{{ language.t('item') }}</th>
              <th>{{ language.t('category') }}</th>
              <th>{{ language.t('uom') }}</th>
              <th class="text-end">{{ language.t('onHand') }}</th>
              <th class="text-end">{{ language.t('avgCost') }}</th>
              <th class="text-end">{{ language.t('retail') }}</th>
              <th>{{ language.t('status') }}</th>
              <th class="text-end">{{ language.isKhmer ? 'សកម្មភាព' : 'Actions' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredItems" :key="item.id">
              <td>
                <strong>{{ item.nameEn }}</strong>
                <small class="d-block text-muted">
                  {{ item.nameKh || '—' }} · {{ item.barcode }}
                </small>
              </td>
              <td>{{ item.category || 'General' }}</td>
              <td>
                <template v-if="item.units?.length">
                  <span
                    v-for="unit in item.units"
                    :key="unit.name"
                    class="badge text-bg-light border me-1"
                  >
                    {{ unit.name }} ×{{ unit.ratio }}
                  </span>
                </template>
                <span v-else class="badge text-bg-light border">
                  {{ item.baseUnit || 'Unit' }}
                </span>
              </td>
              <td class="text-end fw-semibold">{{ item.qtyOnHand ?? 0 }}</td>
              <td class="text-end">${{ formatCurrency(item.averageCost ?? item.purchaseCost) }}</td>
              <td class="text-end">${{ formatCurrency(item.retailPrice) }}</td>
              <td>
                <span :class="['badge', getStatusBadge(item).class]">
                  {{ getStatusBadge(item).text }}
                </span>
              </td>
              <td class="text-end text-nowrap">
                <router-link :to="`/inventory/items/${item.id}/edit`" class="btn btn-sm btn-outline-primary me-1" :title="language.isKhmer ? 'កែប្រែ' : 'Edit'"><i class="bi bi-pencil"></i></router-link>
                <button class="btn btn-sm btn-outline-danger" type="button" :title="language.isKhmer ? 'លុប' : 'Delete'" @click="deleteItem(item)"><i class="bi bi-trash"></i></button>
              </td>
            </tr>

            <!-- Empty State -->
            <tr v-if="filteredItems.length === 0">
              <td colspan="8" class="text-center py-5 text-muted">
                <i class="bi bi-inbox fs-2 d-block mb-2"></i>
                {{ language.t('noItemsMatch') }}
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
import { alertDialog, confirmDialog } from '@/utils/dialog';

const tax = useTaxStore();
const language = useLanguageStore();

const query = ref('');
const category = ref('');

const categories = computed(() => {
  const items = tax.items || [];
  return [...new Set(items.map((item) => item.category).filter(Boolean))];
});

const filteredItems = computed(() => {
  const items = tax.items || [];
  const q = query.value.toLowerCase().trim();

  return items.filter((item) => {
    const matchesCategory = !category.value || item.category === category.value;
    if (!matchesCategory) return false;
    if (!q) return true;

    const searchable = `${item.nameEn || ''} ${item.nameKh || ''} ${item.barcode || ''} ${item.category || ''}`.toLowerCase();
    return searchable.includes(q);
  });
});

const stats = computed(() => {
  const items = tax.items || [];
  const lowStock = tax.lowStockItems || items.filter((i) => i.qtyOnHand > 0 && i.qtyOnHand <= i.reorderQty);
  const outOfStock = items.filter((i) => (i.qtyOnHand ?? 0) === 0);
  const inventoryValue = tax.inventoryValue ?? 0;

  return [
    { label: 'Total items', value: items.length },
    { label: 'Low stock', value: lowStock.length },
    { label: 'Out of stock', value: outOfStock.length },
    { label: 'Stock value', value: `$${formatCurrency(inventoryValue)}` }
  ];
});

function formatCurrency(val) {
  return Number(val || 0).toFixed(2);
}

function getStatusBadge(item) {
  const qty = item.qtyOnHand ?? 0;
  const reorder = item.reorderQty ?? 0;

  if (qty <= 0) {
    return { class: 'text-bg-danger', text: language.t('outOfStock') };
  }
  if (qty <= reorder) {
    return { class: 'text-bg-warning', text: language.t('reorder') };
  }
  return { class: 'text-bg-success', text: language.t('healthy') };
}

async function deleteItem(item) {
  const message = language.isKhmer ? `លុបទំនិញ "${item.nameEn}" មែនទេ? ប្រវត្តិស្តុកនឹងនៅរក្សាទុក។` : `Archive "${item.nameEn}"? Stock and invoice history will be preserved.`;
  const confirmed = await confirmDialog({
    title: language.isKhmer ? 'លុបទំនិញ' : 'Delete item',
    message,
    variant: 'danger',
    confirmText: language.isKhmer ? 'លុប' : 'Delete',
  });
  if (!confirmed) return;

  try {
    await tax.deleteItem(item.id);
  } catch (error) {
    await alertDialog({
      title: language.isKhmer ? 'លុបបរាជ័យ' : 'Delete failed',
      message: error.message || 'Unable to delete item.',
      variant: 'danger',
      confirmText: 'OK',
    });
  }
}
</script>