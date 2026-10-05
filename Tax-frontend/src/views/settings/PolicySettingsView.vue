<template>
  <section class="container-fluid p-4 page-canvas policy-page">
    <div class="policy-hero p-4 mb-4 rounded-4 position-relative overflow-hidden">
      <div class="position-relative z-1">
        <div class="eyebrow text-white-50 mb-2"><i class="bi bi-file-earmark-lock me-1"></i> {{ text.systemSettings }}</div>
        <h1 class="h3 fw-bold text-white mb-2">{{ text.title }}</h1>
        <p class="text-white-50 mb-0">{{ text.description }}</p>
      </div>
      <i class="bi bi-shield-check hero-icon" aria-hidden="true"></i>
    </div>

    <div v-if="success" class="alert alert-success border-0 shadow-sm" role="status">
      <i class="bi bi-check-circle-fill me-2"></i>{{ text.saved }}
    </div>
    <div v-if="error" class="alert alert-danger border-0 shadow-sm" role="alert">
      <i class="bi bi-exclamation-triangle-fill me-2"></i>{{ error }}
    </div>
    <div v-if="!isAdmin" class="alert alert-info border-0 shadow-sm" role="status">
      <i class="bi bi-eye me-2"></i>{{ text.readOnly }}
    </div>

    <form :class="{ 'policy-readonly': !isAdmin }" @submit.prevent="savePolicy">
      <div class="row g-4">
        <div class="col-xl-6">
          <section class="policy-card h-100">
            <div class="policy-card-heading"><span class="policy-icon teal"><i class="bi bi-shield-check"></i></span><div><h2>{{ text.approval.title }}</h2><p>{{ text.approval.description }}</p></div></div>
            <label class="policy-toggle"><span><strong>{{ text.approval.projects }}</strong><small>{{ text.approval.projectsHelp }}</small></span><input v-model="form.approval.projectsRequired" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
            <label class="policy-toggle"><span><strong>{{ text.approval.files }}</strong><small>{{ text.approval.filesHelp }}</small></span><input v-model="form.approval.filesRequired" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
            <label class="policy-toggle"><span><strong>{{ text.approval.leave }}</strong><small>{{ text.approval.leaveHelp }}</small></span><input v-model="form.approval.leaveRequired" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
            <label class="policy-toggle"><span><strong>{{ text.approval.rejection }}</strong><small>{{ text.approval.rejectionHelp }}</small></span><input v-model="form.approval.rejectionReasonRequired" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
          </section>
        </div>

        <div class="col-xl-6">
          <section class="policy-card h-100">
            <div class="policy-card-heading"><span class="policy-icon blue"><i class="bi bi-person-lock"></i></span><div><h2>{{ text.access.title }}</h2><p>{{ text.access.description }}</p></div></div>
            <label class="policy-toggle"><span><strong>{{ text.access.inactive }}</strong><small>{{ text.access.inactiveHelp }}</small></span><input v-model="form.access.inactiveLoginBlocked" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
            <label class="policy-toggle"><span><strong>{{ text.access.registration }}</strong><small>{{ text.access.registrationHelp }}</small></span><input v-model="form.access.registrationRequiresApproval" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
            <div class="policy-field"><label for="password-min">{{ text.access.password }}</label><input id="password-min" v-model.number="form.access.passwordMinLength" :disabled="!isAdmin" class="form-control" type="number" min="6" max="128"><small>{{ text.access.passwordHelp }}</small></div>
          </section>
        </div>

        <div class="col-xl-6">
          <section class="policy-card h-100">
            <div class="policy-card-heading"><span class="policy-icon amber"><i class="bi bi-box-seam"></i></span><div><h2>{{ text.inventory.title }}</h2><p>{{ text.inventory.description }}</p></div></div>
            <label class="policy-toggle"><span><strong>{{ text.inventory.negative }}</strong><small>{{ text.inventory.negativeHelp }}</small></span><input v-model="form.inventory.negativeStockBlocked" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
            <label class="policy-toggle"><span><strong>{{ text.inventory.adjustment }}</strong><small>{{ text.inventory.adjustmentHelp }}</small></span><input v-model="form.inventory.adjustmentRequiresAdmin" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
            <label class="policy-toggle"><span><strong>{{ text.inventory.note }}</strong><small>{{ text.inventory.noteHelp }}</small></span><input v-model="form.inventory.auditNotesRequired" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
          </section>
        </div>

        <div class="col-xl-6">
          <section class="policy-card h-100">
            <div class="policy-card-heading"><span class="policy-icon coral"><i class="bi bi-receipt"></i></span><div><h2>{{ text.sales.title }}</h2><p>{{ text.sales.description }}</p></div></div>
            <label class="policy-toggle"><span><strong>{{ text.sales.discount }}</strong><small>{{ text.sales.discountHelp }}</small></span><input v-model="form.sales.discountApprovalRequired" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
            <div class="policy-field"><label for="discount-limit">{{ text.sales.limit }}</label><input id="discount-limit" v-model.number="form.sales.maxDiscountPercent" :disabled="!isAdmin" class="form-control" type="number" min="0" max="100" step="0.5"><small>{{ text.sales.limitHelp }}</small></div>
            <label class="policy-toggle"><span><strong>{{ text.sales.reversal }}</strong><small>{{ text.sales.reversalHelp }}</small></span><input v-model="form.sales.invoiceVoidRequiresAdmin" :disabled="!isAdmin" type="checkbox"><span class="switch"></span></label>
          </section>
        </div>

        <div class="col-12">
          <section class="policy-card">
            <div class="policy-card-heading"><span class="policy-icon slate"><i class="bi bi-journal-text"></i></span><div><h2>{{ text.documents.title }}</h2><p>{{ text.documents.description }}</p></div></div>
            <div class="row g-3">
              <div class="col-md-4 policy-field"><label for="retention-days">{{ text.documents.retention }}</label><input id="retention-days" v-model.number="form.documents.retentionDays" :disabled="!isAdmin" class="form-control" type="number" min="30" max="3650"><small>{{ text.documents.retentionHelp }}</small></div>
              <div class="col-md-8 policy-field"><div class="d-flex justify-content-between align-items-center gap-2"><label for="policy-notes">{{ text.documents.notes }}</label><button v-if="isAdmin && form.documents.notes" type="button" class="btn btn-sm btn-outline-danger" @click="deleteNotes"><i class="bi bi-trash3 me-1"></i>{{ text.delete }}</button></div><textarea id="policy-notes" v-model.trim="form.documents.notes" :disabled="!isAdmin" class="form-control" rows="3" maxlength="2000" :placeholder="text.documents.notesPlaceholder"></textarea><small>{{ form.documents.notes.length }}/2000 {{ text.documents.characters }}</small></div>
            </div>
          </section>
        </div>
      </div>

      <div v-if="isAdmin" class="d-flex justify-content-end gap-2 mt-4">
        <button type="button" class="btn btn-light border px-4" @click="resetPolicy">{{ text.reset }}</button>
        <button type="submit" class="btn btn-primary px-4" :disabled="saving"><span v-if="saving" class="spinner-border spinner-border-sm me-2"></span><i v-else class="bi bi-check2-circle me-2"></i>{{ saving ? text.saving : text.save }}</button>
      </div>
    </form>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';
import { api } from '@/services/api';
import { confirmDialog } from '@/utils/dialog';

const tax = useTaxStore();
const language = useLanguageStore();
const saving = ref(false);
const success = ref(false);
const error = ref('');
const isAdmin = computed(() => {
  try { return String(JSON.parse(localStorage.getItem('tax_user') || 'null')?.role || '').toLowerCase() === 'admin'; } catch { return false; }
});

const text = computed(() => language.isKhmer ? {
  systemSettings: 'ការកំណត់ប្រព័ន្ធ', title: 'គោលការណ៍ និងការគ្រប់គ្រង', description: 'កំណត់ច្បាប់ប្រតិបត្តិការសម្រាប់ការអនុម័ត សិទ្ធិ ស្តុក ការលក់ និងឯកសារ។', saved: 'បានរក្សាទុកការកំណត់គោលការណ៍ដោយជោគជ័យ។', readOnly: 'អ្នកអាចមើលគោលការណ៍បាន ប៉ុន្តែមានតែអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចកែប្រែបាន។', reset: 'កំណត់ឡើងវិញ', saving: 'កំពុងរក្សាទុក...', save: 'រក្សាទុកការកំណត់គោលការណ៍', delete: 'លុបកំណត់ត្រា',
  approval: { title: 'ដំណើរការអនុម័ត', description: 'ច្បាប់សម្រាប់សំណើប្រតិបត្តិការ។', projects: 'ត្រូវការអនុម័តគម្រោង', projectsHelp: 'គម្រោងថ្មីត្រូវរង់ចាំការត្រួតពិនិត្យពីអ្នកគ្រប់គ្រង។', files: 'ត្រូវការអនុម័តឯកសារ', filesHelp: 'ឯកសារគម្រោងដែលបានបញ្ចូលត្រូវផ្ទៀងផ្ទាត់មុនពេលទទួលយក។', leave: 'ត្រូវការអនុម័តច្បាប់ឈប់សម្រាក', leaveHelp: 'សំណើច្បាប់ឈប់សម្រាកត្រូវការការអនុម័តពីអ្នកគ្រប់គ្រង។', rejection: 'ត្រូវការមូលហេតុបដិសេធ', rejectionHelp: 'អ្នកពិនិត្យត្រូវបញ្ជាក់មូលហេតុនៅពេលបដិសេធសំណើ។' },
  access: { title: 'សិទ្ធិ និងសុវត្ថិភាព', description: 'ការគ្រប់គ្រងគណនី និងការផ្ទៀងផ្ទាត់។', inactive: 'ទប់ស្កាត់គណនីអសកម្ម', inactiveHelp: 'អ្នកប្រើប្រាស់អសកម្មមិនអាចចូលប្រើប្រព័ន្ធបានទេ។', registration: 'ត្រូវការអនុម័តអ្នកប្រើប្រាស់ថ្មី', registrationHelp: 'គណនីបុគ្គលិកថ្មីត្រូវការការត្រួតពិនិត្យមុនប្រើប្រាស់។', password: 'ប្រវែងពាក្យសម្ងាត់អប្បបរមា', passwordHelp: 'ចំនួនតួអក្សរអប្បបរមាដែលអនុញ្ញាត។' },
  inventory: { title: 'ការគ្រប់គ្រងស្តុក', description: 'ការពារភាពត្រឹមត្រូវ និងប្រវត្តិស្តុក។', negative: 'ទប់ស្កាត់ស្តុកអវិជ្ជមាន', negativeHelp: 'ការលក់ និងកែសម្រួលមិនអាចធ្វើឱ្យស្តុកក្រោមសូន្យ។', adjustment: 'ត្រូវការអនុម័តការកែសម្រួលពីអ្នកគ្រប់គ្រង', adjustmentHelp: 'ការកែស្តុកដោយដៃត្រូវបានកំណត់សម្រាប់អ្នកគ្រប់គ្រង។', note: 'ត្រូវការកំណត់ត្រាកែសម្រួល', noteHelp: 'រាល់ការកែស្តុកត្រូវមានមូលហេតុ ឬលេខយោង។' },
  sales: { title: 'ការលក់ និងការទូទាត់', description: 'ការអនុម័តប្រតិបត្តិការ និងកម្រិតបញ្ចុះតម្លៃ។', discount: 'ត្រូវការអនុម័តការបញ្ចុះតម្លៃខ្ពស់', discountHelp: 'ការបញ្ចុះតម្លៃលើសកម្រិតត្រូវការអ្នកគ្រប់គ្រងអនុម័ត។', limit: 'បញ្ចុះតម្លៃអតិបរមាមិនត្រូវការអនុម័ត (%)', limitHelp: 'ប្រើសម្រាប់ដំណើរការអនុម័តការបញ្ចុះតម្លៃក្នុង POS។', reversal: 'ត្រូវការអនុម័តការលុបវិក្កយបត្រ', reversalHelp: 'ការលុបវិក្កយបត្រត្រូវការអ្នកគ្រប់គ្រងអនុញ្ញាត។' },
  documents: { title: 'ការរក្សាទុកឯកសារ និងកំណត់ត្រា', description: 'រក្សាប្រវត្តិប្រតិបត្តិការឱ្យបានច្បាស់លាស់។', retention: 'រយៈពេលរក្សាទុក (ថ្ងៃ)', retentionHelp: 'ណែនាំឱ្យរក្សាទុកយ៉ាងហោចណាស់ 365 ថ្ងៃ។', notes: 'កំណត់ត្រាគោលការណ៍', notesPlaceholder: 'បន្ថែមកំណត់ត្រាផ្ទៃក្នុង ករណីលើកលែង ឬកាលបរិច្ឆេទពិនិត្យឡើងវិញ...', characters: 'តួអក្សរ' },
} : {
  systemSettings: 'System Settings', title: 'Policy & Controls', description: 'Define the operating rules used by approvals, access, inventory, sales, and document handling.', saved: 'Policy settings saved successfully.', readOnly: 'You can view these policies, but only administrators can change them.', reset: 'Reset changes', saving: 'Saving...', save: 'Save policy settings', delete: 'Delete notes',
  approval: { title: 'Approval workflow', description: 'Rules for operational requests.', projects: 'Require project approval', projectsHelp: 'New projects stay pending until an administrator reviews them.', files: 'Require file approval', filesHelp: 'Uploaded project files require verification before acceptance.', leave: 'Require leave approval', leaveHelp: 'Staff leave requests must be approved by an administrator.', rejection: 'Rejection reason required', rejectionHelp: 'Reviewers must explain rejected requests.' },
  access: { title: 'Access & security', description: 'Account and authentication controls.', inactive: 'Block inactive accounts', inactiveHelp: 'Inactive users cannot sign in or access protected services.', registration: 'New user approval required', registrationHelp: 'New staff accounts require administrative review before use.', password: 'Minimum password length', passwordHelp: 'Minimum accepted password characters.' },
  inventory: { title: 'Inventory controls', description: 'Protect stock accuracy and auditability.', negative: 'Block negative stock', negativeHelp: 'Sales and adjustments cannot reduce stock below zero.', adjustment: 'Admin approval for adjustments', adjustmentHelp: 'Manual stock corrections are restricted to administrators.', note: 'Adjustment note required', noteHelp: 'Every stock correction must include a reason or reference.' },
  sales: { title: 'Sales & payments', description: 'Transaction approval and discount limits.', discount: 'Approval for high discounts', discountHelp: 'Discounts above the configured limit require manager approval.', limit: 'Maximum discount without approval (%)', limitHelp: 'Used by the POS discount authorization flow.', reversal: 'Admin approval for invoice reversal', reversalHelp: 'Invoice reversals require an administrator authorization.' },
  documents: { title: 'Document retention & notes', description: 'Keep a clear operational record for the business.', retention: 'Retention period (days)', retentionHelp: 'Recommended minimum: 365 days.', notes: 'Policy notes', notesPlaceholder: 'Add internal policy notes, exceptions, or review dates...', characters: 'characters' },
});

const defaults = () => ({
  approval: { projectsRequired: true, filesRequired: true, leaveRequired: true, rejectionReasonRequired: true },
  access: { inactiveLoginBlocked: true, registrationRequiresApproval: false, passwordMinLength: 6 },
  inventory: { negativeStockBlocked: true, adjustmentRequiresAdmin: true, auditNotesRequired: true },
  sales: { discountApprovalRequired: true, maxDiscountPercent: 10, invoiceVoidRequiresAdmin: true },
  documents: { retentionDays: 365, notes: '' },
});

const form = reactive(defaults());

function copyPolicy() {
  const source = tax.settings?.policy || {};
  const fallback = defaults();
  Object.keys(fallback).forEach((section) => Object.assign(form[section], fallback[section], source[section] || {}));
}

function resetPolicy() {
  Object.assign(form.approval, defaults().approval);
  Object.assign(form.access, defaults().access);
  Object.assign(form.inventory, defaults().inventory);
  Object.assign(form.sales, defaults().sales);
  Object.assign(form.documents, defaults().documents);
  success.value = false;
  error.value = '';
}

async function savePolicy() {
  saving.value = true;
  success.value = false;
  error.value = '';
  try {
    const passwordMinLength = Math.max(6, Math.min(128, Number(form.access.passwordMinLength) || 6));
    const maxDiscountPercent = Math.max(0, Math.min(100, Number(form.sales.maxDiscountPercent) || 0));
    const retentionDays = Math.max(30, Math.min(3650, Number(form.documents.retentionDays) || 365));
    const policy = { ...form, access: { ...form.access, passwordMinLength }, sales: { ...form.sales, maxDiscountPercent }, documents: { ...form.documents, retentionDays } };
    await tax.saveSettings({ ...tax.settings, policy });
    Object.assign(form.access, { passwordMinLength });
    Object.assign(form.sales, { maxDiscountPercent });
    Object.assign(form.documents, { retentionDays });
    success.value = true;
  } catch (requestError) {
    error.value = requestError.message || 'Unable to save policy settings.';
  } finally {
    saving.value = false;
  }
}

async function deleteNotes() {
  const confirmed = await confirmDialog({
    title: language.isKhmer ? 'លុបកំណត់ត្រាគោលការណ៍' : 'Delete policy notes',
    message: language.isKhmer ? 'លុបកំណត់ត្រាគោលការណ៍នេះមែនទេ?' : 'Delete these policy notes?',
    variant: 'danger',
    confirmText: language.isKhmer ? 'លុប' : 'Delete',
  });
  if (!confirmed) return;

  saving.value = true;
  error.value = '';
  try {
    await api.deletePolicyNotes();
    form.documents.notes = '';
    success.value = true;
  } catch (requestError) {
    error.value = requestError.message || (language.isKhmer ? 'មិនអาจលុបកំណត់ត្រាបានទេ។' : 'Unable to delete policy notes.');
  } finally {
    saving.value = false;
  }
}

onMounted(copyPolicy);
</script>

<style scoped>
.policy-page { min-height: 100vh; background: #f3f6f6; }
.policy-hero { background: linear-gradient(120deg, #102a43, #155e63); box-shadow: 0 18px 38px rgba(16, 42, 67, .14); }
.hero-icon { position: absolute; right: 7%; bottom: -18px; color: rgba(255, 255, 255, .1); font-size: 9rem; transform: rotate(-12deg); }
.policy-card { padding: 1.35rem; background: #fff; border: 1px solid #dce8e7; border-radius: .85rem; box-shadow: 0 7px 20px rgba(16, 42, 67, .05); }
.policy-card-heading { display: flex; align-items: center; gap: .8rem; padding-bottom: 1rem; margin-bottom: .3rem; border-bottom: 1px solid #edf2f2; }
.policy-card-heading h2 { margin: 0; color: #102a43; font-size: 1rem; font-weight: 700; }
.policy-card-heading p { margin: .15rem 0 0; color: #71838a; font-size: .78rem; }
.policy-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: .65rem; font-size: 1.1rem; }
.policy-icon.teal { color: #087f73; background: #dff4ef; }.policy-icon.blue { color: #2563a6; background: #e3effc; }.policy-icon.amber { color: #a86a10; background: #fff1d8; }.policy-icon.coral { color: #b74949; background: #fde6e4; }.policy-icon.slate { color: #526579; background: #e9eef2; }
.policy-toggle { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .9rem 0; border-bottom: 1px solid #edf2f2; cursor: pointer; }
.policy-toggle:last-child { border-bottom: 0; }.policy-toggle strong, .policy-field label { display: block; color: #203b4d; font-size: .88rem; font-weight: 700; }.policy-toggle small, .policy-field small { display: block; margin-top: .2rem; color: #78909a; font-size: .75rem; }.policy-toggle input { position: absolute; opacity: 0; }.switch { width: 42px; height: 24px; flex: 0 0 42px; border-radius: 20px; background: #cbd8dc; position: relative; transition: .2s ease; }.switch::after { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: .2s ease; }.policy-toggle input:checked + .switch { background: #0b8f83; }.policy-toggle input:checked + .switch::after { transform: translateX(18px); }.policy-field { padding-top: .9rem; }.policy-field .form-control { margin-top: .4rem; }
</style>
