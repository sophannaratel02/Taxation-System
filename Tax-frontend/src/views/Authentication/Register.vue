<template>
  <main class="auth-page">
    <div class="auth-wrapper">
      <!-- Left Column: Staff Onboarding Showcase -->
      <section class="auth-aside" aria-hidden="true">
        <!-- Ambient Warm Glow Effects -->
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
              <span>Staff Provisioning Active</span>
            </div>
            <h2>Join your organization's synchronized fiscal network.</h2>
            <p>
              Register your terminal account to record transactions, manage daily shifts, and issue verified tax receipts with real-time audit trails.
            </p>

            <!-- Role Badge Features -->
            <div class="perks-list">
              <div class="perk-item">
                <div class="perk-bullet"><i class="bi bi-receipt-cutoff"></i></div>
                <div>
                  <strong>Cashier &amp; POS Station Access</strong>
                  <span>Instant register handovers &amp; session locks</span>
                </div>
              </div>
              <div class="perk-item">
                <div class="perk-bullet"><i class="bi bi-fingerprint"></i></div>
                <div>
                  <strong>Role-Based Permission Matrix</strong>
                  <span>Secure, non-repudiable transaction signing</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Aside Footer -->
          <div class="aside-footer">
            <div class="metric-chip">
              <i class="bi bi-shield-check"></i>
              <span>Hardware &amp; Session Audit Logging</span>
            </div>
            <p class="copyright">&copy; {{ currentYear }} Axis Platform Inc. All rights reserved.</p>
          </div>
        </div>
      </section>

      <!-- Right Column: Registration Form Panel -->
      <section class="auth-panel-container">
        <div class="auth-panel">
          <header class="auth-header">
            <div class="eyebrow-chip">
              <i class="bi bi-person-plus-fill"></i>
              <span>Staff Enrollment</span>
            </div>
            <h1>Create operator account</h1>
            <p>Request a cashier or supervisor terminal account</p>
          </header>

          <form @submit.prevent="submit" class="auth-form" novalidate>
            <!-- Full Name -->
            <div class="form-group">
              <label for="fullName" class="form-label">Full Legal Name</label>
              <div class="input-wrapper" :class="{ 'has-value': !!form.name }">
                <span class="input-icon">
                  <i class="bi bi-person"></i>
                </span>
                <input
                  id="fullName"
                  v-model.trim="form.name"
                  type="text"
                  class="custom-input"
                  placeholder="e.g. Sarah Jenkins"
                  autocomplete="name"
                  required
                />
              </div>
            </div>

            <!-- Username -->
            <div class="form-group">
              <label for="username" class="form-label">Username / Staff ID</label>
              <div class="input-wrapper" :class="{ 'has-value': !!form.username }">
                <span class="input-icon">
                  <i class="bi bi-at"></i>
                </span>
                <input
                  id="username"
                  v-model.trim="form.username"
                  type="text"
                  class="custom-input"
                  placeholder="min. 3 characters (e.g. sjenkins)"
                  minlength="3"
                  autocomplete="username"
                  required
                />
              </div>
            </div>

            <div class="form-group">
              <label for="email" class="form-label">Work Email</label>
              <div class="input-wrapper" :class="{ 'has-value': !!form.email }">
                <span class="input-icon"><i class="bi bi-envelope"></i></span>
                <input id="email" v-model.trim="form.email" type="email" class="custom-input" placeholder="you@company.com" autocomplete="email" />
              </div>
            </div>

            <!-- Password with Show/Hide toggle -->
            <div class="form-group">
              <label for="password" class="form-label">Security Password</label>
              <div class="input-wrapper" :class="{ 'has-value': !!form.password }">
                <span class="input-icon">
                  <i class="bi bi-shield-lock"></i>
                </span>
                <input
                  id="password"
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  class="custom-input with-toggle"
                  placeholder="At least 6 characters"
                  minlength="6"
                  autocomplete="new-password"
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

              <!-- Password Strength Meter -->
              <div v-if="form.password" class="password-meter">
                <div class="meter-bar">
                  <div
                    class="meter-fill"
                    :style="{ width: strengthWidth, backgroundColor: strengthColor }"
                  ></div>
                </div>
                <span class="meter-text" :style="{ color: strengthColor }">{{ strengthLabel }}</span>
              </div>
            </div>

            <!-- Terms Agreement -->
            <div class="form-extra">
              <label class="custom-checkbox">
                <input type="checkbox" v-model="agreeTerms" required />
                <span class="checkbox-mark"></span>
                <span class="checkbox-text">
                  I agree to the <a href="#" class="policy-link" @click.prevent>Security &amp; Fiscal Compliance Policy</a>
                </span>
              </label>
            </div>

            <!-- Error Banner -->
            <transition name="shake-fade">
              <div v-if="error" class="banner error-banner" role="alert">
                <i class="bi bi-exclamation-octagon-fill"></i>
                <span>{{ error }}</span>
              </div>
            </transition>

            <!-- Success Banner -->
            <transition name="shake-fade">
              <div v-if="success" class="banner success-banner" role="status">
                <i class="bi bi-check-circle-fill"></i>
                <div>
                  <strong>Account provisioned successfully!</strong>
                  <p>Redirecting you to the sign-in portal...</p>
                </div>
              </div>
            </transition>

            <!-- Submit Button (Yellow Primary) -->
            <button
              class="btn-primary-yellow"
              type="submit"
              :disabled="loading || success || !agreeTerms"
            >
              <span v-if="loading" class="spinner"></span>
              <span class="btn-text">{{ loading ? 'Provisioning Account...' : 'Create Staff Account' }}</span>
              <i v-if="!loading" class="bi bi-arrow-right-short btn-arrow"></i>
            </button>
          </form>

          <!-- Back to Login Footer -->
          <footer class="auth-footer">
            <p class="existing-account-text">
              Already have assigned credentials?
              <router-link to="/login" class="login-link">Sign in here</router-link>
            </p>

            <div class="compliance-pill">
              <i class="bi bi-shield-lock-fill"></i>
              <span>Access requests require supervisor authorization</span>
            </div>
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
import logoUrl from '@/assets/logo.svg';

const router = useRouter();

const loading = ref(false);
const error = ref('');
const success = ref(false);
const showPassword = ref(false);
const agreeTerms = ref(true);

const form = reactive({
  name: '',
  username: '',
  email: '',
  password: ''
});

const currentYear = computed(() => new Date().getFullYear());

// Dynamic Password Strength Meter
const passwordScore = computed(() => {
  const pwd = form.password;
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 10) score += 1;
  if (/[0-9]/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
  return score;
});

const strengthLabel = computed(() => {
  switch (passwordScore.value) {
    case 1: return 'Weak (min 6 chars)';
    case 2: return 'Moderate';
    case 3: return 'Strong';
    case 4: return 'Very Secure';
    default: return '';
  }
});

const strengthWidth = computed(() => {
  return `${(passwordScore.value / 4) * 100}%`;
});

const strengthColor = computed(() => {
  switch (passwordScore.value) {
    case 1: return '#ef4444';
    case 2: return '#f59e0b';
    case 3: return '#10b981';
    case 4: return '#059669';
    default: return 'transparent';
  }
});

async function submit() {
  if (!form.name || !form.username || !form.password) {
    error.value = 'Please fill in all required credentials.';
    return;
  }

  if (form.username.length < 3) {
    error.value = 'Username must be at least 3 characters.';
    return;
  }

  if (form.password.length < 6) {
    error.value = 'Password must be at least 6 characters.';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    await api.register(form);
    success.value = true;
    setTimeout(() => {
      router.push('/login');
    }, 1000);
  } catch (requestError) {
    error.value = requestError?.message || 'Failed to create account. Please try again.';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* ==========================================================================
   Variables & Foundation
   Primary Yellow: #F59E0B (Amber-500) | #D97706 (Amber-600) | #B45309
   Deep Slate: #080C14 | #0D121F | #1E293B
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
  min-height: 680px;
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
  margin: 2.5rem 0;
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

.perks-list {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  margin-top: 2rem;
}

.perk-item {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
}

.perk-bullet {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  font-size: 1rem;
  flex-shrink: 0;
}

.perk-item strong {
  display: block;
  font-size: 0.88rem;
  color: #f1f5f9;
}

.perk-item span {
  font-size: 0.76rem;
  color: #94a3b8;
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
   Right Panel: Registration Form
   ========================================================================== */

.auth-panel-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 3.25rem;
  background: #ffffff;
}

.auth-panel {
  width: 100%;
  max-width: 410px;
}

/* Header */
.auth-header {
  margin-bottom: 1.75rem;
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
  margin-bottom: 0.75rem;
}

.eyebrow-chip i {
  font-size: 0.75rem;
  color: #d97706;
}

.auth-header h1 {
  font-size: 1.75rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.35rem 0;
  letter-spacing: -0.025em;
}

.auth-header p {
  color: #64748b;
  font-size: 0.88rem;
  margin: 0;
}

/* Form Controls */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
  margin: 0;
}

/* Inputs */
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
  height: 46px;
  padding: 0 1rem 0 2.85rem;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  outline: none;
  box-sizing: border-box;
}

.custom-input::placeholder {
  color: #94a3b8;
  font-size: 0.85rem;
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

/* Password Strength Indicator */
.password-meter {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-top: 0.35rem;
}

.meter-bar {
  flex: 1;
  height: 4px;
  background: #e2e8f0;
  border-radius: 2px;
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  transition: all 0.3s ease;
}

.meter-text {
  font-size: 0.72rem;
  font-weight: 700;
}

/* Agreement Checkbox */
.form-extra {
  margin-top: 0.2rem;
}

.custom-checkbox {
  display: inline-flex;
  align-items: flex-start;
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
  width: 17px;
  height: 17px;
  background: #f1f5f9;
  border: 1.5px solid #cbd5e1;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  margin-top: 2px;
  flex-shrink: 0;
}

.custom-checkbox input:checked ~ .checkbox-mark {
  background: #f59e0b;
  border-color: #f59e0b;
}

.custom-checkbox input:checked ~ .checkbox-mark::after {
  content: '';
  width: 4px;
  height: 8px;
  border: solid #111827;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-top: -2px;
}

.checkbox-text {
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.45;
}

.policy-link {
  color: #b45309;
  text-decoration: underline;
  font-weight: 600;
}

.policy-link:hover {
  color: #92400e;
}

/* Banners */
.banner {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  font-size: 0.85rem;
}

.banner i {
  font-size: 1.15rem;
  line-height: 1.2;
  flex-shrink: 0;
}

.error-banner {
  background-color: #fff1f2;
  border: 1px solid #ffe4e6;
  color: #be123c;
  font-weight: 600;
}

.success-banner {
  background-color: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}

.success-banner strong {
  display: block;
}

.success-banner p {
  margin: 0.15rem 0 0 0;
  font-size: 0.78rem;
  opacity: 0.9;
}

/* Yellow Primary Button */
.btn-primary-yellow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  height: 48px;
  background: linear-gradient(180deg, #fbbf24 0%, #f59e0b 60%, #d97706 100%);
  color: #0f172a;
  border: 1px solid #d97706;
  border-radius: 12px;
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  margin-top: 0.4rem;
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

/* Footer */
.auth-footer {
  margin-top: 1.75rem;
  text-align: center;
}

.existing-account-text {
  font-size: 0.86rem;
  color: #64748b;
  margin: 0 0 1.25rem 0;
}

.login-link {
  color: #b45309;
  font-weight: 700;
  text-decoration: none;
  margin-left: 0.25rem;
}

.login-link:hover {
  color: #92400e;
  text-decoration: underline;
}

.compliance-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 0.45rem 0.85rem;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 500;
}

.compliance-pill i {
  color: #d97706;
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