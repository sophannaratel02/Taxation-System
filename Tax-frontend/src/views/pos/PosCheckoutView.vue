<template>
  <section class="container-fluid p-4 page-canvas pos-screen">
    <!-- Screen Header -->
    <header class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-end gap-3 mb-4">
      <div>
        <div class="eyebrow text-uppercase small fw-bold mb-1">
          <i class="bi bi-display me-1"></i>
          {{ language.t('pointOfSale') }}
        </div>
        <h1 class="h3 fw-bold mb-1">
          {{ language.isKhmer ? 'លក់ទំនិញ' : 'Sales Register' }}
        </h1>
        <p class="text-muted mb-0">
          {{ language.t('scanSearch') }}
        </p>
      </div>

      <div class="rate-card d-flex align-items-center gap-3">
        <div class="rate-icon">
          <i class="bi bi-currency-exchange"></i>
        </div>
        <div>
          <div class="small text-muted">{{ language.t('exchangeRate') }}</div>
          <strong class="rate-value">1 USD = {{ exchangeRate.toLocaleString() }} KHR</strong>
        </div>
      </div>
    </header>

    <!-- Global Notice Banner -->
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
          <i :class="['me-2 bi', noticeType === 'danger' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill']"></i>
          {{ notice }}
        </span>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          @click="notice = ''"
        ></button>
      </div>
    </Transition>

    <div class="row g-4 align-items-start">
      <!-- Left Column: Search & Cart -->
      <div class="col-xl-8">
        <!-- Barcode / Search Box -->
        <div class="card pos-card border-0 mb-3">
          <div class="card-body p-3 p-lg-4">
            <label for="barcodeSearchInput" class="form-label fw-semibold mb-2 d-flex align-items-center justify-content-between">
              <span>{{ language.t('findProduct') }}</span>
              <small class="text-muted fw-normal">
                <kbd class="shortcut-key">Enter</kbd> {{ language.isKhmer ? 'ដើម្បីបញ្ចូល' : 'to add' }}
              </small>
            </label>

            <div class="search-wrapper">
              <div class="input-group input-group-lg search-input-group">
                <span class="input-group-text bg-white border-end-0 text-primary">
                  <i class="bi bi-upc-scan fs-5"></i>
                </span>

                <input
                  id="barcodeSearchInput"
                  ref="searchInput"
                  v-model="search"
                  type="text"
                  class="form-control border-start-0 border-end-0 shadow-none ps-0"
                  :placeholder="language.t('scanPlaceholder')"
                  autocomplete="off"
                  autofocus
                  @keyup.enter="addSearchResult"
                  @keydown.esc="search = ''"
                />

                <button
                  v-if="search.trim()"
                  class="btn btn-outline-secondary border-start-0 border-end-0 bg-white text-muted px-2"
                  type="button"
                  aria-label="Clear input"
                  @click="search = ''"
                >
                  <i class="bi bi-x-circle-fill"></i>
                </button>

                <button
                  class="btn btn-primary px-4 fw-semibold"
                  type="button"
                  :disabled="!search.trim()"
                  @click="addSearchResult"
                >
                  <i class="bi bi-plus-lg me-1"></i>
                  {{ language.t('add') }}
                </button>
              </div>

              <!-- Suggestions Dropdown -->
              <div
                v-if="search.trim() && searchResults.length"
                class="list-group search-dropdown shadow-lg"
              >
                <button
                  v-for="item in searchResults"
                  :key="item.id"
                  type="button"
                  class="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-3 py-2.5 px-3"
                  @click="addItem(item)"
                >
                  <div class="min-width-0 text-start">
                    <strong class="d-block text-truncate product-title">{{ item.nameEn }}</strong>
                    <small class="d-block text-muted text-truncate" lang="km">
                      {{ item.nameKh || item.nameKm || '—' }}
                      <span class="barcode-badge ms-1">{{ item.barcode || 'No barcode' }}</span>
                    </small>
                  </div>

                  <div class="text-end flex-shrink-0">
                    <strong class="d-block fs-6 text-dark">${{ money(item.retailPrice) }}</strong>
                    <small
                      class="badge rounded-pill"
                      :class="Number(item.qtyOnHand) > 0 ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'"
                    >
                      {{ Number(item.qtyOnHand) || 0 }} {{ item.baseUnit || item.unit || 'unit' }}
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
                <i class="bi bi-search me-2 text-muted"></i>
                {{ language.t('noMatchingItem') }}
              </div>
            </div>
          </div>
        </div>

        <!-- Cart Table -->
        <div class="card pos-card border-0 overflow-hidden">
          <div class="card-header bg-white py-3 px-3 px-lg-4 d-flex justify-content-between align-items-center border-bottom">
            <div>
              <strong class="d-block text-dark">{{ language.t('currentCart') }}</strong>
              <small class="text-muted">{{ language.t('reviewCart') }}</small>
            </div>

            <span class="badge rounded-pill badge-cart-count">
              <i class="bi bi-basket2 me-1"></i>
              {{ tax.cart.length }} {{ language.isKhmer ? 'មុខទំនិញ' : (tax.cart.length === 1 ? 'item' : 'items') }}
            </span>
          </div>

          <div class="table-responsive">
            <table class="table align-middle mb-0 pos-table">
              <thead>
                <tr>
                  <th class="ps-3 ps-lg-4 text-center" style="width: 48px">#</th>
                  <th>{{ language.t('item') }}</th>
                  <th style="width: 90px">{{ language.t('unit') }}</th>
                  <th class="text-center" style="width: 120px">{{ language.t('quantity') }}</th>
                  <th class="text-end" style="width: 110px">{{ language.t('price') }}</th>
                  <th class="text-end" style="width: 125px">{{ language.t('discount') }}</th>
                  <th class="text-end" style="width: 125px">{{ language.t('amount') }}</th>
                  <th class="text-center" style="width: 50px"></th>
                </tr>
              </thead>

              <tbody>
                <tr
                  v-for="(line, index) in tax.cart"
                  :key="line.itemId || index"
                  class="cart-row"
                >
                  <td class="ps-3 ps-lg-4 text-center text-muted index-cell">{{ index + 1 }}</td>
                  <td>
                    <strong class="d-block text-dark item-name">{{ line.nameEn }}</strong>
                    <small class="d-block text-muted" lang="km">
                      {{ line.nameKh || line.nameKm || '—' }}
                    </small>
                  </td>
                  <td>
                    <span class="badge unit-badge">
                      {{ line.unit || line.baseUnit || 'unit' }}
                    </span>
                  </td>
                  <td>
                    <div class="qty-control d-flex align-items-center justify-content-center">
                      <input
                        v-model.number="line.qty"
                        type="number"
                        min="1"
                        :max="line.available || 9999"
                        class="form-control form-control-sm text-center qty-input"
                        @blur="validateLineQty(line)"
                      />
                    </div>
                  </td>
                  <td class="text-end fw-semibold text-secondary tabular-nums">
                    ${{ money(line.unitPrice) }}
                  </td>
                  <td>
                    <div class="input-group input-group-sm">
                      <span class="input-group-text bg-light">$</span>
                      <input
                        v-model.number="line.discount"
                        type="number"
                        min="0"
                        step="0.01"
                        class="form-control text-end discount-input"
                        @blur="validateLineDiscount(line)"
                      />
                    </div>
                  </td>
                  <td class="text-end fw-bold text-primary tabular-nums">
                    ${{ money(lineTotal(line)) }}
                  </td>
                  <td class="text-center">
                    <button
                      type="button"
                      class="btn btn-sm delete-btn"
                      :title="language.isKhmer ? 'លុបចេញ' : 'Remove item'"
                      @click="tax.removeFromCart(index)"
                    >
                      <i class="bi bi-trash3"></i>
                    </button>
                  </td>
                </tr>

                <!-- Empty State -->
                <tr v-if="!tax.cart.length">
                  <td colspan="8" class="text-center py-5">
                    <div class="empty-cart">
                      <div class="empty-icon">
                        <i class="bi bi-cart3"></i>
                      </div>
                      <h6 class="fw-bold text-dark mb-1">
                        {{ language.isKhmer ? 'កន្ត្រករបស់អ្នកនៅទទេ' : 'Your cart is empty' }}
                      </h6>
                      <p class="text-muted small mb-0">
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

      <!-- Right Column: Checkout -->
      <div class="col-xl-4">
        <div class="card checkout-card border-0 sticky-xl-top">
          <!-- Checkout Header -->
          <div class="checkout-header">
            <div>
              <div class="checkout-kicker text-uppercase small">
                {{ language.isKhmer ? 'គិតលុយ' : 'CHECKOUT' }}
              </div>
              <strong class="fs-5 text-white">
                <i class="bi bi-receipt me-2"></i>{{ language.t('paymentSummary') }}
              </strong>
            </div>
            <div class="checkout-icon">
              <i class="bi bi-credit-card-2-front"></i>
            </div>
          </div>

          <div class="card-body p-3 p-lg-4">
            <!-- Price Summary -->
            <div class="summary-row">
              <span class="text-muted">{{ language.t('netSale') }}</span>
              <strong class="tabular-nums text-dark">${{ money(tax.cartNetSale) }}</strong>
            </div>

            <div class="summary-row border-bottom pb-2 mb-2">
              <span class="text-muted">VAT ({{ Number(tax.settings?.vatRate) || 0 }}%)</span>
              <strong class="tabular-nums text-danger">${{ money(tax.cartVat) }}</strong>
            </div>

            <div class="grand-total-row">
              <span class="text-dark">{{ language.t('grandTotal') }}</span>
              <strong class="grand-amount tabular-nums">${{ money(tax.cartTotal) }}</strong>
            </div>

            <div class="currency-total mb-3">
              <span class="text-muted">
                <i class="bi bi-cash me-1 text-success"></i>
                {{ language.t('khrTotal') }}
              </span>
              <strong class="tabular-nums text-dark">
                {{ Math.round((tax.cartTotal || 0) * exchangeRate).toLocaleString() }} ៛
              </strong>
            </div>

            <!-- Customer Picker -->
            <label for="customerSelect" class="form-label small fw-semibold text-dark">
              {{ language.t('customer') }}
            </label>
            <select
              id="customerSelect"
              v-model="selectedCustomerId"
              class="form-select form-select-sm mb-3"
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
            <label class="form-label small fw-semibold text-dark mb-2">
              {{ language.t('paymentMethod') }}
            </label>
            <div class="row g-2 mb-3">
              <div
                v-for="method in paymentMethods"
                :key="method.value"
                class="col-4"
              >
                <button
                  type="button"
                  :class="[
                    'payment-method btn w-100',
                    paymentMethod === method.value ? 'active' : 'btn-outline-secondary'
                  ]"
                  @click="selectPaymentMethod(method.value)"
                >
                  <i :class="method.icon"></i>
                  <span>{{ method.label }}</span>
                </button>
              </div>
            </div>

            <!-- KHQR Display (Bank Mode) -->
            <div v-if="paymentMethod === 'bank'" class="khqr-panel mb-3">
              <div class="khqr-ribbon d-flex align-items-center justify-content-between">
                <span><i class="bi bi-qr-code me-1"></i>ABA PayWay · KHQR</span>
              </div>
              <div class="d-flex align-items-start gap-3 p-3">
                <div class="khqr-frame">
                  <div v-if="khqrLoading" class="khqr-loading">
                    <span class="spinner-border spinner-border-sm text-primary"></span>
                  </div>
                  <img
                    v-else-if="khqrImageUrl"
                    :src="khqrImageUrl"
                    class="khqr-image"
                    alt="KHQR Code"
                  />
                  <i v-else class="bi bi-qr-code khqr-empty"></i>
                </div>

                <div class="min-width-0 flex-grow-1">
                  <strong class="d-block text-dark lh-sm">
                    {{ language.isKhmer ? 'ស្កេន KHQR ដើម្បីទូទាត់' : 'Scan KHQR to pay' }}
                  </strong>
                  <small class="text-muted d-block mt-0.5">
                    {{ language.isKhmer ? 'ពិនិត្យចំនួនទឹកប្រាក់មុនពេលបញ្ជាក់។' : 'Verify amount before confirming.' }}
                  </small>

                  <div class="d-flex align-items-center gap-2 mt-2">
                    <select v-model="qrCurrency" class="form-select form-select-sm currency-select" aria-label="KHQR Currency">
                      <option value="USD">USD ($)</option>
                      <option value="KHR">KHR (៛)</option>
                    </select>
                    <span class="khqr-amount-badge fw-bold tabular-nums">
                      {{ qrCurrency === 'KHR' ? `${Math.round(tax.cartTotal * exchangeRate).toLocaleString()} ៛` : `$${money(tax.cartTotal)}` }}
                    </span>
                  </div>

                  <small class="d-block text-muted text-truncate mt-1.5 font-monospace">
                    {{ khqrMerchantName }} · ABA PayWay
                  </small>

                  <!-- Intent Verification Status Indicator -->
                  <div
                    v-if="khqrIntentId"
                    class="mt-2 py-1 px-2 rounded-2 small d-inline-flex align-items-center gap-1.5"
                    :class="khqrStatusInfo.className"
                  >
                    <i :class="khqrStatusInfo.icon"></i>
                    <span>{{ khqrStatusInfo.text }}</span>
                  </div>
                  <small v-if="khqrError" class="d-block text-danger mt-1">{{ khqrError }}</small>

                  <div class="d-flex flex-wrap gap-2 mt-2.5">
                    <button
                      type="button"
                      class="btn btn-xs btn-outline-dark"
                      :disabled="khqrLoading || !khqrPayload"
                      @click="copyKhqr"
                    >
                      <i class="bi bi-copy me-1"></i>Copy
                    </button>
                    <button
                      type="button"
                      class="btn btn-xs btn-outline-primary"
                      :disabled="khqrLoading || khqrChecking || !khqrIntentId || khqrStatus === 'paid'"
                      @click="verifyKhqr(true)"
                    >
                      <i :class="['me-1 bi', khqrChecking ? 'bi-arrow-repeat spin' : 'bi-check2-circle']"></i>
                      {{ khqrChecking ? 'Checking...' : 'Check' }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-xs btn-outline-secondary"
                      :disabled="khqrLoading"
                      @click="refreshKhqr"
                    >
                      <i class="bi bi-arrow-clockwise me-1"></i>Refresh
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Cash Tender Inputs (Cash Mode) -->
            <div v-if="paymentMethod === 'cash'" class="payment-inputs">
              <div class="row g-2">
                <div class="col-6">
                  <label class="form-label small fw-semibold text-muted mb-1">{{ language.t('receivedUsd') }}</label>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text bg-light">$</span>
                    <input
                      v-model.number="receivedUsd"
                      type="number"
                      min="0"
                      step="0.01"
                      class="form-control tabular-nums"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div class="col-6">
                  <label class="form-label small fw-semibold text-muted mb-1">{{ language.t('receivedKhr') }}</label>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text bg-light">៛</span>
                    <input
                      v-model.number="receivedKhr"
                      type="number"
                      min="0"
                      step="100"
                      class="form-control tabular-nums"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div class="summary-row mt-2">
                <span>{{ language.t('receivedUsd') }}</span>
                <strong class="tabular-nums">${{ money(receivedUsd) }}</strong>
              </div>
              <div class="summary-row">
                <span>{{ language.t('receivedKhr') }}</span>
                <strong class="tabular-nums">{{ Math.round(Number(receivedKhr) || 0).toLocaleString() }} ៛</strong>
              </div>

              <!-- Balance / Due Pill -->
              <div class="change-box mt-3" :class="canPay ? 'is-paid' : 'is-due'">
                <div>
                  <small class="d-block text-uppercase fw-semibold opacity-75">
                    {{ canPay ? language.t('changeDue') : language.t('amountDue') }}
                  </small>
                  <strong class="tabular-nums fs-4">
                    ${{ money(activeCashDifference) }}
                    <span v-if="activeCashDifference > 0" class="fs-6 opacity-75 fw-normal ms-1">
                      ({{ Math.round(activeCashDifference * exchangeRate).toLocaleString() }} ៛)
                    </span>
                  </strong>
                </div>
                <i :class="['bi', canPay ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill']"></i>
              </div>
            </div>

            <!-- Alternative / Non-Cash Note -->
            <div v-else-if="paymentMethod !== 'bank'" class="non-cash-note">
              <i class="bi bi-info-circle-fill me-2 text-primary"></i>
              <span>
                {{ language.isKhmer ? 'ការទូទាត់នឹងត្រូវកត់ត្រាជា' : 'Payment will be recorded as' }}
                <strong>{{ selectedPaymentLabel }}</strong>.
              </span>
            </div>

            <!-- Submit Buttons -->
            <div class="d-grid gap-2 mt-4">
              <button
                type="button"
                class="btn btn-success btn-lg complete-btn"
                :disabled="!tax.cart.length || !canPay || processing"
                @click="completeSale"
              >
                <span v-if="processing" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                <i v-else class="bi bi-check2-circle me-2"></i>
                {{ processing 
                    ? (language.isKhmer ? 'កំពុងដំណើរការ...' : 'Processing...') 
                    : (language.isKhmer ? 'ទូទាត់ការលក់' : 'Complete Sale') 
                }}
              </button>

              <button
                type="button"
                class="btn btn-light text-secondary border clear-btn"
                :disabled="!tax.cart.length || processing"
                @click="clearCart"
              >
                <i class="bi bi-trash3 me-1 text-danger"></i>
                {{ language.isKhmer ? 'សម្អាតកន្ត្រក' : 'Clear Cart' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ESC/POS Thermal Receipt Host (80mm) -->
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';
import ThermalReceipt40Col from '@/components/receipt/ThermalReceipt40Col.vue';
import { printThermalReceipt } from '@/utils/thermalPrint';
import { api } from '@/services/api';

// Stores
const tax = useTaxStore();
const language = useLanguageStore();

// UI States
const search = ref('');
const searchInput = ref(null);
const notice = ref('');
const noticeType = ref('success');
const processing = ref(false);
const printReceipt = ref(null);

// Payment States
const selectedCustomerId = ref(null);
const paymentMethod = ref('cash');
const receivedUsd = ref(0);
const receivedKhr = ref(0);

// KHQR States & Polling
const khqrPayload = ref('');
const khqrImageUrl = ref('');
const khqrIntentId = ref('');
const khqrStatus = ref('');
const khqrLoading = ref(false);
const khqrChecking = ref(false);
const khqrError = ref('');
const qrCurrency = ref('USD');

let qrGeneration = 0;
let khqrCheckTimer = null;
let noticeTimer = null;
let printTimer = null;

// ==========================================
// Computed Properties
// ==========================================
const exchangeRate = computed(() => Number(tax.settings?.exchangeRate) || 4000);

const selectedCustomer = computed(() => 
  (tax.customers || []).find((c) => c.id === selectedCustomerId.value) || null
);

const customerName = computed(() => selectedCustomer.value?.name || 'Walk-in customer');

const customerCreditBlocked = computed(() => 
  paymentMethod.value === 'customer_account' && !selectedCustomer.value
);

const paymentMethods = computed(() => [
  { value: 'cash', label: language.t('cash'), icon: 'bi bi-cash-stack' },
  { value: 'bank', label: language.t('cardQr'), icon: 'bi bi-qr-code-scan' },
  { value: 'customer_account', label: language.t('account'), icon: 'bi bi-person-vcard' },
]);

const selectedPaymentLabel = computed(() => 
  paymentMethods.value.find((m) => m.value === paymentMethod.value)?.label || 'Payment'
);

const khqrMerchantName = computed(() => 
  tax.settings?.khqrMerchantName || tax.settings?.companyName || 'Merchant'
);

const searchResults = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return [];

  return (tax.items || [])
    .filter((item) => {
      const searchTarget = [item.nameEn, item.nameKh, item.nameKm, item.barcode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchTarget.includes(query);
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

const activeCashDifference = computed(() => canPay.value ? changeDue.value : amountDue.value);

const canPay = computed(() => {
  if (!tax.cart.length || customerCreditBlocked.value) return false;
  if (paymentMethod.value === 'bank') {
    return khqrStatus.value === 'paid' && Boolean(khqrIntentId.value);
  }
  if (paymentMethod.value !== 'cash') return true;
  return totalTenderedUsd.value >= (Number(tax.cartTotal || 0) - 0.001);
});

const khqrStatusInfo = computed(() => {
  switch (khqrStatus.value) {
    case 'paid':
      return {
        className: 'bg-success-subtle text-success fw-semibold',
        icon: 'bi bi-check-circle-fill',
        text: 'Payment verified',
      };
    case 'expired':
      return {
        className: 'bg-warning-subtle text-warning fw-semibold',
        icon: 'bi bi-exclamation-triangle',
        text: 'QR expired',
      };
    case 'error':
      return {
        className: 'bg-danger-subtle text-danger fw-semibold',
        icon: 'bi bi-x-circle',
        text: 'Verification unavailable',
      };
    default:
      return {
        className: 'bg-light text-muted',
        icon: 'bi bi-clock-history',
        text: 'Waiting for payment confirmation',
      };
  }
});

// ==========================================
// Methods: Math & Catalog
// ==========================================
function money(val) {
  return (Number(val) || 0).toFixed(2);
}

function lineTotal(line) {
  const qty = Math.max(0, Number(line.qty) || 0);
  const price = Math.max(0, Number(line.unitPrice) || 0);
  const discount = Math.max(0, Number(line.discount) || 0);
  return Math.max(0, (price * qty) - discount);
}

function showNotice(message, type = 'success') {
  notice.value = message;
  noticeType.value = type;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
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
  const maxDiscount = (Number(line.unitPrice) || 0) * (Number(line.qty) || 0);
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
      language.isKhmer ? `ទំនិញ "${displayName}" អស់ពីស្តុកហើយ។` : `"${displayName}" is out of stock.`,
      'danger'
    );
    return;
  }

  tax.addToCart(item);
  search.value = '';
  nextTick(() => searchInput.value?.focus());
}

function addSearchResult() {
  const exact = searchResults.value.find(
    (item) => String(item.barcode || '').trim().toLowerCase() === search.value.trim().toLowerCase()
  );
  const target = exact || searchResults.value[0];

  if (target) {
    addItem(target);
  } else {
    showNotice(language.t('noMatchingItem'), 'danger');
  }
}

function clearCart() {
  tax.clearCart();
  receivedUsd.value = 0;
  receivedKhr.value = 0;
}

// ==========================================
// Methods: Payments & KHQR
// ==========================================
function selectPaymentMethod(method) {
  paymentMethod.value = method;
  if (method !== 'cash') {
    receivedUsd.value = 0;
    receivedKhr.value = 0;
  }
  refreshKhqr();
}

async function refreshKhqr() {
  window.clearTimeout(khqrCheckTimer);
  if (paymentMethod.value !== 'bank' || Number(tax.cartTotal) <= 0) {
    qrGeneration++;
    resetKhqrState();
    return;
  }

  const currentGen = ++qrGeneration;
  khqrLoading.value = true;
  khqrError.value = '';
  khqrStatus.value = 'creating';

  try {
    const amount = qrCurrency.value === 'KHR' 
      ? Math.round(tax.cartTotal * exchangeRate.value) 
      : tax.cartTotal;

    const result = await api.createKhqrIntent({ amount, currency: qrCurrency.value });

    if (currentGen === qrGeneration) {
      khqrPayload.value = result.payload;
      khqrImageUrl.value = result.image;
      khqrIntentId.value = result.id;
      khqrStatus.value = 'pending';
      scheduleKhqrCheck(result.id, currentGen);
    }
  } catch (error) {
    if (currentGen === qrGeneration) {
      resetKhqrState();
      khqrStatus.value = 'error';
      khqrError.value = error?.message || 'Unable to generate KHQR';
    }
  } finally {
    if (currentGen === qrGeneration) khqrLoading.value = false;
  }
}

function resetKhqrState() {
  khqrPayload.value = '';
  khqrImageUrl.value = '';
  khqrIntentId.value = '';
  khqrStatus.value = '';
}

function scheduleKhqrCheck(intentId, gen) {
  window.clearTimeout(khqrCheckTimer);
  khqrCheckTimer = window.setTimeout(async () => {
    if (intentId !== khqrIntentId.value || gen !== qrGeneration) return;
    const status = await verifyKhqr(false);
    if (status === 'pending') scheduleKhqrCheck(intentId, gen);
  }, 4000);
}

async function verifyKhqr(manual = false) {
  if (!khqrIntentId.value || khqrChecking.value) return '';
  if (manual) window.clearTimeout(khqrCheckTimer);

  const targetId = khqrIntentId.value;
  khqrChecking.value = true;
  khqrError.value = '';

  try {
    const result = await api.verifyKhqrIntent(targetId);
    if (targetId !== khqrIntentId.value) return '';

    khqrStatus.value = result.status;
    if (result.status === 'paid') {
      showNotice('Payment verified. Completing sale...');
      await completeSale();
    } else if (result.status === 'expired') {
      khqrError.value = 'This payment request expired. Refresh QR.';
    } else if (manual && result.status === 'pending') {
      scheduleKhqrCheck(targetId, qrGeneration);
    }
    return result.status;
  } catch (error) {
    if (targetId === khqrIntentId.value) {
      khqrStatus.value = 'error';
      khqrError.value = error?.message || 'Unable to verify payment';
    }
    return 'error';
  } finally {
    khqrChecking.value = false;
  }
}

async function copyKhqr() {
  if (!khqrPayload.value) return;
  await navigator.clipboard?.writeText(khqrPayload.value);
  showNotice('KHQR payload copied to clipboard.');
}

// ==========================================
// Methods: Sale Completion & Print
// ==========================================
async function completeSale() {
  if (processing.value || !tax.cart.length || !canPay.value) return;
  processing.value = true;

  try {
    const requiresOverride = tax.cart.some(
      (line) => Number(line.discount || 0) > (Number(line.unitPrice || 0) * Number(line.qty || 0) * 0.10)
    );

    let managerPin = '';
    if (requiresOverride) {
      managerPin = window.prompt(
        language.isKhmer 
          ? 'បញ្ចូល PIN អ្នកគ្រប់គ្រង ដើម្បីអនុម័តបញ្ចុះតម្លៃលើស ១០%' 
          : 'Enter manager PIN to approve a discount above 10%'
      );
      if (!managerPin) {
        processing.value = false;
        return;
      }
    }

    const tenderedUSD = paymentMethod.value === 'cash' 
      ? totalTenderedUsd.value 
      : Number(tax.cartTotal || 0);

    const invoice = await tax.completeSale({
      customerName: customerName.value,
      customerId: selectedCustomerId.value,
      paymentMethod: paymentMethod.value,
      receivedUSD: paymentMethod.value === 'cash' ? receivedUsd.value : 0,
      receivedKHR: paymentMethod.value === 'cash' ? receivedKhr.value : 0,
      khqrPayload: paymentMethod.value === 'bank' ? khqrPayload.value : '',
      paymentIntentId: paymentMethod.value === 'bank' ? khqrIntentId.value : '',
      managerPin,
    });

    // Populate Print Context
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
      items: tax.cart.map((line) => ({
        ...line,
        uomName: line.unit || line.baseUnit || 'unit',
      })),
      netSale: Number(invoice.netSale) || 0,
      totalVat: Number(invoice.vat) || 0,
      grandTotal: Number(invoice.total) || 0,
      tenderedKHR: paymentMethod.value === 'cash' ? Math.round(Number(receivedKhr.value) || 0) : Number(invoice.receivedKHR) || 0,
      tenderedUSD: paymentMethod.value === 'cash' ? Math.round((Number(receivedUsd.value) || 0) * 100) / 100 : Number(invoice.receivedUSD) || 0,
      changeUSD: paymentMethod.value === 'cash' ? Math.max(0, tenderedUSD - Number(invoice.total || 0)) : 0,
      khqrImage: paymentMethod.value === 'bank' ? khqrImageUrl.value : '',
    };

    showNotice(
      language.isKhmer 
        ? `វិក្កយបត្រ #${invoice.id} ត្រូវបានទូទាត់ដោយជោគជ័យ។` 
        : `Invoice #${invoice.id} completed successfully.`
    );

    // Reset Form Fields
    search.value = '';
    selectedCustomerId.value = null;
    paymentMethod.value = 'cash';
    receivedUsd.value = 0;
    receivedKhr.value = 0;
    tax.clearCart();

    await nextTick();

    // Print Sequence
    window.clearTimeout(printTimer);
    printTimer = window.setTimeout(() => {
      printThermalReceipt();
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

// Watchers & Lifecycle Hooks
watch(
  [
    () => tax.cartTotal,
    paymentMethod,
    qrCurrency,
    exchangeRate,
    () => tax.settings?.khqrAccount,
    () => tax.settings?.khqrMerchantName,
  ],
  refreshKhqr
);

onBeforeUnmount(() => {
  window.clearTimeout(khqrCheckTimer);
  window.clearTimeout(noticeTimer);
  window.clearTimeout(printTimer);
});
</script>

<style scoped>
.pos-screen {
  --pos-primary: #0d6efd;
  --pos-surface: #ffffff;
  --pos-bg: #f8fafc;
  --pos-border: #e2e8f0;
  --pos-muted: #64748b;

  min-height: 100vh;
  background-color: var(--pos-bg);
  color: #1e293b;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}

.min-width-0 {
  min-width: 0;
}

/* Rate Card */
.rate-card {
  padding: 0.65rem 1rem;
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.rate-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #e0f2fe;
  color: #0284c7;
  font-size: 1.1rem;
}

.rate-value {
  color: #0f172a;
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}

/* POS Cards & Inputs */
.pos-card {
  background: var(--pos-surface);
  border: 1px solid var(--pos-border) !important;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.shortcut-key {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.search-wrapper {
  position: relative;
}

.search-input-group {
  border: 1px solid var(--pos-border);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-input-group:focus-within {
  border-color: var(--pos-primary);
  box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.15);
}

.search-dropdown {
  position: absolute;
  z-index: 1050;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  border-radius: 10px;
  overflow: hidden;
  background: var(--pos-surface);
  border: 1px solid var(--pos-border);
}

.search-dropdown .list-group-item:hover {
  background-color: #f1f5f9;
}

.product-title {
  color: #0f172a;
  font-size: 0.9rem;
}

.barcode-badge {
  font-family: monospace;
  background: #f1f5f9;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}

.search-empty {
  position: absolute;
  z-index: 1050;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  padding: 1rem;
  border-radius: 10px;
  background: var(--pos-surface);
  color: var(--pos-muted);
  border: 1px solid var(--pos-border);
  text-align: center;
  font-size: 0.88rem;
}

/* Cart Table */
.badge-cart-count {
  background-color: #f1f5f9;
  color: #334155;
  border: 1px solid var(--pos-border);
  font-weight: 600;
}

.pos-table thead th {
  padding: 0.8rem 0.85rem;
  background: #f8fafc;
  color: var(--pos-muted);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-bottom: 1px solid var(--pos-border);
}

.pos-table tbody td {
  padding: 0.85rem;
  border-bottom: 1px solid #f1f5f9;
}

.cart-row:hover {
  background-color: #fafbfc;
}

.item-name {
  font-size: 0.88rem;
}

.unit-badge {
  background-color: #f8fafc;
  color: #475569;
  border: 1px solid var(--pos-border);
  font-size: 0.72rem;
  font-weight: 600;
}

.qty-input {
  max-width: 68px;
  font-weight: 600;
  border-color: #cbd5e1;
}

.discount-input {
  max-width: 80px;
  font-variant-numeric: tabular-nums;
}

.delete-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-grid;
  place-items: center;
  border-radius: 6px;
  color: #94a3b8;
  transition: all 0.15s ease;
}

.delete-btn:hover {
  background: #ffe4e6;
  color: #e11d48;
}

.empty-cart {
  padding: 2rem 1rem;
}

.empty-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 0.75rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #f1f5f9;
  color: #94a3b8;
  font-size: 1.4rem;
}

/* Checkout Card */
.checkout-card {
  top: 24px;
  border-radius: 12px;
  border: 1px solid var(--pos-border) !important;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.checkout-header {
  padding: 1.15rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #0b132b, #1c2541);
}

.checkout-kicker {
  letter-spacing: 0.05em;
  color: #94a3b8;
  font-weight: 700;
}

.checkout-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 1.15rem;
}

.summary-row,
.grand-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.summary-row {
  padding: 0.4rem 0;
  font-size: 0.88rem;
}

.grand-total-row {
  padding: 0.85rem 0 0.65rem;
}

.grand-total-row span {
  font-weight: 700;
  font-size: 1rem;
}

.grand-amount {
  color: var(--pos-primary);
  font-size: 2.2rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
}

.currency-total {
  padding: 0.75rem 0.9rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--pos-border);
  border-radius: 8px;
  background: #f8fafc;
  font-size: 0.88rem;
}

/* Payment Method Selectors */
.payment-method {
  min-height: 64px;
  border-radius: 8px;
  font-size: 0.76rem;
  font-weight: 600;
  border: 1px solid var(--pos-border);
  color: #475569;
  background: #ffffff;
  transition: all 0.18s ease;
}

.payment-method i {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 1.15rem;
}

.payment-method:hover {
  background: #f8fafc;
  color: #0f172a;
}

.payment-method.active {
  color: #ffffff !important;
  border-color: var(--pos-primary) !important;
  background: var(--pos-primary) !important;
  box-shadow: 0 4px 12px rgba(13, 110, 253, 0.25);
}

/* KHQR Panel */
.khqr-panel {
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #fed7aa;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(197, 34, 45, 0.04);
}

.khqr-ribbon {
  padding: 0.4rem 0.85rem;
  color: #ffffff;
  background: #c5222d;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.khqr-frame {
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
  flex: 0 0 96px;
  background: #ffffff;
  border: 2px solid #1e293b;
  border-radius: 6px;
  padding: 2px;
}

.khqr-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.khqr-loading,
.khqr-empty {
  color: #c5222d;
  font-size: 1.8rem;
}

.currency-select {
  max-width: 95px;
  font-size: 0.75rem;
}

.khqr-amount-badge {
  font-size: 0.85rem;
  color: #0f172a;
}

.btn-xs {
  padding: 0.2rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 4px;
}

.spin {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

/* Change Due / Due Badge */
.change-box {
  padding: 0.85rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 8px;
}

.change-box.is-paid {
  color: #0f5132;
  background: #d1e7dd;
  border: 1px solid #badbcc;
}

.change-box.is-due {
  color: #842029;
  background: #f8d7da;
  border: 1px solid #f5c2c7;
}

.non-cash-note {
  padding: 0.75rem 1rem;
  color: #334155;
  background: #f8fafc;
  border: 1px solid var(--pos-border);
  border-radius: 8px;
  font-size: 0.85rem;
}

.complete-btn {
  min-height: 48px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 1rem;
  box-shadow: 0 4px 12px rgba(25, 135, 84, 0.22);
}

.clear-btn {
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 8px;
}

/* Animations */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

/* ESC/POS Thermal 80mm Print CSS */
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

  :global(.top-navbar),
  :global(.sidebar-wrapper),
  :global(.sidebar-backdrop) {
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
    padding: 0 !important;
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
  .pos-table {
    min-width: 780px;
  }
}
</style>