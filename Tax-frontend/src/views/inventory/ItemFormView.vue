<template>
  <section
    :class="modal ? 'item-form-backdrop' : 'container-fluid p-4 page-canvas'"
    @click.self="modal && close()"
  >
    <div
      :class="modal ? 'item-form-modal card border-0 shadow-lg' : ''"
      :role="modal ? 'dialog' : null"
      :aria-modal="modal ? 'true' : null"
      aria-labelledby="item-form-title"
      :tabindex="modal ? -1 : null"
    >
      <!-- Header -->
      <div class="mb-4 d-flex justify-content-between align-items-start gap-3">
        <div>
          <div class="eyebrow mb-2">{{ text.inventoryMaster }}</div>
          <h1 id="item-form-title" class="h3 fw-bold mb-1">
            {{ isEditing ? text.editTitle : text.createTitle }}
          </h1>
          <p class="text-muted mb-0">{{ text.description }}</p>
        </div>
        <button
          v-if="modal"
          class="btn-close mt-1"
          type="button"
          :aria-label="text.cancel"
          @click="close"
        ></button>
      </div>

      <!-- Item Form -->
      <form
        :class="modal ? 'card border-0 p-4' : 'card border-0 shadow-sm p-4'"
        @submit.prevent="save"
      >
        <div class="row g-3">
          <!-- Item Names -->
          <div class="col-md-6">
            <label class="form-label" for="item-name-en">{{ text.englishName }}</label>
            <input
              id="item-name-en"
              ref="firstInputRef"
              v-model.trim="form.nameEn"
              type="text"
              class="form-control"
              :placeholder="text.englishNamePlaceholder"
              maxlength="180"
              autocomplete="off"
              required
            />
          </div>

          <div class="col-md-6">
            <label class="form-label" for="item-name-kh">{{ text.khmerName }}</label>
            <input
              id="item-name-kh"
              v-model.trim="form.nameKh"
              type="text"
              class="form-control"
              :placeholder="text.khmerNamePlaceholder"
            />
          </div>

          <!-- Classifications -->
          <div class="col-md-4">
            <label class="form-label" for="item-barcode">{{ text.barcode }}</label>
            <input
              id="item-barcode"
              v-model.trim="form.barcode"
              type="text"
              class="form-control"
              :placeholder="text.barcodePlaceholder"
              maxlength="80"
              autocomplete="off"
              required
            />
          </div>

          <div class="col-md-4">
            <label class="form-label" for="item-category">{{ text.category }}</label>
            <input
              id="item-category"
              v-model.trim="form.category"
              type="text"
              class="form-control"
              :placeholder="text.categoryPlaceholder"
              required
            />
          </div>

          <div class="col-md-4">
            <label class="form-label" for="item-department">{{ text.department }}</label>
            <input
              id="item-department"
              v-model.trim="form.department"
              type="text"
              class="form-control"
              :placeholder="text.departmentPlaceholder"
            />
          </div>

          <!-- Pricing & Units -->
          <div class="col-md-3">
            <label class="form-label" for="item-base-unit">{{ text.baseUnit }}</label>
            <input
              id="item-base-unit"
              v-model.trim="form.baseUnit"
              type="text"
              class="form-control"
              :placeholder="text.baseUnitPlaceholder"
              @input="syncBaseUnit"
              required
            />
          </div>

          <div class="col-md-3">
            <label class="form-label" for="item-retail-price">{{ text.retailPrice }}</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <input
                id="item-retail-price"
                v-model.number="form.retailPrice"
                type="number"
                min="0"
                step="0.0001"
                class="form-control"
                @input="syncUnitPricesFromRetail"
                required
              />
            </div>
          </div>

          <div class="col-md-3">
            <label class="form-label" for="item-purchase-cost">{{ text.purchaseCost }}</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <input
                id="item-purchase-cost"
                v-model.number="form.purchaseCost"
                type="number"
                min="0"
                step="0.000001"
                class="form-control"
                required
              />
            </div>
            <div class="form-text">
              {{ text.movingAverageCost }}: ${{ formatCost(form.averageCost) }}
            </div>
          </div>

          <!-- Markup as Amount -->
          <div class="col-md-3">
            <label class="form-label" for="item-markup">{{ text.markup }}</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <input
                id="item-markup"
                v-model.number="form.markupAmount"
                type="number"
                min="0"
                step="0.0001"
                class="form-control"
                @input="recalculateSellingPrices"
                required
              />
            </div>
            <div class="form-text">
              {{ text.suggestedPrice }}: ${{ formatCost(suggestedPrice) }}
            </div>
          </div>

          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <strong>{{ language.isKhmer ? 'តម្លៃតាមឯកតា (UOM)' : 'Unit prices (UOM)' }}</strong>
              <button class="btn btn-sm btn-outline-primary" type="button" @click="addUnit">
                <i class="bi bi-plus-lg me-1"></i>{{ language.isKhmer ? 'បន្ថែមឯកតា' : 'Add unit' }}
              </button>
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-bordered align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>{{ language.isKhmer ? 'ឈ្មោះឯកតា' : 'Unit name' }}</th>
                    <th>{{ language.isKhmer ? 'ចំនួនឯកតាមូលដ្ឋាន' : 'Base-unit quantity' }}</th>
                    <th>{{ language.isKhmer ? 'តម្លៃលក់' : 'Selling price' }}</th>
                    <th class="text-end">{{ language.isKhmer ? 'សកម្មភាព' : 'Actions' }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(unit, index) in form.units" :key="index">
                    <td>
                      <input
                        v-model.trim="unit.name"
                        type="text"
                        class="form-control form-control-sm"
                        maxlength="50"
                        :disabled="isBaseUnit(unit)"
                        :required="!isBaseUnit(unit)"
                      />
                    </td>
                    <td>
                      <input
                        v-model.number="unit.ratio"
                        type="number"
                        min="1"
                        step="1"
                        class="form-control form-control-sm"
                        :disabled="isBaseUnit(unit)"
                        @input="updateUnitPrice(unit)"
                        required
                      />
                    </td>
                    <td>
                      <div class="input-group input-group-sm">
                        <span class="input-group-text">$</span>
                        <input
                          v-model.number="unit.retailPrice"
                          type="number"
                          min="0"
                          step="0.0001"
                          class="form-control"
                          :disabled="isBaseUnit(unit)"
                          required
                        />
                      </div>
                    </td>
                    <td class="text-end">
                      <span v-if="isBaseUnit(unit)" class="badge text-bg-light">{{ language.isKhmer ? 'មូលដ្ឋាន' : 'Base' }}</span>
                      <button
                        v-else
                        class="btn btn-sm btn-outline-danger"
                        type="button"
                        :aria-label="language.isKhmer ? 'លុបឯកតា' : 'Remove unit'"
                        @click="removeUnit(index)"
                      >
                        <i class="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="form-text">
              {{ language.isKhmer
                ? 'តម្លៃណែនាំ = ថ្លៃដើមមធ្យម + ប្រាក់បន្ថែម។ តម្លៃកញ្ចប់គណនាតាមចំនួនឯកតាមូលដ្ឋាន។'
                : 'Suggested price = average cost + markup amount. Package prices are calculated by the base-unit quantity.' }}
            </div>
          </div>

          <!-- Inventory Controls -->
          <div class="col-md-3">
            <label class="form-label" for="item-reorder-qty">{{ text.reorderQty }}</label>
            <input
              id="item-reorder-qty"
              v-model.number="form.reorderQty"
              type="number"
              min="0"
              step="1"
              class="form-control"
              required
            />
          </div>

          <div class="col-md-5">
            <div class="form-check mt-md-4 pt-md-2">
              <input
                id="auto-recalculate-price"
                v-model="form.autoRecalculatePrice"
                class="form-check-input"
                type="checkbox"
              />
              <label class="form-check-label" for="auto-recalculate-price">
                {{ text.autoRecalculatePrice }}
              </label>
            </div>
            <div class="form-text">{{ text.autoRecalculateHelp }}</div>
          </div>

          <!-- Inventory Starting Balance -->
          <div class="col-md-4">
            <label class="form-label" for="item-qty-on-hand">{{ text.openingQty }}</label>
            <input
              id="item-qty-on-hand"
              v-model.number="form.qtyOnHand"
              type="number"
              min="0"
              step="1"
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
          <button
            v-if="modal"
            class="btn btn-light"
            type="button"
            :disabled="isSaving"
            @click="close"
          >
            {{ text.cancel }}
          </button>
          <router-link v-else to="/inventory/items" class="btn btn-light">
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

        <!-- Feedback Messages -->
        <div v-if="saved" class="alert alert-success mt-3 mb-0" role="alert">
          {{ text.saved }}
        </div>
        <div v-if="errorMessage" class="alert alert-danger mt-3 mb-0" role="alert">
          {{ errorMessage }}
        </div>
      </form>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const props = defineProps({
  modal: { type: Boolean, default: false },
  itemId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'saved']);

const router = useRouter();
const route = useRoute();
const tax = useTaxStore();
const language = useLanguageStore();

const firstInputRef = ref(null);
const saved = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');

const currentItemId = computed(() => props.itemId || route.params.id || null);
const isEditing = computed(() => Boolean(currentItemId.value));

const form = reactive({
  nameEn: '',
  nameKh: '',
  barcode: '',
  category: '',
  department: 'General',
  baseUnit: 'Unit',
  retailPrice: 0,
  purchaseCost: 0,
  averageCost: 0,
  markupAmount: 0,
  units: [{ name: 'Unit', ratio: 1, retailPrice: 0 }],
  autoRecalculatePrice: false,
  reorderQty: 0,
  qtyOnHand: 0
});

const text = computed(() =>
  language.isKhmer
    ? {
        inventoryMaster: 'មូលដ្ឋានទិន្នន័យស្តុក',
        createTitle: 'បង្កើតទំនិញថ្មី',
        editTitle: 'កែប្រែទំនិញ',
        description: 'បង្កើតទំនិញជាមួយឯកតា តម្លៃ និងកម្រិតបញ្ជាទិញ។',
        englishName: 'ឈ្មោះជាភាសាអង់គ្លេស',
        englishNamePlaceholder: 'ឧ. Coca-Cola 330ml',
        khmerName: 'ឈ្មោះជាភាសាខ្មែរ',
        khmerNamePlaceholder: 'ឧ. កូកាកូឡា ៣៣០មីលីលីត្រ',
        barcode: 'បាកូដ',
        barcodePlaceholder: 'ស្កេន ឬបញ្ចូលបាកូដ',
        category: 'ប្រភេទ',
        categoryPlaceholder: 'ឧ. ភេសជ្ជៈ',
        department: 'ផ្នែក',
        departmentPlaceholder: 'ឧ. General',
        baseUnit: 'ឯកតាមូលដ្ឋាន',
        baseUnitPlaceholder: 'ឧ. កំប៉ុង ប្រអប់ ឯកតា',
        retailPrice: 'តម្លៃលក់រាយ',
        purchaseCost: 'ថ្លៃដើមទិញ',
        movingAverageCost: 'ថ្លៃដើមមធ្យមបច្ចុប្បន្ន',
        suggestedPrice: 'តម្លៃលក់ណែនាំ',
        markup: 'ប្រាក់បន្ថែមលើថ្លៃដើម',
        autoRecalculatePrice: 'គណនាតម្លៃលក់ឡើងវិញពេលទទួលការទិញ',
        autoRecalculateHelp: 'បើបិទ តម្លៃលក់ដោយដៃនឹងមិនផ្លាស់ប្តូរ។',
        reorderQty: 'បរិមាណបញ្ជាទិញឡើងវិញ',
        openingQty: 'បរិមាណដើម',
        stockAdjustmentHelp: 'កែប្រែស្តុកតាមទំព័រកែតម្រូវស្តុក ដើម្បីរក្សាបញ្ជីប្រតិបត្តិការ។',
        cancel: 'បោះបង់',
        update: 'ធ្វើបច្ចុប្បន្នភាពទំនិញ',
        save: 'រក្សាទុកទំនិញ',
        saved: 'បានរក្សាទុកទំនិញដោយជោគជ័យ។ កំពុងត្រឡប់ទៅបញ្ជីទំនិញ...',
        error: 'មិនអាចរក្សាទុកទំនិញបានទេ។'
      }
    : {
        inventoryMaster: 'Inventory master',
        createTitle: 'Create new item',
        editTitle: 'Edit item',
        description: 'Create an item with its base unit, pricing, and reorder level.',
        englishName: 'English name',
        englishNamePlaceholder: 'e.g., Coca-Cola 330ml',
        khmerName: 'Khmer name',
        khmerNamePlaceholder: 'e.g., កូកាកូឡា ៣៣០មីលីលីត្រ',
        barcode: 'Barcode',
        barcodePlaceholder: 'Scan or enter barcode',
        category: 'Category',
        categoryPlaceholder: 'e.g., Beverage',
        department: 'Department',
        departmentPlaceholder: 'e.g., General',
        baseUnit: 'Base unit',
        baseUnitPlaceholder: 'e.g., Can, Box, Unit',
        retailPrice: 'Retail price',
        purchaseCost: 'Purchase cost',
        movingAverageCost: 'Current moving average cost',
        suggestedPrice: 'Suggested selling price',
        markup: 'Markup amount',
        autoRecalculatePrice: 'Auto-recalculate selling price on purchase',
        autoRecalculateHelp: 'When disabled, manually maintained selling prices are preserved.',
        reorderQty: 'Reorder quantity',
        openingQty: 'Opening quantity',
        stockAdjustmentHelp: 'Change stock from Stock Adjustments so each movement is recorded.',
        cancel: 'Cancel',
        update: 'Update item',
        save: 'Save item',
        saved: 'Item saved successfully. Redirecting to item list...',
        error: 'Failed to save item.'
      }
);

const suggestedPrice = computed(() => {
  const baseCost = Number(form.averageCost || form.purchaseCost || 0);
  const markupAmount = Number(form.markupAmount || 0);
  return baseCost + markupAmount;
});

function isBaseUnit(unit) {
  return form.units[0] === unit;
}

function syncBaseUnit() {
  const baseUnit = String(form.baseUnit || '').trim();
  if (!form.units.length) {
    form.units.push({ name: baseUnit, ratio: 1, retailPrice: Number(form.retailPrice) || 0 });
  }
  form.units[0].name = baseUnit;
  form.units[0].ratio = 1;
  form.units[0].retailPrice = Number(form.retailPrice) || 0;
}

function syncUnitPricesFromRetail() {
  syncBaseUnit();
  const basePrice = Number(form.retailPrice) || 0;
  for (const unit of form.units) {
    if (isBaseUnit(unit)) {
      unit.retailPrice = basePrice;
      continue;
    }
    const ratio = Number(unit.ratio);
    if (Number.isSafeInteger(ratio) && ratio > 0) {
      unit.retailPrice = Number((basePrice * ratio).toFixed(2));
    }
  }
}

function recalculateSellingPrices() {
  form.retailPrice = Number(suggestedPrice.value.toFixed(2));
  syncUnitPricesFromRetail();
}

function updateUnitPrice(unit) {
  const ratio = Number(unit.ratio);
  if (Number.isSafeInteger(ratio) && ratio > 0) {
    unit.retailPrice = Number((Number(form.retailPrice || 0) * ratio).toFixed(2));
  }
}

function addUnit() {
  form.units.push({
    name: '',
    ratio: 1,
    retailPrice: Number(form.retailPrice || 0).toFixed(2) * 1
  });
}

function removeUnit(index) {
  if (!isBaseUnit(form.units[index])) form.units.splice(index, 1);
}

function formatCost(value) {
  return Number(value || 0).toFixed(2);
}

function close() {
  if (isSaving.value) return;
  if (props.modal) {
    emit('close');
  } else {
    router.push('/inventory/items');
  }
}

async function save() {
  if (isSaving.value) return;

  isSaving.value = true;
  errorMessage.value = '';

  try {
    form.nameEn = form.nameEn.trim();
    form.nameKh = form.nameKh.trim();
    form.barcode = form.barcode.trim();
    form.category = form.category.trim();
    form.department = form.department.trim();
    form.baseUnit = form.baseUnit.trim();

    const numericFields = [
      form.retailPrice,
      form.purchaseCost,
      form.markupAmount,
      form.reorderQty,
      form.qtyOnHand
    ];

    if (!numericFields.every((val) => Number.isFinite(Number(val)) && Number(val) >= 0)) {
      throw new Error('Prices, markup, reorder quantity, and opening stock must be valid non-negative numbers.');
    }

    if (!Number.isSafeInteger(Number(form.reorderQty)) || !Number.isSafeInteger(Number(form.qtyOnHand))) {
      throw new Error('Reorder quantity and opening stock must be whole numbers.');
    }

    syncBaseUnit();
    const unitNames = new Set();
    for (const unit of form.units) {
      const name = String(unit.name || '').trim();
      const ratio = Number(unit.ratio);
      const price = Number(unit.retailPrice);
      if (!name || unitNames.has(name.toLowerCase())) {
        throw new Error('Each unit must have a unique name.');
      }
      if (!Number.isSafeInteger(ratio) || ratio <= 0) {
        throw new Error('Unit quantities must be positive whole numbers.');
      }
      if (!Number.isFinite(price) || price < 0 || Math.abs(price * 10000 - Math.round(price * 10000)) > 0.00001) {
        throw new Error('Unit selling prices must be non-negative and use up to four decimals.');
      }
      unitNames.add(name.toLowerCase());
    }
    const baseUnit = form.units.find((unit) => isBaseUnit(unit));
    baseUnit.ratio = 1;
    baseUnit.retailPrice = Number(form.retailPrice);

    if (
      Math.abs(Number(form.retailPrice) * 10000 - Math.round(Number(form.retailPrice) * 10000)) > 0.00001 ||
      Math.abs(Number(form.purchaseCost) * 1000000 - Math.round(Number(form.purchaseCost) * 1000000)) > 0.00001 ||
      Math.abs(Number(form.markupAmount) * 10000 - Math.round(Number(form.markupAmount) * 10000)) > 0.00001
    ) {
      throw new Error('Use up to four decimals for selling price and markup, and six for cost.');
    }

    if (isEditing.value) {
      await tax.updateItem(Number(currentItemId.value), {
        ...form,
        units: form.units.map((unit) => ({ ...unit, name: unit.name.trim() })),
        branch: tax.settings?.branch
      });
    } else {
      await tax.saveItem({
        ...form,
        units: form.units.map((unit) => ({ ...unit, name: unit.name.trim() }))
      });
    }

    saved.value = true;
    if (props.modal) {
      emit('saved');
    } else {
      setTimeout(() => router.push('/inventory/items'), 500);
    }
  } catch (error) {
    console.error('Failed to save item:', error);
    errorMessage.value = error?.message || text.value.error;
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  if (props.modal) {
    nextTick(() => firstInputRef.value?.focus());
  }

  if (!isEditing.value) return;

  const item = tax.items.find((entry) => entry.id === Number(currentItemId.value));
  if (!item) {
    if (props.modal) emit('close');
    else router.replace('/inventory/items');
    return;
  }

  const units = Array.isArray(item.units) ? item.units.map((unit) => ({
    name: String(unit.name || '').trim(),
    ratio: Number(unit.ratio ?? 1),
    retailPrice: Number(unit.retailPrice ?? 0)
  })) : [];
  const baseUnit = item.baseUnit || 'Unit';
  const baseUnitIndex = units.findIndex((unit) => unit.name.toLowerCase() === baseUnit.toLowerCase());
  if (baseUnitIndex < 0) {
    units.unshift({ name: baseUnit, ratio: 1, retailPrice: Number(item.retailPrice || 0) });
  } else if (baseUnitIndex > 0) {
    units.unshift(units.splice(baseUnitIndex, 1)[0]);
  }
  if (!units.length) units.push({ name: baseUnit, ratio: 1, retailPrice: Number(item.retailPrice || 0) });
  units[0].name = baseUnit;
  units[0].ratio = 1;
  units[0].retailPrice = Number(item.retailPrice || 0);

  Object.assign(form, {
    nameEn: item.nameEn || '',
    nameKh: item.nameKh || '',
    barcode: item.barcode || '',
    category: item.category || '',
    department: item.department || 'General',
    baseUnit,
    retailPrice: item.retailPrice ?? 0,
    purchaseCost: item.purchaseCost ?? 0,
    averageCost: item.averageCost ?? 0,
    markupAmount: item.markupAmount ?? 0,
    autoRecalculatePrice: Boolean(item.autoRecalculatePrice),
    reorderQty: item.reorderQty ?? 0,
    qtyOnHand: item.qtyOnHand ?? 0,
    units
  });
});
</script>

<style scoped>
.item-form-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1070;
  display: grid;
  place-items: center;
  padding: 1rem;
  overflow-y: auto;
  background: rgb(16 27 42 / 55%);
  backdrop-filter: blur(3px);
}

.item-form-modal {
  width: min(100%, 960px);
  max-height: 94vh;
  padding: 1.5rem;
  overflow-y: auto;
  border-radius: 14px;
  background: #f8fafc;
}

@media (max-width: 576px) {
  .item-form-backdrop {
    align-items: end;
    padding: 0;
  }

  .item-form-modal {
    max-height: 96vh;
    padding: 1rem;
    border-radius: 14px 14px 0 0;
  }
}
</style>