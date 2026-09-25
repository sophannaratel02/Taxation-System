<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Header -->
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <div class="eyebrow text-primary text-uppercase small fw-bold mb-1">
          {{ language.t('vendorPurchase') }}
        </div>
        <h1 class="h3 fw-bold mb-1">
          {{ language.isKhmer ? 'បញ្ជាទិញទំនិញ' : 'Purchase Orders' }}
        </h1>
        <p class="text-muted mb-0">
          {{ language.isKhmer 
            ? 'បង្កើត កែសម្រួល និងគ្រប់គ្រងការបញ្ជាទិញទំនិញពីអ្នកផ្គត់ផ្គង់។' 
            : 'Create, edit and manage multi-product purchase orders.' 
          }}
        </p>
      </div>
      <button class="btn btn-primary" type="button" @click="openCreate">
        <i class="bi bi-plus-lg me-2"></i>{{ language.isKhmer ? 'បង្កើតការបញ្ជាទិញថ្មី' : 'New Purchase Order' }}
      </button>
    </div>

    <!-- Error Banner -->
    <div v-if="error" class="alert alert-danger alert-dismissible fade show" role="alert">
      <i class="bi bi-exclamation-triangle-fill me-2"></i>
      {{ error }}
      <button type="button" class="btn-close" aria-label="Close" @click="error = ''"></button>
    </div>

    <!-- Purchase Order Form Card/Drawer -->
    <form v-if="editorOpen" class="card border-0 shadow-sm mb-4" @submit.prevent="saveOrder">
      <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
        <strong>
          {{ editingId 
            ? (language.isKhmer ? `កែប្រែ #${editingId}` : `Edit #${editingId}`) 
            : (language.isKhmer ? 'បង្កើតការបញ្ជាទិញថ្មី' : 'New Purchase Order') 
          }}
        </strong>
        <button class="btn-close" type="button" aria-label="Close" @click="editorOpen = false"></button>
      </div>

      <div class="card-body">
        <!-- Order Metadata -->
        <div class="row g-3 mb-4">
          <div class="col-md-5">
            <label class="form-label fw-semibold">
              {{ language.isKhmer ? 'អ្នកផ្គត់ផ្គង់' : 'Supplier / Vendor' }}
            </label>
            <select v-model="form.vendorId" class="form-select" required>
              <option value="">
                {{ language.isKhmer ? '-- សូមជ្រើសរើសអ្នកផ្គត់ផ្គង់ --' : '-- Select Supplier --' }}
              </option>
              <option v-for="vendor in tax.vendors" :key="vendor.id" :value="vendor.id">
                {{ vendor.name }}
              </option>
            </select>
          </div>

          <div class="col-md-3">
            <label class="form-label fw-semibold">
              {{ language.isKhmer ? 'កាលបរិច្ឆេទបញ្ជាទិញ' : 'Order Date' }}
            </label>
            <input v-model="form.orderDate" type="date" class="form-control" required />
          </div>

          <div class="col-md-4">
            <label class="form-label fw-semibold">
              {{ language.isKhmer ? 'កំណត់ចំណាំ' : 'Note / Remarks' }}
            </label>
            <input
              v-model.trim="form.note"
              type="text"
              class="form-control"
              :placeholder="language.isKhmer ? 'កំណត់ចំណាំបន្ថែម...' : 'Optional notes or instructions'"
            />
          </div>
        </div>

        <!-- Products Header Action -->
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>{{ language.t('items') }}</strong>
          <button class="btn btn-outline-primary btn-sm" type="button" @click="addRow">
            <i class="bi bi-plus-lg me-1"></i>{{ language.isKhmer ? 'បន្ថែមទំនិញ' : 'Add Product' }}
          </button>
        </div>

        <!-- Line Item Entry Table -->
        <div class="table-responsive purchase-table">
          <table class="table align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th style="width: 48px;">#</th>
                <th>{{ language.t('item') }}</th>
                <th style="width: 110px;">{{ language.t('quantity') }}</th>
                <th style="width: 140px;">{{ language.t('price') }}</th>
                <th style="width: 160px;">{{ language.isKhmer ? 'ថ្ងៃដឹកជញ្ជូន' : 'Delivery Date' }}</th>
                <th style="width: 140px;">{{ language.isKhmer ? 'ថ្លៃដឹកជញ្ជូន' : 'Delivery Fee' }}</th>
                <th class="text-end" style="width: 130px;">{{ language.t('amount') }}</th>
                <th style="width: 50px;"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in form.items" :key="item.key">
                <td class="text-muted">{{ index + 1 }}</td>
                <td>
                  <select
                    v-model="item.itemId"
                    class="form-select form-select-sm"
                    @change="setProductName(item)"
                  >
                    <option value="">
                      {{ language.isKhmer ? '-- ជ្រើសរើសពីកាតាឡុក --' : 'Select item catalog' }}
                    </option>
                    <option v-for="product in tax.items" :key="product.id" :value="product.id">
                      {{ getItemDisplayName(product) }}
                    </option>
                  </select>
                  <input
                    v-model.trim="item.productName"
                    class="form-control form-control-sm mt-1"
                    :placeholder="language.isKhmer ? 'ឬបញ្ចូលឈ្មោះទំនិញដោយដៃ...' : 'Or enter custom product name'"
                    required
                  />
                </td>
                <td>
                  <input
                    v-model.number="item.qty"
                    type="number"
                    min="0.001"
                    step="any"
                    class="form-control form-control-sm"
                    required
                  />
                </td>
                <td>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text">$</span>
                    <input
                      v-model.number="item.unitPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      class="form-control"
                      required
                    />
                  </div>
                </td>
                <td>
                  <input
                    v-model="item.deliveryDate"
                    type="date"
                    class="form-control form-control-sm"
                    required
                  />
                </td>
                <td>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text">$</span>
                    <input
                      v-model.number="item.deliveryPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      class="form-control"
                      required
                    />
                  </div>
                </td>
                <td class="text-end fw-bold text-primary">
                  ${{ formatCurrency(itemTotal(item)) }}
                </td>
                <td class="text-center">
                  <button
                    class="btn btn-sm btn-outline-danger"
                    type="button"
                    :title="language.isKhmer ? 'លុបចេញ' : 'Remove item'"
                    :disabled="form.items.length === 1"
                    @click="removeRow(index)"
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot class="table-light">
              <tr>
                <td colspan="6" class="text-end fw-semibold">
                  {{ language.t('netSale') }}
                </td>
                <td class="text-end fw-semibold">${{ formatCurrency(totals.subtotal) }}</td>
                <td></td>
              </tr>
              <tr>
                <td colspan="6" class="text-end fw-semibold">
                  {{ language.isKhmer ? 'ថ្លៃដឹកជញ្ជូនសរុប' : 'Total Delivery Price' }}
                </td>
                <td class="text-end fw-semibold">${{ formatCurrency(totals.deliveryTotal) }}</td>
                <td></td>
              </tr>
              <tr>
                <td colspan="6" class="text-end fw-bold">
                  {{ language.t('grandTotal') }}
                </td>
                <td class="text-end fw-bold text-primary fs-5">
                  ${{ formatCurrency(totals.grandTotal) }}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Validation Prompt -->
        <div v-if="validationMessage" class="alert alert-warning py-2 mt-3 mb-0" role="alert">
          <i class="bi bi-exclamation-circle me-1"></i>
          {{ validationMessage }}
        </div>

        <!-- Tax & Summary Breakdown -->
        <div class="purchase-tax-summary">
          <div>
            <span>{{ language.t('netSale') }}</span>
            <strong>${{ formatCurrency(totals.subtotal) }}</strong>
          </div>
          <div>
            <span>{{ language.isKhmer ? 'ថ្លៃដឹកជញ្ជូន' : 'Delivery' }}</span>
            <strong>${{ formatCurrency(totals.deliveryTotal) }}</strong>
          </div>
          <div>
            <span>VAT ({{ vatRate }}%)</span>
            <strong>${{ formatCurrency(totals.taxAmount) }}</strong>
          </div>
          <div class="grand">
            <span>{{ language.t('grandTotal') }}</span>
            <strong>${{ formatCurrency(totals.grandTotal) }}</strong>
          </div>
        </div>
      </div>

      <div class="card-footer bg-white d-flex justify-content-end gap-2 py-3">
        <button class="btn btn-light border" type="button" @click="editorOpen = false">
          {{ language.t('cancel') }}
        </button>
        <button class="btn btn-success" type="submit" :disabled="saving">
          <span
            v-if="saving"
            class="spinner-border spinner-border-sm me-2"
            role="status"
            aria-hidden="true"
          ></span>
          {{ saving ? language.t('saving') : language.t('save') }}
        </button>
      </div>
    </form>

    <!-- Orders Master Listing -->
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white py-3 border-bottom">
        <strong class="mb-0">{{ language.t('purchaseOrders') }}</strong>
      </div>
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>{{ language.isKhmer ? 'លេខបញ្ជាទិញ' : 'Order' }}</th>
              <th>{{ language.isKhmer ? 'អ្នកផ្គត់ផ្គង់' : 'Supplier' }}</th>
              <th>{{ language.t('items') }}</th>
              <th>{{ language.t('netSale') }}</th>
              <th>{{ language.isKhmer ? 'ថ្លៃដឹកជញ្ជូន' : 'Delivery' }}</th>
              <th>{{ language.t('grandTotal') }}</th>
              <th>{{ language.t('status') }}</th>
              <th class="text-end pe-3">{{ language.isKhmer ? 'សកម្មភាព' : 'Actions' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in tax.purchaseOrders" :key="order.id">
              <td class="fw-semibold text-primary">#{{ order.id }}</td>
              <td>{{ order.vendor || order.vendorName }}</td>
              <td>{{ order.itemCount || order.items?.length || 0 }}</td>
              <td>${{ formatCurrency(order.subtotal) }}</td>
              <td>${{ formatCurrency(order.deliveryTotal) }}</td>
              <td class="fw-bold text-dark">${{ formatCurrency(order.total) }}</td>
              <td>
                <span class="badge text-bg-warning-subtle text-warning-emphasis">
                  {{ order.status || 'Pending' }}
                </span>
              </td>
              <td class="text-end text-nowrap pe-3">
                <button
                  class="btn btn-sm btn-outline-primary me-1"
                  type="button"
                  :title="language.t('edit')"
                  @click="openEdit(order)"
                >
                  <i class="bi bi-pencil"></i>
                </button>
                <button
                  class="btn btn-sm btn-outline-danger"
                  type="button"
                  :title="language.t('delete')"
                  @click="deleteOrder(order)"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </td>
            </tr>
            <tr v-if="!tax.purchaseOrders?.length">
              <td colspan="8" class="text-center text-muted py-5">
                <i class="bi bi-inbox fs-3 d-block mb-2 text-secondary"></i>
                {{ language.t('noRecords') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();

const editorOpen = ref(false);
const editingId = ref('');
const saving = ref(false);
const error = ref('');
const validationMessage = ref('');
let rowKey = 0;

const vatRate = computed(() => Number(tax.settings?.vatRate) || 10);

function getItemDisplayName(product) {
  if (language.isKhmer && (product.nameKh || product.nameKm)) {
    return product.nameKh || product.nameKm;
  }
  return product.nameEn || product.name || 'Item';
}

function createBlankRow() {
  return {
    key: `po-row-${rowKey++}`,
    itemId: '',
    productName: '',
    qty: 1,
    unitPrice: 0,
    deliveryDate: new Date().toISOString().slice(0, 10),
    deliveryPrice: 0
  };
}

const form = reactive({
  vendorId: '',
  orderDate: new Date().toISOString().slice(0, 10),
  note: '',
  items: [createBlankRow()]
});

function formatCurrency(val) {
  return Number(val || 0).toFixed(2);
}

function itemTotal(item) {
  const lineItem = Number(item.qty || 0) * Number(item.unitPrice || 0);
  const delivery = Number(item.deliveryPrice || 0);
  return lineItem + delivery;
}

const totals = computed(() => {
  const calculated = form.items.reduce(
    (acc, item) => {
      const lineItem = Number(item.qty || 0) * Number(item.unitPrice || 0);
      const delivery = Number(item.deliveryPrice || 0);
      acc.subtotal += lineItem;
      acc.deliveryTotal += delivery;
      return acc;
    },
    { subtotal: 0, deliveryTotal: 0 }
  );

  const taxAmount = (calculated.subtotal + calculated.deliveryTotal) * (vatRate.value / 100);
  const grandTotal = calculated.subtotal + calculated.deliveryTotal + taxAmount;

  return {
    subtotal: calculated.subtotal,
    deliveryTotal: calculated.deliveryTotal,
    taxAmount,
    grandTotal
  };
});

function resetForm() {
  editingId.value = '';
  form.vendorId = '';
  form.orderDate = new Date().toISOString().slice(0, 10);
  form.note = '';
  form.items = [createBlankRow()];
  validationMessage.value = '';
  error.value = '';
}

function openCreate() {
  resetForm();
  editorOpen.value = true;
}

function addRow() {
  form.items.push(createBlankRow());
}

function removeRow(index) {
  if (form.items.length > 1) {
    form.items.splice(index, 1);
  }
}

function setProductName(item) {
  const product = tax.items.find((entry) => Number(entry.id) === Number(item.itemId));
  if (product) {
    item.productName = getItemDisplayName(product);
    item.unitPrice = product.purchaseCost || 0;
  }
}

async function fetchOrder(id) {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
  const token = localStorage.getItem('tax_token');

  const response = await fetch(`${baseUrl}/purchase-orders/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || 'Could not load purchase order');
  }
  return payload;
}

async function openEdit(order) {
  try {
    const detail = await fetchOrder(order.id);
    editingId.value = order.id;
    form.vendorId = String(detail.vendor_id || detail.vendorId || '');
    form.orderDate = detail.created_at
      ? new Date(detail.created_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    form.note = detail.note || '';
    form.items = (detail.items || []).map((item) => ({
      ...item,
      key: `po-row-${rowKey++}`,
      itemId: item.itemId ? String(item.itemId) : ''
    }));
    editorOpen.value = true;
    validationMessage.value = '';
  } catch (requestError) {
    error.value = requestError.message;
  }
}

function validate() {
  if (!form.vendorId) {
    return language.isKhmer ? 'សូមជ្រើសរើសអ្នកផ្គត់ផ្គង់។' : 'Supplier is required.';
  }
  if (!form.items.length) {
    return language.isKhmer ? 'សូមបន្ថែមទំនិញយ៉ាងហោចណាស់ ១ មុខ។' : 'Add at least one product row.';
  }

  for (let index = 0; index < form.items.length; index += 1) {
    const item = form.items[index];
    const rowNum = index + 1;

    if (!item.productName?.trim()) {
      return language.isKhmer
        ? `សូមបញ្ចូលឈ្មោះទំនិញសម្រាប់ជួរទី ${rowNum}។`
        : `Product name is required for row ${rowNum}.`;
    }
    if (Number(item.qty) <= 0) {
      return language.isKhmer
        ? `បរិមាណត្រូវតែធំជាង 0 សម្រាប់ជួរទី ${rowNum}។`
        : `Qty must be greater than 0 for row ${rowNum}.`;
    }
    if (Number(item.unitPrice) < 0) {
      return language.isKhmer
        ? `តម្លៃមិនអាចជាលេខអវិជ្ជមានបានទេ (ជួរទី ${rowNum})។`
        : `Unit price cannot be negative for row ${rowNum}.`;
    }
    if (Number(item.deliveryPrice) < 0) {
      return language.isKhmer
        ? `ថ្លៃដឹកជញ្ជូនមិនអាចជាលេខអវិជ្ជមានបានទេ (ជួរទី ${rowNum})។`
        : `Delivery price cannot be negative for row ${rowNum}.`;
    }
    if (!item.deliveryDate) {
      return language.isKhmer
        ? `សូមជ្រើសរើសកាលបរិច្ឆេទដឹកជញ្ជូនសម្រាប់ជួរទី ${rowNum}។`
        : `Delivery date is required for row ${rowNum}.`;
    }
  }
  return '';
}

async function saveOrder() {
  validationMessage.value = validate();
  if (validationMessage.value) return;

  saving.value = true;
  error.value = '';

  try {
    const vendor = tax.vendors.find((item) => Number(item.id) === Number(form.vendorId));
    const sortedDates = form.items.map((item) => item.deliveryDate).filter(Boolean).sort();

    const payload = {
      vendorId: Number(form.vendorId),
      vendorName: vendor?.name || '',
      expectedDate: sortedDates[0] || form.orderDate,
      note: form.note,
      items: form.items.map(({ key, ...item }) => ({
        ...item,
        itemId: item.itemId ? Number(item.itemId) : null
      }))
    };

    if (editingId.value) {
      await tax.updatePurchaseOrder(editingId.value, payload);
    } else {
      await tax.savePurchaseOrder(payload);
    }

    editorOpen.value = false;
    resetForm();
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    saving.value = false;
  }
}

async function deleteOrder(order) {
  const confirmMsg = language.isKhmer
    ? `តើអ្នកប្រាកដថាចង់លុបការបញ្ជាទិញ #${order.id} នេះមែនទេ?`
    : `Delete purchase order #${order.id}?`;

  if (!window.confirm(confirmMsg)) return;

  try {
    await tax.deletePurchaseOrder(order.id);
  } catch (requestError) {
    error.value = requestError.message;
  }
}

onMounted(() => {
  if (typeof tax.initialize === 'function') {
    tax.initialize();
  }
});
</script>

<style scoped>
.purchase-table {
  overflow-x: auto;
}

.purchase-table table {
  min-width: 1040px;
}

.purchase-table th {
  white-space: nowrap;
  font-size: 0.78rem;
  text-transform: uppercase;
  color: #6b7a90;
}

.purchase-table td {
  min-width: 120px;
}

.purchase-tax-summary {
  display: flex;
  justify-content: flex-end;
  gap: 1.5rem;
  flex-wrap: wrap;
  margin-top: 1.25rem;
  padding: 1rem 1.25rem;
  border: 1px solid #e5eaf1;
  border-radius: 10px;
  background: #f8fafc;
}

.purchase-tax-summary div {
  display: flex;
  flex-direction: column;
  min-width: 120px;
  text-align: right;
}

.purchase-tax-summary span {
  color: #6b7a90;
  font-size: 0.78rem;
}

.purchase-tax-summary strong {
  color: #172b4d;
  font-size: 1.05rem;
}

.purchase-tax-summary .grand {
  border-left: 1px solid #dce3ec;
  padding-left: 1.5rem;
}

.purchase-tax-summary .grand strong {
  color: #0d6efd;
  font-size: 1.25rem;
}
</style>