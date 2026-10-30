<template>
  <main class="container-fluid py-4 px-3 px-lg-4 super-admin-page">
    <!-- Header -->
    <header class="super-admin-header d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div>
        <p class="super-admin-eyebrow mb-2">
          <i class="bi bi-shield-lock me-2" aria-hidden="true"></i>
          {{ text('Platform control center', 'មជ្ឈមណ្ឌលគ្រប់គ្រងប្រព័ន្ធ') }}
        </p>
        <h1 class="h2 fw-bold mb-1">{{ text('Super Admin', 'អ្នកគ្រប់គ្រងប្រព័ន្ធ') }}</h1>
        <p class="text-secondary mb-0">
          {{ text('Monitor your platform and manage company accounts from one place.', 'តាមដានប្រព័ន្ធ និងគ្រប់គ្រងគណនីក្រុមហ៊ុននៅកន្លែងតែមួយ។') }}
        </p>
      </div>
      <button class="btn btn-primary" type="button" :disabled="loading" @click="loadOverview">
        <span v-if="loading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
        <i v-else class="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>
        {{ text('Refresh overview', 'ធ្វើបច្ចុប្បន្នភាពទិដ្ឋភាពទូទៅ') }}
      </button>
    </header>

    <!-- Error Alert -->
    <div v-if="error" class="alert alert-danger d-flex flex-wrap justify-content-between align-items-center gap-2" role="alert">
      <span>{{ error }}</span>
      <button class="btn btn-sm btn-outline-danger" type="button" :disabled="loading" @click="loadOverview">
        {{ text('Retry', 'ព្យាយាមម្តងទៀត') }}
      </button>
    </div>

    <!-- Stats Cards -->
    <div v-if="overview" class="row g-3 mb-4">
      <div v-for="stat in summaryCards" :key="stat.key" class="col-12 col-md-4">
        <button
          class="card super-admin-stat super-admin-stat-button h-100 w-100"
          type="button"
          :aria-label="text(`View details for ${stat.label}`, `មើលព័ត៌មានលម្អិត ${stat.label}`)"
          @click="openSummaryDetail(stat.key)"
        >
          <div class="card-body d-flex align-items-center gap-3 p-4">
            <span class="super-admin-stat-icon" aria-hidden="true">
              <i :class="stat.icon"></i>
            </span>
            <div>
              <p class="text-secondary small fw-semibold mb-1">{{ stat.label }}</p>
              <p class="super-admin-stat-value mb-0">{{ formatCount(stat.value) }}</p>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Stats Loading Skeleton -->
    <div v-else-if="loading" class="row g-3 mb-4" :aria-label="text('Loading platform summary', 'កំពុងផ្ទុកសង្ខេបប្រព័ន្ធ')" aria-busy="true">
      <div v-for="item in 3" :key="item" class="col-12 col-md-4">
        <div class="card super-admin-stat h-100" aria-hidden="true">
          <div class="card-body d-flex align-items-center gap-3 p-4">
            <span class="super-admin-stat-icon placeholder-glow">
              <span class="placeholder rounded-3 w-100 h-100"></span>
            </span>
            <div class="flex-grow-1 placeholder-glow">
              <span class="placeholder col-7 mb-2"></span>
              <span class="placeholder col-4 d-block"></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Accounts Section -->
    <section class="card super-admin-accounts mt-4">
      <div class="card-header bg-white border-0 px-4 pt-4 pb-3">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h2 class="h5 fw-bold mb-1">{{ text('Platform user accounts', 'គណនីអ្នកប្រើប្រាស់ក្នុងប្រព័ន្ធ') }}</h2>
            <p class="small text-secondary mb-0">{{ text('Manage company owners and staff.', 'គ្រប់គ្រងម្ចាស់ក្រុមហ៊ុន និងបុគ្គលិក') }}</p>
          </div>
          <span v-if="userList" class="account-count-badge">
            {{ formatCount(userList.totalCount) }} {{ text('accounts', 'គណនី') }}
          </span>
        </div>
      </div>

      <!-- Search Bar -->
      <div class="card-body border-top border-bottom px-4 py-3">
        <form class="row g-2 align-items-end" role="search" @submit.prevent="searchUsers">
          <div class="col-12 col-md-6 col-lg-4">
            <label for="user-search" class="form-label">{{ text('Search accounts', 'ស្វែងរកគណនី') }}</label>
            <input
              id="user-search"
              v-model="userSearchInput"
              class="form-control"
              type="search"
              maxlength="120"
              :placeholder="text('Search names, emails, roles, company details, TIN, phone...', 'ស្វែងរកឈ្មោះ អ៊ីមែល តួនាទី ព័ត៌មានក្រុមហ៊ុន TIN ទូរស័ព្ទ...')"
            />
          </div>
          <div class="col-auto">
            <button class="btn btn-primary" type="submit" :disabled="usersLoading">
              <span v-if="usersLoading" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              <i v-else class="bi bi-search me-2" aria-hidden="true"></i>
              {{ text('Search', 'ស្វែងរក') }}
            </button>
          </div>
          <div class="col-auto">
            <button class="btn btn-outline-secondary" type="button" :disabled="usersLoading" @click="loadUsers">
              <i class="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>
              {{ text('Refresh', 'ធ្វើបច្ចុប្បន្នភាព') }}
            </button>
          </div>
        </form>
      </div>

      <!-- Alerts -->
      <div v-if="usersError" class="alert alert-danger m-3 mb-0" role="alert">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span>{{ usersError }}</span>
          <button class="btn btn-sm btn-outline-danger" type="button" :disabled="usersLoading" @click="loadUsers">
            {{ text('Retry', 'ព្យាយាមម្តងទៀត') }}
          </button>
        </div>
      </div>

      <div v-if="userActionError && !editingUser && !deletingUser" class="alert alert-danger m-3 mb-0" role="alert">
        {{ userActionError }}
      </div>
      <div v-if="userActionSuccess" class="alert alert-success m-3 mb-0" role="status">
        {{ userActionSuccess }}
      </div>

      <!-- Table View -->
      <div v-if="usersLoading && !userList" class="account-empty-state text-secondary" role="status">
        <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
        {{ text('Loading platform accounts…', 'កំពុងផ្ទុកគណនីក្នុងប្រព័ន្ធ…') }}
      </div>

      <div v-else-if="userList?.users?.length" class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <caption class="visually-hidden">
            {{ text('Platform user accounts and management actions', 'គណនីអ្នកប្រើប្រាស់ និងសកម្មភាពគ្រប់គ្រងប្រព័ន្ធ') }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ text('Account', 'គណនី') }}</th>
              <th scope="col">{{ text('Company', 'ក្រុមហ៊ុន') }}</th>
              <th scope="col">{{ text('Role', 'តួនាទី') }}</th>
              <th scope="col">{{ text('Status', 'ស្ថានភាព') }}</th>
              <th scope="col">{{ text('Created', 'កាលបរិច្ឆេទបង្កើត') }}</th>
              <th scope="col" class="text-end">{{ text('Actions', 'សកម្មភាព') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in userList.users" :key="user.id">
              <td>
                <strong>{{ user.name }}</strong>
                <div class="small text-secondary">
                  <span v-if="user.email">{{ user.email }}</span>
                </div>
                <span v-if="user.isOwner" class="badge text-bg-warning mt-1">{{ text('Company owner', 'ម្ចាស់ក្រុមហ៊ុន') }}</span>
                <span v-if="isCurrentUser(user)" class="badge text-bg-info mt-1">{{ text('You', 'អ្នក') }}</span>
              </td>
              <td><span class="company-name">{{ user.companyName || text('Platform', 'ប្រព័ន្ធ') }}</span></td>
              <td><span class="role-label">{{ formatRole(user.role) }}</span></td>
              <td>
                <span class="account-status" :class="`is-${accountStatus(user).state}`">
                  <span class="account-status-dot" aria-hidden="true"></span>
                  {{ accountStatus(user).label }}
                </span>
              </td>
              <td>{{ formatDate(user.createdAt) }}</td>
              <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-outline-primary me-2" type="button" :disabled="userSaving" @click="beginEdit(user)">
                  <i class="bi bi-pencil me-1" aria-hidden="true"></i>
                  {{ text('Edit', 'កែសម្រួល') }}
                </button>
                <button
                  class="btn btn-sm btn-outline-danger"
                  type="button"
                  :disabled="userSaving || isCurrentUser(user)"
                  :title="isCurrentUser(user) ? text('You cannot delete your own account', 'អ្នកមិនអាចលុបគណនីរបស់ខ្លួនបានទេ') : text('Delete account', 'លុបគណនី')"
                  @click="openDeleteModal(user)"
                >
                  <i class="bi bi-trash3 me-1" aria-hidden="true"></i>
                  {{ text('Delete', 'លុប') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="!usersError" class="account-empty-state text-secondary">
        <span class="account-empty-icon" aria-hidden="true"><i class="bi bi-person-lines-fill"></i></span>
        <strong class="d-block text-body mt-3">
          {{ userSearch ? text('No matching accounts', 'មិនមានគណនីដែលត្រូវគ្នាទេ') : text('No accounts yet', 'មិនទាន់មានគណនីទេ') }}
        </strong>
        <span>
          {{ userSearch ? text(`No user accounts match "${userSearch}". Try a different name or email.`, `មិនមានគណនីត្រូវនឹង "${userSearch}" ទេ។ សូមសាកល្បងឈ្មោះ ឬអ៊ីមែលផ្សេង។`) : text('Registered platform users will appear here.', 'គណនីអ្នកប្រើប្រាស់ដែលបានចុះឈ្មោះនឹងបង្ហាញនៅទីនេះ។') }}
        </span>
      </div>
    </section>

    <!-- Pagination Controls -->
    <nav v-if="userList && userList.totalPages > 1" class="d-flex flex-wrap justify-content-between align-items-center gap-3 mt-3" :aria-label="text('User account pages', 'ទំព័រគណនីអ្នកប្រើប្រាស់')">
      <span class="small text-secondary">
        {{ text('Page', 'ទំព័រ') }} {{ formatCount(userList.page) }} {{ text('of', 'នៃ') }} {{ formatCount(userList.totalPages) }} · {{ formatCount(userList.totalCount) }} {{ text('accounts', 'គណនី') }}
      </span>
      <div class="btn-group" role="group" :aria-label="text('User pagination controls', 'ប៊ូតុងប្តូរទំព័រគណនី')">
        <button class="btn btn-outline-secondary" type="button" :disabled="usersLoading || userList.page <= 1" @click="changeUserPage(userList.page - 1)">
          {{ text('Previous', 'មុន') }}
        </button>
        <button class="btn btn-outline-secondary" type="button" :disabled="usersLoading || userList.page >= userList.totalPages" @click="changeUserPage(userList.page + 1)">
          {{ text('Next', 'បន្ទាប់') }}
        </button>
      </div>
    </nav>

    <!-- Edit User Modal -->
    <Teleport to="body">
      <Transition name="user-modal">
        <div v-if="editingUser" class="platform-modal-backdrop" @click.self="cancelEdit">
          <section class="platform-modal card border-0 shadow-lg" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
            <div class="card-header d-flex justify-content-between align-items-center bg-white py-3">
              <div>
                <h2 id="edit-user-title" class="h5 mb-1">{{ text('Edit account', 'កែសម្រួលគណនី') }}</h2>
                <p class="small text-secondary mb-0">{{ editingUser.name }} · {{ editingUser.companyName || text('Platform', 'ប្រព័ន្ធ') }}</p>
              </div>
              <button class="btn-close" type="button" :aria-label="text('Close', 'បិទ')" :disabled="userSaving" @click="cancelEdit"></button>
            </div>
            <form class="card-body" @submit.prevent="saveUser">
              <div v-if="userActionError" class="alert alert-danger" role="alert">{{ userActionError }}</div>
              <div class="row g-3">
                <div class="col-12 col-md-6">
                  <label for="user-name" class="form-label">{{ text('Name', 'ឈ្មោះ') }}</label>
                  <input id="user-name" v-model.trim="userForm.name" class="form-control" maxlength="120" required />
                </div>
                <div class="col-12 col-md-6">
                  <label for="user-email" class="form-label">{{ text('Email', 'អ៊ីមែល') }}</label>
                  <input id="user-email" v-model.trim="userForm.email" class="form-control" type="email" maxlength="255" required />
                </div>
                <div class="col-12 col-md-6">
                  <label for="user-role" class="form-label">{{ text('Role', 'តួនាទី') }}</label>
                  <select v-if="!editingUser.isOwner" id="user-role" v-model="userForm.role" class="form-select">
                    <option v-if="editingUser.role === 'superadmin'" value="superadmin">{{ text('Super Admin', 'អ្នកគ្រប់គ្រងប្រព័ន្ធ') }}</option>
                    <option value="owner">{{ text('Owner', 'ម្ចាស់ក្រុមហ៊ុន') }}</option>
                    <option value="staff">{{ text('Staff', 'បុគ្គលិក') }}</option>
                  </select>
                  <input v-else class="form-control" :value="formatRole(editingUser.role)" readonly />
                  <small v-if="editingUser.isOwner" class="text-secondary">
                    {{ text('Transfer company ownership before changing this role.', 'ផ្ទេរកម្មសិទ្ធិក្រុមហ៊ុនមុនពេលប្តូរតួនាទីនេះ។') }}
                  </small>
                </div>
                <div v-if="userForm.role === 'staff'" class="col-12 col-md-6">
                  <label for="user-preset" class="form-label">{{ text('Staff permission preset', 'សិទ្ធិដែលបានកំណត់សម្រាប់បុគ្គលិក') }}</label>
                  <select id="user-preset" v-model="userForm.preset" class="form-select">
                    <option v-for="preset in staffPresetNames" :key="preset" :value="preset">{{ presetLabel(preset) }}</option>
                  </select>
                </div>
                <div class="col-12 col-md-6">
                  <label for="user-password" class="form-label">{{ text('New password', 'ពាក្យសម្ងាត់ថ្មី') }}</label>
                  <input
                    id="user-password"
                    v-model="userForm.password"
                    class="form-control"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="text('Leave blank to keep current password', 'ទុកឱ្យទទេ ដើម្បីរក្សាពាក្យសម្ងាត់បច្ចុប្បន្ន')"
                  />
                </div>
                <div class="col-12">
                  <div class="form-check">
                    <input
                      id="user-active"
                      v-model="userForm.active"
                      class="form-check-input"
                      type="checkbox"
                      :disabled="isCurrentUser(editingUser)"
                    />
                    <label class="form-check-label" for="user-active">{{ text('Account active', 'គណនីសកម្ម') }}</label>
                    <small v-if="isCurrentUser(editingUser)" class="d-block text-secondary">
                      {{ text('You cannot deactivate your own account.', 'អ្នកមិនអាចបិទគណនីរបស់ខ្លួនបានទេ។') }}
                    </small>
                  </div>
                </div>
              </div>
              <div class="d-flex justify-content-end gap-2 mt-4">
                <button class="btn btn-outline-secondary" type="button" :disabled="userSaving" @click="cancelEdit">
                  {{ text('Cancel', 'បោះបង់') }}
                </button>
                <button class="btn btn-primary" type="submit" :disabled="userSaving">
                  <span v-if="userSaving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                  {{ text('Save changes', 'រក្សាទុកការផ្លាស់ប្តូរ') }}
                </button>
              </div>
            </form>
          </section>
        </div>
      </Transition>
    </Teleport>

    <!-- Delete User Modal -->
    <Teleport to="body">
      <Transition name="user-modal">
        <div v-if="deletingUser" class="platform-modal-backdrop" @click.self="closeDeleteModal">
          <section class="platform-modal platform-delete-modal card border-0 shadow-lg" role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title" aria-describedby="delete-user-message">
            <div class="card-body p-4">
              <h2 id="delete-user-title" class="h5">{{ text('Delete account?', 'លុបគណនីនេះ?') }}</h2>
              <p id="delete-user-message" class="text-secondary">
                {{ text('Permanently delete', 'លុបជាអចិន្ត្រៃយ៍') }} <strong>{{ deletingUser.name }}</strong> {{ text('from', 'ចេញពី') }}
                <strong>{{ deletingUser.companyName || text('Platform', 'ប្រព័ន្ធ') }}</strong>?
                {{ text('Historical records are retained, but user attribution will be removed.', 'កំណត់ត្រាប្រវត្តិសាស្ត្រនឹងត្រូវរក្សាទុក ប៉ុន្តែព័ត៌មានអ្នកប្រើប្រាស់នឹងត្រូវដកចេញ។') }}
              </p>
              <div v-if="deletingUser.isOwner" class="alert alert-warning">
                <strong>{{ text('Ownership transfer is optional.', 'ការផ្ទេរកម្មសិទ្ធិមិនមែនជាកាតព្វកិច្ចទេ។') }}</strong>
                <span class="d-block small mt-1">{{ text('You can delete this owner without transferring ownership. The company will remain without an owner.', 'អ្នកអាចលុបម្ចាស់ក្រុមហ៊ុននេះដោយមិនចាំបាច់ផ្ទេរកម្មសិទ្ធិ។ ក្រុមហ៊ុននឹងនៅតែមានក្នុងប្រព័ន្ធ ប៉ុន្តែគ្មានម្ចាស់។') }}</span>
              </div>
              <div v-if="deletingUser.isOwner && ownershipOptionsLoading" class="text-secondary mb-3" role="status">
                <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                {{ text('Loading eligible users…', 'កំពុងផ្ទុកអ្នកប្រើប្រាស់ដែលមានសិទ្ធិ…') }}
              </div>
              <div v-else-if="deletingUser.isOwner && ownershipCandidates.length" class="mb-3">
                <label for="ownership-recipient" class="form-label">{{ text('Transfer ownership (optional)', 'ផ្ទេរកម្មសិទ្ធិ (ជាជម្រើស)') }}</label>
                <select id="ownership-recipient" v-model="transferToUserId" class="form-select">
                  <option value="">{{ text('Delete without transferring ownership', 'លុបដោយមិនផ្ទេរកម្មសិទ្ធិ') }}</option>
                  <option v-for="candidate in ownershipCandidates" :key="candidate.id" :value="String(candidate.id)">
                    {{ candidate.name }} ({{ candidate.username }})
                  </option>
                </select>
              </div>
              <div v-else-if="deletingUser.isOwner && !ownershipOptionsLoading && !userActionError" class="alert alert-info">
                {{ text('No eligible staff are available. You can still delete this owner without transferring ownership.', 'មិនមានបុគ្គលិកដែលមានសិទ្ធិទេ។ អ្នកនៅតែអាចលុបម្ចាស់ក្រុមហ៊ុននេះដោយមិនផ្ទេរកម្មសិទ្ធិ។') }}
              </div>
              <div v-if="userActionError" class="alert alert-danger" role="alert">{{ userActionError }}</div>
              <div class="d-flex justify-content-end gap-2 mt-4">
                <button class="btn btn-outline-secondary" type="button" :disabled="userSaving" @click="closeDeleteModal">
                  {{ text('Cancel', 'បោះបង់') }}
                </button>
                <button class="btn btn-danger" type="button" :disabled="userSaving" @click="confirmDeleteUser">
                  <span v-if="userSaving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                  {{ text('Delete account', 'លុបគណនី') }}
                </button>
              </div>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>

    <!-- Summary Detail Modal -->
    <Teleport to="body">
      <Transition name="user-modal">
        <div v-if="summaryDetail" class="platform-modal-backdrop" @click.self="closeSummaryDetail">
          <section class="platform-modal platform-detail-modal card border-0 shadow-lg" role="dialog" aria-modal="true" aria-labelledby="summary-detail-title">
            <div class="card-header bg-white d-flex justify-content-between align-items-center p-4">
              <div>
                <h2 id="summary-detail-title" class="h5 fw-bold mb-1">{{ summaryDetail.title }}</h2>
                <p class="small text-secondary mb-0">{{ formatCount(summaryDetail.count) }} {{ text('records', 'កំណត់ត្រា') }}</p>
              </div>
              <button class="btn-close" type="button" :aria-label="text('Close', 'បិទ')" @click="closeSummaryDetail"></button>
            </div>

            <div v-if="summaryDetailError" class="alert alert-danger m-3 mb-0" role="alert">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <span>{{ summaryDetailError }}</span>
                <button class="btn btn-sm btn-outline-danger" type="button" :disabled="summaryDetailLoading" @click="openSummaryDetail(summaryDetail.key)">
                  {{ text('Retry', 'ព្យាយាមម្តងទៀត') }}
                </button>
              </div>
            </div>
            <div v-if="companyDeleteSuccess" class="alert alert-success m-3 mb-0" role="status">
              {{ companyDeleteSuccess }}
            </div>

            <div v-if="summaryDetailLoading" class="account-empty-state text-secondary" role="status">
              <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              {{ text('Loading details…', 'កំពុងផ្ទុកព័ត៌មានលម្អិត…') }}
            </div>

            <div v-else-if="summaryDetail.key === 'companies' && summaryDetailCompanies.length" class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <caption class="visually-hidden">{{ text('Registered companies detail', 'ព័ត៌មានលម្អិតក្រុមហ៊ុនដែលបានចុះឈ្មោះ') }}</caption>
                <thead>
                  <tr>
                    <th scope="col">{{ text('Company', 'ក្រុមហ៊ុន') }}</th>
                    <th scope="col">{{ text('Owners', 'ម្ចាស់') }}</th>
                    <th scope="col">{{ text('Active users', 'អ្នកប្រើប្រាស់សកម្ម') }}</th>
                    <th scope="col">{{ text('Total users', 'អ្នកប្រើប្រាស់សរុប') }}</th>
                    <th scope="col">{{ text('Created', 'កាលបរិច្ឆេទបង្កើត') }}</th>
                    <th scope="col" class="text-end">{{ text('Actions', 'សកម្មភាព') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="company in summaryDetailCompanies" :key="company.id">
                    <td>
                      <strong>{{ company.name }}</strong>
                      <div class="small text-secondary">#{{ company.id }}</div>
                    </td>
                    <td>{{ formatCount(company.ownerCount) }}</td>
                    <td>{{ formatCount(company.activeUserCount) }}</td>
                    <td>{{ formatCount(company.userCount) }}</td>
                    <td>{{ formatDate(company.createdAt) }}</td>
                    <td class="text-end">
                      <button
                        class="btn btn-sm btn-outline-danger text-nowrap"
                        type="button"
                        :disabled="companyDeleting"
                        :aria-label="text(`Delete ${company.name}`, `លុប ${company.name}`)"
                        @click="openCompanyDeleteModal(company)"
                      >
                        <i class="bi bi-trash3 me-1" aria-hidden="true"></i>{{ text('Delete', 'លុប') }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else-if="summaryDetail.key !== 'companies' && summaryDetailUsers.length" class="table-responsive">
              <table class="table table-hover align-middle mb-0">
                <caption class="visually-hidden">{{ summaryDetail.title }}</caption>
                <thead>
                  <tr>
                    <th scope="col">{{ text('Account', 'គណនី') }}</th>
                    <th scope="col">{{ text('Company', 'ក្រុមហ៊ុន') }}</th>
                    <th scope="col">{{ text('Role', 'តួនាទី') }}</th>
                    <th scope="col">{{ text('Status', 'ស្ថានភាព') }}</th>
                    <th scope="col">{{ text('Created', 'កាលបរិច្ឆេទបង្កើត') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="user in summaryDetailUsers" :key="user.id">
                    <td>
                      <strong>{{ user.name }}</strong>
                      <div class="small text-secondary"><span v-if="user.email"> · {{ user.email }}</span></div>
                    </td>
                    <td>{{ user.companyName || text('Unassigned', 'មិនទាន់បានកំណត់') }}</td>
                    <td>{{ user.isOwner ? text('Owner', 'ម្ចាស់ក្រុមហ៊ុន') : formatRole(user.role) }}</td>
                    <td>{{ accountStatus(user).label }}</td>
                    <td>{{ formatDate(user.createdAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else-if="!summaryDetailError && !summaryDetailLoading" class="account-empty-state text-secondary">
              {{ text('No records found.', 'រកមិនឃើញទិន្នន័យទេ។') }}
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>

    <!-- Delete Company Modal -->
    <Teleport to="body">
      <Transition name="user-modal">
        <div v-if="companyToDelete" class="platform-modal-backdrop" @click.self="closeCompanyDeleteModal">
          <section class="platform-modal platform-delete-modal card border-0 shadow-lg" role="alertdialog" aria-modal="true" aria-labelledby="delete-company-title" aria-describedby="delete-company-message">
            <div class="card-body p-4">
              <h2 id="delete-company-title" class="h5 fw-bold">{{ text('Delete company and all its data?', 'លុបក្រុមហ៊ុន និងទិន្នន័យទាំងអស់?') }}</h2>
              <p id="delete-company-message" class="text-secondary">
                {{ text('This permanently deletes', 'សកម្មភាពនេះនឹងលុបជាអចិន្ត្រៃយ៍') }}
                <strong>{{ companyToDelete.name }}</strong>
                {{ text('and all workspace users, transactions, and records from the database. Platform audit history is retained. This cannot be undone.', 'និងអ្នកប្រើប្រាស់ ប្រតិបត្តិការ និងកំណត់ត្រាទាំងអស់ពីប្រព័ន្ធទិន្នន័យ។ ប្រវត្តិកំណត់ហេតុប្រព័ន្ធនឹងត្រូវរក្សាទុក។ មិនអាចត្រឡប់វិញបានទេ។') }}
              </p>
              <label for="delete-company-confirmation" class="form-label">
                {{ text('Type the company name to confirm', 'វាយឈ្មោះក្រុមហ៊ុនដើម្បីបញ្ជាក់') }}
              </label>
              <input
                id="delete-company-confirmation"
                v-model.trim="companyDeleteConfirmation"
                class="form-control"
                autocomplete="off"
                :placeholder="companyToDelete.name"
                :disabled="companyDeleting"
              />
              <div v-if="companyDeleteError" class="alert alert-danger mt-3 mb-0" role="alert">
                {{ companyDeleteError }}
              </div>
              <div class="d-flex justify-content-end gap-2 mt-4">
                <button class="btn btn-outline-secondary" type="button" :disabled="companyDeleting" @click="closeCompanyDeleteModal">
                  {{ text('Cancel', 'បោះបង់') }}
                </button>
                <button
                  class="btn btn-danger"
                  type="button"
                  :disabled="companyDeleting || companyDeleteConfirmation.trim() !== companyToDelete.name.trim()"
                  @click="deleteCompanyRecord"
                >
                  <span v-if="companyDeleting" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                  {{ text('Delete all data', 'លុបទិន្នន័យទាំងអស់') }}
                </button>
              </div>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { useLanguageStore } from '@/stores/language';
import { staffPresets } from '@/router/permissionAccess';

const auth = useAuthStore();
const language = useLanguageStore();
const text = (english, khmer) => (language.isKhmer ? khmer : english);

// Overview state
const overview = ref(null);
const loading = ref(false);
const error = ref('');

// Accounts listing state
const userList = ref(null);
const usersLoading = ref(false);
const usersError = ref('');
const userActionError = ref('');
const userActionSuccess = ref('');
const userSearchInput = ref('');
const userSearch = ref('');
const userPage = ref(1);
let userSearchDebounce = null;
let userRequestSequence = 0;

// Edit & Delete User state
const editingUser = ref(null);
const deletingUser = ref(null);
const ownershipCandidates = ref([]);
const ownershipOptionsLoading = ref(false);
const transferToUserId = ref('');
const userSaving = ref(false);
const userForm = ref({ name: '', email: '', password: '', role: 'staff', preset: 'cashier', active: true });
const staffPresetNames = Object.keys(staffPresets || {});

// Summary Detail Modal state
const summaryDetail = ref(null);
const summaryDetailCompanies = ref([]);
const summaryDetailUsers = ref([]);
const summaryDetailLoading = ref(false);
const summaryDetailError = ref('');
let summaryDetailRequestSequence = 0;

// Company Deletion state
const companyToDelete = ref(null);
const companyDeleteConfirmation = ref('');
const companyDeleting = ref(false);
const companyDeleteError = ref('');
const companyDeleteSuccess = ref('');

const summaryCards = computed(() => [
  { key: 'companies', label: text('Registered companies', 'ក្រុមហ៊ុនដែលបានចុះឈ្មោះ'), value: overview.value?.summary?.totalCompanies || 0, icon: 'bi bi-buildings' },
  { key: 'owners', label: text('Company owners', 'ម្ចាស់ក្រុមហ៊ុន'), value: overview.value?.summary?.totalOwners || 0, icon: 'bi bi-person-badge' },
  { key: 'users', label: text('Company users', 'អ្នកប្រើប្រាស់ក្រុមហ៊ុន'), value: overview.value?.summary?.totalUsers || 0, icon: 'bi bi-people' },
]);

function formatCount(value) {
  return Number(value || 0).toLocaleString(language.isKhmer ? 'km-KH' : undefined);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(language.isKhmer ? 'km-KH' : undefined, { dateStyle: 'medium' }).format(date);
}

function formatRole(role) {
  if (role === 'superadmin') return text('Super Admin', 'អ្នកគ្រប់គ្រងប្រព័ន្ធ');
  if (role === 'owner') return text('Owner', 'ម្ចាស់ក្រុមហ៊ុន');
  return text('Staff', 'បុគ្គលិក');
}

function presetLabel(preset) {
  const presetTranslations = {
    cashier: 'អ្នកគិតប្រាក់',
    manager: 'អ្នកគ្រប់គ្រង',
    inventory: 'សារពើភណ្ឌ',
    accountant: 'គណនេយ្យករ',
    custom: 'កំណត់ផ្ទាល់ខ្លួន',
  };
  if (language.isKhmer && presetTranslations[preset]) return presetTranslations[preset];
  return preset ? preset.charAt(0).toUpperCase() + preset.slice(1) : '';
}

function accountStatus(user) {
  if (user?.approvalStatus === 'pending') {
    return { label: text('Pending approval', 'កំពុងរង់ចាំការអនុម័ត'), state: 'pending' };
  }
  if (user?.active && user?.approvalStatus === 'approved') {
    return { label: text('Active', 'សកម្ម'), state: 'active' };
  }
  return { label: text('Inactive', 'អសកម្ម'), state: 'inactive' };
}

function requestErrorMessage(requestError, english, khmer) {
  return language.isKhmer ? khmer : requestError?.message || english;
}

function isCurrentUser(user) {
  return Number(user?.id) === Number(auth.user?.id);
}

async function loadOverview() {
  loading.value = true;
  error.value = '';
  try {
    overview.value = await api.superAdminOverview({ page: 1, limit: 1 });
  } catch (requestError) {
    error.value = requestErrorMessage(requestError, 'Unable to load the platform overview.', 'មិនអាចផ្ទុកទិដ្ឋភាពទូទៅប្រព័ន្ធបានទេ។');
  } finally {
    loading.value = false;
  }
}

function closeSummaryDetail() {
  summaryDetailRequestSequence += 1;
  summaryDetail.value = null;
  summaryDetailLoading.value = false;
}

async function loadAllPages(fetchPage, property) {
  const firstPage = await fetchPage(1);
  const records = [...(firstPage[property] || [])];
  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const result = await fetchPage(page);
    if (result?.[property]) {
      records.push(...result[property]);
    }
  }
  return records;
}

async function openSummaryDetail(key) {
  const card = summaryCards.value.find((item) => item.key === key);
  if (!card) return;

  const sequence = ++summaryDetailRequestSequence;
  summaryDetail.value = { key, title: card.label, count: card.value };
  summaryDetailCompanies.value = [];
  summaryDetailUsers.value = [];
  summaryDetailError.value = '';
  companyDeleteSuccess.value = '';
  summaryDetailLoading.value = true;
  try {
    if (key === 'companies') {
      summaryDetailCompanies.value = await loadAllPages(
        (page) => api.superAdminOverview({ page, limit: 100 }),
        'companies'
      );
    } else {
      const users = await loadAllPages(
        (page) => api.superAdminUsers({ page, limit: 100 }),
        'users'
      );
      const companyUsers = users.filter((user) => user.role !== 'superadmin' && user.companyId !== null);
      summaryDetailUsers.value = key === 'owners'
        ? companyUsers.filter((user) => user.isOwner)
        : companyUsers;
    }
  } catch (requestError) {
    if (sequence !== summaryDetailRequestSequence) return;
    summaryDetailError.value = requestErrorMessage(
      requestError,
      'Unable to load summary details.',
      'មិនអាចផ្ទុកព័ត៌មានលម្អិតនៃសេចក្ដីសង្ខេបបានទេ។'
    );
  } finally {
    if (sequence === summaryDetailRequestSequence) summaryDetailLoading.value = false;
  }
}

function openCompanyDeleteModal(company) {
  companyToDelete.value = company;
  companyDeleteConfirmation.value = '';
  companyDeleteError.value = '';
}

function closeCompanyDeleteModal() {
  if (companyDeleting.value) return;
  companyToDelete.value = null;
  companyDeleteConfirmation.value = '';
  companyDeleteError.value = '';
}

async function deleteCompanyRecord() {
  const company = companyToDelete.value;
  const confirmedName = companyDeleteConfirmation.value.trim();
  if (!company || confirmedName !== company.name.trim()) return;

  companyDeleting.value = true;
  companyDeleteError.value = '';
  try {
    await api.deleteSuperAdminCompany(company.id, confirmedName);
    summaryDetailCompanies.value = summaryDetailCompanies.value.filter((entry) => entry.id !== company.id);
    if (summaryDetail.value) summaryDetail.value.count = Math.max(0, summaryDetail.value.count - 1);
    companyDeleteSuccess.value = text(
      `${company.name} and its workspace data were deleted.`,
      `បានលុប ${company.name} និងទិន្នន័យក្នុងក្រុមហ៊ុនរួចរាល់។`
    );
    companyToDelete.value = null;
    companyDeleteConfirmation.value = '';
    companyDeleteError.value = '';
    await Promise.all([loadOverview(), loadUsers()]);
  } catch (requestError) {
    companyDeleteError.value = requestErrorMessage(
      requestError,
      'Unable to delete this company and its data.',
      'មិនអាចលុបក្រុមហ៊ុន និងទិន្នន័យរបស់វាបានទេ។'
    );
  } finally {
    companyDeleting.value = false;
  }
}

async function loadUsers() {
  const sequence = ++userRequestSequence;
  usersLoading.value = true;
  usersError.value = '';
  try {
    const result = await api.superAdminUsers({
      page: userPage.value,
      limit: 20,
      search: userSearch.value,
    });
    if (sequence !== userRequestSequence) return;
    if (result.totalPages > 0 && userPage.value > result.totalPages) {
      userPage.value = result.totalPages;
      return await loadUsers();
    }
    userList.value = result;
  } catch (requestError) {
    if (sequence !== userRequestSequence) return;
    usersError.value = requestErrorMessage(requestError, 'Unable to load platform user accounts.', 'មិនអាចផ្ទុកគណនីអ្នកប្រើប្រាស់ក្នុងប្រព័ន្ធបានទេ។');
  } finally {
    if (sequence === userRequestSequence) usersLoading.value = false;
  }
}

watch(userSearchInput, (value) => {
  clearTimeout(userSearchDebounce);
  userSearchDebounce = setTimeout(() => {
    const nextSearch = (value || '').trim();
    if (nextSearch === userSearch.value) return;
    userSearch.value = nextSearch;
    userPage.value = 1;
    userActionError.value = '';
    loadUsers();
  }, 300);
});

function searchUsers() {
  clearTimeout(userSearchDebounce);
  const nextSearch = userSearchInput.value.trim();
  if (nextSearch === userSearch.value) return;
  userSearch.value = nextSearch;
  userPage.value = 1;
  userActionError.value = '';
  loadUsers();
}

function changeUserPage(nextPage) {
  userPage.value = nextPage;
  loadUsers();
}

function beginEdit(user) {
  editingUser.value = user;
  userActionError.value = '';
  userActionSuccess.value = '';
  userForm.value = {
    name: user.name,
    email: user.email || '',
    password: '',
    role: user.role,
    preset: user.permissions?.preset || 'cashier',
    active: user.active,
  };
}

function cancelEdit() {
  if (userSaving.value) return;
  editingUser.value = null;
  userActionError.value = '';
}

async function openDeleteModal(user) {
  if (isCurrentUser(user)) return;
  deletingUser.value = user;
  ownershipCandidates.value = [];
  transferToUserId.value = '';
  ownershipOptionsLoading.value = user.isOwner;
  userActionError.value = '';
  userActionSuccess.value = '';
  if (!user.isOwner) return;
  try {
    const options = await api.superAdminOwnershipTransferOptions(user.id);
    if (deletingUser.value?.id === user.id) ownershipCandidates.value = options.candidates || [];
  } catch (requestError) {
    if (deletingUser.value?.id === user.id) {
      userActionError.value = requestErrorMessage(requestError, 'Unable to load eligible ownership recipients.', 'មិនអាចផ្ទុកអ្នកទទួលកម្មសិទ្ធិដែលមានសិទ្ធិបានទេ។');
    }
  } finally {
    if (deletingUser.value?.id === user.id) ownershipOptionsLoading.value = false;
  }
}

function closeDeleteModal() {
  if (userSaving.value) return;
  deletingUser.value = null;
  ownershipCandidates.value = [];
  ownershipOptionsLoading.value = false;
  transferToUserId.value = '';
  userActionError.value = '';
}

async function saveUser() {
  if (!editingUser.value) return;
  userSaving.value = true;
  userActionError.value = '';
  userActionSuccess.value = '';
  try {
    const changes = {
      name: userForm.value.name,
      email: userForm.value.email,
      active: userForm.value.active,
    };
    if (!editingUser.value.isOwner) changes.role = userForm.value.role;
    if (userForm.value.role === 'staff') {
      changes.permissions = {
        preset: userForm.value.preset,
        grants: staffPresets[userForm.value.preset],
      };
    }
    if (userForm.value.password) changes.password = userForm.value.password;
    await api.updateSuperAdminUser(editingUser.value.id, changes);
    userActionSuccess.value = text(`Updated ${userForm.value.name}.`, `បានធ្វើបច្ចុប្បន្នភាព ${userForm.value.name}។`);
    editingUser.value = null;
    await loadUsers();
  } catch (requestError) {
    userActionError.value = requestErrorMessage(requestError, 'Unable to update this account.', 'មិនអាចធ្វើបច្ចុប្បន្នភាពគណនីនេះបានទេ។');
  } finally {
    userSaving.value = false;
  }
}

async function confirmDeleteUser() {
  if (!deletingUser.value) return;
  const user = deletingUser.value;
  const successor = ownershipCandidates.value.find((candidate) => String(candidate.id) === transferToUserId.value);
  userSaving.value = true;
  userActionError.value = '';
  userActionSuccess.value = '';
  try {
    await api.deleteSuperAdminUser(user.id, transferToUserId.value || undefined);
    if (editingUser.value?.id === user.id) editingUser.value = null;
    deletingUser.value = null;
    userActionSuccess.value = successor
      ? text(
          `Transferred company ownership to ${successor.name} and deleted ${user.name}.`,
          `បានផ្ទេរកម្មសិទ្ធិក្រុមហ៊ុនទៅឱ្យ ${successor.name} និងបានលុប ${user.name}។`
        )
      : text(`Deleted ${user.name}.`, `បានលុប ${user.name}។`);
    ownershipCandidates.value = [];
    transferToUserId.value = '';
    await loadUsers();
  } catch (requestError) {
    userActionError.value = requestErrorMessage(requestError, 'Unable to delete this account.', 'មិនអាចលុបគណនីនេះបានទេ។');
  } finally {
    userSaving.value = false;
  }
}

onMounted(() => {
  loadOverview();
  loadUsers();
});

onBeforeUnmount(() => {
  clearTimeout(userSearchDebounce);
  userRequestSequence += 1;
  summaryDetailRequestSequence += 1;
});
</script>

<style scoped>
.super-admin-page {
  max-width: 1680px;
  margin-inline: auto;
  color: #172b4d;
}

.super-admin-header {
  padding: 1.5rem;
  border: 1px solid #e5eaf1;
  border-radius: 16px;
  background: linear-gradient(115deg, #fff 0%, #f6fbfb 100%);
  box-shadow: 0 8px 24px rgba(17, 36, 63, .04);
}

.super-admin-eyebrow {
  color: #0b8178;
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.super-admin-stat {
  overflow: hidden;
  border: 1px solid #e5eaf1;
  box-shadow: 0 8px 22px rgba(34, 55, 88, .05);
  transition: transform .18s ease, box-shadow .18s ease;
}

.super-admin-stat:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(34, 55, 88, .09);
}

.super-admin-stat-button {
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.super-admin-stat-button:focus-visible {
  outline: 3px solid #0b8178;
  outline-offset: 3px;
}

.super-admin-stat-icon {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  place-items: center;
  border-radius: 14px;
  background: #eaf6f5;
  color: #0b8178;
  font-size: 1.3rem;
}

.super-admin-stat-value {
  color: #11243f;
  font-size: 1.8rem;
  font-weight: 750;
  line-height: 1.1;
}

.super-admin-accounts {
  overflow: hidden;
  border: 1px solid #e5eaf1;
  box-shadow: 0 10px 28px rgba(34, 55, 88, .05);
}

.account-count-badge,
.role-label {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #f0f3f8;
  color: #44546a;
  font-size: .78rem;
  font-weight: 650;
  padding: .35rem .65rem;
  white-space: nowrap;
}

.super-admin-accounts .table thead th {
  background: #f7f9fc;
  color: #64748b;
  font-size: .72rem;
  font-weight: 750;
  letter-spacing: .06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.super-admin-accounts .table tbody td {
  border-color: #edf0f5;
}

.company-name {
  color: #334155;
  font-weight: 600;
}

.account-status {
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  border-radius: 999px;
  font-size: .78rem;
  font-weight: 700;
  padding: .38rem .65rem;
}

.account-status.is-active {
  background: #eaf7f0;
  color: #18794e;
}

.account-status.is-inactive {
  background: #f1f3f6;
  color: #667085;
}

.account-status.is-pending {
  background: #fff5df;
  color: #9a6700;
}

.account-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.account-empty-state {
  display: grid;
  min-height: 190px;
  align-content: center;
  justify-items: center;
  padding: 2rem;
  text-align: center;
}

.account-empty-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 50%;
  background: #f0f4f8;
  color: #718096;
  font-size: 1.25rem;
}

.super-admin-page .btn {
  transition: background-color .15s ease, border-color .15s ease, box-shadow .15s ease;
}

@media (max-width: 575.98px) {
  .super-admin-header {
    align-items: stretch !important;
    padding: 1.15rem;
  }

  .super-admin-header > .btn {
    width: 100%;
  }
}

.platform-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2050;
  display: grid;
  place-items: center;
  overflow-y: auto;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.58);
  backdrop-filter: blur(3px);
}

.platform-modal {
  width: min(100%, 720px);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
}

.platform-delete-modal {
  width: min(100%, 460px);
}

.platform-detail-modal {
  width: min(100%, 1040px);
}

.user-modal-enter-active,
.user-modal-leave-active {
  transition: opacity 0.16s ease;
}

.user-modal-enter-from,
.user-modal-leave-to {
  opacity: 0;
}
</style>