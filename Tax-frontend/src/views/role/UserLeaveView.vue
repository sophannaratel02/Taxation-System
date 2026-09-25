<template>
  <section class="container-fluid p-4 page-canvas leave-page">
    <!-- Executive Ambient Hero -->
    <div class="leave-hero p-4 mb-4 rounded-4 shadow-sm bg-white border position-relative overflow-hidden">
      <div class="hero-glow"></div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 position-relative z-1">
        <div>
          <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-primary-subtle text-primary small fw-semibold mb-2">
            <i class="bi bi-calendar2-check-fill"></i>
            <span>{{ language.t('userWorkspace') }}</span>
            <span class="text-muted">·</span>
            <span>HR Leave Portal</span>
          </div>
          <h1 class="h3 fw-bold text-dark mb-1 tracking-tight">
            {{ language.t('leaveRequests') }}
          </h1>
          <p class="text-muted mb-0">
            {{ language.isKhmer 
              ? 'ដាក់ពាក្យស្នើសុំច្បាប់ឈប់សម្រាក និងតាមដានស្ថានភាពអនុម័តក្នុងប្រព័ន្ធ។' 
              : 'Submit operational leave requests and monitor administrative approval statuses.' 
            }}
          </p>
        </div>

        <button
          class="btn btn-outline-primary bg-white px-4 py-2 rounded-3 shadow-xs d-inline-flex align-items-center"
          type="button"
          :disabled="loading"
          @click="load"
        >
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status"></span>
          <i v-else class="bi bi-arrow-clockwise me-2"></i>
          {{ language.isKhmer ? 'ធ្វើបច្ចុប្បន្នភាព' : 'Refresh' }}
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <div 
      v-if="error" 
      class="alert alert-danger alert-dismissible fade show mb-4 rounded-3 shadow-sm d-flex align-items-center" 
      role="alert"
    >
      <i class="bi bi-exclamation-triangle-fill me-2 fs-5 flex-shrink-0"></i>
      <div>{{ error }}</div>
      <button 
        type="button" 
        class="btn-close ms-auto shadow-none" 
        aria-label="Close" 
        @click="error = ''"
      />
    </div>

    <!-- KPI Metric Cards -->
    <div class="row g-3 mb-4">
      <div v-for="stat in leaveStats" :key="stat.label" class="col-sm-6 col-xl-3">
        <div class="card metric-card border-0 shadow-sm h-100 rounded-4">
          <div class="card-body p-3 d-flex align-items-center gap-3">
            <div class="metric-icon-box rounded-3" :class="stat.bg">
              <i :class="[stat.icon, stat.tone, 'fs-4']"></i>
            </div>
            <div>
              <span class="small text-muted fw-semibold text-uppercase tracking-wider d-block">
                {{ stat.label }}
              </span>
              <strong class="fs-4 text-dark metric-number">{{ stat.value }}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Grid: Request Form + History Table -->
    <div class="row g-4">
      <!-- 1. Left: Leave Submission Card (5 Cols) -->
      <div class="col-xl-5">
        <form class="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white" @submit.prevent="submit">
          <div class="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
            <div class="form-title-icon bg-primary-subtle text-primary rounded-3">
              <i class="bi bi-send-plus"></i>
            </div>
            <div>
              <h6 class="fw-bold mb-0 text-dark">
                {{ language.isKhmer ? 'បែបបទស្នើសុំច្បាប់' : 'New Leave Application' }}
              </h6>
              <small class="text-muted">
                {{ language.isKhmer ? 'បំពេញកាលបរិច្ឆេទ និងមូលហេតុច្បាស់លាស់' : 'Provide dates and operational justification' }}
              </small>
            </div>
          </div>

          <div class="row g-3 mb-3">
            <!-- Start Date -->
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-secondary">
                {{ language.t('startDate') }} <span class="text-danger">*</span>
              </label>
              <div class="input-group">
                <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-calendar-event"></i></span>
                <input
                  v-model="form.startDate"
                  type="date"
                  class="form-control border-start-0"
                  :max="form.endDate || undefined"
                  required
                />
              </div>
            </div>

            <!-- End Date -->
            <div class="col-md-6">
              <label class="form-label small fw-semibold text-secondary">
                {{ language.t('endDate') }} <span class="text-danger">*</span>
              </label>
              <div class="input-group">
                <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-calendar-check"></i></span>
                <input
                  v-model="form.endDate"
                  type="date"
                  class="form-control border-start-0"
                  :min="form.startDate || undefined"
                  required
                />
              </div>
            </div>
          </div>

          <!-- Calculated Duration Preview -->
          <div v-if="form.startDate && form.endDate" class="p-3 mb-3 bg-light rounded-3 border d-flex justify-content-between align-items-center">
            <div>
              <small class="text-muted d-block">{{ language.isKhmer ? 'រយៈពេលស្នើសុំសរុប' : 'Total Duration' }}</small>
              <strong class="text-dark font-monospace fs-6">{{ previewDays }}</strong>
            </div>
            <span class="badge rounded-pill bg-white text-primary border px-3 py-2">
              <i class="bi bi-clock-history me-1"></i>{{ language.isKhmer ? 'ថ្ងៃធ្វើការ' : 'Calendar Days' }}
            </span>
          </div>

          <!-- Reason Input -->
          <div class="mb-4">
            <label class="form-label small fw-semibold text-secondary">
              {{ language.t('reason') }} <span class="text-danger">*</span>
            </label>
            <textarea
              v-model.trim="form.reason"
              class="form-control mb-2"
              rows="3"
              :placeholder="language.isKhmer ? 'ឧ. ឈឺ, សម្រាកប្រចាំឆ្នាំ, កិច្ចការគ្រួសារ...' : 'e.g. Annual vacation, medical appointment, family obligation...'"
              required
            ></textarea>

            <!-- Quick Presets -->
            <div class="d-flex flex-wrap gap-1">
              <button
                v-for="preset in reasonPresets"
                :key="preset.en"
                type="button"
                class="btn btn-sm btn-light border small-preset"
                @click="form.reason = (language.isKhmer ? preset.kh : preset.en)"
              >
                {{ language.isKhmer ? preset.kh : preset.en }}
              </button>
            </div>
          </div>

          <!-- Submit Button -->
          <button
            class="btn btn-primary w-100 py-2 fw-semibold rounded-3 shadow-sm pulse-btn mt-auto"
            type="submit"
            :disabled="saving || !form.startDate || !form.endDate || !form.reason"
          >
            <span v-if="saving" class="spinner-border spinner-border-sm me-2" role="status"></span>
            <i v-else class="bi bi-check2-circle me-1"></i>
            {{ saving 
              ? (language.isKhmer ? 'កំពុងបញ្ជូន...' : language.t('submitting')) 
              : (language.isKhmer ? 'ដាក់ស្នើសុំច្បាប់' : language.t('submitLeave')) 
            }}
          </button>
        </form>
      </div>

      <!-- 2. Right: Requests History Table (7 Cols) -->
      <div class="col-xl-7">
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden h-100 bg-white">
          <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
            <div>
              <strong class="fs-6 text-dark d-block">
                {{ language.isKhmer ? 'ប្រវត្តិនៃការស្នើសុំច្បាប់' : 'Leave History & Authorizations' }}
              </strong>
              <small class="text-muted">
                {{ leaves.length }} {{ language.isKhmer ? 'កំណត់ត្រាសរុប' : 'total applications submitted' }}
              </small>
            </div>
            <span class="badge bg-light text-secondary border font-monospace">HR RECORDS</span>
          </div>

          <div class="table-responsive">
            <table class="table align-middle table-hover mb-0 modern-table">
              <thead class="table-light border-0">
                <tr>
                  <th class="ps-4">{{ language.t('dates') }}</th>
                  <th class="text-center">{{ language.t('days') }}</th>
                  <th>{{ language.t('reason') }}</th>
                  <th class="text-center">{{ language.t('status') }}</th>
                  <th class="pe-4">{{ language.isKhmer ? 'កំណត់ចំណាំរដ្ឋបាល' : 'Admin Remarks' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="leave in leaves" :key="leave.id">
                  <!-- Dates -->
                  <td class="ps-4 text-nowrap">
                    <div class="fw-semibold text-dark">
                      {{ formatDate(leave.start_date || leave.startDate) }}
                    </div>
                    <small class="text-muted d-flex align-items-center gap-1">
                      <i class="bi bi-arrow-right text-secondary"></i>
                      <span>{{ formatDate(leave.end_date || leave.endDate) }}</span>
                    </small>
                  </td>

                  <!-- Total Days -->
                  <td class="text-center">
                    <span class="badge text-bg-light border font-monospace px-2 py-1">
                      {{ calculateDays(leave.start_date || leave.startDate, leave.end_date || leave.endDate) }}
                    </span>
                  </td>

                  <!-- Reason -->
                  <td>
                    <span class="text-dark d-block text-truncate" style="max-width: 190px;" :title="leave.reason">
                      {{ leave.reason }}
                    </span>
                  </td>

                  <!-- Status Badge -->
                  <td class="text-center">
                    <span class="badge rounded-pill px-3 py-1 font-monospace" :class="getStatusBadge(leave.status)">
                      {{ formatStatus(leave.status) }}
                    </span>
                  </td>

                  <!-- Remarks / Rejection Reason -->
                  <td class="pe-4">
                    <span 
                      v-if="leave.rejection_reason || leave.rejectionReason" 
                      class="text-danger small d-flex align-items-center gap-1"
                      :title="leave.rejection_reason || leave.rejectionReason"
                    >
                      <i class="bi bi-info-circle-fill flex-shrink-0"></i>
                      <span class="text-truncate" style="max-width: 140px;">
                        {{ leave.rejection_reason || leave.rejectionReason }}
                      </span>
                    </span>
                    <span v-else class="text-muted small">—</span>
                  </td>
                </tr>

                <!-- Empty State -->
                <tr v-if="!leaves.length">
                  <td colspan="5" class="text-center text-muted py-5">
                    <div class="my-4">
                      <i class="bi bi-calendar2-x fs-1 text-secondary opacity-50 d-block mb-2"></i>
                      <h6 class="fw-bold text-dark">
                        {{ language.isKhmer ? 'មិនមានសំណើសុំច្បាប់ឡើយ' : language.t('noLeaveRequests') }}
                      </h6>
                      <p class="small text-muted mb-0">
                        {{ language.isKhmer ? 'រាល់សំណើដែលបានដាក់ស្នើនឹងបង្ហាញនៅក្នុងតារាងនេះ។' : 'Your submitted leave requests will appear here.' }}
                      </p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';

const language = useLanguageStore();

const leaves = ref([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');

const form = reactive({
  startDate: '',
  endDate: '',
  reason: ''
});

const reasonPresets = [
  { en: 'Annual vacation', kh: 'ឈប់សម្រាកប្រចាំឆ្នាំ' },
  { en: 'Medical / Sick leave', kh: 'ឈប់សម្រាកព្យាបាលជំងឺ' },
  { en: 'Family emergency', kh: 'ធុរៈគ្រួសារបន្ទាន់' },
  { en: 'Study / Exam leave', kh: 'ការសិក្សា ឬការប្រឡង' }
];

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-GB');
};

const calculateDays = (start, end) => {
  if (!start || !end) return '-';
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate - startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Number.isNaN(diffDays) ? '-' : `${diffDays} ${diffDays === 1 ? (language.isKhmer ? 'ថ្ងៃ' : 'day') : (language.isKhmer ? 'ថ្ងៃ' : 'days')}`;
};

const previewDays = computed(() => {
  return calculateDays(form.startDate, form.endDate);
});

const getStatusBadge = (status) => {
  switch (status?.toLowerCase()) {
    case 'approved':
      return 'bg-success-subtle text-success';
    case 'rejected':
      return 'bg-danger-subtle text-danger';
    case 'pending':
    default:
      return 'bg-warning-subtle text-warning-emphasis';
  }
};

const formatStatus = (status) => {
  const s = status?.toLowerCase();
  if (s === 'approved') return language.isKhmer ? 'បានអនុម័ត' : 'Approved';
  if (s === 'rejected') return language.isKhmer ? 'បដិសេធ' : 'Rejected';
  return language.isKhmer ? 'រង់ចាំពិនិត្យ' : 'Pending';
};

const leaveStats = computed(() => [
  {
    label: language.isKhmer ? 'សំណើសរុប' : 'Total Requests',
    value: leaves.value.length.toString(),
    icon: 'bi bi-folder2-open',
    bg: 'bg-primary-subtle',
    tone: 'text-primary'
  },
  {
    label: language.isKhmer ? 'បានអនុម័ត' : 'Approved Leaves',
    value: leaves.value.filter((l) => l.status?.toLowerCase() === 'approved').length.toString(),
    icon: 'bi bi-check-circle',
    bg: 'bg-success-subtle',
    tone: 'text-success'
  },
  {
    label: language.isKhmer ? 'កំពុងរង់ចាំ' : 'Pending Review',
    value: leaves.value.filter((l) => !l.status || l.status?.toLowerCase() === 'pending').length.toString(),
    icon: 'bi bi-hourglass-split',
    bg: 'bg-warning-subtle',
    tone: 'text-warning-emphasis'
  },
  {
    label: language.isKhmer ? 'បដិសេធ' : 'Rejected',
    value: leaves.value.filter((l) => l.status?.toLowerCase() === 'rejected').length.toString(),
    icon: 'bi bi-x-circle',
    bg: 'bg-danger-subtle',
    tone: 'text-danger'
  }
]);

async function load() {
  loading.value = true;
  error.value = '';

  try {
    const res = await api.leaveRequests();
    leaves.value = Array.isArray(res) ? res : [];
  } catch (err) {
    error.value = err.message || (
      language.isKhmer ? 'មិនអាចទាញយកសំណើសុំច្បាប់បានទេ។' : 'Failed to load leave requests.'
    );
    console.error('Failed to load leave requests:', err);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    error.value = language.isKhmer 
      ? 'កាលបរិច្ឆេទបញ្ចប់មិនអាចមុនកាលបរិច្ឆេទចាប់ផ្តើមឡើយ។' 
      : 'End date cannot be prior to start date.';
    return;
  }

  saving.value = true;
  error.value = '';

  try {
    await api.saveLeaveRequest({
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason
    });

    Object.assign(form, { startDate: '', endDate: '', reason: '' });
    await load();
  } catch (requestError) {
    error.value = requestError.message || (
      language.isKhmer ? 'ការដាក់ស្នើសុំច្បាប់បានបរាជ័យ។' : 'Submission failed.'
    );
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.leave-page {
  min-height: 100vh;
  background-color: #f8fafc;
}

.leave-hero {
  border: 1px solid #e2e8f0;
}

.hero-glow {
  position: absolute;
  top: -60px;
  right: -60px;
  width: 250px;
  height: 250px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(13, 110, 253, 0.08) 0%, rgba(255, 255, 255, 0) 70%);
  pointer-events: none;
}

.tracking-tight {
  letter-spacing: -0.02em;
}

.tracking-wider {
  letter-spacing: 0.04em;
  font-size: 0.72rem;
}

.metric-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06) !important;
}

.metric-icon-box {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.form-title-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
}

.small-preset {
  font-size: 0.75rem;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
}

.pulse-btn {
  box-shadow: 0 4px 14px rgba(13, 110, 253, 0.28);
}

.modern-table thead th {
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.modern-table tbody td {
  padding-top: 0.95rem;
  padding-bottom: 0.95rem;
}
</style>