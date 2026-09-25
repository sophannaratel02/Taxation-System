<template>
  <section class="container-fluid p-4 page-canvas pos-screen">
    <!-- Header -->
    <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-end gap-3 mb-4">
      <div>
        <div class="eyebrow text-primary text-uppercase small fw-bold mb-1">
          {{ language.t('pointOfSale') }}
        </div>
        <h1 class="h3 fw-bold mb-1">
          {{ language.isKhmer ? 'លក់ទំនិញ' : 'Sales Register' }}
        </h1>
        <p class="text-muted mb-0">
          {{ language.t('scanSearch') }}
        </p>
      </div>

      <div class="rate-card">
        <div class="small text-muted">{{ language.t('exchangeRate') }}</div>
        <strong>1 USD = {{ exchangeRate.toLocaleString() }} KHR</strong>
      </div>
    </div>

    <!-- Alert Notification -->
    <Transition name="fade">
      <div
        v-if="notice"
        :class="[
          'alert alert-dismissible fade show d-flex align-items-center justify-content-between shadow-sm',
          noticeType === 'danger' ? 'alert-danger' : 'alert-success'
        ]"
        role="alert"
      >
        <span>
          <i
            :class="
              noticeType === 'danger'
                ? 'bi bi-exclamation-triangle-fill me-2'
                : 'bi bi-check-circle-fill me-2'
            "
          ></i>
          {{ notice }}
        </span>
        <button
          class="btn-close"
          type="button"
          aria-label="Close"
          @click="notice = ''"
        ></button>
      </div>
    </Transition>

    <div class="row g-4 align-items-start">
      <!-- Left Column: Search & Cart Table -->
      <div class="col-xl-8">
        <!-- Barcode & Product Search Card -->
        <div class="card pos-card border-0 mb-3">
          <div class="card-body p-3 p-lg-4">
            <label class="form-label fw-semibold mb-2">
              {{ language.t('findProduct') }}
            </label>

            <div class="search-wrapper">
              <div class="input-group input-group-lg">
                <span class="input-group-text bg-white border-end-0">
                  <i class="bi bi-upc-scan text-primary"></i>
                </span>

                <input
                  ref="searchInput"
                  v-model="search"
                  class="form-control border-start-0 shadow-none"
                  :placeholder="language.t('scanPlaceholder')"
                  autocomplete="off"
                  autofocus
                  @keyup.enter="addSearchResult"
                  @keydown.esc="search = ''"
                />

                <button
                  class="btn btn-primary px-4"
                  type="button"
                  :disabled="!search.trim()"
                  @click="addSearchResult"
                >
                  <i class="bi bi-plus-lg me-1"></i>
                  {{ language.t('add') }}
                </button>
              </div>

              <!-- Search Suggestions Dropdown -->
              <div
                v-if="search.trim() && searchResults.length"
                class="list-group search-dropdown shadow-lg"
              >
                <button
                  v-for="item in searchResults"
                  :key="item.id"
                  class="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-3"
                  type="button"
                  @click="addItem(item)"
                >
                  <div class="min-width-0 text-start">
                    <strong class="d-block text-truncate">
                      {{ item.nameEn }}
                    </strong>
                    <small class="d-block text-muted text-truncate khmer-text" lang="km">
                      {{ item.nameKh || item.nameKm || '—' }} · {{ item.barcode || 'No barcode' }}
                    </small>
                  </div>

                  <div class="text-end flex-shrink-0">
                    <strong>${{ money(item.retailPrice) }}</strong>
                    <small
                      class="d-block"
                      :class="Number(item.qtyOnHand) > 0 ? 'text-success' : 'text-danger'"
                    >
                      {{ Number(item.qtyOnHand) || 0 }}
                      {{ item.baseUnit || item.unit || 'unit' }}
                      {{ language.isKhmer ? 'ក្នុងស្តុក' : 'in stock' }}
                    </small>
                  </div>
                </button>
              </div>

              <!-- Search Not Found -->
              <div
                v-else-if="search.trim()"
                class="search-empty shadow-sm"
              >
                <i class="bi bi-search me-2"></i>
                {{ language.t('noMatchingItem') }}
              </div>
            </div>
          </div>
        </div>

        <!-- Cart Table -->
        <div class="card pos-card border-0 overflow-hidden">
          <div class="card-header bg-white py-3 px-3 px-lg-4 d-flex justify-content-between align-items-center">
            <div>
              <strong class="d-block">{{ language.t('currentCart') }}</strong>
              <small class="text-muted">{{ language.t('reviewCart') }}</small>
            </div>

            <span class="badge rounded-pill text-bg-light border">
              {{ tax.cart.length }} {{ language.isKhmer ? 'មុខទំនិញ' : (tax.cart.length === 1 ? 'item' : 'items') }}
            </span>
          </div>

          <div class="table-responsive">
            <table class="table align-middle mb-0 pos-table">
              <thead>
                <tr>
                  <th class="ps-3 ps-lg-4" style="width: 45px">#</th>
                  <th>{{ language.t('item') }}</th>
                  <th style="width: 90px">{{ language.t('unit') }}</th>
                  <th class="text-center" style="width: 110px">{{ language.t('quantity') }}</th>
                  <th class="text-end" style="width: 115px">{{ language.t('price') }}</th>
                  <th class="text-end" style="width: 125px">{{ language.t('discount') }}</th>
                  <th class="text-end" style="width: 125px">{{ language.t('amount') }}</th>
                  <th style="width: 55px"></th>
                </tr>
              </thead>

              <tbody>
                <tr
                  v-for="(line, index) in tax.cart"
                  :key="line.itemId || index"
                >
                  <td class="ps-3 ps-lg-4 text-muted">{{ index + 1 }}</td>

                  <td>
                    <strong class="d-block">{{ line.nameEn }}</strong>
                    <small class="d-block text-muted khmer-text" lang="km">
                      {{ line.nameKh || line.nameKm || '—' }}
                    </small>
                  </td>

                  <td>
                    <span class="badge text-bg-light border">
                      {{ line.unit || line.baseUnit || 'unit' }}
                    </span>
                  </td>

                  <td>
                    <input
                      v-model.number="line.qty"
                      type="number"
                      min="1"
                      :max="line.available || 9999"
                      class="form-control form-control-sm text-center"
                      @blur="validateLineQty(line)"
                    />
                  </td>

                  <td class="text-end fw-medium">
                    ${{ money(line.unitPrice) }}
                  </td>

                  <td>
                    <div class="input-group input-group-sm">
                      <span class="input-group-text">$</span>
                      <input
                        v-model.number="line.discount"
                        type="number"
                        min="0"
                        step="0.01"
                        class="form-control text-end"
                        @blur="validateLineDiscount(line)"
                      />
                    </div>
                  </td>

                  <td class="text-end fw-bold text-primary">
                    ${{ money(lineTotal(line)) }}
                  </td>

                  <td class="text-center">
                    <button
                      class="btn btn-sm btn-light text-danger delete-btn"
                      type="button"
                      :title="language.isKhmer ? 'លុបចេញ' : 'Remove item'"
                      @click="tax.removeFromCart(index)"
                    >
                      <i class="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>

                <!-- Empty Cart State -->
                <tr v-if="!tax.cart.length">
                  <td colspan="8" class="text-center py-5">
                    <div class="empty-cart">
                      <div class="empty-icon">
                        <i class="bi bi-cart3"></i>
                      </div>
                      <h6 class="fw-bold mb-1">
                        {{ language.isKhmer ? 'កន្ត្រករបស់អ្នកនៅទទេ' : 'Your cart is empty' }}
                      </h6>
                      <p class="text-muted mb-0">
                        {{ language.isKhmer 
                          ? 'សូមស្កេនបាកូដ ឬស្វែងរកឈ្មោះទំនិញនៅខាងលើ។' 
                          : 'Scan a barcode or search for a product above.' 
                        }}
                      </p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Right Column: Payment & Checkout Summary -->
      <div class="col-xl-4">
        <div class="card checkout-card border-0 sticky-xl-top">
          <div class="checkout-header">
            <div>
              <div class="small opacity-75">
                {{ language.isKhmer ? 'គិតលុយ' : 'CHECKOUT' }}
              </div>
              <strong class="fs-5">
                <i class="bi bi-receipt me-2"></i>{{ language.t('paymentSummary') }}
              </strong>
            </div>
            <div class="checkout-icon">
              <i class="bi bi-credit-card-2-front"></i>
            </div>
          </div>

          <div class="card-body p-3 p-lg-4">
            <!-- Totals Overview -->
            <div class="summary-row">
              <span class="text-muted">{{ language.t('netSale') }}</span>
              <strong>${{ money(tax.cartNetSale) }}</strong>
            </div>

            <div class="summary-row border-bottom pb-3">
              <span class="text-muted">
                VAT ({{ Number(tax.settings?.vatRate) || 0 }}%)
              </span>
              <strong class="text-danger">${{ money(tax.cartVat) }}</strong>
            </div>

            <div class="grand-total-row">
              <span>{{ language.t('grandTotal') }}</span>
              <strong>${{ money(tax.cartTotal) }}</strong>
            </div>

            <div class="currency-total">
              <span>
                <i class="bi bi-currency-exchange me-1"></i>
                {{ language.t('khrTotal') }}
              </span>
              <strong>
                {{ Math.round(tax.cartTotal * exchangeRate).toLocaleString() }} ៛
              </strong>
            </div>

            <!-- Customer Selection -->
            <label class="form-label small fw-semibold mt-3">
              {{ language.t('customer') }}
            </label>
            <select
              v-model="selectedCustomerId"
              class="form-select mb-3"
            >
              <option :value="null">{{ language.t('walkInCustomer') }}</option>
              <option
                v-for="customer in tax.customers || []"
                :key="customer.id"
                :value="customer.id"
              >
                {{ customer.name }} · ${{ Number(customer.balance || 0).toFixed(2) }} {{ language.isKhmer ? 'ជំពាក់' : 'balance' }}
              </option>
            </select>

            <!-- Payment Method Tabs -->
            <label class="form-label small fw-semibold">
              {{ language.t('paymentMethod') }}
            </label>

            <div class="row g-2 mb-3">
              <div
                v-for="method in methods"
                :key="method.value"
                class="col-4"
              >
                <button
                  :class="[
                    'payment-method btn w-100',
                    paymentMethod === method.value
                      ? 'active'
                      : 'btn-outline-secondary'
                  ]"
                  type="button"
                  @click="selectPaymentMethod(method.value)"
                >
                  <i :class="method.icon"></i>
                  <span>{{ method.label }}</span>
                </button>
              </div>
            </div>

            <div v-if="paymentMethod === 'bank'" class="khqr-panel mb-3">
              <div class="khqr-ribbon">NBC · KHQR</div>
              <div class="d-flex align-items-start gap-3">
                <div class="khqr-frame">
                  <div v-if="khqrLoading" class="khqr-loading"><span class="spinner-border spinner-border-sm"></span></div>
                  <img v-else-if="khqrImageUrl" :src="khqrImageUrl" class="khqr-image" alt="KHQR payment code" />
                  <i v-else class="bi bi-qr-code khqr-empty"></i>
                </div>
                <div class="min-width-0 flex-grow-1">
                  <strong class="d-block">{{ language.isKhmer ? 'ស្កេន KHQR ដើម្បីទូទាត់' : 'Scan KHQR to pay' }}</strong>
                  <small class="text-muted">{{ language.isKhmer ? 'ពិនិត្យចំនួនទឹកប្រាក់មុនពេលបញ្ជាក់ការទូទាត់។' : 'Verify the amount before confirming payment.' }}</small>
                  <select v-model="qrCurrency" class="form-select form-select-sm mt-2" aria-label="KHQR currency">
                    <option value="USD">USD ($)</option>
                    <option value="KHR">KHR (៛)</option>
                  </select>
                  <small class="d-block text-muted mt-2">{{ khqrMerchantName }} · {{ khqrAccount || 'Merchant account not configured' }}</small>
                  <div class="fw-semibold mt-1">${{ money(tax.cartTotal) }} / {{ Math.round(tax.cartTotal * exchangeRate).toLocaleString() }} ៛</div>
                  <small v-if="khqrError" class="d-block text-danger mt-1">{{ khqrError }}</small>
                  <div class="d-flex flex-wrap gap-2 mt-2">
                    <button class="btn btn-sm btn-outline-dark" type="button" :disabled="khqrLoading || !khqrPayload" @click="copyKhqr"><i class="bi bi-copy me-1"></i>Copy KHQR Deep Link</button>
                    <button class="btn btn-sm btn-outline-danger" type="button" :disabled="khqrLoading" @click="refreshKhqr"><i class="bi bi-arrow-clockwise me-1"></i>Refresh QR</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Cash Tender Inputs -->
            <div v-if="paymentMethod === 'cash'" class="payment-inputs">
              <div class="row g-2">
                <div class="col-6">
                  <label class="form-label small">{{ language.t('receivedUsd') }}</label>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text">$</span>
                    <input
                      v-model.number="receivedUsd"
                      type="number"
                      min="0"
                      step="0.01"
                      class="form-control"
                    />
                  </div>
                </div>

                <div class="col-6">
                  <label class="form-label small">{{ language.t('receivedKhr') }}</label>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text">៛</span>
                    <input
                      v-model.number="receivedKhr"
                      type="number"
                      min="0"
                      step="100"
                      class="form-control"
                    />
                  </div>
                </div>
              </div>

              <!-- Change / Due Box with KHR conversion -->
              <div
                class="change-box mt-3"
                :class="canPay ? 'is-paid' : 'is-due'"
              >
                <div>
                  <small class="d-block opacity-75">
                    {{ canPay ? language.t('changeDue') : language.t('amountDue') }}
                  </small>
                  <strong>
                    ${{ money(canPay ? changeDue : amountDue) }}
                    <span v-if="canPay && changeDue > 0" class="fs-6 opacity-75 fw-normal ms-1">
                      ({{ Math.round(changeDue * exchangeRate).toLocaleString() }} ៛)
                    </span>
                  </strong>
                </div>
                <i
                  :class="
                    canPay
                      ? 'bi bi-check-circle-fill'
                      : 'bi bi-clock-history'
                  "
                ></i>
              </div>
            </div>

            <!-- Non-Cash Notice -->
            <div v-else class="non-cash-note">
              <i class="bi bi-info-circle me-2"></i>
              <span>
                {{ language.isKhmer ? 'ការទូទាត់នឹងត្រូវកត់ត្រាជា' : 'Payment will be recorded as' }}
                <strong> {{ selectedPaymentLabel }}</strong>.
              </span>
            </div>

            <!-- Actions -->
            <div class="d-grid gap-2 mt-4">
              <button
                class="btn btn-success btn-lg complete-btn"
                type="button"
                :disabled="!tax.cart.length || !canPay || processing"
                @click="completeSale"
              >
                <span
                  v-if="processing"
                  class="spinner-border spinner-border-sm me-2"
                  aria-hidden="true"
                ></span>
                <i
                  v-else
                  class="bi bi-check2-circle me-2"
                ></i>
                {{ processing 
                  ? (language.isKhmer ? 'កំពុងដំណើរការ...' : 'Processing...') 
                  : (language.isKhmer ? 'ទូទាត់ការលក់' : 'Complete Sale') 
                }}
              </button>

              <button
                class="btn btn-light border"
                type="button"
                :disabled="!tax.cart.length || processing"
                @click="clearCart"
              >
                <i class="bi bi-trash3 me-2"></i>
                {{ language.isKhmer ? 'សម្អាតកន្ត្រក' : 'Clear Cart' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 80mm ESC/POS Receipt Host for Thermal Printing -->
    <div v-if="printReceipt" class="receipt-print-host">
      <ThermalReceipt40Col
        :company="printReceipt.company"
        :receipt-no="printReceipt.receiptNo"
        :cashier-name="printReceipt.cashierName"
        :items="printReceipt.items"
        :net-sale="printReceipt.netSale"
        :total-vat="printReceipt.totalVat"
        :grand-total="printReceipt.grandTotal"
        :tendered-u-s-d="printReceipt.tenderedUSD"
        :change-u-s-d="printReceipt.changeUSD"
        :exchange-rate="exchangeRate"
        :khqr-image="printReceipt.khqrImage"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';
import ThermalReceipt40Col from '@/components/receipt/ThermalReceipt40Col.vue';
import { generatePayableKhqr } from '@/utils/khqr';

const tax = useTaxStore();
const language = useLanguageStore();

const search = ref('');
const searchInput = ref(null);
const notice = ref('');
const noticeType = ref('success');
const selectedCustomerId = ref(null);
const paymentMethod = ref('cash');
const receivedUsd = ref(0);
const receivedKhr = ref(0);
const printReceipt = ref(null);
const processing = ref(false);
const selectedCustomer = computed(() => (tax.customers || []).find((customer) => customer.id === selectedCustomerId.value) || null);
const customerName = computed(() => selectedCustomer.value?.name || 'Walk-in customer');
const customerCreditBlocked = computed(() => paymentMethod.value === 'customer_account' && !selectedCustomer.value);
const khqrPayload = ref('');
const khqrImageUrl = ref('');
const khqrLoading = ref(false);
const khqrError = ref('');
const qrCurrency = ref('USD');
let qrGeneration = 0;

async function refreshKhqr() {
  if (paymentMethod.value !== 'bank' || Number(tax.cartTotal) <= 0) { khqrPayload.value = ''; khqrImageUrl.value = ''; return; }
  const generation = ++qrGeneration;
  khqrLoading.value = true;
  khqrError.value = '';
  try {
    const result = await generatePayableKhqr({ accountIdentifier: khqrAccount.value, merchantName: khqrMerchantName.value, amount: qrCurrency.value === 'KHR' ? Math.round(tax.cartTotal * exchangeRate.value) : tax.cartTotal, currency: qrCurrency.value, billNo: `POS-${Date.now()}`, storeLabel: tax.settings?.branch, provider: tax.settings?.khqrProvider });
    if (generation === qrGeneration) { khqrPayload.value = result.payload; khqrImageUrl.value = result.dataUrl; }
  } catch (error) {
    if (generation === qrGeneration) { khqrPayload.value = ''; khqrImageUrl.value = ''; khqrError.value = error?.message || 'Unable to generate KHQR'; }
  } finally {
    if (generation === qrGeneration) khqrLoading.value = false;
  }
}

const khqrAccount = computed(() => tax.settings?.khqrAccount || '');
const khqrMerchantName = computed(() => tax.settings?.khqrMerchantName || tax.settings?.companyName || 'Merchant');

const methods = computed(() => [
  { value: 'cash', label: language.t('cash'), icon: 'bi bi-cash-stack' },
  { value: 'bank', label: language.t('cardQr'), icon: 'bi bi-qr-code-scan' },
  { value: 'customer_account', label: language.t('account'), icon: 'bi bi-person-vcard' },
]);

const exchangeRate = computed(
  () => Number(tax.settings?.exchangeRate) || 4000
);

const searchResults = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return [];

  return (tax.items || [])
    .filter((item) => {
      const searchable = [
        item.nameEn,
        item.nameKh,
        item.nameKm,
        item.barcode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(query);
    })
    .slice(0, 6);
});

const totalTenderedUsd = computed(() => {
  const usd = Math.max(0, Number(receivedUsd.value) || 0);
  const khr = Math.max(0, Number(receivedKhr.value) || 0);

  return usd + (khr / exchangeRate.value);
});

const amountDue = computed(() => {
  const diff = Number(tax.cartTotal || 0) - totalTenderedUsd.value;
  return diff > 0 ? Math.round(diff * 100) / 100 : 0;
});

const changeDue = computed(() => {
  const diff = totalTenderedUsd.value - Number(tax.cartTotal || 0);
  return diff > 0 ? Math.round(diff * 100) / 100 : 0;
});

const canPay = computed(() => {
  if (!tax.cart.length || customerCreditBlocked.value) return false;
  if (paymentMethod.value !== 'cash') return true;
  return totalTenderedUsd.value >= (Number(tax.cartTotal || 0) - 0.001);
});

const selectedPaymentLabel = computed(() => {
  return methods.value.find((m) => m.value === paymentMethod.value)?.label || 'Payment';
});

function money(value) {
  return (Number(value) || 0).toFixed(2);
}

function lineTotal(line) {
  const qty = Math.max(0, Number(line.qty) || 0);
  const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
  const discount = Math.max(0, Number(line.discount) || 0);

  return Math.max(0, (unitPrice * qty) - discount);
}

function showNotice(message, type = 'success') {
  notice.value = message;
  noticeType.value = type;

  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => {
    notice.value = '';
  }, 4000);
}

function validateLineQty(line) {
  const available = Number(line.available);

  if (!Number.isFinite(Number(line.qty)) || Number(line.qty) < 1) {
    line.qty = 1;
  }

  if (available > 0 && Number(line.qty) > available) {
    line.qty = available;
    showNotice(
      language.isKhmer 
        ? `ទំនិញនេះនៅសល់ត្រឹមតែ ${available} ប៉ុណ្ណោះ។`
        : `Only ${available} unit(s) are available.`, 
      'danger'
    );
  }
}

function validateLineDiscount(line) {
  const maxDiscount = Math.max(
    0,
    (Number(line.unitPrice) || 0) * (Number(line.qty) || 0)
  );
  const discount = Math.max(0, Number(line.discount) || 0);
  line.discount = Math.min(discount, maxDiscount);
}

function addItem(item) {
  const stock = Number(item.qtyOnHand) || 0;
  const displayName = language.isKhmer && (item.nameKh || item.nameKm) 
    ? (item.nameKh || item.nameKm) 
    : item.nameEn;

  if (stock <= 0) {
    showNotice(
      language.isKhmer 
        ? `ទំនិញ "${displayName}" អស់ពីស្តុកហើយ។` 
        : `"${displayName}" is out of stock.`,
      'danger'
    );
    return;
  }

  tax.addToCart(item);
  search.value = '';

  nextTick(() => {
    searchInput.value?.focus();
  });
}

function addSearchResult() {
  const exactMatch = searchResults.value.find(
    (item) => String(item.barcode || '').trim().toLowerCase() === search.value.trim().toLowerCase()
  );

  const item = exactMatch || searchResults.value[0];

  if (item) {
    addItem(item);
  } else {
    showNotice(language.t('noMatchingItem'), 'danger');
  }
}

function selectPaymentMethod(method) {
  paymentMethod.value = method;
  if (method !== 'cash') {
    receivedUsd.value = 0;
    receivedKhr.value = 0;
  }
  refreshKhqr();
}

watch([() => tax.cartTotal, paymentMethod, qrCurrency, () => tax.settings?.khqrAccount, () => tax.settings?.khqrMerchantName], refreshKhqr);

async function copyKhqr() {
  if (!khqrPayload.value) return;
  await navigator.clipboard?.writeText(khqrPayload.value);
  showNotice('KHQR copied to clipboard.');
}

function clearCart() {
  tax.clearCart();
  receivedUsd.value = 0;
  receivedKhr.value = 0;
}

async function completeSale() {
  if (processing.value || !tax.cart.length || !canPay.value) return;

  processing.value = true;

  try {
    const requiresManagerOverride = tax.cart.some((line) => Number(line.discount || 0) > (Number(line.unitPrice || 0) * Number(line.qty || 0) * 0.10));
    const managerPin = requiresManagerOverride ? window.prompt(language.isKhmer ? 'បញ្ចូល PIN អ្នកគ្រប់គ្រង ដើម្បីអនុម័តបញ្ចុះតម្លៃលើស ១០%' : 'Enter manager PIN to approve a discount above 10%') : '';
    if (requiresManagerOverride && !managerPin) {
      processing.value = false;
      return;
    }
    const receiptItems = tax.cart.map((line) => ({
      ...line,
      uomName: line.unit || line.baseUnit || 'unit',
    }));

    const tenderedUSD =
      paymentMethod.value === 'cash' ? totalTenderedUsd.value : Number(tax.cartTotal || 0);

    const invoice = await tax.completeSale({
      customerName: customerName.value,
      customerId: selectedCustomerId.value,
      paymentMethod: paymentMethod.value,
      receivedUSD: paymentMethod.value === 'cash' ? receivedUsd.value : tax.cartTotal,
      receivedKHR: paymentMethod.value === 'cash' ? receivedKhr.value : 0,
      khqrPayload: paymentMethod.value === 'bank' ? khqrPayload.value : '',
      managerPin,
    });

    printReceipt.value = {
      company: {
        nameEn: tax.settings?.companyName || '',
        nameKh: tax.settings?.companyNameKh || '',
        address: tax.settings?.address || '',
        phone: tax.settings?.phone || '',
        vatTin: tax.settings?.vatTin || '',
      },
      receiptNo: invoice.id,
      cashierName: invoice.staff || '',
      items: receiptItems,
      netSale: Number(invoice.netSale) || 0,
      totalVat: Number(invoice.vat) || 0,
      grandTotal: Number(invoice.total) || 0,
      tenderedUSD,
      changeUSD:
        paymentMethod.value === 'cash'
          ? Math.max(0, tenderedUSD - Number(invoice.total || 0))
          : 0,
          khqrImage: paymentMethod.value === 'bank' ? khqrImageUrl.value : '',
    };

    showNotice(
      language.isKhmer 
        ? `វិក្កយបត្រ ${invoice.id} ត្រូវបានទូទាត់ដោយជោគជ័យ។`
        : `Invoice ${invoice.id} completed successfully.`
    );

    // Reset Form
    search.value = '';
    selectedCustomerId.value = null;
    paymentMethod.value = 'cash';
    receivedUsd.value = 0;
    receivedKhr.value = 0;
    tax.clearCart();

    await nextTick();

    // Trigger Print after thermal container has rendered
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        printReceipt.value = null;
      }, 500);
    }, 150);
  } catch (error) {
    showNotice(
      error?.message || (language.isKhmer ? 'មិនអាចទូទាត់ការលក់បានទេ។' : 'Failed to complete sale.'),
      'danger'
    );
  } finally {
    processing.value = false;
  }
}
</script>

<style scoped>
.pos-screen {
  min-height: 100vh;
  background: #f6f8fb;
}

.rate-card {
  padding: 0.75rem 1rem;
  background: #fff;
  border: 1px solid #e9edf3;
  border-radius: 0.75rem;
  box-shadow: 0 4px 18px rgba(25, 42, 70, 0.05);
}

.pos-card,
.checkout-card {
  border-radius: 1rem;
  box-shadow: 0 8px 28px rgba(25, 42, 70, 0.07);
}

.search-wrapper {
  position: relative;
}

.search-dropdown {
  position: absolute;
  z-index: 1050;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  border-radius: 0.75rem;
  overflow: hidden;
  background: #fff;
}

.search-dropdown .list-group-item {
  padding: 0.85rem 1rem;
}

.search-empty {
  position: absolute;
  z-index: 1050;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  padding: 1rem;
  border-radius: 0.75rem;
  background: #fff;
  color: #6c757d;
}

.min-width-0 {
  min-width: 0;
}

.pos-table thead th {
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
  background: #f8f9fb;
  color: #687385;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.pos-table tbody td {
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
}

.delete-btn {
  width: 34px;
  height: 34px;
  border-radius: 0.6rem;
}

.empty-cart {
  padding: 1.5rem;
}

.empty-icon {
  width: 58px;
  height: 58px;
  margin: 0 auto 0.75rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #f0f4f8;
  color: #8b98a8;
  font-size: 1.5rem;
}

.checkout-card {
  top: 24px;
  overflow: hidden;
}

.checkout-header {
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  background: linear-gradient(135deg, #172033, #253b5d);
}

.checkout-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.12);
  font-size: 1.2rem;
}

.summary-row,
.grand-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.summary-row {
  padding: 0.45rem 0;
}

.grand-total-row {
  padding: 1.25rem 0 0.9rem;
}

.grand-total-row span {
  font-weight: 700;
}

.grand-total-row strong {
  color: #0d6efd;
  font-size: 2rem;
  line-height: 1;
}

.currency-total {
  padding: 0.85rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid #e8edf3;
  border-radius: 0.75rem;
  background: #f7f9fc;
}

.payment-method {
  min-height: 68px;
  border-radius: 0.75rem;
  font-size: 0.78rem;
}

.payment-method i {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 1.1rem;
}

.payment-method.active {
  color: #fff;
  border-color: #0d6efd;
  background: #0d6efd;
  box-shadow: 0 5px 14px rgba(13, 110, 253, 0.22);
}

.change-box {
  padding: 0.9rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 0.75rem;
}

.change-box strong {
  font-size: 1.25rem;
}

.change-box > i {
  font-size: 1.5rem;
}

.khqr-panel {
  position: relative;
  overflow: hidden;
  padding: 0.75rem;
  border: 1px solid #b8dfd8;
  border-radius: 10px;
  background: #f1fbf9;
}

.khqr-ribbon {
  margin: -0.75rem -0.75rem 0.75rem;
  padding: 0.35rem 0.75rem;
  color: #fff;
  background: #c5222d;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.khqr-frame {
  width: 104px;
  height: 104px;
  display: grid;
  place-items: center;
  flex: 0 0 104px;
  background: #fff;
  border: 4px solid #111827;
  border-radius: 4px;
}

.khqr-image {
  width: 96px;
  height: 96px;
}

.khqr-loading,
.khqr-empty {
  color: #c5222d;
  font-size: 2rem;
}

.change-box.is-paid {
  color: #146c43;
  background: #e9f8f0;
  border: 1px solid #bce8d0;
}

.change-box.is-due {
  color: #b02a37;
  background: #fff0f1;
  border: 1px solid #f3c2c7;
}

.non-cash-note {
  padding: 0.85rem 1rem;
  color: #495057;
  background: #f7f9fc;
  border: 1px solid #e8edf3;
  border-radius: 0.75rem;
  font-size: 0.9rem;
}

.complete-btn {
  min-height: 52px;
  border-radius: 0.75rem;
  font-weight: 700;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

/* Print Formatting for Thermal 80mm ESC/POS Printers */
@media print {
  @page {
    margin: 0;
    size: 80mm auto;
  }

  :global(html),
  :global(body) {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  :global(nav),
  :global(aside),
  :global(header),
  :global(footer) {
    display: none !important;
  }

  :global(*) {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .pos-screen {
    display: block !important;
    min-height: 0 !important;
    width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
  }

  .pos-screen > :not(.receipt-print-host) {
    display: none !important;
  }

  .receipt-print-host {
    display: block !important;
    visibility: visible !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 80mm !important;
    max-width: 80mm !important;
    margin: 0 !important;
    padding: 0 4mm !important;
    box-sizing: border-box !important;
    background: #fff !important;
    color: #000 !important;
    overflow: visible !important;
  }
}

@media (max-width: 1199.98px) {
  .checkout-card {
    position: static !important;
  }
}

@media (max-width: 767.98px) {
  .page-canvas {
    padding: 1rem !important;
  }

  .input-group-lg .btn {
    padding-left: 0.85rem !important;
    padding-right: 0.85rem !important;
  }

  .pos-table {
    min-width: 880px;
  }
}
</style>