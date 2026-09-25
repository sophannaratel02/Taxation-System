<template>
  <main class="auth-page">
    <div class="auth-wrapper">
      <!-- Left Column: High-End Industrial & FinTech Showcase -->
      <section class="auth-aside" aria-hidden="true">
        <!-- Ambient Mesh Background with Warm Golden Glows -->
        <div class="ambient-glow glow-top"></div>
        <div class="ambient-glow glow-bottom"></div>
        <div class="pattern-grid"></div>

        <div class="aside-content">
          <!-- Brand Logo Header -->
          <div class="aside-brand">
            <img :src="logoUrl" class="auth-wordmark" alt="Axis Investment Consulting" />
          </div>

          <!-- Hero Value Statement -->
          <div class="aside-body">
            <div class="status-indicator">
              <span class="pulse-dot"></span>
              <span>All Node Systems Operational</span>
            </div>
            <h2>Enterprise precision for inventory, ledger &amp; fiscal compliance.</h2>
            <p>
              Streamline multi-entity sales reconciliation, audit trails, and automated VAT/GST filings in one synchronized terminal.
            </p>

            <!-- Mini Live Stat Highlights -->
            <div class="stat-cards">
              <div class="stat-card">
                <span class="stat-num">99.98%</span>
                <span class="stat-label">Filing Accuracy</span>
              </div>
              <div class="stat-card">
                <span class="stat-num">&lt; 12ms</span>
                <span class="stat-label">Sync Latency</span>
              </div>
            </div>
          </div>

          <!-- Aside Footer -->
          <div class="aside-footer">
            <div class="metric-chip">
              <i class="bi bi-shield-check"></i>
              <span>ISO 27001 &amp; SOC2 Type II Certified</span>
            </div>
            <p class="copyright">&copy; {{ currentYear }} Axis Platform Inc. All rights reserved.</p>
          </div>
        </div>
      </section>

      <!-- Right Column: Authentication Panel -->
      <section class="auth-panel-container">
        <div class="auth-panel">
          <header class="auth-header">
            <div class="eyebrow-chip">
              <i class="bi bi-lock-fill"></i>
              <span>Access Terminal</span>
            </div>
            <h1>Sign in to workspace</h1>
            <p>Enter your assigned operator credentials to proceed.</p>
          </header>

          <form @submit.prevent="submit" class="auth-form" novalidate>
            <!-- Username Input -->
            <div class="form-group">
              <label for="username" class="form-label">Username or Staff ID</label>
              <div class="input-wrapper" :class="{ 'has-value': !!form.username }">
                <span class="input-icon">
                  <i class="bi bi-person-badge"></i>
                </span>
                <input
                  id="username"
                  v-model.trim="form.username"
                  type="text"
                  class="custom-input"
                  placeholder="e.g. admin"
                  autocomplete="username"
                  required
                />
              </div>
            </div>

            <!-- Password Input -->
            <div class="form-group">
              <div class="label-row">
                <label for="password" class="form-label">Security Key / Password</label>
                <router-link to="/forgot-password" class="forgot-link">
                  Forgot key?
                </router-link>
              </div>
              <div class="input-wrapper" :class="{ 'has-value': !!form.password }">
                <span class="input-icon">
                  <i class="bi bi-shield-lock"></i>
                </span>
                <input
                  id="password"
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  class="custom-input with-toggle"
                  placeholder="••••••••••••"
                  autocomplete="current-password"
                  required
                />
                <button
                  class="btn-toggle-visibility"
                  type="button"
                  tabindex="-1"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  @click="showPassword = !showPassword"
                >
                  <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
                </button>
              </div>
            </div>

            <!-- Remember me & Status -->
            <div class="form-extra">
              <label class="custom-checkbox">
                <input type="checkbox" v-model="rememberMe" />
                <span class="checkbox-mark"></span>
                <span class="checkbox-text">Trust this workstation</span>
              </label>
            </div>

            <!-- Error Notification -->
            <transition name="shake-fade">
              <div v-if="error" class="error-banner" role="alert">
                <i class="bi bi-exclamation-octagon-fill"></i>
                <span>{{ error }}</span>
              </div>
            </transition>

            <!-- Submit Button (Primary Yellow) -->
            <button class="btn-primary-yellow" type="submit" :disabled="loading">
              <span v-if="loading" class="spinner"></span>
              <span class="btn-text">{{ loading ? 'Verifying Credentials...' : 'Authenticate & Enter' }}</span>
              <i v-if="!loading" class="bi bi-arrow-right-short btn-arrow"></i>
            </button>
          </form>

          <!-- Quick Dev Fill + Footer -->
          <footer class="auth-footer">
            <p class="new-account-text">
              Unregistered staff?
              <router-link to="/register" class="register-link">Request access</router-link>
            </p>

            <!-- Clickable Dev helper pill -->
            <button
              type="button"
              class="dev-credential-chip"
              title="Click to auto-populate test credentials"
              @click="quickFillDev"
            >
              <div class="chip-label">
                <i class="bi bi-lightning-charge-fill"></i>
                <span>Demo Sandbox</span>
              </div>
              <span class="chip-code">admin / admin123</span>
              <i class="bi bi-cursor-fill click-hint"></i>
            </button>
          </footer>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { reactive, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/services/api';
import { useTaxStore } from '@/stores/tax';
import logoUrl from '@/assets/logo.svg';

const router = useRouter();
const tax = useTaxStore();

const loading = ref(false);
const error = ref('');
const showPassword = ref(false);
const rememberMe = ref(true);

const form = reactive({
  username: '',
  password: ''
});

const currentYear = computed(() => new Date().getFullYear());

// Convenience helper for testing
function quickFillDev() {
  form.username = 'admin';
  form.password = 'admin123';
  error.value = '';
}

async function submit() {
  if (!form.username || !form.password) {
    error.value = 'Please provide both username and password.';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const session = await api.login(form.username, form.password);
    localStorage.setItem('tax_token', session.token);
    localStorage.setItem('tax_user', JSON.stringify(session.user));
    await tax.initialize();
    router.push('/');
  } catch (requestError) {
    error.value = requestError?.message || 'Authentication failed. Please verify your credentials.';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* ==========================================================================
   Variables & Foundation
   Primary Yellow: #F59E0B (Amber-500) | #D97706 (Amber-600) | #B45309
   Deep Slate: #0B0F19 | #111827 | #1F2937
   ========================================================================== */

.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #080c14;
  background-image: 
    radial-gradient(at 100% 0%, rgba(245, 158, 11, 0.08) 0px, transparent 50%),
    radial-gradient(at 0% 100%, rgba(217, 119, 6, 0.06) 0px, transparent 50%);
  font-family: -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", "Segoe UI", Inter, Roboto, sans-serif;
  color: #0f172a;
  padding: 1.5rem;
  box-sizing: border-box;
}

.auth-wrapper {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  width: 100%;
  max-width: 1080px;
  min-height: 660px;
  background: #ffffff;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 
    0 25px 50px -12px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 0 80px -20px rgba(245, 158, 11, 0.12);
}

/* ==========================================================================
   Left Aside: High-End Industrial Dark Showcase
   ========================================================================== */

.auth-aside {
  position: relative;
  background: #0d121f;
  color: #f8fafc;
  padding: 3.5rem 3rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.ambient-glow {
  position: absolute;
  pointer-events: none;
  filter: blur(80px);
  border-radius: 50%;
  opacity: 0.6;
}

.glow-top {
  top: -100px;
  right: -80px;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, #f59e0b 0%, rgba(245, 158, 11, 0) 70%);
}

.glow-bottom {
  bottom: -120px;
  left: -80px;
  width: 280px;
  height: 280px;
  background: radial-gradient(circle, rgba(217, 119, 6, 0.4) 0%, transparent 70%);
}

.pattern-grid {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 0);
  background-size: 24px 24px;
  opacity: 0.4;
  pointer-events: none;
}

.aside-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-between;
}

/* Brand */
.aside-brand {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.brand-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%);
  color: #111827;
  border-radius: 14px;
  box-shadow: 
    0 8px 20px -4px rgba(245, 158, 11, 0.5),
    inset 0 1px 1px rgba(255, 255, 255, 0.4);
}

.brand-icon {
  font-size: 1.5rem;
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-name {
  font-size: 1.35rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  color: #ffffff;
  line-height: 1.1;
}

.brand-dot {
  color: #f59e0b;
}

.brand-tag {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: #f59e0b;
  margin-top: 2px;
}

/* Aside Body */
.aside-body {
  margin: 3rem 0;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
  color: #fbbf24;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin-bottom: 1.25rem;
}

.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 8px #f59e0b;
  animation: pulse 2s infinite;
}

.aside-body h2 {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.25;
  color: #ffffff;
  letter-spacing: -0.02em;
  margin-bottom: 1rem;
}

.aside-body p {
  color: #94a3b8;
  font-size: 0.95rem;
  line-height: 1.65;
  max-width: 440px;
  margin: 0;
}

.stat-cards {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}

.stat-card {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
}

.stat-num {
  font-size: 1.25rem;
  font-weight: 800;
  color: #fbbf24;
  font-family: monospace;
}

.stat-label {
  font-size: 0.72rem;
  color: #94a3b8;
  font-weight: 500;
  margin-top: 0.2rem;
}

/* Aside Footer */
.aside-footer {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.metric-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #cbd5e1;
  font-size: 0.75rem;
  font-weight: 500;
}

.metric-chip i {
  color: #f59e0b;
  font-size: 0.9rem;
}

.copyright {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
}

/* ==========================================================================
   Right Panel: Authentication Form
   ========================================================================== */

.auth-panel-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3.5rem 3.25rem;
  background: #ffffff;
}

.auth-panel {
  width: 100%;
  max-width: 410px;
}

/* Header */
.auth-header {
  margin-bottom: 2rem;
}

.eyebrow-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: #fffbeb;
  border: 1px solid #fef3c7;
  color: #b45309;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.25rem 0.65rem;
  border-radius: 6px;
  margin-bottom: 0.85rem;
}

.eyebrow-chip i {
  font-size: 0.75rem;
  color: #d97706;
}

.auth-header h1 {
  font-size: 1.85rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.35rem 0;
  letter-spacing: -0.025em;
}

.auth-header p {
  color: #64748b;
  font-size: 0.9rem;
  margin: 0;
}

/* Form Controls */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
  margin: 0;
}

.forgot-link {
  font-size: 0.8rem;
  color: #b45309;
  text-decoration: none;
  font-weight: 600;
  transition: color 0.15s ease;
}

.forgot-link:hover {
  color: #92400e;
  text-decoration: underline;
}

/* Input Fields */
.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 1rem;
  color: #94a3b8;
  font-size: 1.15rem;
  pointer-events: none;
  transition: color 0.2s ease;
  display: flex;
  align-items: center;
}

.custom-input {
  width: 100%;
  height: 48px;
  padding: 0 1rem 0 2.85rem;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  font-size: 0.92rem;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  outline: none;
  box-sizing: border-box;
}

.custom-input::placeholder {
  color: #94a3b8;
}

.custom-input.with-toggle {
  padding-right: 3rem;
}

.input-wrapper:focus-within .input-icon,
.input-wrapper.has-value .input-icon {
  color: #d97706;
}

.custom-input:focus {
  background: #ffffff;
  border-color: #f59e0b;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.15);
}

.btn-toggle-visibility {
  position: absolute;
  right: 0.85rem;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.35rem;
  display: flex;
  align-items: center;
  font-size: 1.1rem;
  border-radius: 6px;
  transition: color 0.15s ease;
}

.btn-toggle-visibility:hover {
  color: #475569;
}

/* Checkbox */
.form-extra {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.custom-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  cursor: pointer;
  user-select: none;
}

.custom-checkbox input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkbox-mark {
  width: 18px;
  height: 18px;
  background: #f1f5f9;
  border: 1.5px solid #cbd5e1;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.custom-checkbox input:checked ~ .checkbox-mark {
  background: #f59e0b;
  border-color: #f59e0b;
}

.custom-checkbox input:checked ~ .checkbox-mark::after {
  content: '';
  width: 5px;
  height: 9px;
  border: solid #111827;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-top: -2px;
}

.checkbox-text {
  font-size: 0.82rem;
  color: #64748b;
  font-weight: 500;
}

/* Error Banner */
.error-banner {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background-color: #fff1f2;
  border: 1px solid #ffe4e6;
  color: #be123c;
  font-size: 0.85rem;
  font-weight: 600;
}

.error-banner i {
  font-size: 1.05rem;
  flex-shrink: 0;
}

/* Yellow Primary Button */
.btn-primary-yellow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  height: 50px;
  background: linear-gradient(180deg, #fbbf24 0%, #f59e0b 60%, #d97706 100%);
  color: #0f172a;
  border: 1px solid #d97706;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  margin-top: 0.5rem;
  box-shadow: 
    0 4px 14px -2px rgba(245, 158, 11, 0.45),
    inset 0 1px 1px rgba(255, 255, 255, 0.5);
}

.btn-primary-yellow:hover:not(:disabled) {
  background: linear-gradient(180deg, #fcd34d 0%, #fbbf24 60%, #f59e0b 100%);
  box-shadow: 
    0 6px 20px -2px rgba(245, 158, 11, 0.6),
    inset 0 1px 1px rgba(255, 255, 255, 0.6);
  transform: translateY(-1.5px);
}

.btn-primary-yellow:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
}

.btn-primary-yellow:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  filter: grayscale(0.2);
}

.btn-arrow {
  font-size: 1.4rem;
  line-height: 1;
  transition: transform 0.15s ease;
}

.btn-primary-yellow:hover:not(:disabled) .btn-arrow {
  transform: translateX(3px);
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(15, 23, 42, 0.2);
  border-top-color: #0f172a;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* Footer & Dev Chip */
.auth-footer {
  margin-top: 2rem;
  text-align: center;
}

.new-account-text {
  font-size: 0.86rem;
  color: #64748b;
  margin: 0 0 1.25rem 0;
}

.register-link {
  color: #b45309;
  font-weight: 700;
  text-decoration: none;
  margin-left: 0.25rem;
}

.register-link:hover {
  color: #92400e;
  text-decoration: underline;
}

.dev-credential-chip {
  width: 100%;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 0.65rem 0.9rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.dev-credential-chip:hover {
  background: #fffbeb;
  border-color: #f59e0b;
  transform: translateY(-1px);
}

.chip-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 600;
}

.chip-label i {
  color: #f59e0b;
}

.chip-code {
  color: #0f172a;
  background: #e2e8f0;
  padding: 0.2rem 0.5rem;
  border-radius: 5px;
  font-weight: 700;
  font-size: 0.74rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.dev-credential-chip:hover .chip-code {
  background: #fef3c7;
  color: #92400e;
}

.click-hint {
  font-size: 0.75rem;
  color: #94a3b8;
  opacity: 0.7;
}

/* Animations */
@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.8; }
}

.shake-fade-enter-active {
  animation: shake 0.3s ease;
}

.shake-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-5px); }
  40%, 80% { transform: translateX(5px); }
}

/* Responsive */
@media (max-width: 900px) {
  .auth-wrapper {
    grid-template-columns: 1fr;
    max-width: 440px;
    min-height: auto;
  }

  .auth-aside {
    display: none;
  }

  .auth-panel-container {
    padding: 2.75rem 2rem;
  }
}
</style>