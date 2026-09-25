<template>
  <section class="container-fluid p-4 page-canvas">
    <!-- Header -->
    <div class="mb-4 d-flex justify-content-between align-items-end">
      <div>
        <div class="eyebrow mb-2">{{ language.t('updates') }}</div>
        <h1 class="h3 fw-bold mb-1">{{ language.t('notifications') }}</h1>
        <p class="text-muted mb-0">{{ language.t('approvalUpdates') }}</p>
      </div>

      <button
        v-if="hasUnread"
        class="btn btn-sm btn-outline-secondary"
        :disabled="isMarkingAll"
        @click="markAllAsRead"
      >
        {{ language.t('markAllRead') }}
      </button>
    </div>

    <!-- Notification List Container -->
    <div class="card border-0 shadow-sm overflow-hidden">
      <!-- Loading State -->
      <div v-if="isLoading" class="text-center text-muted py-5">
        <div class="spinner-border spinner-border-sm text-primary me-2" role="status" />
        {{ language.t('loadingUpdates') }}
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!notifications.length"
        class="text-center text-muted py-5"
      >
        {{ language.t('noNotifications') }}
      </div>

      <!-- Item List -->
      <div
        v-for="notification in notifications"
        v-else
        :key="notification.id"
        role="button"
        tabindex="0"
        class="p-3 border-bottom notification-item transition-all"
        :class="{ 'bg-unread': !notification.read_at }"
        @click="handleRead(notification)"
        @keydown.enter.prevent="handleRead(notification)"
        @keydown.space.prevent="handleRead(notification)"
      >
        <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
          <div class="d-flex align-items-center gap-2">
            <span
              v-if="!notification.read_at"
              class="unread-dot bg-primary rounded-circle"
              aria-label="Unread notification"
            />
            <strong :class="{ 'fw-bold': !notification.read_at }">
              {{ notification.title }}
            </strong>
          </div>
          <small class="text-muted text-nowrap">
            {{ formatDate(notification.created_at) }}
          </small>
        </div>
        <p class="mb-0 text-muted small ps-3">
          {{ notification.message }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';

const notifications = ref([]);
const language = useLanguageStore();
const isLoading = ref(true);
const isMarkingAll = ref(false);

const hasUnread = computed(() =>
  notifications.value.some((n) => !n.read_at)
);

const formatDate = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return isNaN(date.getTime()) ? '' : date.toLocaleString();
};

async function load() {
  isLoading.value = true;
  try {
    const data = await api.notifications();
    notifications.value = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Failed to load notifications:', error);
  } finally {
    isLoading.value = false;
  }
}

async function handleRead(notification) {
  if (notification.read_at) return;

  // Optimistic update
  const previousState = notification.read_at;
  notification.read_at = new Date().toISOString();

  try {
    await api.markNotificationRead(notification.id);
  } catch (error) {
    // Rollback on network failure
    notification.read_at = previousState;
    console.error('Failed to mark notification as read:', error);
  }
}

async function markAllAsRead() {
  const unreadItems = notifications.value.filter((n) => !n.read_at);
  if (!unreadItems.length) return;

  isMarkingAll.value = true;
  const now = new Date().toISOString();
  unreadItems.forEach((n) => (n.read_at = now));

  try {
    if (typeof api.markAllNotificationsRead === 'function') {
      await api.markAllNotificationsRead();
    } else {
      await Promise.all(unreadItems.map((n) => api.markNotificationRead(n.id)));
    }
  } catch (error) {
    console.error('Failed to mark all as read:', error);
  } finally {
    isMarkingAll.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.notification-item {
  cursor: pointer;
  transition: background-color 0.15s ease-in-out;
}

.notification-item:hover {
  background-color: var(--bs-tertiary-bg, #f8f9fa);
}

.bg-unread {
  background-color: rgba(var(--bs-primary-rgb, 13, 110, 253), 0.04);
}

.unread-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  display: inline-block;
}
</style>