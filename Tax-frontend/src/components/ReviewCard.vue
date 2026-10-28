<template>
  <div class="card border-0 shadow-sm">
    <!-- Header -->
    <div class="card-header bg-white py-3">
      <strong>{{ title }}</strong>
    </div>

    <!-- Items List -->
    <div
      v-for="item in pending"
      :key="item.id"
      class="p-3 border-bottom"
    >
      <div class="fw-semibold">
        {{ item[nameKey] }}
      </div>
      
      <small class="text-muted d-block mb-2">
        {{ item.submitted_by_name || item.submitted_by || '' }}
      </small>

      <div class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-sm btn-success"
          @click="review(item, 'Approved')"
        >
          {{ language.isKhmer ? 'អនុម័ត' : 'Approve' }}
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-danger"
          @click="reject(item)"
        >
          {{ language.isKhmer ? 'បដិសេធ' : 'Reject' }}
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="!pending.length"
      class="text-muted text-center py-4"
    >
      {{ language.isKhmer ? 'មិនមានសំណើកំពុងរង់ចាំទេ។' : 'No pending requests.' }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useLanguageStore } from '@/stores/language';

const language = useLanguageStore();

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  items: {
    type: Array,
    default: () => [],
  },
  nameKey: {
    type: String,
    default: 'name',
  },
});

const emit = defineEmits(['review']);

const pending = computed(() =>
  props.items.filter((item) => item.status === 'Pending Approval')
);

function review(item, status, reason = '') {
  emit('review', item, status, reason);
}

function reject(item) {
  const reason = window.prompt(language.isKhmer ? 'មូលហេតុនៃការបដិសេធ៖' : 'Reason for rejection:');
  if (reason?.trim()) {
    review(item, 'Rejected', reason.trim());
  }
}
</script>