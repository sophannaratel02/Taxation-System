<template>
  <section class="container-fluid p-4 page-canvas">
    <header class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
      <div>
        <div class="eyebrow mb-2">{{ language.isKhmer ? 'កន្លែងធ្វើការរបស់ខ្ញុំ' : 'MY WORKSPACE' }}</div>
        <h1 class="h3 fw-bold mb-1">{{ language.isKhmer ? 'ឯកសាររបស់ខ្ញុំ' : 'My Files' }}</h1>
        <p class="text-muted mb-0">{{ language.isKhmer ? 'បញ្ជូនឯកសារទៅអ្នកគ្រប់គ្រងពិនិត្យ និងអនុម័ត។' : 'Upload documents for an administrator to review and approve.' }}</p>
      </div>
    </header>

    <form class="card border-0 shadow-sm p-4 mb-4" @submit.prevent="uploadFile">
      <label class="form-label fw-semibold" for="document-file">{{ language.isKhmer ? 'ជ្រើសរើសឯកសារ' : 'Choose a document' }}</label>
      <div class="d-flex flex-column flex-sm-row gap-3 align-items-sm-end">
        <input
          id="document-file"
          ref="fileInput"
          class="form-control"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx,.xls,.xlsx"
          required
          @change="selectFile"
        />
        <button class="btn btn-primary flex-shrink-0" type="submit" :disabled="uploading || !selectedFile">
          <span v-if="uploading" class="spinner-border spinner-border-sm me-2" role="status"></span>
          <i v-else class="bi bi-cloud-arrow-up me-2" aria-hidden="true"></i>
          {{ uploading ? (language.isKhmer ? 'កំពុងបញ្ជូន...' : 'Uploading...') : (language.isKhmer ? 'បញ្ជូនសម្រាប់អនុម័ត' : 'Submit for approval') }}
        </button>
      </div>
      <small class="form-text mt-2">{{ language.isKhmer ? 'PDF, រូបភាព, Word ឬ Excel, ទំហំអតិបរមា 10 MB។' : 'PDF, image, text, Word, or Excel documents. Maximum size: 10 MB.' }}</small>
      <div v-if="error" class="alert alert-danger py-2 mt-3 mb-0" role="alert">{{ error }}</div>
      <div v-if="success" class="alert alert-success py-2 mt-3 mb-0" role="status">{{ success }}</div>
    </form>

    <section class="card border-0 shadow-sm overflow-hidden">
      <div class="card-header bg-white d-flex justify-content-between align-items-center py-3 px-4">
        <div>
          <strong class="d-block">{{ language.isKhmer ? 'ឯកសារដែលបានបញ្ជូន' : 'Submitted documents' }}</strong>
          <small class="text-muted">{{ language.isKhmer ? 'ស្ថានភាពអនុម័តរបស់ឯកសាររបស់អ្នក' : 'Track review status for your uploads.' }}</small>
        </div>
        <button class="btn btn-sm btn-light border" type="button" :disabled="loading" :aria-label="language.isKhmer ? 'ធ្វើបច្ចុប្បន្នភាព' : 'Refresh documents'" @click="loadFiles">
          <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
        </button>
      </div>
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-4">{{ language.isKhmer ? 'ឯកសារ' : 'Document' }}</th>
              <th>{{ language.isKhmer ? 'គម្រោង' : 'Project' }}</th>
              <th>{{ language.isKhmer ? 'ស្ថានភាព' : 'Status' }}</th>
              <th>{{ language.isKhmer ? 'មូលហេតុ' : 'Review note' }}</th>
              <th class="text-end pe-4">{{ language.isKhmer ? 'បញ្ជូននៅ' : 'Submitted' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in files" :key="file.id">
              <td class="ps-4">
                <button class="btn btn-link p-0 text-decoration-none fw-semibold text-start" type="button" @click="download(file)">
                  <i class="bi bi-download me-2" aria-hidden="true"></i>{{ file.file_name }}
                </button>
                <small v-if="file.file_size" class="d-block text-muted">{{ formatSize(file.file_size) }}</small>
              </td>
              <td>{{ file.project_title || '—' }}</td>
              <td><span class="badge" :class="statusClass(file.status)">{{ file.status || 'Pending Approval' }}</span></td>
              <td :class="file.rejection_reason ? 'text-danger' : 'text-muted'">{{ file.rejection_reason || '—' }}</td>
              <td class="text-end pe-4 text-nowrap">{{ formatDate(file.created_at) }}</td>
            </tr>
            <tr v-if="!loading && !files.length">
              <td colspan="5" class="text-center text-muted py-5">{{ language.isKhmer ? 'មិនទាន់មានឯកសារដែលបានបញ្ជូនទេ។' : 'You have not submitted any documents yet.' }}</td>
            </tr>
            <tr v-if="loading">
              <td colspan="5" class="text-center text-muted py-5"><span class="spinner-border spinner-border-sm me-2" role="status"></span>{{ language.isKhmer ? 'កំពុងផ្ទុក...' : 'Loading documents...' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';

const language = useLanguageStore();
const files = ref([]);
const fileInput = ref(null);
const selectedFile = ref(null);
const loading = ref(false);
const uploading = ref(false);
const error = ref('');
const success = ref('');

function selectFile(event) {
  selectedFile.value = event.target.files?.[0] || null;
  error.value = '';
  success.value = '';
}

async function loadFiles() {
  loading.value = true;
  error.value = '';
  try {
    files.value = await api.userFiles();
  } catch (requestError) {
    error.value = requestError.message || 'Unable to load your documents.';
  } finally {
    loading.value = false;
  }
}

async function uploadFile() {
  if (!selectedFile.value) return;
  uploading.value = true;
  error.value = '';
  success.value = '';
  try {
    await api.uploadUserFile(selectedFile.value);
    success.value = language.isKhmer ? 'ឯកសារបានបញ្ជូនទៅរង់ចាំការអនុម័ត។' : 'Document uploaded and sent for admin approval.';
    selectedFile.value = null;
    if (fileInput.value) fileInput.value.value = '';
    await loadFiles();
  } catch (requestError) {
    error.value = requestError.message || 'Unable to upload the document.';
  } finally {
    uploading.value = false;
  }
}

async function download(file) {
  error.value = '';
  try {
    await api.downloadFile(file.id);
  } catch (requestError) {
    error.value = requestError.message || 'Unable to download the document.';
  }
}

function statusClass(status) {
  if (status === 'Approved') return 'text-bg-success';
  if (status === 'Rejected') return 'text-bg-danger';
  return 'text-bg-warning';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatSize(value) {
  const size = Number(value || 0);
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

onMounted(loadFiles);
</script>
