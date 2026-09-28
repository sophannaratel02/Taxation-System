<template>
  <section class="container-fluid p-4 page-canvas approval-page">
    <!-- Executive Ambient Hero -->
    <div class="approval-hero p-4 mb-4 rounded-4 shadow-sm bg-white border position-relative overflow-hidden">
      <div class="hero-glow"></div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 position-relative z-1">
        <div>
          <div class="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-danger-subtle text-danger small fw-semibold mb-2">
            <i class="bi bi-shield-check"></i>
            <span>{{ language.t('settings') }}</span>
            <span class="text-muted">·</span>
            <span>Administrative Governance</span>
          </div>
          <h1 class="h3 fw-bold text-dark mb-1 tracking-tight">
            {{ language.t('approvalCenter') }}
          </h1>
          <p class="text-muted mb-0">
            {{ language.isKhmer 
              ? 'ពិនិត្យ និងអនុម័តគម្រោង ឯកសារ និងសំណើសុំច្បាប់ឈប់សម្រាកដែលបានដាក់ស្នើ។' 
              : 'Review uploaded documents and staff leave applications.' 
            }}
          </p>
        </div>

        <button
          class="btn btn-outline-primary   px-4 py-2 rounded-3 shadow-xs d-inline-flex align-items-center"
          type="button"
          :disabled="isLoading"
          @click="load"
        >
          <span v-if="isLoading" class="spinner-border spinner-border-sm me-2" role="status"></span>
          <i v-else class="bi bi-arrow-clockwise me-2"></i>
          {{ language.isKhmer ? 'ធ្វើបច្ចុប្បន្នភាព' : 'Refresh' }}
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <div 
      v-if="errorMessage" 
      class="alert alert-danger alert-dismissible fade show mb-4 rounded-3 shadow-sm d-flex align-items-center" 
      role="alert"
    >
      <i class="bi bi-exclamation-triangle-fill me-2 fs-5"></i>
      <div>{{ errorMessage }}</div>
      <button 
        type="button" 
        class="btn-close ms-auto shadow-none" 
        aria-label="Close" 
        @click="errorMessage = ''"
      />
    </div>

    <!-- Queue Health & Status Cards -->
    <div class="row g-3 mb-4">
      <div v-for="stat in queueStats" :key="stat.label" class="col-sm-6 col-xl-4">
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

    <!-- Filter Pills / Queue Switcher -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div class="nav-filter-pills d-inline-flex p-1 bg-white border rounded-pill shadow-xs">
        <button
          class="pill-btn"
          :class="{ active: activeTab === 'all' }"
          type="button"
          @click="activeTab = 'all'"
        >
          {{ language.isKhmer ? 'ទាំងអស់' : 'All Queues' }}
          <span class="badge rounded-pill ms-1" :class="activeTab === 'all' ? 'bg-white text-primary' : 'bg-light text-secondary border'">
            {{ totalQueueCount }}
          </span>
        </button>

        <button
          class="pill-btn"
          :class="{ active: activeTab === 'files' }"
          type="button"
          @click="activeTab = 'files'"
        >
          {{ language.isKhmer ? 'ឯកសារ' : 'Files' }}
          <span class="badge rounded-pill ms-1" :class="activeTab === 'files' ? 'bg-white text-primary' : 'bg-light text-secondary border'">
            {{ files.length }}
          </span>
        </button>

        <button
          class="pill-btn"
          :class="{ active: activeTab === 'leaves' }"
          type="button"
          @click="activeTab = 'leaves'"
        >
          {{ language.t('leaveRequest') }}
          <span class="badge rounded-pill ms-1" :class="activeTab === 'leaves' ? 'bg-white text-primary' : 'bg-light text-secondary border'">
            {{ leaves.length }}
          </span>
        </button>
      </div>

      <!-- Search Box -->
      <div class="input-group input-group-sm search-group shadow-xs">
        <span class="input-group-text bg-white border-end-0 text-muted"><i class="bi bi-search"></i></span>
        <input
          v-model.trim="search"
          class="form-control border-start-0 shadow-none bg-white"
          :placeholder="language.isKhmer ? 'ស្វែងរកសំណើ...' : 'Search pending requests...'"
        />
        <button v-if="search" class="btn btn-outline-secondary border-start-0 border-end" type="button" @click="search = ''">
          <i class="bi bi-x"></i>
        </button>
      </div>
    </div>

    <!-- Cards Grid -->
    <div class="row g-4">
      <!-- Files & Documents Queue -->
      <div v-if="activeTab === 'all' || activeTab === 'files'" :class="activeTab === 'all' ? 'col-xl-6' : 'col-12'">
        <div class="card border-0 shadow-sm rounded-4 h-100 queue-column bg-white">
          <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-2">
              <div class="column-badge bg-info-subtle text-info-emphasis rounded-3">
                <i class="bi bi-file-earmark-arrow-up"></i>
              </div>
              <div>
                <strong class="fs-6 d-block text-dark">{{ language.isKhmer ? 'ឯកសារ និងទិន្នន័យ' : 'Files & Documents' }}</strong>
                <small class="text-muted">{{ files.length }} {{ language.isKhmer ? 'ឯកសាររង់ចាំអនុម័ត' : 'awaiting verification' }}</small>
              </div>
            </div>
            <span class="badge bg-light text-secondary border font-monospace">DOC</span>
          </div>

          <div class="card-body p-3 queue-body custom-scroll">
            <div
              v-for="item in filterItems(files, 'file_name')"
              :key="item.id"
              class="queue-item p-3 mb-3 rounded-3 border bg-white shadow-xs"
            >
              <div class="d-flex justify-content-between align-items-start mb-2">
                <span class="badge text-bg-light border small font-monospace">#DOC-{{ item.id }}</span>
                <span class="badge rounded-pill" :class="statusBadgeClass(item.status)">
                  {{ item.status || 'PENDING' }}
                </span>
              </div>

              <div class="d-flex align-items-center gap-2 mb-2">
                <i class="bi bi-file-earmark-text text-primary fs-4"></i>
                <div class="text-truncate">
                  <h6 class="fw-bold text-dark mb-0 text-truncate" :title="item.file_name">
                    {{ item.file_name || 'document_upload.pdf' }}
                  </h6>
                  <small class="text-muted">
                    {{ item.file_size ? formatFileSize(item.file_size) : 'Stored document' }}
                    <span v-if="item.submitted_by_name"> · {{ item.submitted_by_name }}</span>
                    <span v-if="item.project_title"> · {{ item.project_title }}</span>
                  </small>
                </div>
              </div>

              <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                <small class="text-muted font-monospace">{{ formatDate(item.created_at || item.date) }}</small>
                <div class="d-flex gap-1">
                  <button
                    class="btn btn-sm btn-outline-primary px-2 rounded-2"
                    type="button"
                    :title="language.isKhmer ? 'ទាញយកឯកសារ' : 'Download uploaded document'"
                    @click="downloadFile(item)"
                  >
                    <i class="bi bi-download"></i>
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger px-2 rounded-2"
                    type="button"
                    :disabled="isSubmitting"
                    @click="openReviewModal('files', item, 'Rejected')"
                  >
                    <i class="bi bi-x-lg"></i>
                  </button>
                  <button
                    class="btn btn-sm btn-success px-3 rounded-2 shadow-xs"
                    type="button"
                    :disabled="isSubmitting"
                    @click="handleReview('files', item.id, 'Approved', '')"
                  >
                    <i class="bi bi-check-lg me-1"></i>{{ language.isKhmer ? 'អនុម័ត' : 'Approve' }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="!filterItems(files, 'file_name').length" class="empty-queue-box text-center py-5 text-muted">
              <i class="bi bi-folder-check fs-1 text-secondary opacity-50 d-block mb-2"></i>
              <strong class="d-block text-dark">{{ language.isKhmer ? 'គ្មានឯកសារត្រូវពិនិត្យ' : 'No Pending Files' }}</strong>
              <small>{{ language.isKhmer ? 'ឯកសារដែលបានបញ្ចូលទាំងអស់ត្រូវបានអនុម័ត។' : 'No document authorization requests found.' }}</small>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Leave Requests Queue -->
      <div v-if="activeTab === 'all' || activeTab === 'leaves'" :class="activeTab === 'all' ? 'col-xl-6' : 'col-12'">
        <div class="card border-0 shadow-sm rounded-4 h-100 queue-column bg-white">
          <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-2">
              <div class="column-badge bg-warning-subtle text-warning-emphasis rounded-3">
                <i class="bi bi-calendar2-check"></i>
              </div>
              <div>
                <strong class="fs-6 d-block text-dark">{{ language.t('leaveRequest') }}</strong>
                <small class="text-muted">{{ leaves.length }} {{ language.isKhmer ? 'សំណើសុំច្បាប់' : 'staff leaves requested' }}</small>
              </div>
            </div>
            <span class="badge bg-light text-secondary border font-monospace">HR</span>
          </div>

          <div class="card-body p-3 queue-body custom-scroll">
            <div
              v-for="item in filterItems(leaves, 'reason')"
              :key="item.id"
              class="queue-item p-3 mb-3 rounded-3 border bg-white shadow-xs"
            >
              <div class="d-flex justify-content-between align-items-start mb-2">
                <span class="badge text-bg-light border small font-monospace">#HR-{{ item.id }}</span>
                <span class="badge rounded-pill" :class="statusBadgeClass(item.status)">
                  {{ item.status || 'PENDING' }}
                </span>
              </div>

              <div class="d-flex align-items-center gap-2 mb-2">
                <div class="user-avatar-sm">
                  {{ requesterName(item).charAt(0).toUpperCase() }}
                </div>
                <div>
                  <strong class="text-dark d-block">{{ requesterName(item) }}</strong>
                  <small class="text-muted">{{ item.type || 'Leave Request' }}</small>
                </div>
              </div>

              <div class="p-2 bg-light rounded-2 border mb-3 small">
                <div class="text-muted d-flex align-items-center gap-1 mb-1">
                  <i class="bi bi-clock-history"></i>
                  <span>
                    {{ formatDate(item.start_date || item.startDate) }}
                    <span class="mx-1">to</span>
                    {{ formatDate(item.end_date || item.endDate) }}
                    ({{ calculateDays(item.start_date || item.startDate, item.end_date || item.endDate) }})
                  </span>
                </div>
                <div class="text-dark fst-italic">"{{ item.reason || 'Personal leave request' }}"</div>
              </div>

              <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                <small class="text-muted font-monospace">{{ formatDate(item.created_at || item.date) }}</small>
                <div class="d-flex gap-1">
                  <button
                    class="btn btn-sm btn-outline-danger px-2 rounded-2"
                    type="button"
                    :disabled="isSubmitting"
                    @click="openReviewModal('leaves', item, 'Rejected')"
                  >
                    <i class="bi bi-x-lg"></i>
                  </button>
                  <button
                    class="btn btn-sm btn-success px-3 rounded-2 shadow-xs"
                    type="button"
                    :disabled="isSubmitting"
                    @click="handleReview('leaves', item.id, 'Approved', '')"
                  >
                    <i class="bi bi-check-lg me-1"></i>{{ language.isKhmer ? 'អនុម័ត' : 'Approve' }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="!filterItems(leaves, 'reason').length" class="empty-queue-box text-center py-5 text-muted">
              <i class="bi bi-person-check fs-1 text-secondary opacity-50 d-block mb-2"></i>
              <strong class="d-block text-dark">{{ language.isKhmer ? 'គ្មានសំណើសុំច្បាប់ទេ' : 'No Leave Requests' }}</strong>
              <small>{{ language.isKhmer ? 'ពុំមានសំណើសុំច្បាប់ដែលមិនទាន់ដោះស្រាយឡើយ។' : 'No pending staff leave applications.' }}</small>
            </div>
          </div>
        </div>
      </div>
    </div>

    <section class="card border-0 shadow-sm rounded-4 mt-4">
      <div class="card-header bg-white border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2 py-3 px-4">
        <div>
          <strong class="d-block text-dark">{{ language.isKhmer ? 'ប្រវត្តិការអនុម័ត' : 'Approval history' }}</strong>
          <small class="text-muted">{{ language.isKhmer ? 'កំណត់ត្រាអនុម័ត និងបដិសេធទាំងអស់' : 'Permanent record of approval decisions and submissions' }}</small>
        </div>
        <span class="badge bg-light text-secondary border">{{ approvalHistory.length }}</span>
      </div>
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-4">{{ language.isKhmer ? 'សកម្មភាព' : 'Action' }}</th>
              <th>{{ language.isKhmer ? 'ប្រភេទ' : 'Type' }}</th>
              <th>{{ language.isKhmer ? 'អ្នកប្រើប្រាស់' : 'By' }}</th>
              <th>{{ language.isKhmer ? 'ព័ត៌មាន' : 'Details' }}</th>
              <th class="text-end pe-4">{{ language.isKhmer ? 'កាលបរិច្ឆេទ' : 'Date' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in approvalHistory" :key="entry.id">
              <td class="ps-4"><span class="badge rounded-pill" :class="historyStatusClass(entry.action)">{{ formatAction(entry.action) }}</span></td>
              <td class="text-capitalize">{{ entry.entity_type || '—' }}</td>
              <td>
                <button
                  v-if="entry.user_id"
                  type="button"
                  class="btn btn-link p-0 text-decoration-none fw-semibold"
                  @click="openUserDetails(entry.user_id, entry.user_name)"
                >
                  <i class="bi bi-person-circle me-1"></i>{{ entry.user_name || 'User' }}
                </button>
                <span v-else>System</span>
              </td>
              <td class="small text-muted">#{{ entry.entity_id || '—' }}<span v-if="historyReason(entry)" class="d-block">{{ historyReason(entry) }}</span></td>
              <td class="text-end pe-4 text-nowrap small text-muted">{{ formatDateTime(entry.created_at) }}</td>
            </tr>
            <tr v-if="!approvalHistory.length">
              <td colspan="5" class="text-center py-5 text-muted">{{ language.isKhmer ? 'មិនទាន់មានប្រវត្តិទេ' : 'No approval history yet.' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <Transition name="fade">
      <div v-if="selectedUser" class="modal-backdrop-custom" @click.self="closeUserDetails">
        <div class="card user-detail-modal shadow-lg border-0 rounded-4 overflow-hidden">
          <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
            <h6 class="fw-bold mb-0 text-dark d-flex align-items-center gap-2">
              <i class="bi bi-person-vcard text-primary fs-5"></i>
              <span>{{ language.isKhmer ? 'ព័ត៌មានអ្នកប្រើប្រាស់' : 'User information' }}</span>
            </h6>
            <button class="btn-close" type="button" aria-label="Close" @click="closeUserDetails"></button>
          </div>

          <div class="card-body p-4">
            <div class="d-flex align-items-center gap-3 mb-4">
              <div class="user-avatar-lg">{{ (selectedUser.name || 'U').charAt(0).toUpperCase() }}</div>
              <div>
                <h2 class="h5 fw-bold mb-1">{{ selectedUser.name || 'Unknown user' }}</h2>
                <div class="text-muted">@{{ selectedUser.username || '—' }}</div>
              </div>
              <span class="badge ms-auto" :class="selectedUser.active ? 'text-bg-success' : 'text-bg-secondary'">
                {{ selectedUser.active ? (language.isKhmer ? 'សកម្ម' : 'Active') : (language.isKhmer ? 'អសកម្ម' : 'Inactive') }}
              </span>
            </div>

            <dl class="row small mb-4">
              <dt class="col-5 text-muted">{{ language.isKhmer ? 'លេខសម្គាល់' : 'User ID' }}</dt>
              <dd class="col-7 mb-2">#{{ selectedUser.id || '—' }}</dd>
              <dt class="col-5 text-muted">{{ language.isKhmer ? 'អ៊ីមែល' : 'Email' }}</dt>
              <dd class="col-7 mb-2 text-break">{{ selectedUser.email || '—' }}</dd>
              <dt class="col-5 text-muted">{{ language.isKhmer ? 'តួនាទី' : 'Role' }}</dt>
              <dd class="col-7 mb-2 text-capitalize">{{ selectedUser.role || '—' }}</dd>
              <dt class="col-5 text-muted">{{ language.isKhmer ? 'បង្កើតនៅ' : 'Created' }}</dt>
              <dd class="col-7 mb-0">{{ formatDateTime(selectedUser.created_at) }}</dd>
            </dl>

            <h3 class="h6 fw-bold border-top pt-3 mb-3">{{ language.isKhmer ? 'ប្រវត្តិសកម្មភាព' : 'Activity history' }}</h3>
            <div class="user-history-list">
              <div v-for="entry in selectedUserHistory" :key="entry.id" class="d-flex justify-content-between gap-3 py-2 border-bottom">
                <div>
                  <span class="badge rounded-pill me-2" :class="historyStatusClass(entry.action)">{{ formatAction(entry.action) }}</span>
                  <span class="small text-muted text-capitalize">{{ entry.entity_type }} #{{ entry.entity_id || '—' }}</span>
                  <div v-if="historyReason(entry)" class="small text-muted mt-1">{{ historyReason(entry) }}</div>
                </div>
                <small class="text-muted text-nowrap">{{ formatDateTime(entry.created_at) }}</small>
              </div>
              <div v-if="!selectedUserHistory.length" class="text-center text-muted small py-3">{{ language.isKhmer ? 'មិនទាន់មានប្រវត្តិទេ' : 'No activity history.' }}</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Structured Rejection / Review Modal -->
    <Transition name="fade">
      <div v-if="reviewModal.visible" class="modal-backdrop-custom">
        <div class="card review-modal shadow-lg border-0 rounded-4 overflow-hidden">
          <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
            <h6 class="fw-bold mb-0 text-dark d-flex align-items-center gap-2">
              <i class="bi bi-shield-x text-danger fs-5"></i>
              <span>{{ language.isKhmer ? 'បដិសេធសំណើ / ផ្ដល់មតិយោបល់' : 'Reject / Provide Feedback' }}</span>
            </h6>
            <button class="btn-close" type="button" @click="closeReviewModal"></button>
          </div>

          <div class="card-body p-4">
            <p class="text-muted small mb-3">
              {{ language.isKhmer 
                ? 'សូមបញ្ជាក់ពីមូលហេតុនៃការបដិសេធ ដើម្បីជូនដំណឹងទៅកាន់អ្នកស្នើសុំ។' 
                : 'Please state the operational reason for rejecting this request for the user.' 
              }}
            </p>

            <div class="mb-3">
              <label class="form-label small fw-semibold text-secondary">
                {{ language.isKhmer ? 'មូលហេតុ ឬការកែសម្រួលបន្ថែម' : 'Rejection Reason / Comments' }}
                <span class="text-danger">*</span>
              </label>
              <textarea
                v-model.trim="reviewModal.reason"
                class="form-control"
                rows="3"
                :placeholder="language.isKhmer ? 'ឧ. ខ្វះឯកសារយោង ឬកាលបរិច្ឆេទជាន់គ្នា...' : 'e.g. Incomplete documentation or scheduling conflict...'"
                required
              ></textarea>
            </div>

            <div class="d-flex justify-content-end gap-2 pt-2 border-top">
              <button class="btn btn-light border px-4 rounded-3" type="button" @click="closeReviewModal">
                {{ language.t('cancel') }}
              </button>
              <button
                class="btn btn-danger px-4 rounded-3 shadow-sm"
                type="button"
                :disabled="isSubmitting || !reviewModal.reason"
                @click="confirmRejection"
              >
                <span v-if="isSubmitting" class="spinner-border spinner-border-sm me-2" role="status"></span>
                <i v-else class="bi bi-x-circle me-1"></i>
                {{ isSubmitting ? language.t('saving') : (language.isKhmer ? 'បញ្ជាក់ការបដិសេធ' : 'Confirm Rejection') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';

const language = useLanguageStore();

const files = ref([]);
const leaves = ref([]);
const approvalHistory = ref([]);
const users = ref([]);
const selectedUser = ref(null);
const isLoading = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref('');
const activeTab = ref('all');
const search = ref('');

const reviewModal = reactive({
  visible: false,
  type: '',
  item: null,
  status: '',
  reason: ''
});

const reviewActions = {
  files: api.reviewFile,
  leaves: api.reviewLeave,
};

const totalQueueCount = computed(() => files.value.length + leaves.value.length);
const selectedUserHistory = computed(() => selectedUser.value
  ? approvalHistory.value.filter((entry) => Number(entry.user_id) === Number(selectedUser.value.id))
  : []);

const queueStats = computed(() => [
  {
    label: language.isKhmer ? 'សំណើកំពុងរង់ចាំសរុប' : 'Total Pending Queue',
    value: totalQueueCount.value.toString(),
    icon: 'bi bi-hourglass-split',
    bg: 'bg-warning-subtle',
    tone: 'text-warning-emphasis'
  },
  {
    label: language.isKhmer ? 'ឯកសារត្រូវផ្ទៀងផ្ទាត់' : 'Pending Files',
    value: files.value.length.toString(),
    icon: 'bi bi-file-earmark-check',
    bg: 'bg-info-subtle',
    tone: 'text-info-emphasis'
  },
  {
    label: language.isKhmer ? 'សំណើសុំច្បាប់' : 'Staff Leaves',
    value: leaves.value.length.toString(),
    icon: 'bi bi-calendar2-week',
    bg: 'bg-danger-subtle',
    tone: 'text-danger'
  }
]);

function isPendingStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  return !s || s === 'pending' || s === 'pending approval' || s === 'in review';
}

function filterItems(list, key) {
  if (!search.value) return list;
  const q = search.value.toLowerCase();
  return list.filter((item) => {
    const targetVal = String(item[key] || item.name || '').toLowerCase();
    const idVal = String(item.id || '');
    return targetVal.includes(q) || idVal.includes(q);
  });
}

function formatDate(val) {
  if (!val) return '-';
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? val : d.toLocaleDateString('en-GB');
}

function requesterName(item) {
  return item.submitted_by_name || item.staff_name || item.user || 'Staff Member';
}

function calculateDays(start, end) {
  if (!start || !end) return 'duration unavailable';
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const days = Math.round((endDate - startDate) / 86400000) + 1;
  return days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : 'invalid dates';
}

function statusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('approved')) return 'bg-success-subtle text-success';
  if (s.includes('rejected')) return 'bg-danger-subtle text-danger';
  return 'bg-warning-subtle text-warning-emphasis';
}

function formatAction(action) {
  return String(action || 'activity').replaceAll('_', ' ');
}

function historyStatusClass(action) {
  const value = String(action || '').toLowerCase();
  if (value.includes('approved')) return 'bg-success-subtle text-success';
  if (value.includes('rejected')) return 'bg-danger-subtle text-danger';
  return 'bg-light text-secondary border';
}

function parseDetails(entry) {
  if (!entry?.details) return {};
  if (typeof entry.details === 'object') return entry.details;
  try { return JSON.parse(entry.details); } catch { return {}; }
}

function historyReason(entry) {
  const details = parseDetails(entry);
  return details.reason || details.fileName || '';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatFileSize(value) {
  const size = Number(value || 0);
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

async function downloadFile(item) {
  try {
    await api.downloadFile(item.id);
  } catch (error) {
    errorMessage.value = error.message || 'Unable to download the uploaded document.';
  }
}

function openUserDetails(userId, fallbackName = '') {
  const user = users.value.find((entry) => Number(entry.id) === Number(userId));
  selectedUser.value = user || { id: userId, name: fallbackName, active: true };
}

function closeUserDetails() {
  selectedUser.value = null;
}

function openReviewModal(type, item, status) {
  reviewModal.type = type;
  reviewModal.item = item;
  reviewModal.status = status;
  reviewModal.reason = '';
  reviewModal.visible = true;
}

function closeReviewModal() {
  reviewModal.visible = false;
  reviewModal.item = null;
  reviewModal.reason = '';
}

async function confirmRejection() {
  if (!reviewModal.item || !reviewModal.reason) return;
  await handleReview(reviewModal.type, reviewModal.item.id, 'Rejected', reviewModal.reason);
  closeReviewModal();
}

async function load() {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const results = await Promise.allSettled([
      api.adminFiles ? api.adminFiles() : Promise.resolve([]),
      api.leaveRequests ? api.leaveRequests() : Promise.resolve([]),
      api.adminActivity ? api.adminActivity() : Promise.resolve([]),
      api.adminUsers ? api.adminUsers() : Promise.resolve([]),
    ]);

    if (results[0].status === 'fulfilled') {
      const raw = Array.isArray(results[0].value) ? results[0].value : [];
      files.value = raw.filter((item) => isPendingStatus(item.status));
    }
    if (results[1].status === 'fulfilled') {
      const raw = Array.isArray(results[1].value) ? results[1].value : [];
      leaves.value = raw.filter((item) => isPendingStatus(item.status));
    }
    if (results[2].status === 'fulfilled') {
      const raw = Array.isArray(results[2].value) ? results[2].value : [];
      approvalHistory.value = raw.filter((entry) => ['project', 'file', 'leave'].includes(String(entry.entity_type || '').toLowerCase()));
    }
    if (results[3].status === 'fulfilled') {
      users.value = Array.isArray(results[3].value) ? results[3].value : [];
    }

    if (results.some((r) => r.status === 'rejected')) {
      errorMessage.value = language.isKhmer 
        ? 'មិនអាចទាញយកទិន្នន័យមួយចំនួនបានទេ។ សូមព្យាយាមម្តងទៀត។'
        : 'Some approval queues could not be loaded. Please try again.';
    }
  } catch (err) {
    errorMessage.value = language.isKhmer 
      ? 'មានបញ្ហាក្នុងការទាញយកទិន្នន័យ។'
      : 'Failed to load approval queues. Please try again.';
    console.error('Approval queues fetch error:', err);
  } finally {
    isLoading.value = false;
  }
}

async function handleReview(type, id, status, reason = '') {
  const action = reviewActions[type];
  if (!action) return;

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    await action(id, { status, reason });

    // Optimistically update local array immediately
    if (type === 'files') files.value = files.value.filter((i) => i.id !== id);
    if (type === 'leaves') leaves.value = leaves.value.filter((i) => i.id !== id);

    await load();
  } catch (err) {
    errorMessage.value = language.isKhmer
      ? `បរាជ័យក្នុងការធ្វើបច្ចុប្បន្នភាពស្ថានភាព (${type})`
      : `Failed to update status for ${type}.`;
    console.error(`Error reviewing ${type} (${id}):`, err);
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.approval-page {
  min-height: 100vh;
  background-color: #f8fafc;
}

.approval-hero {
  border: 1px solid #e2e8f0;
}

.hero-glow {
  position: absolute;
  top: -60px;
  right: -60px;
  width: 250px;
  height: 250px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(220, 53, 69, 0.08) 0%, rgba(255, 255, 255, 0) 70%);
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

.column-badge {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
}

/* Nav Filter Pills */
.nav-filter-pills {
  gap: 4px;
}

.pill-btn {
  border: 0;
  background: transparent;
  padding: 6px 14px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #64748b;
  border-radius: 9999px;
  transition: all 0.2s ease;
}

.pill-btn:hover {
  color: #0f172a;
}

.pill-btn.active {
  background-color: #0d6efd;
  color: #ffffff;
}

.search-group {
  width: 260px;
}

@media (max-width: 575.98px) {
  .search-group,
  .nav-filter-pills {
    width: 100%;
  }
}

/* Queue List and Column */
.queue-column {
  background: #ffffff;
}

.queue-body {
  max-height: 640px;
  overflow-y: auto;
}

.queue-item {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.queue-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06) !important;
}

.user-avatar-sm {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #1e293b;
  font-size: 0.78rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.line-clamp-2 {
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Modal */
.modal-backdrop-custom {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(3px);
}

.review-modal {
  width: min(100%, 480px);
}

.user-detail-modal {
  width: min(100%, 620px);
  max-height: min(90vh, 760px);
  overflow-y: auto;
}

.user-avatar-lg {
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #e0ecff;
  color: #0d6efd;
  font-size: 1.25rem;
  font-weight: 700;
}

.user-history-list {
  max-height: 240px;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>