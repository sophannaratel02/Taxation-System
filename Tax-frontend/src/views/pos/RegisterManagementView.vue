<template>
  <section class="container-fluid p-4 page-canvas">
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <div class="eyebrow mb-2">{{ language.isKhmer ? 'វេនលក់ និងថតប្រាក់' : 'Register & cash drawer' }}</div>
        <h1 class="h3 fw-bold mb-1">{{ language.isKhmer ? 'បើក និងបិទវេនលក់' : 'Open / close register' }}</h1>
        <p class="text-muted mb-0">{{ language.isKhmer ? 'រាប់សាច់ប្រាក់ដើម និងផ្ទៀងផ្ទាត់សាច់ប្រាក់ចុងវេន។' : 'Record starting cash and reconcile the drawer at close.' }}</p>
      </div>
      <span class="badge rounded-pill" :class="register ? 'text-bg-success' : 'text-bg-secondary'">
        {{ register ? (language.isKhmer ? 'កំពុងបើក' : 'Register open') : (language.isKhmer ? 'បិទ' : 'Register closed') }}
      </span>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="result" class="alert alert-success">{{ result }}</div>

    <div class="row g-4">
      <div class="col-lg-5">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body p-4">
            <h2 class="h5 fw-bold mb-3"><i class="bi bi-safe2 me-2 text-primary"></i>{{ register ? (language.isKhmer ? 'បិទថតប្រាក់' : 'Close cash drawer') : (language.isKhmer ? 'បើកថតប្រាក់' : 'Open cash drawer') }}</h2>
            <label class="form-label">{{ language.isKhmer ? 'សាខា' : 'Branch' }}</label>
            <select v-model="branch" class="form-select mb-3"><option>Head Quarter</option><option>Downtown Shop</option><option>Main Warehouse</option></select>
            <label class="form-label">{{ register ? (language.isKhmer ? 'សាច់ប្រាក់រាប់បាន' : 'Counted cash') : (language.isKhmer ? 'សាច់ប្រាក់ដើម' : 'Starting cash') }}</label>
            <div class="input-group mb-3"><span class="input-group-text">$</span><input v-model.number="cash" class="form-control" type="number" min="0" step="0.01" /></div>
            <button class="btn w-100" :class="register ? 'btn-danger' : 'btn-primary'" :disabled="saving" @click="register ? closeRegister() : openRegister()">
              <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
              {{ register ? (language.isKhmer ? 'បិទវេន និងបង្កើត Z-Report' : 'Close & create Z-Report') : (language.isKhmer ? 'បើកវេនលក់' : 'Open register') }}
            </button>
          </div>
        </div>
      </div>
      <div class="col-lg-7">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body p-4">
            <h2 class="h5 fw-bold mb-3">{{ language.isKhmer ? 'ស្ថានភាពវេនបច្ចុប្បន្ន' : 'Current shift status' }}</h2>
            <div v-if="register" class="row g-3">
              <div class="col-sm-6"><div class="border rounded p-3"><small class="text-muted">{{ language.isKhmer ? 'បើកនៅ' : 'Opened at' }}</small><div class="fw-semibold">{{ formatDate(register.opened_at) }}</div></div></div>
              <div class="col-sm-6"><div class="border rounded p-3"><small class="text-muted">{{ language.isKhmer ? 'សាច់ប្រាក់ដើម' : 'Starting cash' }}</small><div class="fw-semibold">${{ Number(register.starting_cash).toFixed(2) }}</div></div></div>
            </div>
            <div v-else class="text-muted py-4"><i class="bi bi-info-circle me-2"></i>{{ language.isKhmer ? 'សូមបើកវេនមុនពេលលក់។' : 'Open a register before processing sales.' }}</div>
            <hr />
            <p class="small text-muted mb-0">X-Report shows the current shift totals. Z-Report is created when the drawer is closed and records any cash variance.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { api } from '@/services/api';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';
import { confirmDialog } from '@/utils/dialog';

const tax = useTaxStore();
const language = useLanguageStore();
const branch = ref(tax.settings?.branch || 'Head Quarter');
const cash = ref(0);
const register = ref(null);
const saving = ref(false);
const error = ref('');
const result = ref('');

function formatDate(value) { return value ? new Date(value).toLocaleString() : '-'; }
async function load() { try { register.value = await api.currentRegister(branch.value); } catch (requestError) { error.value = requestError.message; } }
async function openRegister() { saving.value = true; error.value = ''; try { register.value = await api.openRegister({ branch: branch.value, startingCash: cash.value }); result.value = language.isKhmer ? 'វេនត្រូវបានបើកដោយជោគជ័យ។' : 'Register opened successfully.'; } catch (requestError) { error.value = requestError.message; } finally { saving.value = false; } }
async function closeRegister() {
  const confirmed = await confirmDialog({
    title: language.isKhmer ? 'បិទវេនលក់' : 'Close register',
    message: language.isKhmer ? 'បិទវេនលក់នេះមែនទេ?' : 'Close this register?',
    variant: 'warning',
    confirmText: language.isKhmer ? 'បិទ' : 'Close',
  });

  if (!confirmed) return;

  saving.value = true;
  error.value = '';
  try {
    const report = await api.closeRegister({ branch: branch.value, countedCash: cash.value });
    register.value = null;
    result.value = `${language.isKhmer ? 'Z-Report រួចរាល់។ ភាពខុសគ្នា' : 'Z-Report complete. Cash variance'}: $${Number(report.variance).toFixed(2)}`;
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    saving.value = false;
  }
}
watch(branch, load);
onMounted(load);
</script>
