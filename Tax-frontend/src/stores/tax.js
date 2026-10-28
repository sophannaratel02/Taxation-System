import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { userHasPermission } from '@/router/permissionAccess';

function createEmptySettings() {
  return {
    companyName: '',
    address: '',
    phone: '',
    baseCurrency: 'USD',
    exchangeRate: 4000,
    vatRate: 10,
    branch: 'Main Branch',
    policy: {
      approval: {},
      access: {},
      inventory: {},
      sales: {},
      documents: {},
    },
  };
}

export const useTaxStore = defineStore('tax', () => {
  // ==========================================
  // STATE
  // ==========================================
  const settings = ref(createEmptySettings());

  const items = ref([]);
  const vendors = ref([]);
  const customers = ref([]);
  const invoices = ref([]);
  const transactions = ref([]);
  const purchaseOrders = ref([]);
  const cart = ref([]);

  const loading = ref(false);
  const error = ref('');

  function reset() {
    settings.value = createEmptySettings();
    items.value = [];
    vendors.value = [];
    customers.value = [];
    invoices.value = [];
    transactions.value = [];
    purchaseOrders.value = [];
    cart.value = [];
    loading.value = false;
    error.value = '';
  }

  // ==========================================
  // UTILITIES & HELPERS
  // ==========================================
  const roundCurrency = (value) =>
    Math.round((Number(value) + Number.EPSILON) * 100) / 100;

  function calculateAverageCost(item, purchasedQty, purchaseCost) {
    const onHand = Math.max(0, Number(item?.qtyOnHand || 0));
    const currentCost = onHand > 0 ? Number(item?.averageCost || purchaseCost) : Number(purchaseCost);
    const totalQty = onHand + Number(purchasedQty);

    return totalQty > 0
      ? ((onHand * currentCost) + (Number(purchasedQty) * Number(purchaseCost))) / totalQty
      : Number(purchaseCost);
  }

  // ==========================================
  // COMPUTED PROPERTIES
  // ==========================================
  const todayInvoices = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return invoices.value.filter((invoice) => invoice.date === today);
  });

  const todaySales = computed(() =>
    todayInvoices.value.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
  );

  const totalVat = computed(() =>
    todayInvoices.value.reduce((sum, invoice) => sum + Number(invoice.vat || 0), 0)
  );

  const inventoryValue = computed(() =>
    items.value.reduce(
      (sum, item) => sum + Number(item.qtyOnHand || 0) * Number(item.averageCost || 0),
      0
    )
  );

  const retailValue = computed(() =>
    items.value.reduce(
      (sum, item) => sum + Number(item.qtyOnHand || 0) * Number(item.retailPrice || 0),
      0
    )
  );

  const lowStockItems = computed(() =>
    items.value.filter((item) => Number(item.qtyOnHand || 0) <= Number(item.reorderQty || 0))
  );

  const cartNetSale = computed(() =>
    roundCurrency(
      cart.value.reduce(
        (sum, line) =>
          sum + roundCurrency(Number(line.unitPrice) * Number(line.qty) - Number(line.discount || 0)),
        0
      )
    )
  );

  const cartVat = computed(() =>
    roundCurrency(
      cart.value.reduce((sum, line) => {
        const lineNet = roundCurrency(
          Number(line.unitPrice) * Number(line.qty) - Number(line.discount || 0)
        );
        return sum + roundCurrency(lineNet * (Number(settings.value.vatRate || 0) / 100));
      }, 0)
    )
  );

  const cartTotal = computed(() => roundCurrency(cartNetSale.value + cartVat.value));

  // ==========================================
  // INITIALIZATION
  // ==========================================
  async function initialize() {
    loading.value = true;
    error.value = '';
    items.value = [];
    vendors.value = [];
    customers.value = [];
    invoices.value = [];
    transactions.value = [];
    purchaseOrders.value = [];
    try {
      const currentUser = useAuthStore().user;
      const canAccessWorkspace = userHasPermission(currentUser, 'workspace.access');
      let branch;
      if (canAccessWorkspace) {
        const remoteSettings = await api.settings();
        if (!remoteSettings || typeof remoteSettings !== 'object' || Array.isArray(remoteSettings)) {
          throw new Error('Invalid settings response');
        }
        settings.value = { ...settings.value, ...remoteSettings };
        branch = remoteSettings.branch || settings.value.branch;
      }

      const dataSources = [
        {
          label: 'Inventory',
          permission: 'inventory.read',
          load: () => api.items('', branch),
          apply: (value) => {
            if (!Array.isArray(value)) throw new Error('Invalid response');
            items.value = value;
          },
          clear: () => { items.value = []; },
        },
        {
          label: 'Vendors',
          permission: 'purchases.read',
          load: () => api.vendors(),
          apply: (value) => {
            if (!Array.isArray(value)) throw new Error('Invalid response');
            vendors.value = value;
          },
          clear: () => { vendors.value = []; },
        },
        {
          label: 'Customers',
          permission: 'sales.read',
          load: () => api.customers(),
          apply: (value) => {
            if (!Array.isArray(value)) throw new Error('Invalid response');
            customers.value = value;
          },
          clear: () => { customers.value = []; },
        },
        {
          label: 'Sales',
          permission: 'sales.read',
          load: () => api.invoices(),
          apply: (value) => {
            if (!Array.isArray(value)) throw new Error('Invalid response');
            invoices.value = value;
          },
          clear: () => { invoices.value = []; },
        },
        {
          label: 'Inventory transactions',
          permission: userHasPermission(currentUser, 'inventory.read')
            ? 'inventory.read'
            : userHasPermission(currentUser, 'purchases.read') ? 'purchases.read' : null,
          load: () => api.transactions({
            page: 1,
            limit: 50,
            ...(!userHasPermission(currentUser, 'inventory.read') ? { type: 'Purchase' } : {}),
          }),
          apply: (value) => {
            if (!Array.isArray(value?.data)) throw new Error('Invalid response');
            transactions.value = value.data;
          },
          clear: () => { transactions.value = []; },
        },
        {
          label: 'Purchases',
          permission: 'purchases.read',
          load: () => api.purchaseOrders(),
          apply: (value) => {
            if (!Array.isArray(value)) throw new Error('Invalid response');
            purchaseOrders.value = value;
          },
          clear: () => { purchaseOrders.value = []; },
        },
      ];

      const permittedSources = dataSources.filter((source) => (
        source.permission && userHasPermission(currentUser, source.permission)
      ));
      const results = await Promise.allSettled(
        permittedSources.map(({ load }) => Promise.resolve().then(load))
      );
      const failures = [];
      results.forEach((result, index) => {
        const source = permittedSources[index];
        try {
          if (result.status === 'fulfilled') {
            source.apply(result.value);
            return;
          }
          throw result.reason;
        } catch (requestError) {
          source.clear();
          failures.push(`${source.label}: ${requestError?.message || 'Request failed'}`);
        }
      });
      error.value = failures.join('; ');
    } catch (requestError) {
      error.value = requestError?.message || 'Error initializing store';
    } finally {
      loading.value = false;
    }
  }

  // ==========================================
  // CART ACTIONS
  // ==========================================
  function addToCart(item) {
    const baseUnit = item.baseUnit || item.unit || 'Unit';
    const existing = cart.value.find((line) =>
      String(line.itemId) === String(item.id) && line.unit === baseUnit
    );
    if (existing) {
      existing.qty += 1;
      return;
    }

    const units = Array.isArray(item.units) ? item.units.map((unit) => ({ ...unit })) : [];
    const baseUnitEntry = units.find((entry) => String(entry?.name || '').toLowerCase() === baseUnit.toLowerCase());
    if (baseUnitEntry) {
      baseUnitEntry.ratio = 1;
      baseUnitEntry.retailPrice = Number(item.retailPrice || 0);
    } else {
      units.unshift({ name: baseUnit, ratio: 1, retailPrice: Number(item.retailPrice || 0) });
    }
    const unit = units.find((entry) => String(entry?.name || '').toLowerCase() === baseUnit.toLowerCase());
    const catalogPrice = Number(unit?.retailPrice ?? item.retailPrice);
    const averageCost = Number(item.averageCost);
    const purchaseCost = Number(item.purchaseCost);

    const cost = Number.isFinite(averageCost) && averageCost > 0
      ? averageCost
      : Number.isFinite(purchaseCost) && purchaseCost > 0
        ? purchaseCost
        : 0;

    const ratio = Number(unit?.ratio ?? 1);
    const markupAmount = Number(item.markupAmount ?? 0);

    const unitPrice = Number.isFinite(catalogPrice) && catalogPrice > 0
      ? catalogPrice
      : Number.isFinite(cost) && cost >= 0 && Number.isFinite(ratio) && ratio > 0 && Number.isFinite(markupAmount) && markupAmount >= 0
        ? Number(((cost + markupAmount) * ratio).toFixed(4))
        : 0;

    cart.value.push({
      itemId: item.id,
      barcode: item.barcode,
      nameKh: item.nameKh,
      nameEn: item.nameEn,
      unit: baseUnit,
      unitRatio: ratio,
      units,
      baseUnit,
      unitPrice,
      averageCost: item.averageCost,
      purchaseCost: item.purchaseCost,
      markupAmount,
      qty: 1,
      discount: 0,
      available: item.qtyOnHand,
      availableInUnit: Math.floor(Number(item.qtyOnHand || 0) / ratio)
    });
  }

  function removeFromCart(index) {
    cart.value.splice(index, 1);
  }

  function clearCart() {
    cart.value = [];
  }

  // ==========================================
  // SALES & STOCK
  // ==========================================
  async function completeSale({
    customerId,
    customerName = 'Walk-in customer',
    paymentMethod = 'cash',
    receivedUSD = 0,
    receivedKHR = 0,
    paymentReference = '',
    khqrPayload = '',
    paymentIntentId = '',
    managerPin = ''
  }) {
    const invoice = await api.completeSale({
      customerId,
      customerName,
      paymentMethod,
      receivedUSD,
      receivedKHR,
      paymentReference,
      khqrPayload,
      paymentIntentId,
      managerPin,
      vatRate: settings.value.vatRate,
      exchangeRate: settings.value.exchangeRate,
      khqrMerchantId: settings.value.khqrMerchantId,
      branch: settings.value.branch,
      lines: cart.value.map((line) => ({
        itemId: line.itemId,
        unit: line.unit,
        qty: line.qty,
        discount: line.discount
      }))
    });

    await initialize();
    clearCart();
    return invoice;
  }

  async function adjustStock(itemId, quantity, note) {
    await api.adjustStock({
      itemId,
      quantity,
      note,
      branch: settings.value.branch
    });
    await initialize();
  }

  async function fetchInvoice(identifier) {
    return api.invoice(identifier);
  }

  async function saveSettings(payload) {
    const saved = await api.saveSettings(payload);
    settings.value = { ...settings.value, ...saved };
    items.value = await api.items('', settings.value.branch);
    return saved;
  }

  // ==========================================
  // ITEMS CRUD
  // ==========================================
  async function saveItem(payload) {
    const item = await api.saveItem({ ...payload, branch: settings.value.branch });
    items.value.push(item);
    return item;
  }

  async function updateItem(id, payload) {
    const item = await api.updateItem(id, payload);
    items.value = await api.items('', settings.value.branch);
    return items.value.find((entry) => String(entry.id) === String(id)) || item;
  }

  async function deleteItem(id) {
    await api.deleteItem(id);
    items.value = items.value.filter((item) => String(item.id) !== String(id));
  }

  // ==========================================
  // VENDORS CRUD
  // ==========================================
  async function saveVendor(payload) {
    const vendor = await api.saveVendor(payload);
    vendors.value.push(vendor);
    return vendor;
  }

  async function updateVendor(id, payload) {
    const vendor = await api.updateVendor(id, payload);
    const index = vendors.value.findIndex((entry) => String(entry.id) === String(id));
    if (index !== -1) {
      vendors.value[index] = vendor;
    } else {
      vendors.value.push(vendor);
    }
    return vendor;
  }

  async function deleteVendor(id) {
    await api.deleteVendor(id);
    vendors.value = vendors.value.filter((vendor) => String(vendor.id) !== String(id));
  }

  // ==========================================
  // CUSTOMERS CRUD
  // ==========================================
  async function saveCustomer(payload) {
    const customer = await api.saveCustomer(payload);
    customers.value.push(customer);
    return customer;
  }

  async function updateCustomer(id, payload) {
    const customer = await api.updateCustomer(id, payload);
    const index = customers.value.findIndex((entry) => String(entry.id) === String(id));
    if (index !== -1) {
      customers.value[index] = customer;
    }
    return customer;
  }

  async function deleteCustomer(id) {
    await api.deleteCustomer(id);
    customers.value = customers.value.filter((customer) => String(customer.id) !== String(id));
  }

  // ==========================================
  // PURCHASE ORDERS CRUD
  // ==========================================
  async function savePurchaseOrder(payload) {
    const order = await api.savePurchaseOrder(payload);
    await initialize();
    return order;
  }

  async function updatePurchaseOrder(id, payload) {
    const order = await api.updatePurchaseOrder(id, payload);
    await initialize();
    return order;
  }

  async function deletePurchaseOrder(id) {
    await api.deletePurchaseOrder(id);
    purchaseOrders.value = purchaseOrders.value.filter((order) => String(order.id) !== String(id));
  }

  return {
    // State
    settings,
    items,
    vendors,
    customers,
    invoices,
    transactions,
    purchaseOrders,
    cart,
    loading,
    error,
    reset,

    // Computeds
    todayInvoices,
    todaySales,
    totalVat,
    inventoryValue,
    retailValue,
    lowStockItems,
    cartNetSale,
    cartVat,
    cartTotal,

    // Cart Methods
    addToCart,
    removeFromCart,
    clearCart,

    // Business Methods
    initialize,
    completeSale,
    adjustStock,
    fetchInvoice,
    saveSettings,
    calculateAverageCost,

    // CRUD Methods
    saveItem,
    updateItem,
    deleteItem,
    saveVendor,
    updateVendor,
    deleteVendor,
    saveCustomer,
    updateCustomer,
    deleteCustomer,
    savePurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder
  };
});