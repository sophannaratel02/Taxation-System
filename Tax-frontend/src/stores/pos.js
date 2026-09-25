import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export const usePosStore = defineStore('pos', () => {
  const cart = ref([]);
  const exchangeRate = ref(4000);
  const paymentMethod = ref('cash');
  const amountTenderedUSD = ref(0);
  const amountTenderedKHR = ref(0);

  const netSale = computed(() => cart.value.reduce((total, item) => total + item.unitPrice * item.qty - (item.discount || 0), 0));
  const totalVat = computed(() => netSale.value * 0.1);
  const grandTotal = computed(() => netSale.value + totalVat.value);
  const grandTotalKHR = computed(() => Math.round(grandTotal.value * exchangeRate.value));
  const changeDueUSD = computed(() => Math.max(0, amountTenderedUSD.value + amountTenderedKHR.value / exchangeRate.value - grandTotal.value));

  function addToCart(item) {
    const existing = cart.value.find((entry) => entry.barcode === item.barcode);
    if (existing) {
      existing.qty += 1;
      return;
    }
    cart.value.push({
      id: item.id,
      barcode: item.barcode,
      nameEn: item.name_en || item.nameEn,
      nameKh: item.name_kh || item.nameKh,
      uomName: item.base_unit_name || item.uomName || 'Unit',
      unitPrice: Number(item.base_retail_price || item.unitPrice || 0),
      qty: 1,
      discount: 0,
    });
  }

  function removeItem(index) {
    cart.value.splice(index, 1);
  }

  function clearCart() {
    cart.value = [];
    amountTenderedUSD.value = 0;
    amountTenderedKHR.value = 0;
  }

  return { cart, exchangeRate, paymentMethod, amountTenderedUSD, amountTenderedKHR, netSale, totalVat, grandTotal, grandTotalKHR, changeDueUSD, addToCart, removeItem, clearCart };
});
