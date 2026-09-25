<template>
  <section class="container-fluid p-4 page-canvas settings-page">
    <!-- Header Hero Section -->
    <div class="settings-hero p-4 mb-4 rounded-4 shadow-sm bg-white border">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-primary-subtle text-primary small fw-semibold mb-2">
            <i class="bi bi-sliders2"></i>
            <span>{{ language.t('settings') }}</span>
          </div>
          <h1 class="h3 fw-bold text-dark mb-1">
            {{ language.isKhmer ? 'ការកំណត់ក្រុមហ៊ុន និងសាខា' : 'Company & Branch Configuration' }}
          </h1>
          <p class="text-muted mb-0">
            {{ language.isKhmer 
              ? 'គ្រប់គ្រងអត្តសញ្ញាណស្របច្បាប់ ពន្ធដារ GDT អត្រាប្តូរប្រាក់ និងច្រកទូទាត់ KHQR / Bakong។' 
              : 'Configure company identity, GDT compliance, dual-currency engine, and KHQR gateway.' 
            }}
          </p>
        </div>

        <!-- Sticky / Header Quick Save -->
        <button class="btn btn-primary px-4 py-2 rounded-3 shadow-sm" type="button" @click="save">
          <i class="bi bi-check2-circle me-2"></i>
          {{ language.t('save') }}
        </button>
      </div>
    </div>

    <!-- Alert Notifications -->
    <Transition name="fade">
      <div v-if="saved" class="alert alert-success d-flex align-items-center mb-4 rounded-3 border-0 shadow-sm" role="alert">
        <i class="bi bi-check-circle-fill me-2 fs-5"></i>
        <div>
          <strong>{{ language.isKhmer ? 'ជោគជ័យ!' : 'Settings Saved!' }}</strong>
          <span class="ms-1">
            {{ language.isKhmer 
              ? 'រាល់ការផ្លាស់ប្តូរត្រូវបានរក្សាទុក និងធ្វើបច្ចុប្បន្នភាពក្នុងប្រព័ន្ធរួចរាល់។' 
              : 'All store parameters, tax rates, and KHQR credentials have been updated.' 
            }}
          </span>
        </div>
      </div>
    </Transition>

    <form @submit.prevent="save">
      <div class="row g-4">
        <!-- 1. Legal Company Identity & Tax Card -->
        <div class="col-xl-6">
          <div class="card border-0 shadow-sm rounded-4 h-100">
            <div class="card-header bg-white py-3 px-4 border-bottom border-light-subtle d-flex align-items-center gap-2">
              <div class="section-icon bg-primary-subtle text-primary rounded-3">
                <i class="bi bi-building"></i>
              </div>
              <div>
                <strong class="fs-6 d-block">{{ language.isKhmer ? 'អត្តសញ្ញាណក្រុមហ៊ុន និងពន្ធ' : 'Company Identity & Tax' }}</strong>
                <small class="text-muted">{{ language.isKhmer ? 'ព័ត៌មានផ្លូវការសម្រាប់ចេញលើវិក្កយបត្រ' : 'Legal registered business credentials' }}</small>
              </div>
            </div>

            <div class="card-body p-4">
              <div class="row g-3">
                <!-- Company Name EN -->
                <div class="col-12">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'ឈ្មោះក្រុមហ៊ុន (អង់គ្លេស)' : 'Company Name (English)' }}
                  </label>
                  <div class="input-group">
                    <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-card-text"></i></span>
                    <input
                      v-model.trim="form.companyName"
                      class="form-control border-start-0"
                      placeholder="e.g. POS Mart Retail Co., Ltd."
                      required
                    />
                  </div>
                </div>

                <!-- Company Name Khmer -->
                <div class="col-12">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'ឈ្មោះក្រុមហ៊ុន (ភាសាខ្មែរ)' : 'Company Name (Khmer)' }}
                  </label>
                  <div class="input-group">
                    <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-fonts"></i></span>
                    <input
                      v-model.trim="form.companyNameKh"
                      class="form-control border-start-0"
                      placeholder="ឧ. ក្រុមហ៊ុន ភីអូអេស ម៉ាត រីថែល ឯ.ក"
                    />
                  </div>
                </div>

                <!-- VAT TIN -->
                <div class="col-md-6">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'លេខអត្តសញ្ញាណកម្មសារពើពន្ធ (VAT TIN)' : 'VAT TIN (Tax ID)' }}
                  </label>
                  <div class="input-group">
                    <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-hash"></i></span>
                    <input
                      v-model.trim="form.vatTin"
                      class="form-control border-start-0 font-monospace text-uppercase"
                      placeholder="K001-123456789"
                    />
                  </div>
                </div>

                <!-- Phone Number -->
                <div class="col-md-6">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'លេខទូរស័ព្ទផ្លូវការ' : 'Official Contact Phone' }}
                  </label>
                  <div class="input-group">
                    <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-telephone"></i></span>
                    <input
                      v-model.trim="form.phone"
                      class="form-control border-start-0"
                      placeholder="+855 12 345 678"
                    />
                  </div>
                </div>

                <!-- Address -->
                <div class="col-12">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'អាសយដ្ឋានទីតាំង' : 'Physical Address' }}
                  </label>
                  <div class="input-group">
                    <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-geo-alt"></i></span>
                    <input
                      v-model.trim="form.address"
                      class="form-control border-start-0"
                      placeholder="e.g. #123, St. 271, Phnom Penh, Cambodia"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. Dual-Currency Engine & Branch Architecture -->
        <div class="col-xl-6">
          <div class="card border-0 shadow-sm rounded-4 h-100">
            <div class="card-header bg-white py-3 px-4 border-bottom border-light-subtle d-flex align-items-center gap-2">
              <div class="section-icon bg-info-subtle text-info-emphasis rounded-3">
                <i class="bi bi-currency-exchange"></i>
              </div>
              <div>
                <strong class="fs-6 d-block">{{ language.isKhmer ? 'រូបិយប័ណ្ណ និងសាខាប្រតិបត្តិការ' : 'Currency & Operations' }}</strong>
                <small class="text-muted">{{ language.isKhmer ? 'អត្រាប្តូរប្រាក់ដុល្លារ/រៀល និងការគណនាពន្ធ' : 'Exchange engine and active store branch' }}</small>
              </div>
            </div>

            <div class="card-body p-4">
              <div class="row g-3">
                <!-- Active Branch -->
                <div class="col-12">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'សាខា ឬឃ្លាំងដែលកំពុងដំណើរការ' : 'Active Operating Branch' }}
                  </label>
                  <select v-model="form.branch" class="form-select form-select-lg fs-6">
                    
                    <option value="Downtown Shop">Downtown Shop (សាខាកណ្តាលក្រុង)</option>
                    <option value="#32 street 432, Toul Tum Poung 1">#32 street 432, Toul Tum Poung 1, Chamkar Morn, Phnom Penh, Cambodia</option>
                
                  </select>
                </div>

                <!-- Base Currency -->
                <div class="col-md-4">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'រូបិយប័ណ្ណគោល' : 'Base Currency' }}
                  </label>
                  <input v-model="form.baseCurrency" class="form-control bg-light" readonly />
                  <div class="form-text small text-muted">Fixed store base</div>
                </div>

                <!-- KHR Exchange Rate -->
                <div class="col-md-4">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.t('exchangeRate') }} (KHR)
                  </label>
                  <div class="input-group">
                    <span class="input-group-text bg-light text-primary fw-bold">៛</span>
                    <input
                      v-model.number="form.exchangeRate"
                      type="number"
                      min="1"
                      step="10"
                      class="form-control fw-bold"
                      required
                    />
                  </div>
                  <div class="form-text small text-muted">Per 1.00 USD</div>
                </div>

                <!-- VAT Rate -->
                <div class="col-md-4">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'អត្រាពន្ធ VAT' : 'VAT Rate' }}
                  </label>
                  <div class="input-group">
                    <input
                      v-model.number="form.vatRate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      class="form-control fw-bold"
                      required
                    />
                    <span class="input-group-text bg-light text-danger fw-bold">%</span>
                  </div>
                  <div class="form-text small text-muted">GDT standard</div>
                </div>

                <!-- Live Exchange Calculation Box -->
                <div class="col-12 mt-4">
                  <div class="p-3 bg-light rounded-3 border d-flex justify-content-between align-items-center">
                    <div>
                      <small class="text-muted d-block">{{ language.isKhmer ? 'ការបំប្លែងគំរូ' : 'Live Rate Preview' }}</small>
                      <strong>$10.00 USD</strong> = <span class="text-primary fw-bold">{{ (10 * Number(form.exchangeRate || 4000)).toLocaleString() }} ៛</span>
                    </div>
                    <span class="badge bg-white text-secondary border px-3 py-2">
                      <i class="bi bi-clock-history me-1"></i>{{ language.isKhmer ? 'ពេលវេលាជាក់ស្តែង' : 'Active Rate' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. NBC Bakong / KHQR Payment Gateway -->
        <div class="col-xl-7">
          <div class="card border-0 shadow-sm rounded-4 h-100">
            <div class="card-header bg-white py-3 px-4 border-bottom border-light-subtle d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center gap-2">
                <div class="section-icon bg-danger-subtle text-danger rounded-3">
                  <i class="bi bi-qr-code-scan"></i>
                </div>
                <div>
                  <strong class="fs-6 d-block">{{ language.isKhmer ? 'ច្រកទូទាត់ KHQR / Bakong' : 'NBC KHQR Payment Gateway' }}</strong>
                  <small class="text-muted">{{ language.isKhmer ? 'បង្កើត QR ស្កេនទូទាត់សម្រាប់ ABA, ACLEDA, Wing' : 'EMVCo compliant mobile payment configuration' }}</small>
                </div>
              </div>
              <span class="badge bg-danger px-3 py-2 text-uppercase fw-bold letter-spacing">KHQR Official</span>
            </div>

            <div class="card-body p-4">
              <div class="row g-3">
                <!-- Provider Select -->
                <div class="col-md-6">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'ធនាគារ / អ្នកផ្តល់សេវា' : 'Bank / Provider' }}
                  </label>
                  <select v-model="form.khqrProvider" class="form-select">
                    <option value="abaa">ABA Bank (@abaa)</option>
                    <option value="aclb">ACLEDA Bank (@aclb)</option>
                    <option value="wing">Wing Bank (@wing)</option>
                    <option value="spbn">Sathapana Bank (@spbn)</option>
                    <option value="bakong">Bakong Native Account (@bakong)</option>
                  </select>
                </div>

                <!-- Account Identifier -->
                <div class="col-md-6">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'Bakong Account ID (ត្រូវការ)' : 'Bakong Account ID (required)' }}
                  </label>
                  <input
                    v-model.trim="form.khqrAccount"
                    class="form-control font-monospace"
                    placeholder="e.g. merchant@abaa or merchant@aclb"
                    required
                  />
                </div>

                <!-- Merchant Display Name -->
                <div class="col-md-6">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'ឈ្មោះពាណិជ្ជករលើ KHQR' : 'Merchant Display Name' }}
                  </label>
                  <input
                    v-model.trim="form.khqrMerchantName"
                    class="form-control text-uppercase fw-semibold"
                    placeholder="e.g. HAPPY BABE SHOP"
                    required
                  />
                  <small class="form-text text-muted">
                    {{ language.isKhmer ? 'ឈ្មោះនឹងបង្ហាញលើ App ធនាគាររបស់ភ្ញៀវពេលស្កេន' : 'Appears on customer banking screen upon scan' }}
                  </small>
                </div>

                <!-- Optional Acquiring Bank Merchant ID -->
                <div class="col-md-6">
                  <label class="form-label small fw-semibold text-secondary">
                    {{ language.isKhmer ? 'លេខសម្គាល់ពាណិជ្ជករ (16 ខ្ទង់ - បើមាន)' : 'Merchant ID (16-Digit Optional)' }}
                  </label>
                  <input
                    v-model.trim="form.khqrMerchantId"
                    class="form-control font-monospace"
                    placeholder="16-character Merchant Code"
                  />
                  <small class="form-text text-muted">The Bakong Account ID above is required for cross-bank scanning.</small>
                </div>

                <!-- Live Configuration Badge -->
                <div class="col-12 mt-3">
                  <div class="p-3 rounded-3 border bg-white d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-3">
                      <div class="khqr-badge-icon">
                        <i class="bi bi-shield-lock-fill text-success fs-4"></i>
                      </div>
                      <div>
                        <div class="small text-muted">{{ language.isKhmer ? 'អត្តសញ្ញាណបច្ចុប្បន្ន' : 'Configured Gateway Account' }}</div>
                        <strong class="text-primary font-monospace">{{ form.khqrAccount || 'name@provider' }}</strong>
                        <span class="mx-2 text-muted">·</span>
                        <span class="fw-semibold text-dark">{{ form.khqrMerchantName || 'MERCHANT NAME' }}</span>
                      </div>
                    </div>
                    <span class="badge text-bg-success-subtle text-success px-3 py-2">
                      <i class="bi bi-check-circle me-1"></i>EMVCo Ready
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Thermal Receipt 80mm Options -->
        <div class="col-xl-5">
          <div class="card border-0 shadow-sm rounded-4 h-100">
            <div class="card-header bg-white py-3 px-4 border-bottom border-light-subtle d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center gap-2">
                <div class="section-icon bg-secondary-subtle text-secondary rounded-3">
                  <i class="bi bi-receipt"></i>
                </div>
                <div>
                  <strong class="fs-6 d-block">{{ language.isKhmer ? 'បោះពុម្ពវិក្កយបត្រ 80mm' : '80mm Thermal Receipt' }}</strong>
                  <small class="text-muted">{{ language.isKhmer ? 'កំណត់ការបង្ហាញទិន្នន័យលើក្រដាសកម្ដៅ' : 'ESC/POS 40-Column layout fields' }}</small>
                </div>
              </div>
              <span class="badge bg-light text-dark border">ESC/POS</span>
            </div>

            <div class="card-body p-4">
              <div class="d-flex flex-column gap-3">
                <div
                  v-for="option in receiptOptions"
                  :key="option.key"
                  class="p-3 rounded-3 border transition-switch d-flex justify-content-between align-items-center"
                  :class="option.enabled ? 'bg-light border-primary-subtle' : 'bg-white'"
                >
                  <div class="pe-3">
                    <label :for="'opt-' + option.key" class="fw-semibold text-dark d-block mb-0 cursor-pointer">
                      {{ optionLabel(option) }}
                    </label>
                    <small class="text-muted">{{ option.enabled ? 'Displayed on receipt' : 'Hidden from print' }}</small>
                  </div>

                  <div class="form-check form-switch m-0 fs-5">
                    <input
                      :id="'opt-' + option.key"
                      v-model="option.enabled"
                      class="form-check-input cursor-pointer"
                      type="checkbox"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sticky Bottom Bar -->
        <div class="col-12 text-end mb-4">
          <div class="p-3 bg-white rounded-4 border shadow-sm d-flex justify-content-between align-items-center">
            <span class="text-muted small ms-2">
              <i class="bi bi-info-circle me-1"></i>
              {{ language.isKhmer ? 'កុំភ្លេចចុច រក្សាទុក ដើម្បីធ្វើបច្ចុប្បន្នភាពទិន្នន័យក្នុងប្រព័ន្ធ' : 'Ensure all account identifiers are accurate before saving' }}
            </span>
            <button class="btn btn-primary px-4 py-2 rounded-3 shadow-sm" type="submit">
              <i class="bi bi-check2-circle me-2"></i>
              {{ language.t('save') }}
            </button>
          </div>
        </div>
      </div>
    </form>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();

const saved = ref(false);

const form = reactive({
  companyName: tax.settings?.companyName || '',
  companyNameKh: tax.settings?.companyNameKh || '',
  phone: tax.settings?.phone || '',
  address: tax.settings?.address || '',
  branch: tax.settings?.branch || 'Head Quarter',
  baseCurrency: tax.settings?.baseCurrency || 'USD ($)',
  exchangeRate: Number(tax.settings?.exchangeRate) || 4000,
  vatRate: Number(tax.settings?.vatRate) ?? 10,
  vatTin: tax.settings?.vatTin || '',
  khqrMerchantId: tax.settings?.khqrMerchantId || '',
  khqrProvider: tax.settings?.khqrProvider || 'bakong',
  khqrAccount: tax.settings?.khqrAccount || '',
  khqrMerchantName: tax.settings?.khqrMerchantName || tax.settings?.companyName || ''
});

const receiptOptions = reactive([
  {
    key: 'header',
    labelEn: 'Business name & physical address',
    labelKh: 'បង្ហាញឈ្មោះ និងអាសយដ្ឋានក្រុមហ៊ុន',
    enabled: true
  },
  {
    key: 'barcode',
    labelEn: 'Invoice barcode / QR Code',
    labelKh: 'បង្ហាញបាកូដ ឬ QR លើវិក្កយបត្រ',
    enabled: true
  },
  {
    key: 'staff',
    labelEn: 'Cashier name & counter terminal',
    labelKh: 'បង្ហាញឈ្មោះអ្នកគិតលុយ និងបញ្ជរ',
    enabled: true
  },
  {
    key: 'message',
    labelEn: 'Footer thank you message',
    labelKh: 'សារអរគុណនៅបាតវិក្កយបត្រ',
    enabled: true
  },
  {
    key: 'khrTotal',
    labelEn: 'Dual currency balance (USD & KHR total)',
    labelKh: 'បង្ហាញទឹកប្រាក់សរុបជាដុល្លារ និងរៀល',
    enabled: true
  }
]);

function optionLabel(opt) {
  return language.isKhmer ? opt.labelKh : opt.labelEn;
}

function save() {
  const receiptConfig = receiptOptions.reduce((acc, opt) => {
    acc[opt.key] = opt.enabled;
    return acc;
  }, {});

  const payload = {
    ...form,
    khqrMerchantName: String(form.khqrMerchantName || '').trim().toUpperCase(),
    khqrAccount: String(form.khqrAccount || '').trim().replace(/\s+/g, ''),
    receiptOptions: receiptConfig
  };

  if (typeof tax.saveSettings === 'function') {
    tax.saveSettings(payload);
  } else {
    tax.settings = { ...tax.settings, ...payload };
  }

  saved.value = true;
  window.clearTimeout(save.timer);
  save.timer = window.setTimeout(() => {
    saved.value = false;
  }, 3000);
}
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background-color: #f8fafc;
}

.section-icon {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
}

.cursor-pointer {
  cursor: pointer;
}

.transition-switch {
  transition: all 0.2s ease;
}

.letter-spacing {
  letter-spacing: 0.05em;
}

.form-control:focus,
.form-select:focus {
  border-color: #0d6efd;
  box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.12);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>