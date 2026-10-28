import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './assets/main.css';
import { useAuthStore } from './stores/auth';
import { useTaxStore } from './stores/tax';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

const app = createApp(App);
app.config.performance = true;
app.use(createPinia());
app.use(router);

const authStore = useAuthStore();
const taxStore = useTaxStore();
router.isReady()
  .then(async () => {
    if (localStorage.getItem('tax_token') && authStore.user) await taxStore.initialize();
    app.mount('#app');
  })
  .catch((error) => {
    console.error('Application startup failed.', error);
    app.mount('#app');
  });