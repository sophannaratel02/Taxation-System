<template><div class="card border-0 shadow-sm"><div class="card-header bg-white py-3"><strong>{{ title }}</strong></div><div v-for="item in pending" :key="item.id" class="p-3 border-bottom"><div class="fw-semibold">{{ item[nameKey] }}</div><small class="text-muted d-block mb-2">{{ item.submitted_by_name || item.submitted_by || '' }}</small><div class="d-flex gap-2"><button class="btn btn-sm btn-success" type="button" @click="review(item, 'Approved')">Approve</button><button class="btn btn-sm btn-outline-danger" type="button" @click="reject(item)">Reject</button></div></div><div v-if="!pending.length" class="text-muted text-center py-4">No pending requests.</div></div></template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ title: String, items: { type: Array, default: () => [] }, nameKey: String }); const emit = defineEmits(['review']); const pending = computed(() => props.items.filter((item) => item.status === 'Pending Approval'));
function review(item, status, reason = '') { emit('review', item, status, reason); }
function reject(item) { const reason = window.prompt('Reason for rejection:'); if (reason?.trim()) review(item, 'Rejected', reason.trim()); }
</script>
