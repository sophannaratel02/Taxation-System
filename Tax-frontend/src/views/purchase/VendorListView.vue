<template>
  <ModulePage
    :title="pageText.title"
    :description="pageText.description"
    :action-label="pageText.actionLabel"
    :form-modal="true"
    :form-icon="'bi bi-building-add'"
    :form-eyebrow="pageText.formEyebrow"
    :form-description="pageText.formDescription"
    :required-fields-text="pageText.requiredFieldsText"
    :form-step-text="pageText.formStepText"
    :secure-form-text="pageText.secureFormText"
    :save-button-text="pageText.saveButtonText"
    :edit-label="pageText.editLabel"
    :edit-confirm-title="pageText.editConfirmTitle"
    :edit-confirm-message="pageText.editConfirmMessage"
    :delete-confirm-message="pageText.deleteConfirmMessage"
    :delete-success-message="pageText.deleteSuccessMessage"
    :table-title="pageText.tableTitle"
    :headings="headings"
    :rows="rows"
    :row-ids="rowIds"
    :form-values="formValues"
    :row-actions="true"
    :form-fields="fields"
    :save-action="tax.saveVendor"
    :update-action="tax.updateVendor"
    :delete-action="tax.deleteVendor"
  />
</template>

<script setup>
import { computed } from 'vue';
import ModulePage from '@/components/ModulePage.vue';
import { useTaxStore } from '@/stores/tax';
import { useLanguageStore } from '@/stores/language';

const tax = useTaxStore();
const language = useLanguageStore();

const pageText = computed(() => {
  const isKhmer = language.isKhmer;

  return {
    title: isKhmer ? 'អ្នកផ្គត់ផ្គង់' : language.t('vendors'),
    description: language.t('manageSupplier'),
    actionLabel: language.t('addVendor'),
    formEyebrow: isKhmer ? 'ព័ត៌មានអ្នកផ្គត់ផ្គង់' : 'SUPPLIER DIRECTORY',
    formDescription: isKhmer
      ? 'បញ្ចូលព័ត៌មានក្រុមហ៊ុន និងព័ត៌មានទំនាក់ទំនងអ្នកផ្គត់ផ្គង់។'
      : 'Add the company and contact details you use to manage this supplier.',
    requiredFieldsText: isKhmer ? 'តម្រូវឱ្យបំពេញ' : 'Required fields',
    formStepText: isKhmer ? 'ព័ត៌មានមានសុវត្ថិភាព' : 'Secure information',
    secureFormText: isKhmer
      ? 'ព័ត៌មានអ្នកផ្គត់ផ្គង់ត្រូវបានរក្សាទុកដោយសុវត្ថិភាព។'
      : 'Supplier details are stored securely.',
    saveButtonText: isKhmer ? 'រក្សាទុកអ្នកផ្គត់ផ្គង់' : 'Save vendor',
    editLabel: isKhmer ? 'កែប្រែអ្នកផ្គត់ផ្គង់' : 'Edit vendor',
    editConfirmTitle: isKhmer ? 'កែប្រែអ្នកផ្គត់ផ្គង់' : 'Edit vendor',
    editConfirmMessage: isKhmer
      ? 'តើអ្នកចង់កែប្រែព័ត៌មានអ្នកផ្គត់ផ្គង់នេះមែនទេ?'
      : 'Update this vendor profile before continuing?',
    deleteConfirmMessage: isKhmer
      ? 'តើអ្នកចង់លុបអ្នកផ្គត់ផ្គង់នេះមែនទេ?'
      : 'Archive this vendor? Existing purchase history will be retained.',
    deleteSuccessMessage: isKhmer
      ? 'បានរក្សាទុកអ្នកផ្គត់ផ្គង់ជាបណ្ណសារហើយ។'
      : 'Vendor archived successfully.',
    tableTitle: language.t('vendorDirectory')
  };
});

// មាន ៦ ជួរឈរ (Columns)
const headings = computed(() => {
  const isKhmer = language.isKhmer;
  return [
    isKhmer ? 'ឈ្មោះក្រុមហ៊ុន' : 'Company name',
    isKhmer ? 'ឈ្មោះអ្នកទំនាក់ទំនង' : 'Contact name',
    isKhmer ? 'លេខអត្តសញ្ញាណកម្មសារពើពន្ធ (TIN)' : 'Tax Identification Number (TIN)',
    isKhmer ? 'ទូរស័ព្ទ' : 'Telephone',
    isKhmer ? 'អ៊ីមែល' : 'Email',
    isKhmer ? 'អាសយដ្ឋាន' : 'Address'
  ];
});

const fields = computed(() => {
  const isKhmer = language.isKhmer;
  const sections = {
    company: isKhmer ? 'ព័ត៌មានក្រុមហ៊ុន' : 'Company information',
    contact: isKhmer ? 'ព័ត៌មានទំនាក់ទំនង' : 'Contact information'
  };

  return [
    {
      key: 'name',
      label: isKhmer ? 'ឈ្មោះក្រុមហ៊ុន' : 'Company name',
      required: true,
      maxlength: 160,
      autocomplete: 'organization',
      section: sections.company,
      class: 'col-md-6'
    },
    {
      key: 'contactName',
      label: isKhmer ? 'ឈ្មោះអ្នកទំនាក់ទំនង' : 'Contact name',
      required: true,
      editRequired: false,
      maxlength: 180,
      autocomplete: 'name',
      section: sections.company,
      class: 'col-md-6'
    },
    {
      key: 'vatTin',
      label: isKhmer ? 'លេខអត្តសញ្ញាណកម្មសារពើពន្ធ (TIN)' : 'Tax Identification Number (TIN)',
      required: true,
      editRequired: false,
      maxlength: 50,
      section: sections.company,
      class: 'col-md-6'
    },
    {
      key: 'address',
      label: isKhmer ? 'អាសយដ្ឋាន' : 'Address',
      type: 'textarea',
      required: true,
      editRequired: false,
      maxlength: 5000,
      section: sections.company,
      class: 'col-12'
    },
    {
      key: 'phone',
      label: isKhmer ? 'ទូរស័ព្ទ' : 'Telephone',
      type: 'tel',
      required: true,
      editRequired: false,
      maxlength: 60,
      autocomplete: 'tel',
      section: sections.contact,
      class: 'col-md-6'
    },
    {
      key: 'email',
      label: isKhmer ? 'អ៊ីមែល' : 'Email',
      type: 'email',
      required: true,
      editRequired: false,
      maxlength: 255,
      autocomplete: 'email',
      section: sections.contact,
      class: 'col-md-6'
    }
  ];
});

// កែសម្រួលឱ្យត្រូវគ្នានឹង ៦ ជួរឈររបស់ headings
const rows = computed(() =>
  tax.vendors.map((vendor) => [
    vendor.name,
    vendor.contactName || '-',
    vendor.vatTin || '-',
    vendor.phone || '-',
    vendor.email || '-',
    vendor.address || '-'
  ])
);

const rowIds = computed(() => tax.vendors.map((vendor) => vendor.id));

const formValues = computed(() =>
  tax.vendors.map((vendor) => ({
    name: vendor.name,
    contactName: vendor.contactName || '',
    vatTin: vendor.vatTin || '',
    address: vendor.address || '',
    phone: vendor.phone || '',
    email: vendor.email || '',
   
  }))
);
</script>