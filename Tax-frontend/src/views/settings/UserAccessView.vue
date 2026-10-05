<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Top Action Bar & Branding -->
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <div class="eyebrow text-primary text-uppercase small fw-bold tracking-wider mb-1">
          <i class="bi bi-shield-lock-fill me-1"></i>
          {{ language.t('settings') }}
        </div>
        <h1 class="h3 fw-bold mb-1 tracking-tight text-dark">
          {{ language.isKhmer ? 'អ្នកប្រើប្រាស់ និងសិទ្ធិ' : 'Access & Users' }}
        </h1>
        <p class="text-muted small mb-0">
          {{ language.isKhmer 
            ? 'គ្រប់គ្រងគណនីបុគ្គលិក កំណត់តួនាទី និងសិទ្ធិចូលប្រើប្រព័ន្ធ។' 
            : 'Role-based access control and staff account permissions across the system.' 
          }}
        </p>
      </div>

      <div class="d-flex gap-2">
        <button
          class="btn btn-primary d-inline-flex align-items-center gap-2 px-3 py-2 shadow-sm rounded-3 fw-medium"
          type="button"
          @click="openCreateModal"
        >
          <i class="bi bi-person-plus-fill"></i>
          <span>{{ language.isKhmer ? 'បន្ថែមអ្នកប្រើប្រាស់' : 'Add User' }}</span>
        </button>
      </div>
    </div>

    <!-- Alert Notifications -->
    <div v-if="error" class="alert alert-danger alert-dismissible fade show border-0 shadow-sm rounded-3 mb-4" role="alert">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-exclamation-triangle-fill fs-5 flex-shrink-0"></i>
        <div>{{ error }}</div>
      </div>
      <button type="button" class="btn-close" @click="error = ''" aria-label="Close"></button>
    </div>
    <div v-if="successMessage" class="alert alert-success alert-dismissible fade show border-0 shadow-sm rounded-3 mb-4" role="status">
      <div class="d-flex align-items-center gap-2"><i class="bi bi-check-circle-fill fs-5"></i><div>{{ successMessage }}</div></div>
      <button type="button" class="btn-close" @click="successMessage = ''" aria-label="Close"></button>
    </div>

    <!-- Security & Metrics Overview -->
    <div class="row g-3 mb-4">
      <div v-for="stat in securityStats" :key="stat.label" class="col-sm-6 col-xl-3">
        <div class="card security-stat border-0 shadow-sm h-100 rounded-3">
          <div class="card-body d-flex align-items-center gap-3 p-3">
            <div class="security-stat-icon rounded-3" :class="stat.tone">
              <i :class="stat.icon"></i>
            </div>
            <div>
              <div class="text-muted extra-small fw-medium text-uppercase tracking-wider">{{ stat.label }}</div>
              <strong class="fs-4 fw-bold text-dark">{{ stat.value }}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dynamic User Form Modal / Card -->
    <div v-if="showForm" ref="userFormCard" class="card border-0 shadow-sm rounded-3 p-4 mb-4 backdrop-card">
      <div class="d-flex justify-content-between align-items-center pb-3 mb-3 border-bottom">
        <div class="d-flex align-items-center gap-2">
          <span class="p-2 bg-primary-subtle text-primary rounded-circle">
            <i :class="isEditing ? 'bi bi-pencil-fill' : 'bi bi-person-fill-add'"></i>
          </span>
          <strong class="fs-6 text-dark">
            {{ isEditing 
              ? (language.isKhmer ? 'កែប្រែគណនីអ្នកប្រើប្រាស់' : 'Edit User Account') 
              : (language.isKhmer ? 'បង្កើតគណនីអ្នកប្រើប្រាស់ថ្មី' : 'Create New User Account') 
            }}
          </strong>
        </div>
        <button type="button" class="btn-close" aria-label="Close" @click="closeForm"></button>
      </div>

      <form class="row g-3" @submit.prevent="saveUser">
        <div class="col-md-4">
          <label class="form-label fw-semibold small text-secondary">
            {{ language.isKhmer ? 'ឈ្មោះពេញ' : 'Full Name' }} <span class="text-danger">*</span>
          </label>
          <input
            v-model.trim="userForm.name"
            class="form-control form-control-md"
            placeholder="e.g. Sok Dara"
            required
          />
        </div>

        <div class="col-md-3">
          <label class="form-label fw-semibold small text-secondary">
            {{ language.isKhmer ? 'ឈ្មោះគណនី (Username)' : 'Username' }} <span class="text-danger">*</span>
          </label>
          <input
            v-model.trim="userForm.username"
            class="form-control form-control-md"
            placeholder="e.g. dara.pos"
            minlength="3"
            required
            :disabled="isEditing"
          />
        </div>

        <div class="col-md-4">
          <label class="form-label fw-semibold small text-secondary">
            {{ language.isKhmer ? 'អ៊ីមែលសម្រាប់ស្តារពាក្យសម្ងាត់' : 'Recovery Email' }} <span class="text-danger">*</span>
          </label>
          <input v-model.trim="userForm.email" type="email" class="form-control form-control-md" placeholder="name@company.com" autocomplete="email" required />
        </div>

        <div class="col-md-3">
          <label class="form-label fw-semibold small text-secondary">
            {{ isEditing 
              ? (language.isKhmer ? 'ពាក្យសម្ងាត់ថ្មី (ទុកទទេបើមិនប្តូរ)' : 'New Password (Optional)') 
              : (language.isKhmer ? 'ពាក្យសម្ងាត់បណ្តោះអាសន្ន' : 'Temporary Password') 
            }} 
            <span v-if="!isEditing" class="text-danger">*</span>
          </label>
          <input
            v-model="userForm.password"
            type="password"
            class="form-control form-control-md"
            :placeholder="isEditing ? '••••••••' : 'Min. 6 characters'"
            :minlength="isEditing ? 0 : 6"
            :required="!isEditing"
          />
        </div>

        <div class="col-md-2">
          <label class="form-label fw-semibold small text-secondary">
            {{ language.isKhmer ? 'តួនាទី' : 'Role' }} <span class="text-danger">*</span>
          </label>
          <select v-model="userForm.role" class="form-select form-select-md">
            <option value="user">{{ language.t('staffUser') }}</option>
            <option value="admin">{{ language.t('administrator') }}</option>
          </select>
        </div>

        <div class="col-12 d-flex justify-content-end gap-2 pt-2">
          <button class="btn btn-light border px-4" type="button" @click="closeForm">
            {{ language.t('cancel') }}
          </button>
          <button class="btn btn-primary px-4 d-inline-flex align-items-center gap-2" type="submit" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm" role="status"></span>
            <i v-else class="bi bi-check-circle-fill"></i>
            <span>
              {{ saving 
                ? language.t('saving') 
                : (language.isKhmer ? 'រក្សាទុកអ្នកប្រើប្រាស់' : 'Save User') 
              }}
            </span>
          </button>
        </div>
      </form>
    </div>

    <!-- Users Master Table Card -->
    <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
      <div class="card-header bg-white py-3 border-bottom d-flex flex-wrap gap-3 justify-content-between align-items-center">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-people-fill text-primary fs-5"></i>
          <strong class="mb-0 text-dark">{{ language.t('accessUsers') }}</strong>
        </div>

        <div class="d-flex flex-wrap gap-2 align-items-center ms-auto">
          <div class="input-group input-group-sm user-search">
            <span class="input-group-text bg-light border-end-0"><i class="bi bi-search text-muted"></i></span>
            <input 
              v-model.trim="search" 
              class="form-control border-start-0 bg-light" 
              :placeholder="language.isKhmer ? 'ស្វែងរកអ្នកប្រើប្រាស់...' : 'Search users...'" 
            />
          </div>

          <select v-model="roleFilter" class="form-select form-select-sm user-filter bg-light">
            <option value="">{{ language.isKhmer ? 'តួនាទីទាំងអស់' : 'All roles' }}</option>
            <option value="admin">{{ language.t('administrator') }}</option>
            <option value="user">{{ language.t('staffUser') }}</option>
          </select>

          <span class="badge bg-light text-secondary border px-2 py-2 text-nowrap rounded-2">
            {{ filteredUsers.length }} {{ language.isKhmer ? 'គណនី' : 'Users' }}
          </span>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table align-middle table-hover mb-0">
          <thead class="bg-light text-secondary">
            <tr>
              <th class="ps-4">{{ language.isKhmer ? 'ឈ្មោះអ្នកប្រើប្រាស់' : 'User' }}</th>
              <th>{{ language.isKhmer ? 'ឈ្មោះគណនី' : 'Username' }}</th>
              <th>{{ language.isKhmer ? 'តួនាទី' : 'Role' }}</th>
              <th>{{ language.t('status') }}</th>
              <th class="text-end pe-4">{{ language.isKhmer ? 'សកម្មភាព' : 'Actions' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in filteredUsers" :key="user.id">
              <td class="ps-4">
                <div class="d-flex align-items-center gap-3">
                  <div class="user-avatar rounded-circle d-flex align-items-center justify-content-center fw-bold" :class="getUserAvatarClass(user.role)">
                    {{ getInitials(user.name) }}
                  </div>
                  <div>
                    <div class="fw-semibold text-dark mb-0">{{ user.name }}</div>
                    <small v-if="isCurrentUser(user)" class="text-primary fw-medium extra-small">
                      <i class="bi bi-person-badge me-1"></i>{{ language.isKhmer ? '(គណនីរបស់អ្នក)' : '(You)' }}
                    </small>
                  </div>
                </div>
              </td>
              <td class="text-secondary font-monospace small">{{ user.username }}</td>
              <td>
                <span
                  class="badge border text-capitalize px-2.5 py-1.5 rounded-2"
                  :class="user.role === 'admin' ? 'bg-primary-subtle text-primary border-primary-subtle' : 'bg-light text-secondary'"
                >
                  <i :class="user.role === 'admin' ? 'bi bi-shield-lock me-1' : 'bi bi-person me-1'"></i>
                  {{ formatRole(user.role) }}
                </span>
              </td>
              <td>
                <span
                  class="badge px-2.5 py-1.5 rounded-2 d-inline-flex align-items-center gap-1"
                  :class="user.active ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary border border-secondary-subtle'"
                >
                  <span class="status-dot" :class="user.active ? 'bg-success' : 'bg-secondary'"></span>
                  {{ user.active 
                    ? (language.isKhmer ? 'សកម្ម' : 'Active') 
                    : (language.isKhmer ? 'អសកម្ម' : 'Inactive') 
                  }}
                </span>
              </td>
              <td class="text-end pe-4 text-nowrap">
                <div class="btn-group gap-1">
                  <!-- Edit Button -->
                  <button
                    class="btn btn-sm btn-icon btn-light border-0 text-secondary"
                    type="button"
                    :title="language.isKhmer ? 'កែប្រែ' : 'Edit'"
                    @click="openEditModal(user)"
                  >
                    <i class="bi bi-pencil"></i>
                  </button>

                  <!-- Toggle Status Button -->
                  <button
                    class="btn btn-sm btn-icon btn-light border-0"
                    :class="user.active ? 'text-warning' : 'text-success'"
                    type="button"
                    :disabled="isCurrentUser(user)"
                    :title="isCurrentUser(user) 
                      ? (language.isKhmer ? 'មិនអាចផ្អាកគណនីរបស់អ្នកបានទេ' : 'You cannot deactivate your own account') 
                      : (user.active ? (language.isKhmer ? 'ផ្អាកដំណើរការ' : 'Deactivate') : (language.isKhmer ? 'បើកដំណើរការ' : 'Activate'))"
                    @click="toggleUser(user)"
                  >
                    <i :class="user.active ? 'bi bi-pause-circle' : 'bi bi-play-circle'"></i>
                  </button>

                  <!-- Remove Button -->
                  <button
                    class="btn btn-sm btn-icon btn-light border-0 text-danger"
                    type="button"
                    :disabled="isCurrentUser(user)"
                    :title="language.t('delete')"
                    @click="removeUser(user)"
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="!filteredUsers.length">
              <td colspan="5" class="text-center text-muted py-5">
                <div class="py-4">
                  <i class="bi bi-people fs-1 text-secondary opacity-50 d-block mb-2"></i>
                  <span class="fw-medium">{{ language.t('noRecords') }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';
import { alertDialog, confirmDialog } from '@/utils/dialog';

const language = useLanguageStore();

const showForm = ref(false);
const isEditing = ref(false);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');
const userFormCard = ref(null);
const users = ref([]);
const search = ref('');
const roleFilter = ref('');
const editingUserId = ref(null);

const userForm = reactive({
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'user'
});

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('tax_user') || 'null'); } catch { return null; }
}

const currentUser = getCurrentUser();

const filteredUsers = computed(() => users.value.filter((user) => {
  const query = search.value.toLowerCase();
  const matchesSearch = !query || `${user.name} ${user.username}`.toLowerCase().includes(query);
  return matchesSearch && (!roleFilter.value || user.role === roleFilter.value);
}));

const securityStats = computed(() => [
  { label: language.isKhmer ? 'គណនីសកម្ម' : 'Active accounts', value: users.value.filter((u) => u.active).length, icon: 'bi bi-shield-check', tone: 'security-good' },
  { label: language.isKhmer ? 'អ្នកគ្រប់គ្រង' : 'Administrators', value: users.value.filter((u) => u.role === 'admin' && u.active).length, icon: 'bi bi-person-lock', tone: 'security-primary' },
  { label: language.isKhmer ? 'គណនីអសកម្ម' : 'Inactive accounts', value: users.value.filter((u) => !u.active).length, icon: 'bi bi-person-slash', tone: 'security-muted' },
  { label: language.isKhmer ? 'គោលការណ៍សិទ្ធិ' : 'Access Policy', value: 'RBAC', icon: 'bi bi-fingerprint', tone: 'security-warning' },
]);

function formatRole(role) {
  if (role === 'admin') return language.t('administrator');
  if (role === 'user') return language.t('staffUser');
  return role;
}

function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function getUserAvatarClass(role) {
  return role === 'admin' ? 'bg-primary text-white' : 'bg-light text-secondary border';
}

function openCreateModal() {
  isEditing.value = false;
  editingUserId.value = null;
  Object.assign(userForm, { name: '', username: '', email: '', password: '', role: 'user' });
  showForm.value = true;
  error.value = '';
  successMessage.value = '';
}

async function openEditModal(user) {
  isEditing.value = true;
  editingUserId.value = user.id;
  Object.assign(userForm, { name: user.name, username: user.username, email: user.email || '', password: '', role: user.role });
  showForm.value = true;
  error.value = '';
  await nextTick();
  userFormCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeForm() {
  showForm.value = false;
  error.value = '';
}

async function loadUsers() {
  try {
    users.value = await api.adminUsers();
  } catch (requestError) {
    error.value = requestError.message || (
      language.isKhmer ? 'មិនអាចទាញយកបញ្ជីអ្នកប្រើប្រាស់បានទេ។' : 'Failed to load user list.'
    );
  }
}

async function saveUser() {
  saving.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    if (isEditing.value) {
      const payload = { name: userForm.name, email: userForm.email, role: userForm.role };
      if (userForm.password) payload.password = userForm.password;

      const updated = await api.updateAdminUser(editingUserId.value, payload);
      const index = users.value.findIndex(u => u.id === editingUserId.value);
      if (index !== -1) {
        users.value[index] = { ...users.value[index], ...(updated.user || updated), name: userForm.name, email: userForm.email, role: userForm.role };
      }
      successMessage.value = language.isKhmer ? 'បានកែប្រែអ្នកប្រើប្រាស់ដោយជោគជ័យ។' : 'User updated successfully.';
    } else {
      const created = await api.saveUser(userForm);
      users.value.push(created);
      successMessage.value = language.isKhmer ? 'បានបង្កើតអ្នកប្រើប្រាស់ដោយជោគជ័យ។' : 'User created successfully.';
    }
    closeForm();
  } catch (requestError) {
    error.value = requestError.message || (
      language.isKhmer ? 'មិនអាចរក្សាទុកព័ត៌មានបានទេ។' : 'Failed to save user.'
    );
  } finally {
    saving.value = false;
  }
}

async function toggleUser(user) {
  if (isCurrentUser(user)) return;
  const promptText = language.isKhmer
    ? `${user.active ? 'ផ្អាក' : 'បើកដំណើរការ'} គណនី ${user.name} មែនទេ?`
    : `${user.active ? 'Deactivate' : 'Activate'} ${user.name}'s account?`;

  const confirmed = await confirmDialog({
    title: language.isKhmer ? 'ប្តូរស្ថានភាពគណនី' : 'Update account status',
    message: promptText,
    variant: user.active ? 'warning' : 'success',
    confirmText: user.active ? (language.isKhmer ? 'ផ្អាក' : 'Deactivate') : (language.isKhmer ? 'បើក' : 'Activate'),
  });
  if (!confirmed) return;

  try {
    const result = await api.updateAdminUser(user.id, { active: !user.active });
    Object.assign(user, result.user || { active: !user.active });
    successMessage.value = language.isKhmer ? 'បានធ្វើបច្ចុប្បន្នភាពស្ថានភាពគណនី។' : 'Account status updated successfully.';
  } catch (requestError) {
    error.value = requestError.message || (
      language.isKhmer ? 'មិនអាចផ្លាស់ប្តូរស្ថានភាពគណនីបានទេ។' : 'Failed to update account status.'
    );
  }
}

function isCurrentUser(user) {
  return Number(user.id) === Number(currentUser?.id);
}

async function removeUser(user) {
  if (isCurrentUser(user)) return;

  const confirmText = language.isKhmer
    ? `តើអ្នកប្រាកដថាចង់លុបអ្នកប្រើប្រាស់ "${user.name}" មែនទេ?`
    : `Are you sure you want to delete "${user.name}"?`;

  const confirmed = await confirmDialog({
    title: language.isKhmer ? 'លុបអ្នកប្រើប្រាស់' : 'Delete user',
    message: confirmText,
    variant: 'danger',
    confirmText: language.isKhmer ? 'លុប' : 'Delete',
  });
  if (!confirmed) return;

  error.value = '';
  successMessage.value = '';

  try {
    const result = await api.deleteAdminUser(user.id);
    if (result.deactivated) {
      user.active = false;
      await alertDialog({
        title: language.isKhmer ? 'បានផ្អាកគណនី' : 'Account deactivated',
        message: language.isKhmer
          ? 'អ្នកប្រើប្រាស់មានប្រវត្តិដែលត្រូវរក្សាទុក ដូច្នេះគណនីត្រូវបានផ្អាក។'
          : 'This user has linked history, so the account was deactivated instead.',
        variant: 'success',
      });
    } else {
      users.value = users.value.filter((item) => item.id !== user.id);
      await alertDialog({
        title: language.isKhmer ? 'បានលុបអ្នកប្រើប្រាស់' : 'User deleted',
        message: language.isKhmer ? 'បានលុបអ្នកប្រើប្រាស់ដោយជោគជ័យ។' : 'User deleted successfully.',
        variant: 'success',
      });
    }
  } catch (requestError) {
    error.value = requestError.message || (
      language.isKhmer ? 'មិនអាចលុបអ្នកប្រើប្រាស់បានទេ។' : 'Failed to delete user.'
    );
  }
}

onMounted(loadUsers);
</script>

<style scoped>
.page-canvas {
  background-color: #f8fafc;
  min-height: 100vh;
}

.tracking-wider { letter-spacing: 0.05em; }
.tracking-tight { letter-spacing: -0.02em; }
.extra-small { font-size: 0.75rem; }

.security-stat {
  border: 1px solid #e2e8f0 !important;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.security-stat:hover {
  transform: translateY(-2px);
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.05) !important;
}

.security-stat-icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  font-size: 1.25rem;
}

.security-good { background: #dcfce7; color: #15803d; }
.security-primary { background: #dbeafe; color: #1d4ed8; }
.security-muted { background: #f1f5f9; color: #475569; }
.security-warning { background: #fef3c7; color: #b45309; }

.user-avatar {
  width: 36px;
  height: 36px;
  font-size: 0.825rem;
  flex-shrink: 0;
}

.user-search { width: 220px; }
.user-filter { width: 140px; }

@media (max-width: 575.98px) {
  .user-search, .user-filter { width: 100%; }
}

.backdrop-card {
  background: #ffffff;
  border: 1px solid #e2e8f0 !important;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.btn-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}
.btn-icon:hover:not(:disabled) {
  background-color: #e2e8f0 !important;
}

.table th {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid #e2e8f0;
}

.table td {
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
}
</style>