import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/services/api';

export const useTaxStore = defineStore('tax', () => {
  const settings = ref({ companyName: 'Axis Investment Consulting', address: '', phone: '', baseCurrency: 'USD', exchangeRate: 4000, vatRate: 10, branch: 'Head Quarter', policy: { approval: {}, access: {}, inventory: {}, sales: {}, documents: {} } });
  const items = ref([]); const vendors = ref([]); const customers = ref([]); const invoices = ref([]); const transactions = ref([]); const purchaseOrders = ref([]); const cart = ref([]); const loading = ref(false); const error = ref('');
  const today = new Date().toISOString().slice(0, 10);
  const todayInvoices = computed(() => invoices.value.filter((invoice) => invoice.date === today));
  const todaySales = computed(() => todayInvoices.value.reduce((sum, invoice) => sum + Number(invoice.total), 0));
  const totalVat = computed(() => todayInvoices.value.reduce((sum, invoice) => sum + Number(invoice.vat), 0));
  const inventoryValue = computed(() => items.value.reduce((sum, item) => sum + Number(item.qtyOnHand) * Number(item.averageCost), 0));
  const retailValue = computed(() => items.value.reduce((sum, item) => sum + Number(item.qtyOnHand) * Number(item.retailPrice), 0));
  const lowStockItems = computed(() => items.value.filter((item) => Number(item.qtyOnHand) <= Number(item.reorderQty)));
  const cartNetSale = computed(() => cart.value.reduce((sum, line) => sum + (Number(line.unitPrice) * Number(line.qty)) - Number(line.discount || 0), 0));
  const cartVat = computed(() => cartNetSale.value * (Number(settings.value.vatRate) / 100));
  const cartTotal = computed(() => cartNetSale.value + cartVat.value);

  async function initialize() {
    loading.value = true; error.value = '';
    try { if (!localStorage.getItem('tax_token')) { const session = await api.login('admin', 'admin123'); localStorage.setItem('tax_token', session.token); localStorage.setItem('tax_user', JSON.stringify(session.user)); } const [remoteSettings, remoteItems, remoteVendors, remoteCustomers, remoteInvoices, remoteTransactions, remoteOrders] = await Promise.all([api.settings(), api.items(), api.vendors(), api.customers(), api.invoices(), api.transactions(), api.purchaseOrders()]); settings.value = { ...settings.value, ...remoteSettings }; items.value = remoteItems; vendors.value = remoteVendors; customers.value = remoteCustomers; invoices.value = remoteInvoices; transactions.value = remoteTransactions; purchaseOrders.value = remoteOrders; }
    catch (requestError) { error.value = requestError.message; }
    finally { loading.value = false; }
  }
  function addToCart(item) { const existing = cart.value.find((line) => line.itemId === item.id); if (existing) existing.qty += 1; else cart.value.push({ itemId: item.id, barcode: item.barcode, nameKh: item.nameKh, nameEn: item.nameEn, unit: item.baseUnit, unitPrice: item.retailPrice, qty: 1, discount: 0, available: item.qtyOnHand }); }
  function removeFromCart(index) { cart.value.splice(index, 1); }
  function clearCart() { cart.value = []; }
  async function completeSale({ customerId, customerName = 'Walk-in customer', paymentMethod = 'cash', receivedUSD = 0, receivedKHR = 0, paymentReference = '', khqrPayload = '', managerPin = '' }) { const invoice = await api.completeSale({ customerId, customerName, paymentMethod, receivedUSD, receivedKHR, paymentReference, khqrPayload, managerPin, vatRate: settings.value.vatRate, exchangeRate: settings.value.exchangeRate, khqrMerchantId: settings.value.khqrMerchantId, branch: settings.value.branch, lines: cart.value.map((line) => ({ itemId: line.itemId, unit: line.unit, qty: line.qty, discount: line.discount })) }); await initialize(); clearCart(); return invoice; }
  async function adjustStock(itemId, quantity, note) { await api.adjustStock({ itemId, quantity, note, branch: settings.value.branch }); await initialize(); }
  async function fetchInvoice(identifier) { return api.invoice(identifier); }
  async function saveItem(payload) { const item = await api.saveItem(payload); items.value.push(item); return item; }
  async function updateItem(id, payload) { const item = await api.updateItem(id, payload); const index = items.value.findIndex((entry) => entry.id === id); if (index !== -1) items.value[index] = item; return item; }
  async function deleteItem(id) { await api.deleteItem(id); items.value = items.value.filter((item) => item.id !== id); }
  async function saveSettings(payload) { const saved = await api.saveSettings(payload); settings.value = { ...settings.value, ...saved }; return saved; }
  async function saveVendor(payload) { const vendor = await api.saveVendor(payload); vendors.value.push(vendor); return vendor; }
  async function updateVendor(id, payload) { const vendor = await api.updateVendor(id, payload); const index = vendors.value.findIndex((entry) => entry.id === id); if (index !== -1) vendors.value[index] = vendor; return vendor; }
  async function deleteVendor(id) { await api.deleteVendor(id); vendors.value = vendors.value.filter((vendor) => vendor.id !== id); }
  async function saveCustomer(payload) { const customer = await api.saveCustomer(payload); customers.value.push(customer); return customer; }
  async function updateCustomer(id, payload) { const customer = await api.updateCustomer(id, payload); const index = customers.value.findIndex((entry) => entry.id === id); if (index !== -1) customers.value[index] = customer; return customer; }
  async function deleteCustomer(id) { await api.deleteCustomer(id); customers.value = customers.value.filter((customer) => customer.id !== id); }
  async function savePurchaseOrder(payload) { const order = await api.savePurchaseOrder(payload); purchaseOrders.value.unshift(order); return order; }
  async function updatePurchaseOrder(id, payload) { const order = await api.updatePurchaseOrder(id, payload); await initialize(); return order; }
  async function deletePurchaseOrder(id) { await api.deletePurchaseOrder(id); purchaseOrders.value = purchaseOrders.value.filter((order) => order.id !== id); }
  function calculateAverageCost(item, purchasedQty, purchaseCost) { const onHand = Math.max(0, item.qtyOnHand); const currentCost = onHand > 0 ? item.averageCost : purchaseCost; const totalQty = onHand + purchasedQty; return totalQty > 0 ? ((onHand * currentCost) + (purchasedQty * purchaseCost)) / totalQty : purchaseCost; }
  return { settings, items, vendors, customers, invoices, transactions, purchaseOrders, cart, loading, error, todayInvoices, todaySales, totalVat, inventoryValue, retailValue, lowStockItems, cartNetSale, cartVat, cartTotal, initialize, addToCart, removeFromCart, clearCart, completeSale, adjustStock, fetchInvoice, saveItem, updateItem, deleteItem, saveSettings, saveVendor, updateVendor, deleteVendor, saveCustomer, updateCustomer, deleteCustomer, savePurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, calculateAverageCost };
});
