<template>
  <ModulePage
    :title="language.isKhmer ? 'អ្នកផ្គត់ផ្គង់' : language.t('vendors')"
    :description="language.t('manageSupplier')"
    :action-label="language.t('addVendor')"
    :edit-label="language.isKhmer ? 'កែប្រែអ្នកផ្គត់ផ្គង់' : 'Edit vendor'"
    :delete-confirm-message="language.isKhmer ? 'តើអ្នកចង់លុបអ្នកផ្គត់ផ្គង់នេះមែនទេ?' : 'Archive this vendor? Existing purchase history will be retained.'"
    :delete-success-message="language.isKhmer ? 'បានរក្សាទុកអ្នកផ្គត់ផ្គង់ជាបណ្ណសារហើយ។' : 'Vendor archived successfully.'"
    :table-title="language.t('vendorDirectory')"
    :headings="[language.t('vendor'), language.t('contact'), language.t('creditLimit'), language.t('balance'), language.t('note')]"
    :rows="rows"
    :row-ids="rowIds"
    :form-values="formValues"
    :row-actions="true"
    :form-fields="fields"
    :save-action="saveVendor"
    :update-action="updateVendor"
    :delete-action="deleteVendor"
  />
</template>

<script setup>
import { computed } from 'vue';
import ModulePage from '@/components/ModulePage.vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();

const fields = computed(() => [
  { key: 'name', label: 'Vendor name', required: true, class: 'col-md-6' },
  { key: 'phone', label: 'Phone', class: 'col-md-6' },
  { key: 'creditLimit', label: 'Credit limit', type: 'number', min: 0, step: '0.01', default: 0, class: 'col-md-6' },
  { key: 'vatTin', label: 'VAT TIN', class: 'col-md-6' },
  { key: 'note', label: language.t('note'), type: 'textarea', required: false, class: 'col-md-6' }
]);

const rows = computed(() =>
  tax.vendors.map((vendor) => [
    vendor.name,
    vendor.phone || '-',
    `$${Number(vendor.creditLimit || 0).toFixed(2)}`,
    `$${Number(vendor.balance || 0).toFixed(2)}`,
    vendor.note || '-'
  ])
);

const saveVendor = (payload) => tax.saveVendor(payload);
const updateVendor = (id, payload) => tax.updateVendor(id, payload);
const deleteVendor = (id) => tax.deleteVendor(id);
const rowIds = computed(() => tax.vendors.map((vendor) => vendor.id));
const formValues = computed(() => tax.vendors.map((vendor) => ({ name: vendor.name, phone: vendor.phone || '', creditLimit: vendor.creditLimit || 0, vatTin: vendor.vatTin || '', note: vendor.note || '' })));
</script>