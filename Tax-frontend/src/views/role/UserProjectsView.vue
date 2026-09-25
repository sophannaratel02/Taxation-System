<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Header -->
    <div class="d-flex justify-content-between align-items-end mb-4">
      <div>
        <div class="eyebrow mb-2">User workspace</div>
        <h1 class="h3 fw-bold mb-1">My Projects</h1>
        <p class="text-muted mb-0">Submit projects, documents and follow admin decisions.</p>
      </div>
      <button class="btn btn-primary" type="button" @click="showForm = !showForm">
        <i class="bi bi-plus-lg me-2" />{{ showForm ? 'Cancel' : 'New project' }}
      </button>
    </div>

    <!-- New Project Form Collapsible -->
    <form v-if="showForm" class="card border-0 shadow-sm p-4 mb-4" @submit.prevent="createProject">
      <h5 class="fw-bold mb-3">Submit New Project</h5>

      <div class="mb-3">
        <label class="form-label fw-semibold">Project title</label>
        <input v-model.trim="form.title" class="form-control" placeholder="e.g. ERP System Migration" required />
      </div>

      <div class="mb-3">
        <label class="form-label fw-semibold">Description</label>
        <textarea
          v-model="form.description"
          class="form-control"
          rows="3"
          placeholder="Briefly describe project goals, deliverables, and timeline"
        />
      </div>

      <div v-if="projectError" class="alert alert-danger py-2 mb-3">
        {{ projectError }}
      </div>

      <div class="d-flex gap-2">
        <button class="btn btn-success px-4" :disabled="saving">
          <span v-if="saving" class="spinner-border spinner-border-sm me-2" role="status" />
          {{ saving ? 'Submitting...' : 'Submit for approval' }}
        </button>
        <button type="button" class="btn btn-outline-secondary" @click="showForm = false">
          Cancel
        </button>
      </div>
    </form>

    <!-- File Attachment Section -->
    <form class="card border-0 shadow-sm p-4 mb-4" @submit.prevent="uploadFile">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="fw-bold mb-0">Attach Supporting Document</h6>
        <span v-if="uploadSuccess" class="text-success small fw-semibold">
          ✓ Document submitted successfully
        </span>
      </div>

      <div class="row g-3 align-items-end">
        <div class="col-md-5">
          <label class="form-label fw-semibold">Select project</label>
          <select v-model="fileForm.projectId" class="form-select" :disabled="!projects.length" required>
            <option value="" disabled>Choose an active project...</option>
            <option v-for="project in projects" :key="project.id" :value="project.id">
              {{ project.title }}
            </option>
          </select>
        </div>

        <div class="col-md-5">
          <label class="form-label fw-semibold">File or document name</label>
          <input
            v-model.trim="fileForm.fileName"
            class="form-control"
            placeholder="e.g. project-scope-v1.pdf"
            :disabled="!projects.length"
            required
          />
        </div>

        <div class="col-md-2">
          <button
            class="btn btn-outline-primary w-100"
            type="submit"
            :disabled="fileSaving || !projects.length"
          >
            <span v-if="fileSaving" class="spinner-border spinner-border-sm me-1" role="status" />
            {{ fileSaving ? 'Submitting...' : 'Submit file' }}
          </button>
        </div>
      </div>

      <div v-if="fileError" class="alert alert-danger py-2 mt-3 mb-0">
        {{ fileError }}
      </div>
    </form>

    <!-- Project List Table -->
    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Project</th>
              <th>Description</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Decision / Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="project in projects" :key="project.id">
              <td class="fw-semibold">{{ project.title }}</td>
              <td class="text-muted">{{ project.description || '-' }}</td>
              <td>
                <span class="badge" :class="statusClass(project.status)">
                  {{ project.status || 'Pending' }}
                </span>
              </td>
              <td>{{ formatDate(project.created_at) }}</td>
              <td>
                <span :class="project.rejection_reason ? 'text-danger fw-semibold' : 'text-muted'">
                  {{ project.rejection_reason || '-' }}
                </span>
              </td>
            </tr>
            <tr v-if="!projects.length">
              <td colspan="5" class="text-center text-muted py-5">
                No projects submitted yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api } from '@/services/api';

const projects = ref([]);
const showForm = ref(false);
const saving = ref(false);
const fileSaving = ref(false);

const projectError = ref('');
const fileError = ref('');
const uploadSuccess = ref(false);

const form = reactive({
  title: '',
  description: ''
});

const fileForm = reactive({
  projectId: '',
  fileName: ''
});

const load = async () => {
  try {
    const data = await api.projects();
    projects.value = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
};

async function createProject() {
  saving.value = true;
  projectError.value = '';
  try {
    await api.saveProject(form);
    Object.assign(form, { title: '', description: '' });
    showForm.value = false;
    await load();
  } catch (err) {
    projectError.value = err?.response?.data?.message || err.message || 'Failed to submit project.';
  } finally {
    saving.value = false;
  }
}

async function uploadFile() {
  fileSaving.value = true;
  fileError.value = '';
  uploadSuccess.value = false;
  try {
    await api.saveProjectFile(fileForm.projectId, { fileName: fileForm.fileName });
    Object.assign(fileForm, { projectId: '', fileName: '' });
    uploadSuccess.value = true;
    setTimeout(() => {
      uploadSuccess.value = false;
    }, 4000);
  } catch (err) {
    fileError.value = err?.response?.data?.message || err.message || 'Failed to upload document.';
  } finally {
    fileSaving.value = false;
  }
}

function statusClass(status) {
  switch (status?.toLowerCase()) {
    case 'approved':
      return 'text-bg-success';
    case 'rejected':
      return 'text-bg-danger';
    case 'pending':
    default:
      return 'text-bg-warning';
  }
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

onMounted(load);
</script>