import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/services/api';

export const useFixedAssetsStore = defineStore('fixedAssets', () => {
  const assets = ref([]);
  const classes = ref([]);
  const accounts = ref([]);
  const vendors = ref([]);
  const depreciation = ref([]);
  const loading = ref(false);
  const error = ref('');

  function reset() {
    assets.value = [];
    classes.value = [];
    accounts.value = [];
    vendors.value = [];
    depreciation.value = [];
    loading.value = false;
    error.value = '';
  }

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      const [assetRows, classRows, accountRows, vendorRows, depreciationRows] = await Promise.all([
        api.fixedAssets(),
        api.fixedAssetClasses(),
        api.accountingAccounts(),
        api.vendors(),
        api.fixedAssetDepreciation(),
      ]);
      assets.value = assetRows;
      classes.value = classRows;
      accounts.value = accountRows;
      vendors.value = vendorRows;
      depreciation.value = depreciationRows;
    } catch (requestError) {
      error.value = requestError.message;
      throw requestError;
    } finally {
      loading.value = false;
    }
  }

  async function saveAsset(payload) {
    const asset = await api.saveFixedAsset(payload);
    await load();
    return asset;
  }

  async function updateClass(id, payload) {
    const assetClass = await api.updateFixedAssetClass(id, payload);
    await load();
    return assetClass;
  }

  async function createClass(payload) {
    const assetClass = await api.createFixedAssetClass(payload);
    await load();
    return assetClass;
  }

  async function runDepreciation(periodEnd) {
    const result = await api.runFixedAssetDepreciation(periodEnd);
    await load();
    return result;
  }

  async function disposeAsset(id, payload) {
    const result = await api.disposeFixedAsset(id, payload);
    await load();
    return result;
  }

  return {
    assets,
    classes,
    accounts,
    vendors,
    depreciation,
    loading,
    error,
    load,
    saveAsset,
    createClass,
    updateClass,
    runDepreciation,
    disposeAsset,
    reset,
  };
});
