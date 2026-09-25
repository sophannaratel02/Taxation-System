<template>
  <article class="receipt" aria-label="Printed sales invoice">
    <!-- Header / Brand -->
    <header class="receipt-header">
      <div class="brand-row">
        <img :src="logoUrl" class="receipt-logo" alt="Axis Investment Consulting" />
        <div class="brand-text">
          <div class="brand-name">Axis</div>
          <div class="brand-name">Investment</div>
          <div class="brand-name">Consulting</div>
          <div class="brand-line"></div>
        </div>
      </div>
      <div class="brand-tagline">FOR A MORE PROSPEROUS FUTURE</div>
    </header>

    <div class="company-section">
      <div class="company-name">{{ company.nameEn || 'Inklusivity' }}</div>
      <div v-if="company.nameKh" class="company-name-kh khmer-text" lang="km">{{ company.nameKh }}</div>
      <div class="company-info">{{ company.address || 'Phnom Penh, Cambodia' }}</div>
      <div class="company-info">Tel: {{ company.phone || '023 555 888' }}</div>
      <div v-if="company.vatTin" class="company-info">VAT TIN: {{ company.vatTin }}</div>
    </div>

    <div class="receipt-title">SALES INVOICE</div>

    <!-- Meta / Invoice info -->
    <div class="dash-divider"></div>
    <div class="receipt-meta">
      <div class="meta-row invoice-line">
        <div class="meta-left">
          <span class="meta-label">Invoice</span>
          <span class="meta-val fw-bold">{{ receiptNo || 'INV-01006' }}</span>
        </div>
        <div class="meta-right">
          <span class="meta-label">Date</span>
          <span class="fw-bold">{{ printedAt }}</span>
        </div>
      </div>
      <div class="meta-row cashier-line">
        <div class="meta-left">
          <span class="meta-label">Cashier</span>
          <span class="fw-bold">{{ cashierName || 'Admin User' }}</span>
        </div>
      </div>
      <div v-if="customerName" class="meta-row cashier-line">
        <div class="meta-left">
          <span class="meta-label">Customer</span>
          <span class="fw-bold">{{ customerName }}</span>
        </div>
      </div>
    </div>
    <div class="dash-divider"></div>

    <!-- Items Table -->
    <table class="receipt-items">
      <thead>
        <tr>
          <th class="col-item">ITEM</th>
          <th class="col-qty">QTY</th>
          <th class="col-price">PRICE</th>
          <th class="col-total">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(item, index) in items || []" :key="index">
          <tr class="item-primary-row">
            <td class="col-item fw-bold">{{ item.nameEn || item.nameKh }}</td>
            <td class="col-qty">{{ item.qty }}</td>
            <td class="col-price">${{ Number(item.unitPrice).toFixed(2) }}</td>
            <td class="col-total">${{ lineTotal(item).toFixed(2) }}</td>
          </tr>
          <tr class="item-detail-row">
            <td colspan="4" class="col-sub">
              {{ item.uomName || item.unit || 'Unit' }}
              <template v-if="item.discount"> · Disc ${{ Number(item.discount).toFixed(2) }}</template>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <div class="dotted-divider"></div>

    <!-- Totals -->
    <section class="receipt-summary">
      <div class="summary-row">
        <span>Net sale</span>
        <strong>${{ Number(netSale).toFixed(2) }}</strong>
      </div>
      <div class="summary-row">
        <span>VAT ({{ vatRate }}%)</span>
        <strong>${{ Number(totalVat).toFixed(2) }}</strong>
      </div>
    </section>

    <!-- Grand Total with solid top & bottom bars -->
    <div class="grand-total-container">
      <div class="grand-total-row">
        <span>GRAND TOTAL</span>
        <span class="grand-total-val">${{ Number(grandTotal).toFixed(2) }}</span>
      </div>
    </div>

    <!-- KHR Total -->
    <div class="summary-row khr-row">
      <span>Total in KHR</span>
      <strong>{{ khrTotal.toLocaleString() }} ៛</strong>
    </div>

    <div class="dash-divider"></div>

    <!-- Payment section -->
    <section class="receipt-summary pt-1">
      <div class="summary-row">
        <span>Received</span>
        <strong>${{ Number(tenderedUSD).toFixed(2) }}</strong>
      </div>
      <div class="summary-row">
        <span>Change</span>
        <strong>${{ Number(changeUSD).toFixed(2) }}</strong>
      </div>
    </section>

    <div class="dash-divider"></div>

    <div v-if="khqrImage" class="receipt-khqr">
      <img :src="khqrImage" alt="KHQR payment code" />
      <div>Scan to pay via KHQR</div>
    </div>

    <!-- Footer -->
    <footer class="receipt-footer">
      <div class="thanks">Thank you for your business</div>
      <div class="footer-sub">
        <span class="khmer-text" lang="km">សូមអរគុណ</span>
        <span class="dot">·</span>
        <span>Powered by INKLUSIVITY</span>
      </div>
    </footer>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import logoUrl from '@/assets/logo.svg';

const props = defineProps({
  company: {
    type: Object,
    default: () => ({
      nameEn: 'Inklusivity',
      nameKh: '',
      address: 'Phnom Penh, Cambodia',
      phone: '023 555 888'
    })
  },
  receiptNo: { type: String, default: 'INV-01006' },
  issueDate: { type: [String, Date], default: '' },
  cashierName: { type: String, default: 'Admin User' },
  customerName: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  netSale: { type: Number, default: 0 },
  totalVat: { type: Number, default: 0 },
  vatRate: { type: [Number, String], default: 10 },
  grandTotal: { type: Number, default: 0 },
  tenderedUSD: { type: Number, default: 0 },
  changeUSD: { type: Number, default: 0 },
  exchangeRate: { type: Number, default: 4000 }
  ,khqrImage: { type: String, default: '' }
});

const printedAt = computed(() => {
  const now = props.issueDate ? new Date(props.issueDate) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const d = pad(now.getDate());
  const m = pad(now.getMonth() + 1);
  const y = now.getFullYear();
  const hr = pad(now.getHours());
  const min = pad(now.getMinutes());
  return `${d}/${m}/${y}, ${hr}:${min}`;
});

const khrTotal = computed(() => Math.round(Number(props.grandTotal) * Number(props.exchangeRate || 4000)));

function lineTotal(item) {
  return (Number(item.qty) * Number(item.unitPrice)) - Number(item.discount || 0);
}
</script>

<style scoped>
.receipt {
  width: 80mm;
  margin: 0 auto;
  padding: 5mm 3mm 6mm;
  background: #ffffff;
  color: #111111;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  line-height: 1.35;
  box-sizing: border-box;
}

/* Header & Logo */
.receipt-header {
  text-align: center;
  margin-bottom: 8px;
}

.brand-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.receipt-logo {
  width: 42px;
  height: 30px;
  object-fit: cover;
  object-position: left center;
}

.brand-text {
  text-align: left;
  line-height: 1.15;
  position: relative;
}

.brand-name {
  font-size: 12px;
  font-weight: 700;
  color: #0d2d45;
}

.brand-line {
  height: 2px;
  background-color: #8b1e23;
  margin-top: 2px;
  width: 100%;
}

.brand-tagline {
  font-size: 8px;
  letter-spacing: 0.05em;
  color: #374151;
  font-weight: 700;
  margin-top: 7px;
}

/* Company Details */
.company-section {
  text-align: center;
  margin-top: 6px;
}

.company-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.company-name-kh {
  font-family: 'Noto Sans Khmer', 'Leelawadee UI', 'Khmer OS', sans-serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.7;
}

.company-info {
  font-size: 12px;
  color: #222;
}

.receipt-title {
  margin-top: 16px;
  margin-bottom: 9px;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.16em;
  color: #0b6863;
}

/* Dividers */
.dash-divider {
  border-bottom: 1px dashed #4b5563;
  margin: 7px 0;
}

.dotted-divider {
  border-bottom: 1px dotted #888888;
  margin: 5px 0;
}

/* Meta Section */
.receipt-meta {
  padding: 2px 0 1px;
  font-size: 13px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
}

.invoice-line {
  min-height: 18px;
}

.meta-left,
.meta-right {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
}

.meta-right {
  justify-content: flex-end;
  text-align: right;
}

.cashier-line {
  margin-top: 4px;
}

.meta-label {
  color: #333;
}

.fw-bold {
  font-weight: 700;
}

/* Table layout */
.receipt-items {
  width: 100%;
  border-collapse: collapse;
}

.receipt-items thead th {
  padding: 4px 0 7px;
  border-bottom: 1px solid #111111;
  color: #222222;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.col-item { text-align: left; width: 42%; }
.col-qty { text-align: right; width: 14%; }
.col-price { text-align: right; width: 21%; }
.col-total { text-align: right; width: 23%; }

.item-primary-row td {
  padding-top: 8px;
  vertical-align: baseline;
}

.item-detail-row td {
  padding-bottom: 8px;
  font-size: 11px;
  color: #444444;
}

/* Totals & Summary */
.receipt-summary {
  font-size: 12px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}

.khr-row {
  padding: 8px 0 3px;
}

/* Grand Total with double-bordered emphasis */
.grand-total-container {
  border-top: 2px solid #111111;
  border-bottom: 2px solid #111111;
  margin: 7px 0;
  padding: 7px 0;
}

.grand-total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
}

.grand-total-val {
  color: #0b6863;
  font-size: 16px;
  font-weight: 700;
}

/* Footer */
.receipt-footer {
  text-align: center;
  padding-top: 14px;
}

.receipt-khqr {
  padding: 8px 0 2px;
  text-align: center;
  font-size: 10px;
}

.receipt-khqr img {
  display: block;
  width: 34mm;
  height: 34mm;
  margin: 0 auto 4px;
  image-rendering: pixelated;
}

.thanks {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 2px;
}

.footer-sub {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #444444;
}

.footer-sub span:first-child {
  font-family: 'Noto Sans Khmer', 'Leelawadee UI', 'Khmer OS', sans-serif;
  letter-spacing: 0;
  line-height: 1.6;
}

.dot {
  font-size: 12px;
}

@media print {
  @page {
    size: 80mm auto;
    margin: 0;
  }

  html, body {
    margin: 0;
    background: #fff;
  }

  body * {
    visibility: hidden !important;
  }

  .receipt,
  .receipt * {
    visibility: visible !important;
  }

  .receipt {
    position: fixed !important;
    top: 0;
    left: 0;
    width: 80mm !important;
    margin: 0 !important;
    padding: 4mm 3mm 5mm !important;
    box-shadow: none !important;
    display: block !important;
    background: #fff !important;
  }
}
</style>