<template>
  <section class="container-fluid p-4 policy-notes-page">
    <div class="notes-toolbar d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <div class="eyebrow mb-2"><i class="bi bi-file-earmark-text me-1"></i>{{ text.settings }}</div>
        <h1 class="h3 fw-bold mb-1">{{ text.title }}</h1>
        <p class="text-muted mb-0">{{ text.description }}</p>
      </div>
      <span class="read-only-badge"><i class="bi bi-eye me-1"></i>{{ text.readOnly }}</span>
    </div>

    <div v-if="loading" class="paper-state text-center text-muted"><span class="spinner-border spinner-border-sm me-2"></span>{{ text.loading }}</div>
    <div v-else-if="error" class="alert alert-danger border-0 shadow-sm">{{ error }}</div>
    <article v-else class="policy-paper">
      <header class="paper-header">
        <div class="paper-mark"><i class="bi bi-shield-check"></i></div>
        <div>
          <div class="paper-kicker">{{ text.companyPolicy }}</div>
          <h2>{{ text.title }}</h2>
          <p>{{ text.paperIntro }}</p>
        </div>
      </header>
      <div class="paper-rule"></div>
      <div class="paper-body" v-if="notes">
        <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
      </div>
      <div v-else class="paper-empty">
        <i class="bi bi-journal-x"></i>
        <strong>{{ text.emptyTitle }}</strong>
        <span>{{ text.emptyDescription }}</span>
      </div>
      <footer class="paper-footer">
        <span>{{ text.footer }}</span>
        <span>{{ text.readOnly }}</span>
      </footer>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';

const language = useLanguageStore();
const loading = ref(true);
const error = ref('');
const notes = ref('');

const text = computed(() => language.isKhmer ? {
  settings: 'ការកំណត់ប្រព័ន្ធ', title: 'កំណត់ត្រាគោលការណ៍', description: 'ឯកសារគោលការណ៍របស់ក្រុមហ៊ុនសម្រាប់បុគ្គលិកអាន។', readOnly: 'មើលតែប៉ុណ្ណោះ', loading: 'កំពុងទាញយកគោលការណ៍...', companyPolicy: 'ឯកសារគោលការណ៍ក្រុមហ៊ុន', paperIntro: 'សូមអាន និងអនុវត្តតាមគោលការណ៍ដែលបានកំណត់ដោយអ្នកគ្រប់គ្រង។', emptyTitle: 'មិនទាន់មានកំណត់ត្រាគោលការណ៍', emptyDescription: 'អ្នកគ្រប់គ្រងមិនទាន់បានបន្ថែមកំណត់ត្រានៅឡើយទេ។', footer: 'ឯកសារផ្ទៃក្នុង • សម្រាប់បុគ្គលិក'
} : {
  settings: 'System Settings', title: 'Policy Notes', description: 'Company policy document for staff reference.', readOnly: 'Read only', loading: 'Loading policy notes...', companyPolicy: 'Company Policy Document', paperIntro: 'Please read and follow the policies established by management.', emptyTitle: 'No policy notes yet', emptyDescription: 'An administrator has not added policy notes yet.', footer: 'Internal document • Staff reference'
});

const paragraphs = computed(() => notes.value.split(/\r?\n+/).map((paragraph) => paragraph.trim()).filter(Boolean));

async function loadNotes() {
  loading.value = true;
  error.value = '';
  try {
    const result = await api.policyNotes();
    notes.value = result.notes || '';
  } catch (requestError) {
    error.value = requestError.message || (language.isKhmer ? 'មិនអាចទាញយកគោលការណ៍បានទេ។' : 'Unable to load policy notes.');
  } finally {
    loading.value = false;
  }
}

onMounted(loadNotes);
</script>

<style scoped>
.policy-notes-page { min-height: 100vh; background: #f1f3f2; }
.notes-toolbar { max-width: 980px; margin: 0 auto; }
.read-only-badge { padding: .45rem .8rem; color: #526579; background: #e8eef0; border: 1px solid #d5e0e3; border-radius: 999px; font-size: .78rem; font-weight: 700; }
.policy-paper { max-width: 820px; min-height: 540px; margin: 0 auto; padding: clamp(2rem, 6vw, 4.5rem); color: #273842; background: #fffdf8; border: 1px solid #e4ded0; box-shadow: 0 14px 35px rgba(50, 61, 57, .1); }
.paper-header { display: flex; align-items: flex-start; gap: 1rem; }.paper-mark { width: 48px; height: 48px; flex: 0 0 48px; display: grid; place-items: center; color: #176b63; background: #e4f1ec; border-radius: 50%; font-size: 1.4rem; }.paper-kicker { color: #77837f; font-size: .72rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }.paper-header h2 { margin: .25rem 0 .35rem; color: #193943; font-family: Georgia, 'Times New Roman', serif; font-size: clamp(1.45rem, 3vw, 2rem); }.paper-header p { margin: 0; color: #71807e; font-size: .9rem; }.paper-rule { height: 1px; margin: 2rem 0; background: #d9d0bf; }.paper-body { min-height: 250px; font-family: Georgia, 'Times New Roman', serif; font-size: 1.03rem; line-height: 1.9; white-space: pre-wrap; }.paper-body p { margin: 0 0 1.2rem; }.paper-empty { min-height: 250px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .55rem; color: #89928f; text-align: center; }.paper-empty i { color: #b2b7af; font-size: 2.5rem; }.paper-empty strong { color: #5c6c6a; }.paper-empty span { font-size: .85rem; }.paper-footer { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2rem; padding-top: 1rem; color: #89928f; border-top: 1px solid #e5ddcf; font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; }.paper-state { max-width: 820px; margin: 4rem auto; padding: 4rem; background: #fff; border: 1px solid #e1e7e5; }
@media (max-width: 575.98px) { .policy-notes-page { padding: 1rem !important; }.policy-paper { padding: 1.5rem; }.paper-footer { flex-direction: column; }.paper-body { font-size: .98rem; } }
</style>
