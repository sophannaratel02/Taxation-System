<template>
  <section class="module-page container-fluid p-4 min-vh-100">
    <div class="module-shell">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4 module-header">
        <div>
          <p class="module-kicker">Tax &amp; Inventory Operations</p>
          <h1 class="module-title">{{ title }}</h1>
          <p class="module-description">{{ description }}</p>
        </div>
        <button v-if="actionLabel" class="btn module-primary-btn" type="button" @click="openForm()">
          <i class="bi bi-plus-lg me-2"></i>{{ actionLabel }}
        </button>
      </div>

      <div v-if="actionMessage" class="alert module-alert-success py-2">{{ actionMessage }}</div>
      <div v-if="actionError" class="alert module-alert-danger py-2" role="alert">{{ actionError }}</div>

      <div v-if="formOpen" class="module-card module-form-card mb-4">
        <div class="module-card-header d-flex justify-content-between align-items-center py-3">
          <strong>{{ editingId ? editLabel : actionLabel }}</strong>
          <button class="btn-close" type="button" aria-label="Close" @click="formOpen = false"></button>
        </div>
        <form class="module-card-body" @submit.prevent="submitForm">
          <div class="row g-3">
            <div v-for="field in formFields" :key="field.key" :class="field.class || 'col-md-6'">
              <label class="form-label module-form-label">{{ field.label }}</label>
              <select v-if="field.type === 'select'" v-model="form[field.key]" class="form-select module-form-control" :required="field.required !== false">
                <option v-for="option in field.options || []" :key="option.value ?? option" :value="option.value ?? option">{{ option.label ?? option }}</option>
              </select>
              <textarea v-else-if="field.type === 'textarea'" v-model="form[field.key]" class="form-control module-form-control" rows="2" :required="field.required !== false"></textarea>
              <input v-else v-model="form[field.key]" :type="field.type || 'text'" class="form-control module-form-control" :min="field.min" :step="field.step" :required="field.required !== false" />
            </div>
          </div>
          <div v-if="formError" class="alert module-alert-danger py-2 mt-3 mb-0">{{ formError }}</div>
          <div class="d-flex justify-content-end gap-2 mt-4">
            <button class="btn btn-light module-secondary-btn" type="button" @click="formOpen = false">{{ language.t('cancel') }}</button>
            <button class="btn module-submit-btn" type="submit" :disabled="saving">
              <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
              {{ saving ? language.t('saving') : language.t('save') }}
            </button>
          </div>
        </form>
      </div>

      <div class="row g-3 mb-4">
        <div v-for="stat in stats" :key="stat.label" class="col-sm-6 col-xl-3">
          <div class="module-stat-card h-100">
            <div class="module-stat-card-body">
              <div class="module-stat-label">{{ stat.label }}</div>
              <div class="module-stat-value">{{ stat.value }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="module-card">
        <div class="module-card-header py-3 fw-bold">{{ tableTitle }}</div>
        <div class="table-responsive">
          <table class="table module-table align-middle mb-0">
            <thead>
              <tr><th v-for="heading in headings" :key="heading">{{ heading }}</th><th v-if="rowActions">Actions</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="index">
                <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                  <router-link
                    v-if="cell && cell.type === 'invoice-link'"
                    :to="{ name: 'InvoiceDetail', params: { id: cell.id }, query: { from: invoiceBackRoute } }"
                    class="module-link font-monospace fw-semibold"
                  >
                    #{{ cell.id }}
                  </router-link>
                  <template v-else>{{ cell }}</template>
                </td>
                <td v-if="rowActions" class="text-nowrap">
                  <button class="btn btn-sm module-action-btn module-edit-btn me-2" type="button" title="Edit" @click="openForm(index)"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm module-action-btn module-delete-btn" type="button" title="Delete" @click="removeRow(index)"><i class="bi bi-trash"></i></button>
                </td>
              </tr>
              <tr v-if="!rows.length"><td :colspan="headings.length + (rowActions ? 1 : 0)" class="text-center text-muted py-5">{{ language.t('noRecords') }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useLanguageStore } from '@/stores/language';
import { confirmDialog } from '@/utils/dialog';

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
  if (!props.deleteAction) return;

  const confirmed = await confirmDialog({
    title: 'Delete record',
    message: props.deleteConfirmMessage,
    variant: 'danger',
    confirmText: 'Delete',
  });

  if (!confirmed) return;

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

<style scoped>
.module-page {
  background: linear-gradient(180deg, #f7f9fc 0%, #edf3f8 100%);
  color: #102033;
}

.module-shell {
  max-width: 1600px;
  margin: 0 auto;
}

.module-header {
  padding: 0.5rem 0;
}

.module-kicker {
  margin-bottom: 0.4rem;
  color: #0f766e;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.module-title {
  margin: 0;
  font-size: clamp(1.6rem, 2vw, 2.25rem);
  font-weight: 800;
  letter-spacing: -0.03em;
}

.module-description {
  margin: 0.35rem 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.module-primary-btn,
.module-submit-btn {
  background: linear-gradient(135deg, #0f766e 0%, #0d1b2a 100%);
  border: none;
  color: #fff;
  border-radius: 10px;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(15, 118, 110, 0.18);
}

.module-primary-btn:hover,
.module-submit-btn:hover {
  color: #fff;
  filter: brightness(1.05);
}

.module-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.04);
}

.module-form-card { overflow: hidden; }

.module-card-header {
  padding: 1.1rem 1.25rem;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  border-bottom: 1px solid #edf2f7;
  color: #0f172a;
}

.module-card-body {
  padding: 1.25rem;
}

.module-form-label {
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
}

.module-form-control {
  border-radius: 10px;
  border-color: #d9e2ec;
  min-height: 44px;
}

.module-form-control:focus {
  border-color: #0f766e;
  box-shadow: 0 0 0 0.2rem rgba(15, 118, 110, 0.12);
}

.module-secondary-btn {
  border: 1px solid #dfe7ef;
  border-radius: 10px;
  background: #fff;
  color: #334155;
}

.module-alert-success {
  background: #ecfdf5;
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
}

.module-alert-danger {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 10px;
}

.module-stat-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.04);
}

.module-stat-card-body {
  padding: 1.1rem 1.2rem;
}

.module-stat-label {
  margin-bottom: 0.5rem;
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.module-stat-value {
  font-size: clamp(1.3rem, 2vw, 1.8rem);
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.module-table thead th {
  background: #f8fafc;
  color: #64748b;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.8rem 1rem;
}

.module-table tbody td {
  padding: 0.9rem 1rem;
  border-color: #edf2f7;
  color: #334155;
}

.module-table tbody tr:hover {
  background: #f8fafc;
}

.module-link {
  color: #0f766e;
  text-decoration: none;
}

.module-link:hover {
  text-decoration: underline;
}

.module-action-btn {
  border-radius: 8px;
  font-weight: 700;
}

.module-edit-btn {
  background: rgba(15, 118, 110, 0.08);
  color: #0f766e;
  border: 1px solid rgba(15, 118, 110, 0.14);
}

.module-delete-btn {
  background: rgba(239, 68, 68, 0.06);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.12);
}

@media (max-width: 576px) {
  .module-page {
    padding-left: 0.9rem !important;
    padding-right: 0.9rem !important;
  }

  .module-primary-btn,
  .module-submit-btn,
  .module-secondary-btn {
    width: 100%;
  }
}
</style>
