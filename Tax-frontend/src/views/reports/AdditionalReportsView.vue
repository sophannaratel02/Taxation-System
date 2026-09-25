<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Header -->
    <div class="mb-4">
      <div class="eyebrow mb-2">Reports & analytics</div>
      <h1 class="h3 fw-bold mb-1">{{ report.title }}</h1>
      <p class="text-muted mb-0">{{ report.description }}</p>
    </div>

    <!-- Metrics Cards -->
    <div class="row g-3 mb-4">
      <div v-for="stat in stats" :key="stat.label" class="col-sm-6 col-xl-3">
        <div class="card metric-card h-100">
          <div class="card-body">
            <small class="text-muted">{{ stat.label }}</small>
            <div class="h4 fw-bold mt-2 mb-0">{{ stat.value }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th v-for="heading in report.headings" :key="heading">
                {{ heading }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in report.rows" :key="index">
              <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                {{ cell }}
              </td>
            </tr>
            <tr v-if="!report.rows.length">
              <td :colspan="report.headings.length" class="text-center text-muted py-4">
                No records found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useTaxStore } from '@/stores/tax';

const route = useRoute();
const tax = useTaxStore();

const formatCurrency = (val) => `$${Number(val || 0).toFixed(2)}`;

const report = computed(() => {
  const path = route.path;

  // 1. Customer Report
  if (path.includes('by-customer')) {
    return {
      title: 'Sales by Customer',
      description: 'Sales, VAT and balances by customer.',
      headings: ['Customer', 'Invoices', 'Net sale', 'VAT', 'Grand total'],
      rows: (tax.customers || []).map((customer) => {
        const invoices = (tax.invoices || []).filter((inv) => inv.customer === customer.name);
        const netSale = invoices.reduce((s, i) => s + (i.netSale || 0), 0);
        const vat = invoices.reduce((s, i) => s + (i.vat || 0), 0);
        const total = invoices.reduce((s, i) => s + (i.total || 0), 0);
        return [customer.name, invoices.length, formatCurrency(netSale), formatCurrency(vat), formatCurrency(total)];
      })
    };
  }

  // 2. Category Report
  if (path.includes('by-category')) {
    const categories = [...new Set((tax.items || []).map((item) => item.category))];
    return {
      title: 'Sales by Category',
      description: 'Net sales allocated to each item category.',
      headings: ['Category', 'Items', 'Units sold', 'Net sale', 'Margin'],
      rows: categories.map((category) => [
        category,
        (tax.items || []).filter((item) => item.category === category).length,
        '-',
        '$0.00',
        '-'
      ])
    };
  }

  // 3. Item Report
  if (path.includes('by-item') || path.includes('inventory-detail')) {
    return {
      title: 'Sales by Item',
      description: 'Best and slow-moving item performance.',
      headings: ['Item', 'Category', 'On hand', 'Retail price', 'Stock value'],
      rows: (tax.items || []).map((item) => [
        item.nameEn,
        item.category,
        item.qtyOnHand || 0,
        formatCurrency(item.retailPrice),
        formatCurrency((item.qtyOnHand || 0) * (item.averageCost || 0))
      ])
    };
  }

  // 4. Payment Method Report
  if (path.includes('payment-method')) {
    const totalSales = (tax.invoices || []).reduce((s, i) => s + (i.total || 0), 0);
    const methods = ['cash', 'bank', 'customer_account'];

    return {
      title: 'Sales by Payment Method',
      description: 'Tender mix and payment totals.',
      headings: ['Payment method', 'Invoices', 'Grand total', 'Share'],
      rows: methods.map((method) => {
        const list = (tax.invoices || []).filter((inv) => inv.paymentMethod === method);
        const methodTotal = list.reduce((sum, inv) => sum + (inv.total || 0), 0);
        const share = totalSales > 0 ? ((methodTotal / totalSales) * 100).toFixed(1) : '0.0';
        return [method.replaceAll('_', ' '), list.length, formatCurrency(methodTotal), `${share}%`];
      })
    };
  }

  // 5. Aging Report
  if (path.includes('aging')) {
    return {
      title: path.includes('/ar') ? 'Accounts Receivable Aging' : 'Accounts Payable Aging',
      description: 'Open balances by aging bucket for collection and payment planning.',
      headings: ['Bucket', 'Documents', 'Balance', 'Action'],
      rows: [
        ['0-30 days', '4', '$1,240.00', 'Monitor'],
        ['31-60 days', '2', '$420.00', 'Follow up'],
        ['61-90 days', '1', '$180.00', 'Escalate'],
        ['>90 days', '0', '$0.00', 'Clear']
      ]
    };
  }

  // 6. Transfers Report
  if (path.includes('transfer')) {
    return {
      title: 'Inventory Transfer Report',
      description: 'Branch and warehouse stock movements.',
      headings: ['Transfer', 'From', 'To', 'Items', 'Status'],
      rows: [['TR-0001', 'Head Quarter', 'Downtown Shop', '24', 'Completed']]
    };
  }

  // 7. Purchase / Vendor Default
  const purchaseTitle = path.includes('best-selling')
    ? 'Best Selling Items'
    : path.includes('multi-vendor')
    ? 'Items Supplied by Multiple Vendors'
    : 'Purchase by Vendor';

  return {
    title: purchaseTitle,
    description: 'Procurement performance and supplier allocation.',
    headings: ['Vendor / Item', 'Orders', 'Quantity', 'Amount', 'Status'],
    rows: (tax.vendors || []).map((vendor) => [
      vendor.name,
      '2',
      '-',
      formatCurrency(vendor.balance),
      'Tracked'
    ])
  };
});

const stats = computed(() => [
  { label: 'Records', value: report.value.rows.length },
  { label: 'Net sales', value: formatCurrency(tax.todaySales) },
  { label: 'Inventory value', value: formatCurrency(tax.inventoryValue) },
  { label: 'As of', value: 'Today' }
]);
</script>