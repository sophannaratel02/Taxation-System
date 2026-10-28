<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Header -->
    <div class="mb-4">
      <div class="eyebrow mb-2">{{ text('របាយការណ៍ និងការវិភាគ', 'Reports & analytics') }}</div>
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
                {{ text('រកមិនឃើញទិន្នន័យទេ។', 'No records found.') }}
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
import { useLanguageStore } from '@/stores/language';

const route = useRoute();
const tax = useTaxStore();
const language = useLanguageStore();
const text = (khmer, english) => language.isKhmer ? khmer : english;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatCurrency = (val) => `$${toNumber(val).toFixed(2)}`;

const report = computed(() => {
  const path = route.path;

  // 1. Customer Report
  if (path.includes('by-customer')) {
    return {
      title: text('ការលក់តាមអតិថិជន', 'Sales by Customer'),
      description: text('ការលក់ អាករ VAT និងសមតុល្យតាមអតិថិជន។', 'Sales, VAT and balances by customer.'),
      headings: [text('អតិថិជន', 'Customer'), text('វិក្កយបត្រ', 'Invoices'), text('ការលក់សុទ្ធ', 'Net sale'), 'VAT', text('សរុបរួម', 'Grand total')],
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
      title: text('ការលក់តាមប្រភេទ', 'Sales by Category'),
      description: text('ការលក់សុទ្ធបែងចែកតាមប្រភេទទំនិញនីមួយៗ។', 'Net sales allocated to each item category.'),
      headings: [text('ប្រភេទ', 'Category'), text('ទំនិញ', 'Items'), text('ចំនួនដែលបានលក់', 'Units sold'), text('ការលក់សុទ្ធ', 'Net sale'), text('ប្រាក់ចំណេញ', 'Margin')],
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
      title: text('ការលក់តាមទំនិញ', 'Sales by Item'),
      description: text('ប្រសិទ្ធភាពទំនិញដែលលក់ដាច់ និងលក់យឺត។', 'Best and slow-moving item performance.'),
      headings: [text('ទំនិញ', 'Item'), text('ប្រភេទ', 'Category'), text('នៅសល់ក្នុងស្តុក', 'On hand'), text('តម្លៃលក់រាយ', 'Retail price'), text('តម្លៃស្តុក', 'Stock value')],
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
      title: text('ការលក់តាមវិធីទូទាត់', 'Sales by Payment Method'),
      description: text('សមាសភាពវិធីទូទាត់ និងចំនួនទឹកប្រាក់ទូទាត់សរុប។', 'Tender mix and payment totals.'),
      headings: [text('វិធីទូទាត់', 'Payment method'), text('វិក្កយបត្រ', 'Invoices'), text('សរុបរួម', 'Grand total'), text('ភាគរយ', 'Share')],
      rows: methods.map((method) => {
        const list = (tax.invoices || []).filter((inv) => inv.paymentMethod === method);
        const methodTotal = list.reduce((sum, inv) => sum + (inv.total || 0), 0);
        const share = totalSales > 0 ? ((methodTotal / totalSales) * 100).toFixed(1) : '0.0';
        const labels = {
          cash: text('សាច់ប្រាក់', 'Cash'),
          bank: text('ធនាគារ', 'Bank'),
          customer_account: text('គណនីអតិថិជន', 'Customer account')
        };
        return [labels[method] || method.replaceAll('_', ' '), list.length, formatCurrency(methodTotal), `${share}%`];
      })
    };
  }

  // 5. Aging Report
  if (path.includes('aging')) {
    return {
      title: path.includes('/ar') ? text('តារាងអាយុបំណុលត្រូវទារ', 'Accounts Receivable Aging') : text('តារាងអាយុបំណុលត្រូវសង', 'Accounts Payable Aging'),
      description: text('សមតុល្យមិនទាន់ទូទាត់តាមរយៈពេលសម្រាប់រៀបចំការទារ និងទូទាត់។', 'Open balances by aging bucket for collection and payment planning.'),
      headings: [text('រយៈពេល', 'Bucket'), text('ឯកសារ', 'Documents'), text('សមតុល្យ', 'Balance'), text('សកម្មភាព', 'Action')],
      rows: [
        [`0-30 ${text('ថ្ងៃ', 'days')}`, '4', '$1,240.00', text('តាមដាន', 'Monitor')],
        [`31-60 ${text('ថ្ងៃ', 'days')}`, '2', '$420.00', text('តាមដានបន្ត', 'Follow up')],
        [`61-90 ${text('ថ្ងៃ', 'days')}`, '1', '$180.00', text('បញ្ជូនបន្ត', 'Escalate')],
        [`>90 ${text('ថ្ងៃ', 'days')}`, '0', '$0.00', text('បិទ', 'Clear')]
      ]
    };
  }

  // 6. Transfers Report
  if (path.includes('transfer')) {
    return {
      title: text('របាយការណ៍ផ្ទេរសារពើភណ្ឌ', 'Inventory Transfer Report'),
      description: text('ចលនាស្តុករវាងសាខា និងឃ្លាំង។', 'Branch and warehouse stock movements.'),
      headings: [text('ការផ្ទេរ', 'Transfer'), text('ពី', 'From'), text('ទៅ', 'To'), text('ទំនិញ', 'Items'), text('ស្ថានភាព', 'Status')],
      rows: [['TR-0001', text('ទីស្នាក់ការកណ្តាល', 'Head Quarter'), text('ហាងកណ្តាលក្រុង', 'Downtown Shop'), '24', text('បានបញ្ចប់', 'Completed')]]
    };
  }

  // 7. Purchase / Vendor Default
  const purchaseTitle = path.includes('best-selling')
    ? text('ទំនិញលក់ដាច់បំផុត', 'Best Selling Items')
    : path.includes('multi-vendor')
    ? text('ទំនិញដែលផ្គត់ផ្គង់ដោយអ្នកផ្គត់ផ្គង់ច្រើន', 'Items Supplied by Multiple Vendors')
    : text('ការទិញតាមអ្នកផ្គត់ផ្គង់', 'Purchase by Vendor');

  return {
    title: purchaseTitle,
    description: text('ប្រសិទ្ធភាពការទិញ និងការបែងចែកតាមអ្នកផ្គត់ផ្គង់។', 'Procurement performance and supplier allocation.'),
    headings: [text('អ្នកផ្គត់ផ្គង់ / ទំនិញ', 'Vendor / Item'), text('បញ្ជាទិញ', 'Orders'), text('បរិមាណ', 'Quantity'), text('ចំនួនទឹកប្រាក់', 'Amount'), text('ស្ថានភាព', 'Status')],
    rows: (tax.vendors || []).map((vendor) => [
      vendor.name,
      '2',
      '-',
      formatCurrency(vendor.balance),
      text('បានតាមដាន', 'Tracked')
    ])
  };
});

const stats = computed(() => [
  { label: text('កំណត់ត្រា', 'Records'), value: report.value.rows.length },
  { label: text('ការលក់សុទ្ធ', 'Net sales'), value: formatCurrency(tax.todaySales) },
  { label: text('តម្លៃសារពើភណ្ឌ', 'Inventory value'), value: formatCurrency(tax.inventoryValue) },
  { label: text('គិតត្រឹម', 'As of'), value: text('ថ្ងៃនេះ', 'Today') }
]);
</script>