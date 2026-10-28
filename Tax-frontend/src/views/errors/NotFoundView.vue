<template>
  <div class="container py-5 text-center">
    <i class="bi bi-compass display-1 text-primary"></i>
    <h1 class="mt-3">{{ text('404 - Page not found', '៤០៤ - រកមិនឃើញទំព័រ') }}</h1>
    <p class="text-muted">{{ text('The page you requested does not exist.', 'ទំព័រដែលអ្នកស្នើសុំមិនមានទេ។') }}</p>
    <router-link class="btn btn-primary" to="/">{{ text('Return to dashboard', 'ត្រឡប់ទៅផ្ទាំងគ្រប់គ្រង') }}</router-link>
  </div>
</template>

<script setup>
import { useLanguageStore } from '../../stores/language.js';

const language = useLanguageStore();
const text = (english, khmer) => (language.isKhmer ? khmer : english);
</script>
