<template>
  <section class="container-fluid p-4 page-canvas">
    <div class="mb-4">
      <div class="eyebrow mb-2">{{ language.t('inventory') }}</div>
      <h1 class="h3 fw-bold mb-1">{{ language.isKhmer ? 'ផ្ទេរស្តុករវាងសាខា' : 'Branch Stock Transfers' }}</h1>
      <p class="text-muted mb-0">
        {{ language.isKhmer ? 'ដកស្តុកពីសាខាដើមពេលផ្ញើ និងបន្ថែមទៅសាខាគោលដៅពេលទទួល។' : 'Dispatch stock from the source branch and add it to the destination when received.' }}
      </p>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <form class="card border-0 shadow-sm mb-4" @submit.prevent="createTransfer">
      <div class="card-body p-4">
        <h2 class="h5 fw-bold mb-3">{{ language.isKhmer ? 'បង្កើតការផ្ទេរ' : 'Create transfer' }}</h2>
        <div class="row g-3 mb-4">
          <div class="col-md-5">
            <label class="form-label">{{ language.isKhmer ? 'សាខាដើម' : 'From branch' }}</label>
            <input v-model.trim="form.fromBranch" class="form-control" required maxlength="120" @change="loadSourceItems" />
          </div>
          <div class="col-md-5">
            <label class="form-label">{{ language.isKhmer ? 'សាខាគោលដៅ' : 'To branch' }}</label>
            <input v-model.trim="form.toBranch" class="form-control" required maxlength="120" />
          </div>
        </div>

        <div class="row g-3 align-items-end">
          <div class="col-md-6">
            <label class="form-label">{{ language.t('item') }}</label>
            <select v-model.number="form.itemId" class="form-select" :disabled="loadingItems" required>
              <option value="" disabled>{{ language.isKhmer ? 'ជ្រើសរើសទំនិញ' : 'Select item' }}</option>
              <option v-for="item in sourceItems" :key="item.id" :value="item.id">
                {{ item.nameEn }} · {{ item.qtyOnHand }} {{ item.baseUnit }}
              </option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">{{ language.t('quantity') }}</label>
            <input v-model.number="form.qty" type="number" min="1" step="1" class="form-control" required />
          </div>
          <div class="col-md-3">
            <button class="btn btn-outline-primary w-100" type="button" :disabled="!form.itemId || !form.qty" @click="addLine">
              <i class="bi bi-plus-lg me-1"></i>{{ language.isKhmer ? 'បន្ថែមទំនិញ' : 'Add item' }}
            </button>
          </div>
        </div>

        <div v-if="lines.length" class="table-responsive mt-4">
          <table class="table align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>{{ language.t('item') }}</th>
                <th class="text-end">{{ language.t('quantity') }}</th>
                <th class="text-end">{{ language.isKhmer ? 'មាននៅសាខាដើម' : 'Available at source' }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, index) in lines" :key="line.itemId">
                <td>{{ line.itemName }} <small class="text-muted">{{ line.unit }}</small></td>
                <td class="text-end">{{ line.qty }}</td>
                <td class="text-end">{{ line.available }}</td>
                <td class="text-end">
                  <button class="btn btn-sm btn-outline-danger" type="button" :aria-label="language.t('delete')" @click="lines.splice(index, 1)">
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card-footer bg-white text-end">
        <button class="btn btn-primary" type="submit" :disabled="saving || !lines.length">
          <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
          {{ language.isKhmer ? 'ផ្ញើស្តុក' : 'Dispatch transfer' }}
        </button>
      </div>
    </form>

    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white py-3">
        <h2 class="h5 fw-bold mb-0">{{ language.isKhmer ? 'ប្រវត្តិផ្ទេរ' : 'Transfer history' }}</h2>
      </div>
      <div v-if="loadingTransfers" class="p-4 text-center text-muted">{{ language.t('loading') }}</div>
      <div v-else class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>{{ language.isKhmer ? 'លេខផ្ទេរ' : 'Transfer' }}</th>
              <th>{{ language.isKhmer ? 'ផ្លូវ' : 'Route' }}</th>
              <th>{{ language.t('items') }}</th>
              <th>{{ language.t('status') }}</th>
              <th>{{ language.t('date') }}</th>
              <th class="text-end">{{ language.isKhmer ? 'សកម្មភាព' : 'Actions' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="transfer in transfers" :key="transfer.id">
              <td class="fw-semibold">{{ transfer.transfer_no }}</td>
              <td>{{ transfer.from_branch }} → {{ transfer.to_branch }}</td>
              <td>
                <div v-for="item in transfer.items" :key="item.id">
                  {{ item.itemName }} <span class="text-muted">× {{ item.qty }}</span>
                </div>
              </td>
              <td><span class="badge" :class="transfer.status === 'Received' ? 'text-bg-success' : 'text-bg-warning'">{{ transferStatusLabel(transfer.status) }}</span></td>
              <td>{{ formatDate(transfer.created_at) }}</td>
              <td class="text-end">
                <button
                  v-if="transfer.status === 'In Transit'"
                  class="btn btn-sm btn-success"
                  type="button"
                  :disabled="receivingId === transfer.id"
                  @click="receiveTransfer(transfer)"
                >
                  <span v-if="receivingId === transfer.id" class="spinner-border spinner-border-sm me-1"></span>
                  {{ language.isKhmer ? 'ទទួល' : 'Receive' }}
                </button>
              </td>
            </tr>
            <tr v-if="!transfers.length">
              <td colspan="6" class="text-center text-muted py-4">{{ language.t('noRecords') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';
import { useTaxStore } from '@/stores/tax';
import { alertDialog } from '@/utils/dialog';

const language = useLanguageStore();
const tax = useTaxStore();
const form = reactive({
  fromBranch: tax.settings.branch || 'Head Quarter',
  toBranch: '',
  itemId: '',
  qty: null,
});
const sourceItems = ref([]);
const lines = ref([]);
const transfers = ref([]);
const loadingItems = ref(false);
const loadingTransfers = ref(false);
const saving = ref(false);
const receivingId = ref(null);
const error = ref('');

async function loadSourceItems() {
  if (!form.fromBranch.trim()) {
    sourceItems.value = [];
    return;
  }
  loadingItems.value = true;
  try {
    sourceItems.value = await api.items('', form.fromBranch.trim());
    lines.value = [];
    form.itemId = '';
  } catch (requestError) {
    error.value = requestError.message || (language.isKhmer ? 'មិនអាចទាញយកស្តុកសាខាដើមបានទេ។' : 'Failed to load source branch inventory.');
  } finally {
    loadingItems.value = false;
  }
}

async function loadTransfers() {
  loadingTransfers.value = true;
  try {
    transfers.value = await api.transfers();
  } catch (requestError) {
    error.value = requestError.message || (language.isKhmer ? 'មិនអាចទាញយកប្រវត្តិផ្ទេរបានទេ។' : 'Failed to load transfers.');
  } finally {
    loadingTransfers.value = false;
  }
}

function addLine() {
  error.value = '';
  const item = sourceItems.value.find((entry) => Number(entry.id) === Number(form.itemId));
  const quantity = Number(form.qty);
  if (!item || !Number.isSafeInteger(quantity) || quantity <= 0) {
    error.value = language.isKhmer ? 'សូមបញ្ចូលបរិមាណទំនិញជាចំនួនគត់វិជ្ជមាន។' : 'Enter a positive whole item quantity.';
    return;
  }
  const existing = lines.value.find((line) => line.itemId === item.id);
  const combinedQuantity = quantity + (existing?.qty || 0);
  if (combinedQuantity > Number(item.qtyOnHand)) {
    error.value = language.isKhmer
      ? `មាន ${item.qtyOnHand} ${item.baseUnit} នៅសាខា ${form.fromBranch} ប៉ុណ្ណោះ។`
      : `Only ${item.qtyOnHand} ${item.baseUnit} are available at ${form.fromBranch}.`;
    return;
  }
  if (existing) existing.qty = combinedQuantity;
  else lines.value.push({ itemId: item.id, itemName: item.nameEn, unit: item.baseUnit, qty: quantity, available: item.qtyOnHand });
  form.qty = null;
}

async function createTransfer() {
  error.value = '';
  if (form.fromBranch.trim().toLowerCase() === form.toBranch.trim().toLowerCase()) {
    error.value = language.isKhmer ? 'សាខាដើម និងសាខាគោលដៅត្រូវតែខុសគ្នា។' : 'Source and destination branches must be different.';
    return;
  }
  saving.value = true;
  try {
    const result = await api.saveTransfer({
      fromBranch: form.fromBranch.trim(),
      toBranch: form.toBranch.trim(),
      items: lines.value.map(({ itemId, qty }) => ({ itemId, qty })),
    });
    lines.value = [];
    form.itemId = '';
    form.qty = null;
    await Promise.all([loadTransfers(), tax.initialize()]);
    await alertDialog({
      title: language.isKhmer ? 'បានផ្ញើការផ្ទេរ' : 'Transfer dispatched',
      message: `${result.transferNo} · ${language.isKhmer ? 'ស្តុកត្រូវបានដកពីសាខាដើម។' : 'Stock was deducted from the source branch.'}`,
      variant: 'success',
    });
  } catch (requestError) {
    error.value = requestError.message || (language.isKhmer ? 'មិនអាចបញ្ជូនការផ្ទេរបានទេ។' : 'Failed to dispatch transfer.');
  } finally {
    saving.value = false;
  }
}

async function receiveTransfer(transfer) {
  error.value = '';
  receivingId.value = transfer.id;
  try {
    await api.receiveTransfer(transfer.id);
    await Promise.all([loadTransfers(), tax.initialize()]);
    await alertDialog({
      title: language.isKhmer ? 'បានទទួលការផ្ទេរ' : 'Transfer received',
      message: `${transfer.transfer_no} · ${language.isKhmer ? 'ស្តុកត្រូវបានបន្ថែមទៅសាខាគោលដៅ។' : 'Stock was added to the destination branch.'}`,
      variant: 'success',
    });
  } catch (requestError) {
    error.value = requestError.message || (language.isKhmer ? 'មិនអាចទទួលការផ្ទេរបានទេ។' : 'Failed to receive transfer.');
  } finally {
    receivingId.value = null;
  }
}

function transferStatusLabel(status) {
  if (status === 'Received') return language.isKhmer ? 'បានទទួល' : 'Received';
  if (status === 'In Transit') return language.isKhmer ? 'កំពុងដឹកជញ្ជូន' : 'In Transit';
  return status;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

onMounted(() => Promise.all([loadSourceItems(), loadTransfers()]));
</script>
