<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Header -->
    <div class="mb-4">
      <div class="eyebrow mb-2">{{ text.inventoryMaster }}</div>
      <h1 class="h3 fw-bold mb-1">{{ isEditing ? text.editTitle : text.createTitle }}</h1>
      <p class="text-muted mb-0">{{ text.description }}</p>
    </div>

    <!-- Create Form -->
    <form class="card border-0 shadow-sm p-4" @submit.prevent="save">
      <div class="row g-3">
        <!-- Names -->
        <div class="col-md-6">
          <label class="form-label">{{ text.englishName }}</label>
          <input
            v-model.trim="form.nameEn"
            type="text"
            class="form-control"
            :placeholder="text.englishNamePlaceholder"
            required
          />
        </div>

        <div class="col-md-6">
          <label class="form-label">{{ text.khmerName }}</label>
          <input
            v-model.trim="form.nameKh"
            type="text"
            class="form-control"
            :placeholder="text.khmerNamePlaceholder"
          />
        </div>

        <!-- Classifications -->
        <div class="col-md-4">
          <label class="form-label">{{ text.barcode }}</label>
          <input
            v-model.trim="form.barcode"
            type="text"
            class="form-control"
            :placeholder="text.barcodePlaceholder"
            required
          />
        </div>

        <div class="col-md-4">
          <label class="form-label">{{ text.category }}</label>
          <input
            v-model.trim="form.category"
            type="text"
            class="form-control"
            :placeholder="text.categoryPlaceholder"
            required
          />
        </div>

        <div class="col-md-4">
          <label class="form-label">{{ text.department }}</label>
          <input
            v-model.trim="form.department"
            type="text"
            class="form-control"
            :placeholder="text.departmentPlaceholder"
          />
        </div>

        <!-- Pricing & Units -->
        <div class="col-md-3">
          <label class="form-label">{{ text.baseUnit }}</label>
          <input
            v-model.trim="form.baseUnit"
            type="text"
            class="form-control"
            :placeholder="text.baseUnitPlaceholder"
            required
          />
        </div>

        <div class="col-md-3">
          <label class="form-label">{{ text.retailPrice }}</label>
          <div class="input-group">
            <span class="input-group-text">$</span>
            <input
              v-model.number="form.retailPrice"
              type="number"
              min="0"
              step="0.01"
              class="form-control"
            />
          </div>
        </div>

        <div class="col-md-3">
          <label class="form-label">{{ text.purchaseCost }}</label>
          <div class="input-group">
            <span class="input-group-text">$</span>
            <input
              v-model.number="form.purchaseCost"
              type="number"
              min="0"
              step="0.01"
              class="form-control"
            />
          </div>
        </div>

        <div class="col-md-3">
          <label class="form-label">{{ text.reorderQty }}</label>
          <input
            v-model.number="form.reorderQty"
            type="number"
            min="0"
            step="1"
            class="form-control"
          />
        </div>

        <!-- Inventory Starting Balance -->
        <div class="col-md-4">
          <label class="form-label">{{ text.openingQty }}</label>
          <input
            v-model.number="form.qtyOnHand"
            type="number"
            min="0"
            step="0.001"
            class="form-control"
            :disabled="isEditing"
          />
          <div v-if="isEditing" class="form-text">
            {{ text.stockAdjustmentHelp }}
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="d-flex gap-2 mt-4">
        <router-link to="/inventory/items" class="btn btn-light">
          {{ text.cancel }}
        </router-link>
        <button class="btn btn-primary" type="submit" :disabled="isSaving">
          <span
            v-if="isSaving"
            class="spinner-border spinner-border-sm me-2"
            role="status"
            aria-hidden="true"
          ></span>
          <i v-else class="bi bi-check-lg me-2"></i>
          {{ isEditing ? text.update : text.save }}
        </button>
      </div>

      <!-- Feedback Banner -->
      <div v-if="saved" class="alert alert-success mt-3 mb-0" role="alert">
        {{ text.saved }}
      </div>
      <div v-if="errorMessage" class="alert alert-danger mt-3 mb-0" role="alert">{{ errorMessage }}</div>
    </form>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const router = useRouter();
const route = useRoute();
const tax = useTaxStore();
const language = useLanguageStore();
const isEditing = Boolean(route.params.id);

const saved = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');

const text = computed(() => language.isKhmer ? {
  inventoryMaster: 'មូលដ្ឋានទិន្នន័យស្តុក', createTitle: 'បង្កើតទំនិញថ្មី', editTitle: 'កែប្រែទំនិញ', description: 'បង្កើតទំនិញជាមួយឯកតា តម្លៃ និងកម្រិតបញ្ជាទិញ។', englishName: 'ឈ្មោះជាភាសាអង់គ្លេស', englishNamePlaceholder: 'ឧ. Coca-Cola 330ml', khmerName: 'ឈ្មោះជាភាសាខ្មែរ', khmerNamePlaceholder: 'ឧ. កូកាកូឡា ៣៣០មីលីលីត្រ', barcode: 'បាកូដ', barcodePlaceholder: 'ស្កេន ឬបញ្ចូលបាកូដ', category: 'ប្រភេទ', categoryPlaceholder: 'ឧ. ភេសជ្ជៈ', department: 'ផ្នែក', departmentPlaceholder: 'ឧ. ទូទៅ', baseUnit: 'ឯកតាមូលដ្ឋាន', baseUnitPlaceholder: 'ឧ. កំប៉ុង ប្រអប់ ឯកតា', retailPrice: 'តម្លៃលក់រាយ', purchaseCost: 'ថ្លៃដើមទិញ', reorderQty: 'បរិមាណបញ្ជាទិញឡើងវិញ', openingQty: 'បរិមាណដើម', stockAdjustmentHelp: 'កែប្រែស្តុកតាមទំព័រកែតម្រូវស្តុក ដើម្បីរក្សាបញ្ជីប្រតិបត្តិការ។', cancel: 'បោះបង់', update: 'ធ្វើបច្ចុប្បន្នភាពទំនិញ', save: 'រក្សាទុកទំនិញ', saved: 'បានរក្សាទុកទំនិញដោយជោគជ័យ។ កំពុងត្រឡប់ទៅបញ្ជីទំនិញ...', error: 'មិនអាចរក្សាទុកទំនិញបានទេ។'
} : {
  inventoryMaster: 'Inventory master', createTitle: 'Create new item', editTitle: 'Edit item', description: 'Create an item with its base unit, pricing, and reorder level.', englishName: 'English name', englishNamePlaceholder: 'e.g., Coca-Cola 330ml', khmerName: 'Khmer name', khmerNamePlaceholder: 'e.g., កូកាកូឡា ៣៣០មីលីលីត្រ', barcode: 'Barcode', barcodePlaceholder: 'Scan or enter barcode', category: 'Category', categoryPlaceholder: 'e.g., Beverage', department: 'Department', departmentPlaceholder: 'e.g., General', baseUnit: 'Base unit', baseUnitPlaceholder: 'e.g., Can, Box, Unit', retailPrice: 'Retail price', purchaseCost: 'Purchase cost', reorderQty: 'Reorder quantity', openingQty: 'Opening quantity', stockAdjustmentHelp: 'Change stock from Stock Adjustments so each movement is recorded.', cancel: 'Cancel', update: 'Update item', save: 'Save item', saved: 'Item saved successfully. Redirecting to item list...', error: 'Failed to save item.'
});

const form = reactive({
  nameEn: '',
  nameKh: '',
  barcode: '',
  category: '',
  department: 'General',
  baseUnit: 'Unit',
  retailPrice: 0,
  purchaseCost: 0,
  reorderQty: 0,
  qtyOnHand: 0
});

async function save() {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = '';
  try {
    if (isEditing) await tax.updateItem(Number(route.params.id), { ...form, branch: tax.settings?.branch });
    else await tax.saveItem({ ...form });
    saved.value = true;
    setTimeout(() => {
      router.push('/inventory/items');
    }, 500);
  } catch (error) {
    console.error('Failed to save item:', error);
    errorMessage.value = error?.message || text.value.error;
    isSaving.value = false;
  }
}

onMounted(() => {
  if (!isEditing) return;
  const item = tax.items.find((entry) => entry.id === Number(route.params.id));
  if (!item) { router.replace('/inventory/items'); return; }
  Object.assign(form, {
    nameEn: item.nameEn || '', nameKh: item.nameKh || '', barcode: item.barcode || '', category: item.category || '',
    department: item.department || 'General', baseUnit: item.baseUnit || 'Unit', retailPrice: item.retailPrice || 0,
    purchaseCost: item.purchaseCost || 0, reorderQty: item.reorderQty || 0, qtyOnHand: item.qtyOnHand || 0, units: item.units || []
  });
});
</script>