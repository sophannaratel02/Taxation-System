<template>
  <section class="module-page container-fluid p-4 min-vh-100">
    <div class="module-shell">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4 module-header">
        <div>
          <p class="module-kicker">{{ language.isKhmer ? 'ប្រតិបត្តិការពន្ធ និងសារពើភណ្ឌ' : 'Tax & Inventory Operations' }}</p>
          <h1 class="module-title">{{ title }}</h1>
          <p class="module-description">{{ localizedDefault(description, 'Manage your tax and inventory workflow from this workspace.', 'គ្រប់គ្រងការងារពន្ធ និងសារពើភណ្ឌរបស់អ្នកនៅកន្លែងធ្វើការនេះ។') }}</p>
        </div>
        <button v-if="actionLabel" class="btn module-primary-btn" type="button" @click="openForm()">
          <i class="bi bi-plus-lg me-2"></i>{{ actionLabel }}
        </button>
      </div>

      <div v-if="actionMessage" class="alert module-alert-success py-2">{{ actionMessage }}</div>
      <div v-if="actionError" class="alert module-alert-danger py-2" role="alert">{{ actionError }}</div>

      <Transition name="module-modal">
      <div v-if="formOpen" :class="formModal ? 'module-form-backdrop' : ''" @click.self="formModal && !saving && (formOpen = false)">
        <div
          class="module-card module-form-card"
          :class="formModal ? 'module-form-modal' : 'mb-4'"
          :role="formModal ? 'dialog' : null"
          :aria-modal="formModal ? 'true' : null"
          :aria-labelledby="formModal ? 'module-form-title' : null"
        >
          <header class="module-form-header">
            <div class="module-form-heading">
              <span class="module-form-icon" aria-hidden="true">
                <i :class="formIcon"></i>
              </span>
              <div class="min-w-0">
                <span class="module-form-eyebrow">{{ localizedDefault(formEyebrow, 'RECORD DETAILS', 'ព័ត៌មានលម្អិតកំណត់ត្រា') }}</span>
                <h2 id="module-form-title" class="module-form-title">{{ editingId ? editLabel : actionLabel }}</h2>
                <p v-if="formDescription" class="module-form-description">{{ formDescription }}</p>
              </div>
            </div>
            <button class="module-form-close" type="button" :aria-label="language.isKhmer ? 'បិទ' : 'Close'" :disabled="saving" @click="formOpen = false">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </header>
          <form class="module-form-content" @submit.prevent="submitForm">
            <div class="module-form-body">
              <div v-if="formModal" class="module-form-required-note">
                <span><span class="module-required-star">*</span> {{ localizedDefault(requiredFieldsText, 'Required fields', 'វាលដែលត្រូវបំពេញ') }}</span>
                <span class="module-form-step"><i class="bi bi-shield-check me-1"></i>{{ localizedDefault(formStepText, 'Your information is secure', 'ព័ត៌មានរបស់អ្នកត្រូវបានការពារ') }}</span>
              </div>
              <div class="row g-3">
                <template v-for="(field, fieldIndex) in formFields" :key="field.key">
                  <div
                    v-if="field.section && (fieldIndex === 0 || formFields[fieldIndex - 1]?.section !== field.section)"
                    class="col-12"
                  >
                    <div class="module-field-section">{{ field.section }}</div>
                  </div>
                  <div :class="field.class || 'col-md-6'">
                    <label :for="`module-field-${field.key}`" class="form-label module-form-label">
                      {{ field.label }}<span v-if="isFieldRequired(field)" class="module-required-star ms-1">*</span>
                    </label>
                    <select v-if="field.type === 'select'" :id="`module-field-${field.key}`" v-model="form[field.key]" class="form-select module-form-control" :required="isFieldRequired(field)" :disabled="saving">
                      <option v-for="option in field.options || []" :key="option.value ?? option" :value="option.value ?? option">{{ option.label ?? option }}</option>
                    </select>
                    <textarea v-else-if="field.type === 'textarea'" :id="`module-field-${field.key}`" v-model="form[field.key]" class="form-control module-form-control" :class="{ 'module-form-textarea': formModal }" rows="2" :maxlength="field.maxlength" :required="isFieldRequired(field)" :disabled="saving"></textarea>
                    <input v-else :id="`module-field-${field.key}`" v-model="form[field.key]" :type="field.type || 'text'" class="form-control module-form-control" :min="field.min" :max="field.max" :step="field.step" :maxlength="field.maxlength" :autocomplete="field.autocomplete" :required="isFieldRequired(field)" :disabled="saving" />
                  </div>
                </template>
              </div>
              <div v-if="formError" class="alert module-alert-danger py-2 mt-3 mb-0" role="alert">
                <i class="bi bi-exclamation-circle-fill me-2" aria-hidden="true"></i>{{ formError }}
              </div>
            </div>
            <footer v-if="formModal" class="module-form-footer">
              <span class="module-form-footer-note"><i class="bi bi-lock-fill me-1" aria-hidden="true"></i>{{ localizedDefault(secureFormText, 'Information is saved securely', 'ព័ត៌មានត្រូវបានរក្សាទុកដោយសុវត្ថិភាព') }}</span>
              <div class="d-flex justify-content-end gap-2">
                <button class="btn module-secondary-btn" type="button" :disabled="saving" @click="formOpen = false">{{ language.t('cancel') }}</button>
                <button class="btn module-submit-btn" type="submit" :disabled="saving">
                  <span v-if="saving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                  <i v-else class="bi bi-check2-circle me-2" aria-hidden="true"></i>
                  {{ saving ? language.t('saving') : localizedDefault(saveButtonText, 'Save changes', 'រក្សាទុកការផ្លាស់ប្តូរ') }}
                </button>
              </div>
            </footer>
            <div v-else class="d-flex justify-content-end gap-2 mt-4">
              <button class="btn btn-light module-secondary-btn" type="button" :disabled="saving" @click="formOpen = false">{{ language.t('cancel') }}</button>
              <button class="btn module-submit-btn" type="submit" :disabled="saving">
                <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
                {{ saving ? language.t('saving') : language.t('save') }}
              </button>
            </div>
          </form>
        </div>
      </div>
      </Transition>

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
        <div class="module-card-header py-3 fw-bold">{{ localizedDefault(tableTitle, 'Recent records', 'កំណត់ត្រាថ្មីៗ') }}</div>
        <div class="table-responsive">
          <table class="table module-table align-middle mb-0">
            <thead>
              <tr><th v-for="heading in displayedHeadings" :key="heading">{{ heading }}</th><th v-if="rowActions">{{ language.isKhmer ? 'សកម្មភាព' : 'Actions' }}</th></tr>
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
                  <button class="btn btn-sm module-action-btn module-edit-btn me-2" type="button" :title="language.isKhmer ? 'កែប្រែ' : 'Edit'" @click="openForm(index)"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm module-action-btn module-delete-btn" type="button" :title="language.isKhmer ? 'លុប' : 'Delete'" @click="removeRow(index)"><i class="bi bi-trash"></i></button>
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
import { computed, reactive, ref } from 'vue';
import { useLanguageStore } from '@/stores/language';
import { confirmDialog } from '@/utils/dialog';

const language = useLanguageStore();

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: 'Manage your tax and inventory workflow from this workspace.' },
  actionLabel: { type: String, default: '' },
  formModal: { type: Boolean, default: false },
  formIcon: { type: String, default: 'bi bi-file-earmark-text' },
  formEyebrow: { type: String, default: 'RECORD DETAILS' },
  formDescription: { type: String, default: '' },
  requiredFieldsText: { type: String, default: 'Required fields' },
  formStepText: { type: String, default: 'Your information is secure' },
  secureFormText: { type: String, default: 'Information is saved securely' },
  saveButtonText: { type: String, default: 'Save changes' },
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
  editConfirmTitle: { type: String, default: 'Edit record' },
  editConfirmMessage: { type: String, default: 'Update this record?' },
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
const displayedHeadings = computed(() => props.headings.map((heading) => {
  if (!language.isKhmer) return heading;
  return ({
    Name: 'ឈ្មោះ',
    Status: 'ស្ថានភាព',
    Updated: 'បានធ្វើបច្ចុប្បន្នភាព',
  })[heading] || heading;
}));

function localizedDefault(value, english, khmer) {
  return language.isKhmer && value === english ? khmer : value;
}

function isFieldRequired(field) {
  return editingId.value === null
    ? field.required !== false
    : field.editRequired !== false && field.required !== false;
}

async function openForm(rowIndex = null) {
  if (rowIndex !== null) {
    const confirmed = await confirmDialog({
      title: localizedDefault(props.editConfirmTitle, 'Edit record', 'កែប្រែកំណត់ត្រា'),
      message: localizedDefault(props.editConfirmMessage, 'Update this record?', 'តើអ្នកចង់ធ្វើបច្ចុប្បន្នភាពកំណត់ត្រានេះឬទេ?'),
      variant: 'info',
      confirmText: localizedDefault(props.editLabel, 'Edit', 'កែប្រែ'),
    });

    if (!confirmed) return;
  }

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
    title: language.isKhmer ? 'លុបកំណត់ត្រា' : 'Delete record',
    message: localizedDefault(props.deleteConfirmMessage, 'Delete this record?', 'តើអ្នកចង់លុបកំណត់ត្រានេះឬទេ?'),
    variant: 'danger',
    confirmText: language.isKhmer ? 'លុប' : 'Delete',
  });

  if (!confirmed) return;

  actionError.value = '';
  actionMessage.value = '';
  try {
    await props.deleteAction(props.rowIds[rowIndex]);
    actionMessage.value = localizedDefault(props.deleteSuccessMessage, 'Record archived successfully.', 'បានរក្សាទុកកំណត់ត្រាក្នុងប័ណ្ណសារដោយជោគជ័យ។');
  } catch (error) {
    actionError.value = error.message;
  }
}

async function submitForm() {
  saving.value = true;
  formError.value = '';
  try {
    if (!props.saveAction) throw new Error(language.isKhmer
      ? 'ទម្រង់នេះមិនទាន់ភ្ជាប់ទៅសកម្មភាពរក្សាទុកទេ។'
      : 'This form is not connected to a save action.');
    if (editingId.value !== null && props.updateAction) await props.updateAction(editingId.value, { ...form });
    else await props.saveAction({ ...form });
    formOpen.value = false;
    actionMessage.value = language.isKhmer
      ? `${editingId.value !== null ? localizedDefault(props.editLabel, 'Edit', 'កែប្រែ') : props.actionLabel} បានរក្សាទុកដោយជោគជ័យ។`
      : `${editingId.value !== null ? props.editLabel : props.actionLabel} saved successfully.`;
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

.module-form-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1090;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(16 27 42 / 55%);
  backdrop-filter: blur(3px);
}

.module-form-modal {
  display: flex;
  flex-direction: column;
  width: min(100%, 820px);
  max-height: min(92vh, 820px);
  overflow: hidden;
  margin: 0;
  border: 1px solid rgb(226 232 240 / 85%);
  border-radius: 20px;
  box-shadow: 0 32px 90px rgb(8 20 38 / 30%), 0 8px 24px rgb(8 20 38 / 12%);
}

.module-form-header {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem 1.75rem;
  border-bottom: 1px solid #eaf0f5;
  background:
    radial-gradient(ellipse at top right, rgb(15 118 110 / 10%), transparent 45%),
    linear-gradient(135deg, #fff 0%, #f7fbfc 100%);
}

.module-form-heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 1rem;
}

.module-form-icon {
  display: grid;
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  place-items: center;
  border: 1px solid rgb(15 118 110 / 14%);
  border-radius: 16px;
  background: linear-gradient(145deg, #e6f7f4, #d3eeea);
  color: #0f766e;
  font-size: 1.4rem;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 90%);
}

.module-form-eyebrow {
  display: block;
  margin: 0.05rem 0 0.25rem;
  color: #0f766e;
  font-size: 0.67rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  line-height: 1.3;
}

.module-form-title {
  margin: 0;
  color: #102033;
  font-size: clamp(1.18rem, 2.5vw, 1.45rem);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.25;
}

.module-form-description {
  max-width: 580px;
  margin: 0.35rem 0 0;
  color: #64748b;
  font-size: 0.86rem;
  line-height: 1.5;
}

.module-form-close {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: rgb(255 255 255 / 85%);
  color: #64748b;
  transition: color 140ms ease, background 140ms ease, border-color 140ms ease, transform 140ms ease;
}

.module-form-close:hover:not(:disabled) {
  transform: rotate(90deg);
  border-color: #fecaca;
  background: #fff1f2;
  color: #be123c;
}

.module-form-content {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.module-form-body {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 1.5rem 1.75rem;
  scrollbar-color: #cbd5e1 transparent;
  scrollbar-width: thin;
}

.module-form-required-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.15rem;
  color: #64748b;
  font-size: 0.76rem;
}

.module-form-step {
  color: #0f766e;
  font-weight: 650;
}

.module-required-star {
  color: #dc4a4a;
  font-weight: 800;
}

.module-field-section {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0.35rem 0 -0.1rem;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.075em;
  text-transform: uppercase;
}

.module-field-section::after {
  height: 1px;
  flex: 1;
  background: #e8edf2;
  content: '';
}

.module-form-modal .module-form-label {
  margin-bottom: 0.42rem;
  color: #334155;
  font-size: 0.79rem;
  font-weight: 700;
}

.module-form-modal .module-form-control {
  min-height: 46px;
  padding: 0.68rem 0.85rem;
  border: 1px solid #d9e2ec;
  border-radius: 11px;
  background-color: #fff;
  color: #14253a;
  font-size: 0.9rem;
  transition: border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
}

.module-form-modal .module-form-control:hover:not(:disabled) {
  border-color: #b9c9d6;
}

.module-form-modal .module-form-control:focus {
  border-color: #0f8b80;
  background-color: #fff;
  box-shadow: 0 0 0 0.22rem rgb(15 118 110 / 12%);
}

.module-form-modal .module-form-control:disabled {
  background: #f8fafc;
}

.module-form-modal .module-form-textarea {
  min-height: 82px;
  resize: vertical;
}

.module-form-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.75rem;
  border-top: 1px solid #eaf0f5;
  background: #fbfcfd;
}

.module-form-footer-note {
  color: #718096;
  font-size: 0.73rem;
}

.module-form-footer-note .bi {
  color: #0f766e;
}

.module-form-modal .module-submit-btn,
.module-form-modal .module-secondary-btn {
  min-height: 43px;
  padding-inline: 1.15rem;
  border-radius: 11px;
  font-size: 0.86rem;
}

.module-form-modal .module-submit-btn:disabled,
.module-form-modal .module-secondary-btn:disabled {
  cursor: wait;
  opacity: 0.7;
}

.module-modal-enter-active,
.module-modal-leave-active {
  transition: opacity 180ms ease;
}

.module-modal-enter-active .module-form-modal,
.module-modal-leave-active .module-form-modal {
  transition: transform 180ms ease, opacity 180ms ease;
}

.module-modal-enter-from,
.module-modal-leave-to {
  opacity: 0;
}

.module-modal-enter-from .module-form-modal,
.module-modal-leave-to .module-form-modal {
  transform: translateY(12px) scale(0.985);
  opacity: 0;
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

  .module-form-backdrop {
    padding: 0;
    align-items: end;
  }

  .module-form-modal {
    width: 100%;
    max-height: 94dvh;
    border-radius: 20px 20px 0 0;
  }

  .module-form-header {
    gap: 0.75rem;
    padding: 1.15rem 1rem;
  }

  .module-form-heading {
    gap: 0.75rem;
  }

  .module-form-icon {
    width: 44px;
    height: 44px;
    flex-basis: 44px;
    border-radius: 13px;
    font-size: 1.2rem;
  }

  .module-form-body {
    padding: 1.1rem 1rem;
  }

  .module-form-footer {
    align-items: stretch;
    flex-direction: column;
    padding: 0.9rem 1rem calc(0.9rem + env(safe-area-inset-bottom));
  }

  .module-form-footer > .d-flex {
    width: 100%;
  }

  .module-form-footer .btn {
    flex: 1 1 0;
  }

  .module-form-footer-note {
    text-align: center;
  }
}
</style>
