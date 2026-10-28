<template>
  <main class="container-fluid p-4">
    <header class="mb-4">
      <div class="text-uppercase small fw-semibold text-primary mb-1">{{ language.isKhmer ? 'ឧបសម្ព័ន្ធទី ២ · ទិន្នន័យសហគ្រាស' : 'Annex 2 · Enterprise data' }}</div>
      <h1 class="h3 fw-bold mb-1">{{ language.isKhmer ? 'ប្រវត្តិរូបទិន្នន័យក្រុមហ៊ុន' : 'Company data profile' }}</h1>
      <p class="text-muted mb-0">{{ language.isKhmer ? 'រក្សាទុកអត្តសញ្ញាណពន្ធ និងអាជីវកម្មផ្លូវការដែលភ្ជាប់នឹងគណនីនេះ។' : 'Maintain the tax and official business identity associated with this account.' }}</p>
    </header>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>
    <div v-if="notice" class="alert alert-success" role="status">{{ notice }}</div>
    <div v-if="loading && !loaded" class="text-center py-5"><span class="spinner-border text-primary" role="status"><span class="visually-hidden">{{ language.isKhmer ? 'កំពុងទាញយកប្រវត្តិរូបក្រុមហ៊ុន…' : 'Loading company profile…' }}</span></span></div>
    <div v-else-if="loaded && !canEdit" class="alert alert-info" role="status">
      {{ language.isKhmer ? 'អ្នកអាចមើលប្រវត្តិរូបក្រុមហ៊ុនដែលបានចែករំលែកនេះ។ មានតែម្ចាស់ក្រុមហ៊ុន ឬអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចកែប្រែបាន។' : 'You can view the shared company profile. Only the company owner or an administrator can edit it.' }}
    </div>

    <form v-else class="card border-0 shadow-sm" novalidate @submit.prevent="save">
      <div class="card-body p-4">
        <fieldset :disabled="!canEdit">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label" for="enterprise">{{ language.isKhmer ? 'ឈ្មោះសហគ្រាស' : 'Name of enterprise' }} <span class="text-danger">*</span></label>
            <input id="enterprise" v-model.trim="form.enterprise_name" class="form-control" :class="{ 'is-invalid': attempted && !form.enterprise_name.trim() }" maxlength="180" required autocomplete="organization" />
            <div class="invalid-feedback">{{ language.isKhmer ? 'ត្រូវបញ្ចូលឈ្មោះសហគ្រាស។' : 'Enterprise name is required.' }}</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="tin">{{ language.isKhmer ? 'លេខអត្តសញ្ញាណកម្មសារពើពន្ធ (TIN)' : 'Tax identification number (TIN)' }} <span class="text-danger">*</span></label>
            <input id="tin" v-model.trim="form.tin" class="form-control text-uppercase" :class="{ 'is-invalid': attempted && !validTin }" maxlength="80" required autocomplete="off" />
            <div class="invalid-feedback">{{ language.isKhmer ? 'សូមបញ្ចូល TIN ត្រឹមត្រូវ ដោយប្រើអក្សរ លេខ ដកឃ្លា ឬសញ្ញា ., / និង -។' : 'Enter a valid TIN using letters, numbers, spaces, ., / or -.' }}</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="tax-date">{{ language.isKhmer ? 'កាលបរិច្ឆេទចុះបញ្ជីជាមួយអគ្គនាយកដ្ឋានពន្ធដារ' : 'Date registered with Tax Administration' }} <span class="text-danger">*</span></label>
            <input id="tax-date" v-model="form.tax_registered_date" class="form-control" :class="{ 'is-invalid': attempted && !validDate }" type="date" :max="today" required />
            <div class="invalid-feedback">{{ language.isKhmer ? 'សូមបញ្ចូលកាលបរិច្ឆេទចុះបញ្ជីត្រឹមត្រូវ និងមិននៅអនាគត។' : 'Enter a valid registration date that is not in the future.' }}</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="director">{{ language.isKhmer ? 'នាយក / អ្នកគ្រប់គ្រង / ម្ចាស់' : 'Director / manager / owner' }} <span class="text-danger">*</span></label>
            <input id="director" v-model.trim="form.director_name" class="form-control" :class="{ 'is-invalid': attempted && !form.director_name.trim() }" maxlength="180" required />
            <div class="invalid-feedback">{{ language.isKhmer ? 'ត្រូវបញ្ចូលឈ្មោះនាយក អ្នកគ្រប់គ្រង ឬម្ចាស់។' : 'Director, manager, or owner name is required.' }}</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="accountant">{{ language.isKhmer ? 'គណនេយ្យករ / ទីប្រឹក្សា / ក្រុមហ៊ុន' : 'Accountant / consultant / firm' }} <span class="text-danger">*</span></label>
            <input id="accountant" v-model.trim="form.accountant_name" class="form-control" :class="{ 'is-invalid': attempted && !form.accountant_name.trim() }" maxlength="180" required />
            <div class="invalid-feedback">{{ language.isKhmer ? 'ត្រូវបញ្ចូលឈ្មោះគណនេយ្យករ ឬទីប្រឹក្សា។' : 'Accountant or consultant name is required.' }}</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="phone">{{ language.isKhmer ? 'ទូរស័ព្ទការិយាល័យ' : 'Office phone' }} <span class="text-danger">*</span></label>
            <input id="phone" v-model.trim="form.office_phone" class="form-control" :class="{ 'is-invalid': attempted && !validPhone }" type="tel" maxlength="60" inputmode="tel" autocomplete="tel" required />
            <div class="invalid-feedback">{{ language.isKhmer ? 'សូមបញ្ចូលលេខទូរស័ព្ទត្រឹមត្រូវដែលមានពី ៦ ដល់ ២០ ខ្ទង់។' : 'Enter a valid phone number containing 6 to 20 digits.' }}</div>
          </div>
          <div class="col-12">
            <label class="form-label" for="activities">{{ language.isKhmer ? 'សកម្មភាពអាជីវកម្មចម្បង' : 'Main business activities' }} <span class="text-danger">*</span></label>
            <textarea id="activities" v-model.trim="form.business_activity" class="form-control" :class="{ 'is-invalid': attempted && !form.business_activity.trim() }" maxlength="5000" rows="3" required></textarea>
            <div class="invalid-feedback">{{ language.isKhmer ? 'ត្រូវបញ្ចូលសកម្មភាពអាជីវកម្មចម្បង។' : 'Main business activities are required.' }}</div>
          </div>
          <div class="col-12">
            <label class="form-label" for="address">{{ language.isKhmer ? 'អាសយដ្ឋានការិយាល័យដែលបានចុះបញ្ជីបច្ចុប្បន្ន' : 'Current registered office address' }} <span class="text-danger">*</span></label>
            <textarea id="address" v-model.trim="form.registered_address" class="form-control" :class="{ 'is-invalid': attempted && !form.registered_address.trim() }" maxlength="5000" rows="3" autocomplete="street-address" required></textarea>
            <div class="invalid-feedback">{{ language.isKhmer ? 'ត្រូវបញ្ចូលអាសយដ្ឋានការិយាល័យដែលបានចុះបញ្ជី។' : 'Registered office address is required.' }}</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="official-email">{{ language.isKhmer ? 'អ៊ីមែលផ្លូវការ' : 'Official email' }} <span class="text-danger">*</span></label>
            <input id="official-email" v-model.trim="form.official_email" class="form-control" :class="{ 'is-invalid': attempted && !validEmail }" type="email" maxlength="255" autocomplete="email" required />
            <div class="invalid-feedback">{{ language.isKhmer ? 'សូមបញ្ចូលអាសយដ្ឋានអ៊ីមែលផ្លូវការត្រឹមត្រូវ។' : 'Enter a valid official email address.' }}</div>
          </div>
        </div>
        </fieldset>
      </div>
      <footer class="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-3 px-4 py-3">
        <small v-if="profile?.updated_at" class="text-muted">{{ language.isKhmer ? 'រក្សាទុកចុងក្រោយ៖' : 'Last saved:' }} {{ formatDate(profile.updated_at) }}</small>
        <button v-if="canEdit" class="btn btn-primary ms-auto" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
          {{ loading ? (language.isKhmer ? 'កំពុងរក្សាទុក…' : 'Saving…') : (language.isKhmer ? 'រក្សាទុកប្រវត្តិរូបក្រុមហ៊ុន' : 'Save company profile') }}
        </button>
      </footer>
    </form>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { useLanguageStore } from '@/stores/language';

const auth = useAuthStore();
const language = useLanguageStore();
const { companyProfile: profile, loading, user } = storeToRefs(auth);
const canEdit = computed(() =>
  String(user.value?.role || '').toLowerCase() === 'owner'
  || Number(profile.value?.owner_user_id) === Number(user.value?.id)
);
const error = ref('');
const notice = ref('');
const loaded = ref(false);
const attempted = ref(false);
const today = new Date().toISOString().slice(0, 10);
const form = reactive({
  enterprise_name: '',
  tin: '',
  tax_registered_date: '',
  director_name: '',
  business_activity: '',
  accountant_name: '',
  registered_address: '',
  office_phone: '',
  official_email: '',
});
const validTin = computed(() => /^[A-Za-z0-9][A-Za-z0-9./\-\s]{1,79}$/.test(form.tin.trim()));
const validDate = computed(() => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.tax_registered_date) || form.tax_registered_date > today) return false;
  const parsed = new Date(`${form.tax_registered_date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === form.tax_registered_date;
});
const validPhone = computed(() => {
  const digits = form.office_phone.replace(/\D/g, '');
  return /^[+\d().\-\s]+$/.test(form.office_phone) && digits.length >= 6 && digits.length <= 20;
});
const validEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.official_email.trim()));

function assignProfile(value) {
  Object.keys(form).forEach((key) => { form[key] = value[key] || ''; });
}
async function load() {
  error.value = '';
  try {
    assignProfile(await auth.loadCompanyProfile());
    loaded.value = true;
  } catch (requestError) {
    error.value = requestError.message || (language.isKhmer ? 'មិនអាចទាញយកប្រវត្តិរូបក្រុមហ៊ុនបានទេ។' : 'Unable to load company profile.');
  }
}
async function save() {
  attempted.value = true;
  error.value = '';
  notice.value = '';
  const requiredFields = [
    form.enterprise_name, form.director_name, form.business_activity,
    form.accountant_name, form.registered_address,
  ];
  if (requiredFields.some((value) => !value.trim()) || !validTin.value || !validDate.value || !validPhone.value || !validEmail.value) {
    error.value = language.isKhmer ? 'សូមពិនិត្យ និងកែតម្រូវវាលដែលបានបន្លិច។' : 'Review the highlighted required fields and correct their values.';
    return;
  }
  try {
    const saved = await auth.saveCompanyProfile({ ...form, tin: form.tin.trim().toUpperCase() });
    assignProfile(saved);
    attempted.value = false;
    notice.value = language.isKhmer ? 'បានរក្សាទុកប្រវត្តិរូបក្រុមហ៊ុន។' : 'Company profile saved.';
  } catch (requestError) {
    error.value = requestError.message || (language.isKhmer ? 'មិនអាចរក្សាទុកប្រវត្តិរូបក្រុមហ៊ុនបានទេ។' : 'Unable to save company profile.');
  }
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(language.isKhmer ? 'km-KH' : undefined);
}
onMounted(load);
</script>
