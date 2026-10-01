<template>
  <section class="container-fluid p-4 bg-light min-vh-100">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <p class="text-uppercase text-primary small fw-bold mb-1">Tax & Inventory POS</p>
        <h1 class="h3 fw-bold mb-1">{{ title }}</h1>
        <p class="text-muted mb-0">{{ description }}</p>
      </div>
      <button v-if="actionLabel" class="btn btn-primary" type="button" @click="openForm()">
        <i class="bi bi-plus-lg me-2"></i>{{ actionLabel }}
      </button>
    </div>

    <div v-if="actionMessage" class="alert alert-success py-2">{{ actionMessage }}</div>
    <div v-if="actionError" class="alert alert-danger py-2" role="alert">{{ actionError }}</div>

    <div v-if="formOpen" class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-white d-flex justify-content-between align-items-center py-3">
        <strong>{{ editingId ? editLabel : actionLabel }}</strong>
        <button class="btn-close" type="button" aria-label="Close" @click="formOpen = false"></button>
      </div>
      <form class="card-body" @submit.prevent="submitForm">
        <div class="row g-3">
          <div v-for="field in formFields" :key="field.key" :class="field.class || 'col-md-6'">
            <label class="form-label">{{ field.label }}</label>
            <select v-if="field.type === 'select'" v-model="form[field.key]" class="form-select" :required="field.required !== false">
              <option v-for="option in field.options || []" :key="option.value ?? option" :value="option.value ?? option">{{ option.label ?? option }}</option>
            </select>
            <textarea v-else-if="field.type === 'textarea'" v-model="form[field.key]" class="form-control" rows="2" :required="field.required !== false"></textarea>
            <input v-else v-model="form[field.key]" :type="field.type || 'text'" class="form-control" :min="field.min" :step="field.step" :required="field.required !== false" />
          </div>
        </div>
        <div v-if="formError" class="alert alert-danger py-2 mt-3 mb-0">{{ formError }}</div>
        <div class="d-flex justify-content-end gap-2 mt-4"><button class="btn btn-light" type="button" @click="formOpen = false">{{ language.t('cancel') }}</button><button class="btn btn-success" type="submit" :disabled="saving"><span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>{{ saving ? language.t('saving') : language.t('save') }}</button></div>
      </form>
    </div>

    <div class="row g-3 mb-4">
      <div v-for="stat in stats" :key="stat.label" class="col-sm-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <div class="text-muted small mb-2">{{ stat.label }}</div>
            <div class="h4 mb-0 fw-bold">{{ stat.value }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white py-3 fw-bold">{{ tableTitle }}</div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr><th v-for="heading in headings" :key="heading">{{ heading }}</th><th v-if="rowActions">Actions</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="index">
              <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                <router-link
                  v-if="cell && cell.type === 'invoice-link'"
                  :to="{ name: 'InvoiceDetail', params: { id: cell.id }, query: { from: invoiceBackRoute } }"
                  class="text-primary text-decoration-none font-monospace fw-semibold"
                >
                  #{{ cell.id }}
                </router-link>
                <template v-else>{{ cell }}</template>
              </td>
              <td v-if="rowActions" class="text-nowrap">
                <button class="btn btn-sm btn-outline-primary me-2" type="button" title="Edit" @click="openForm(index)"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-sm btn-outline-danger" type="button" title="Delete" @click="removeRow(index)"><i class="bi bi-trash"></i></button>
              </td>
            </tr>
            <tr v-if="!rows.length"><td :colspan="headings.length + (rowActions ? 1 : 0)" class="text-center text-muted py-5">{{ language.t('noRecords') }}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useLanguageStore } from '@/stores/language';

const language = useLanguageStore();

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: 'Manage your tax and inventory workflow from this workspace.' },
  actionLabel: { type: String, default: '' },
  tableTitle: { type: String, default: 'Recent records' },
  stats: { type: Array, default: () => [] },
  headings: { type: Array, default: () => ['Name', 'Status', 'Updated'] },
  rows: { type: Array, default: () => [] },
  formFields: { type: Array, default: () => [] },
  saveAction: { type: Function, default: null },
  updateAction: { type: Function, default: null },
  deleteAction: { type: Function, default: null },
  rowIds: { type: Array, default: () => [] },
  formValues: { type: Array, default: () => [] },
  rowActions: { type: Boolean, default: false },
  editLabel: { type: String, default: 'Edit' },
  deleteConfirmMessage: { type: String, default: 'Delete this record?' },
  deleteSuccessMessage: { type: String, default: 'Record archived successfully.' },
  invoiceBackRoute: { type: String, default: '/sales/invoices' },
});

const actionMessage = ref('');
const actionError = ref('');
const formOpen = ref(false);
const saving = ref(false);
const formError = ref('');
const editingId = ref(null);
const form = reactive({});

function openForm(rowIndex = null) {
  Object.keys(form).forEach((key) => delete form[key]);
  props.formFields.forEach((field) => { form[field.key] = field.default ?? ''; });
  if (rowIndex !== null) Object.assign(form, props.formValues[rowIndex] || {});
  editingId.value = rowIndex === null ? null : props.rowIds[rowIndex];
  formError.value = '';
  formOpen.value = true;
}

async function removeRow(rowIndex) {
  if (!props.deleteAction || !window.confirm(props.deleteConfirmMessage)) return;
  actionError.value = '';
  actionMessage.value = '';
  try {
    await props.deleteAction(props.rowIds[rowIndex]);
    actionMessage.value = props.deleteSuccessMessage;
  } catch (error) {
    actionError.value = error.message;
  }
}

async function submitForm() {
  saving.value = true;
  formError.value = '';
  try {
    if (!props.saveAction) throw new Error('This form is not connected to a save action.');
    if (editingId.value !== null && props.updateAction) await props.updateAction(editingId.value, { ...form });
    else await props.saveAction({ ...form });
    formOpen.value = false;
    actionMessage.value = `${editingId.value !== null ? props.editLabel : props.actionLabel} saved successfully.`;
    editingId.value = null;
  } catch (error) {
    formError.value = error.message;
  } finally {
    saving.value = false;
  }
}
</script>
