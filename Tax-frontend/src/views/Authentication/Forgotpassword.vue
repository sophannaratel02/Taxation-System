<template>
  <main class="recovery-page">
    <section class="recovery-card" aria-labelledby="recovery-title">
      <!-- Brand & Header -->
      <header class="brand-row">
        <img :src="logoUrl" alt="Logo" class="logo" />
        <span class="security-mark" title="Secured with OTP">
          <i class="bi bi-shield-lock-fill"></i>
        </span>
      </header>

      <!-- Stepper Indicator -->
      <div class="stepper" aria-label="Password recovery progress">
        <div
          v-for="item in steps"
          :key="item.number"
          class="step"
          :class="{ 
            active: step >= item.number,
            current: step === item.number 
          }"
        >
          <span>
            <i v-if="step > item.number" class="bi bi-check-lg"></i>
            <template v-else>{{ item.number }}</template>
          </span>
          <small>{{ item.label }}</small>
        </div>
      </div>

      <!-- Title & Copy -->
      <header class="copy-block">
        <p class="eyebrow">{{ text('SECURE ACCESS', 'សុវត្ថិភាពចូលប្រើ') }}</p>
        <h1 id="recovery-title">{{ title }}</h1>
        <p class="description-text">{{ description }}</p>
      </header>

      <!-- Feedback Alerts -->
      <div v-if="error" class="feedback error" role="alert">
        <i class="bi bi-exclamation-triangle-fill me-2 fs-5 flex-shrink-0"></i>
        <div>{{ error }}</div>
      </div>
      <div v-if="success" class="feedback success" role="status">
        <i class="bi bi-check-circle-fill me-2 fs-5 flex-shrink-0"></i>
        <div>{{ success }}</div>
      </div>

      <!-- Step 1: Request OTP -->
      <form v-if="step === 1" @submit.prevent="requestOtp">
        <label class="field-label" for="emailOrUsername">
          {{ text('Email or username', 'អ៊ីមែល ឬឈ្មោះអ្នកប្រើ') }}
        </label>
        <div class="input-shell">
          <i class="bi bi-person-vcard text-muted"></i>
          <input
            id="emailOrUsername"
            v-model.trim="emailOrUsername"
            type="text"
            autocomplete="username"
            required
            :placeholder="text('name@company.com or username', 'name@company.com ឬឈ្មោះអ្នកប្រើ')"
          />
        </div>

        <button class="primary-button" :disabled="loading || !emailOrUsername" type="submit">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status"></span>
          <span>
            {{ loading 
              ? text('Sending code...', 'កំពុងផ្ញើលេខកូដ...') 
              : text('Send verification code', 'ផ្ញើលេខកូដផ្ទៀងផ្ទាត់') 
            }}
          </span>
          <i v-if="!loading" class="bi bi-arrow-right ms-2"></i>
        </button>
      </form>

      <!-- Step 2: Verify OTP -->
      <form v-else-if="step === 2" @submit.prevent="verifyOtp">
        <div class="delivery-notice p-3 rounded-3 mb-3 bg-light border">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-envelope-check-fill text-primary fs-5"></i>
            <div>
              <div class="small text-muted">{{ text('Code sent to', 'លេខកូដផ្ទៀងផ្ទាត់ផ្ញើទៅកាន់') }}</div>
              <strong class="text-dark">{{ maskedEmail }}</strong>
            </div>
          </div>
        </div>

        <div class="otp-grid mb-3">
          <input
            v-for="(_, index) in otpDigits"
            :key="index"
            :ref="(element) => setOtpRef(element, index)"
            v-model="otpDigits[index]"
            type="text"
            inputmode="numeric"
            maxlength="1"
            pattern="[0-9]"
            class="otp-box"
            :aria-label="`OTP digit ${index + 1}`"
            @input="handleOtpInput(index, $event)"
            @keydown.backspace="handleBackspace(index, $event)"
            @paste.prevent="handlePaste"
          />
        </div>

        <button class="primary-button" :disabled="loading || otpDigits.join('').length !== 6" type="submit">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status"></span>
          <span>
            {{ loading 
              ? text('Verifying...', 'កំពុងផ្ទៀងផ្ទាត់...') 
              : text('Verify code', 'ផ្ទៀងផ្ទាត់លេខកូដ') 
            }}
          </span>
        </button>

        <button
          class="text-button"
          type="button"
          :disabled="resendSeconds > 0 || loading"
          @click="resendOtp"
        >
          <i class="bi bi-arrow-clockwise me-1"></i>
          {{ resendSeconds > 0 
            ? text(`Resend code in ${resendSeconds}s`, `ផ្ញើម្តងទៀតក្នុង ${resendSeconds} វិនាទី`) 
            : text('Resend code', 'ផ្ញើលេខកូដម្តងទៀត') 
          }}
        </button>
      </form>

      <!-- Step 3: Set New Password -->
      <form v-else @submit.prevent="resetPassword">
        <label class="field-label" for="newPassword">
          {{ text('New password', 'ពាក្យសម្ងាត់ថ្មី') }}
        </label>
        <div class="input-shell">
          <i class="bi bi-lock text-muted"></i>
          <input
            id="newPassword"
            v-model="newPassword"
            :type="showPassword ? 'text' : 'password'"
            minlength="6"
            autocomplete="new-password"
            required
            :placeholder="text('At least 6 characters', 'យ៉ាងតិច ៦ តួអក្សរ')"
          />
          <button
            type="button"
            class="icon-button"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            @click="showPassword = !showPassword"
          >
            <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
          </button>
        </div>

        <!-- Password Strength Meter -->
        <div class="strength-box mt-2">
          <div class="strength-track">
            <span :style="{ width: `${passwordScore * 25}%`, background: strengthColor }"></span>
          </div>
          <small class="strength-label fw-semibold" :style="{ color: strengthColor }">
            {{ strengthLabel }}
          </small>
        </div>

        <label class="field-label mt-3" for="confirmPassword">
          {{ text('Confirm password', 'បញ្ជាក់ពាក្យសម្ងាត់') }}
        </label>
        <div class="input-shell">
          <i class="bi bi-lock-fill text-muted"></i>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            minlength="6"
            autocomplete="new-password"
            required
            :placeholder="text('Re-enter new password', 'បញ្ចូលពាក្យសម្ងាត់ម្តងទៀត')"
          />
        </div>

        <button
          class="primary-button"
          :disabled="loading || passwordScore < 2 || newPassword !== confirmPassword"
          type="submit"
        >
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status"></span>
          <span>
            {{ loading 
              ? text('Saving password...', 'កំពុងរក្សាទុក...') 
              : text('Reset password', 'កំណត់ពាក្យសម្ងាត់ឡើងវិញ') 
            }}
          </span>
        </button>
      </form>

      <!-- Back to Login Navigation -->
      <router-link to="/login" class="back-link">
        <i class="bi bi-arrow-left me-1"></i>
        {{ text('Back to sign in', 'ត្រឡប់ទៅចូលប្រើ') }}
      </router-link>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/services/api';
import { useLanguageStore } from '@/stores/language';
import logoUrl from '@/assets/logo.svg';

const router = useRouter();
const language = useLanguageStore();

const step = ref(1);
const emailOrUsername = ref('');
const email = ref('');
const otpDigits = ref(['', '', '', '', '', '']);
const otpRefs = [];
const resetToken = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const loading = ref(false);
const error = ref('');
const success = ref('');
const resendSeconds = ref(0);
let resendTimer = null;

const text = (english, khmer) => (language.isKhmer ? khmer : english);

const steps = computed(() => [
  { number: 1, label: text('Request', 'ស្នើសុំ') },
  { number: 2, label: text('Verify', 'ផ្ទៀងផ្ទាត់') },
  { number: 3, label: text('Reset', 'កំណត់ថ្មី') },
]);

const title = computed(() => {
  if (step.value === 1) return text('Reset your password', 'កំណត់ពាក្យសម្ងាត់ឡើងវិញ');
  if (step.value === 2) return text('Verify your code', 'ផ្ទៀងផ្ទាត់លេខកូដ');
  return text('Create a new password', 'បង្កើតពាក្យសម្ងាត់ថ្មី');
});

const description = computed(() => {
  if (step.value === 1) {
    return text(
      'Enter your email or username and we will send a 6-digit verification code.',
      'បញ្ចូលអ៊ីមែល ឬឈ្មោះអ្នកប្រើ ដើម្បីទទួលលេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់។'
    );
  }
  if (step.value === 2) {
    return text('Enter the code sent to your email. Valid for 10 minutes.', 'សូមបញ្ចូលលេខកូដដែលបានផ្ញើទៅអ៊ីមែលរបស់អ្នក។ មានសុពលភាព ១០ នាទី។');
  }
  return text('Choose a strong password for your account.', 'ជ្រើសរើសពាក្យសម្ងាត់រឹងមាំសម្រាប់គណនីរបស់អ្នក។');
});

const maskedEmail = computed(() => {
  if (!email.value || !email.value.includes('@')) {
    return text('your registered recovery email', 'អ៊ីមែលសម្រាប់ស្តារគណនីដែលបានចុះឈ្មោះ');
  }
  return email.value.replace(/^(.{2}).*(@.*)$/, '$1••••$2');
});

const passwordScore = computed(() => {
  const pwd = newPassword.value;
  return (
    (pwd.length >= 6 ? 1 : 0) +
    (pwd.length >= 10 ? 1 : 0) +
    (/[0-9]/.test(pwd) ? 1 : 0) +
    (/[\W_]/.test(pwd) ? 1 : 0)
  );
});

const strengthColor = computed(() => ['#cbd5e1', '#ef4444', '#f59e0b', '#10b981', '#059669'][passwordScore.value]);

const strengthLabel = computed(() => [
  '',
  text('Weak', 'ខ្សោយ'),
  text('Fair', 'មធ្យម'),
  text('Strong', 'រឹងមាំ'),
  text('Very strong', 'រឹងមាំខ្លាំង'),
][passwordScore.value]);

function clearFeedback() {
  error.value = '';
  success.value = '';
}

function startResendTimer() {
  clearInterval(resendTimer);
  resendSeconds.value = 60;
  resendTimer = setInterval(() => {
    resendSeconds.value -= 1;
    if (resendSeconds.value <= 0) clearInterval(resendTimer);
  }, 1000);
}

function setOtpRef(element, index) {
  if (element) otpRefs[index] = element;
}

async function requestOtp() {
  clearFeedback();
  loading.value = true;

  try {
    await api.forgotPassword(emailOrUsername.value);
    // Keep the original identifier because the backend intentionally returns a generic response.
    email.value = emailOrUsername.value;
    step.value = 2;
    otpDigits.value = ['', '', '', '', '', ''];
    startResendTimer();
    success.value = text(
      'Verification code has been sent to your recovery email.',
      'លេខកូដផ្ទៀងផ្ទាត់ត្រូវបានផ្ញើទៅកាន់អ៊ីមែលសង្គ្រោះរបស់អ្នក។'
    );
    nextTick(() => {
      otpRefs[0]?.focus();
    });
  } catch (requestError) {
    error.value = requestError.message || text('Failed to request OTP code.', 'មិនអាចផ្ញើលេខកូដផ្ទៀងផ្ទាត់បានទេ។');
  } finally {
    loading.value = false;
  }
}

async function resendOtp() {
  if (resendSeconds.value > 0) return;
  await requestOtp();
}

function handleOtpInput(index, event) {
  const clean = event.target.value.replace(/\D/g, '');
  otpDigits.value[index] = clean ? clean.slice(-1) : '';

  if (otpDigits.value[index] && index < 5) {
    otpRefs[index + 1]?.focus();
  }

  // Auto-verify if all 6 digits are provided
  if (otpDigits.value.join('').length === 6) {
    verifyOtp();
  }
}

function handleBackspace(index, event) {
  if (!otpDigits.value[index] && index > 0) {
    event.preventDefault();
    otpDigits.value[index - 1] = '';
    otpRefs[index - 1]?.focus();
  }
}

function handlePaste(event) {
  const textData = event.clipboardData.getData('text') || '';
  const digits = textData.replace(/\D/g, '').slice(0, 6).split('');
  if (!digits.length) return;

  for (let i = 0; i < 6; i += 1) {
    otpDigits.value[i] = digits[i] || '';
  }

  const nextFocusIndex = Math.min(digits.length, 5);
  otpRefs[nextFocusIndex]?.focus();

  if (otpDigits.value.join('').length === 6) {
    verifyOtp();
  }
}

async function verifyOtp() {
  const code = otpDigits.value.join('');
  if (loading.value || code.length !== 6) return;

  clearFeedback();
  loading.value = true;

  try {
    const result = await api.verifyOtp(email.value, code);
    resetToken.value = result?.resetToken || '';
    step.value = 3;
    success.value = text('Code verified successfully.', 'លេខកូដផ្ទៀងផ្ទាត់បានត្រឹមត្រូវ។');
  } catch (requestError) {
    error.value = requestError.message || text('Invalid or expired OTP code.', 'លេខកូដមិនត្រឹមត្រូវ ឬផុតកំណត់។');
  } finally {
    loading.value = false;
  }
}

async function resetPassword() {
  clearFeedback();

  if (newPassword.value !== confirmPassword.value) {
    error.value = text('Passwords do not match.', 'ពាក្យសម្ងាត់មិនដូចគ្នាទេ។');
    return;
  }

  loading.value = true;

  try {
    await api.resetPassword({
      email: email.value,
      otp: otpDigits.value.join(''),
      newPassword: newPassword.value,
      resetToken: resetToken.value,
    });

    success.value = text(
      'Password reset successfully! Redirecting to sign in...',
      'កំណត់ពាក្យសម្ងាត់បានជោគជ័យ! កំពុងត្រឡប់ទៅចូលប្រើ...'
    );

    setTimeout(() => {
      router.push('/login');
    }, 1500);
  } catch (requestError) {
    error.value = requestError.message || text('Failed to reset password.', 'មិនអាចកំណត់ពាក្យសម្ងាត់ឡើងវិញបានទេ។');
  } finally {
    loading.value = false;
  }
}

onUnmounted(() => {
  clearInterval(resendTimer);
});
</script>

<style scoped>
.recovery-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: radial-gradient(circle at 15% 15%, #fff7ed 0, #f8fafc 40%, #e2e8f0 100%);
}

.recovery-card {
  width: min(100%, 480px);
  padding: 36px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
}

.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.logo {
  width: 200px;
  max-height: 50px;
  object-fit: contain;
  object-position: left center;
}

.security-mark {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: #d97706;
  background: #fef3c7;
  border-radius: 12px;
  font-size: 1.25rem;
}

/* Stepper */
.stepper {
  display: flex;
  justify-content: space-between;
  margin-bottom: 28px;
  position: relative;
}

.step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
  font-size: 0.75rem;
  flex: 1;
}

.step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 15px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: #e2e8f0;
  z-index: 1;
}

.step.active:not(:last-child)::after {
  background: #f59e0b;
}

.step span {
  position: relative;
  z-index: 2;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 2px solid #cbd5e1;
  border-radius: 50%;
  background: #ffffff;
  font-weight: 700;
  transition: all 0.25s ease;
}

.step.active span {
  color: #ffffff;
  border-color: #f59e0b;
  background: #f59e0b;
}

.step.current small {
  color: #d97706;
  font-weight: 700;
}

/* Headings */
.eyebrow {
  color: #d97706;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  margin: 0 0 6px;
}

.copy-block h1 {
  margin: 0 0 6px;
  color: #0f172a;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.description-text {
  margin: 0 0 24px;
  color: #64748b;
  font-size: 0.92rem;
  line-height: 1.5;
}

.field-label {
  display: block;
  margin: 16px 0 6px;
  color: #334155;
  font-size: 0.82rem;
  font-weight: 700;
}

.input-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-shell:focus-within {
  border-color: #f59e0b;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.14);
}

.input-shell input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: #0f172a;
  font-size: 0.95rem;
}

.icon-button {
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
}

/* Primary Button */
.primary-button {
  width: 100%;
  min-height: 48px;
  margin-top: 24px;
  border: 0;
  border-radius: 12px;
  color: #ffffff;
  background: #d97706;
  font-weight: 700;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease, transform 0.1s ease;
}

.primary-button:hover:not(:disabled) {
  background: #b45309;
}

.primary-button:active:not(:disabled) {
  transform: scale(0.99);
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Feedback banners */
.feedback {
  display: flex;
  align-items: flex-start;
  margin-bottom: 20px;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 0.86rem;
}

.feedback.error {
  color: #991b1b;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.feedback.success {
  color: #166534;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

/* OTP Boxes */
.otp-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.otp-box {
  width: 100%;
  aspect-ratio: 1;
  text-align: center;
  font-size: 1.4rem;
  font-weight: 800;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  transition: all 0.2s ease;
}

.otp-box:focus {
  outline: 0;
  background: #ffffff;
  border-color: #f59e0b;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.14);
}

.text-button {
  display: block;
  margin: 16px auto 0;
  border: 0;
  background: transparent;
  color: #d97706;
  font-weight: 600;
  font-size: 0.86rem;
  cursor: pointer;
}

.text-button:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

/* Password Strength */
.strength-track {
  height: 6px;
  border-radius: 6px;
  background: #e2e8f0;
  overflow: hidden;
}

.strength-track span {
  display: block;
  height: 100%;
  transition: width 0.3s ease;
}

.strength-label {
  display: block;
  margin-top: 4px;
  font-size: 0.78rem;
}

.back-link {
  display: block;
  margin-top: 26px;
  color: #64748b;
  text-align: center;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.88rem;
  transition: color 0.2s;
}

.back-link:hover {
  color: #d97706;
}

@media (max-width: 480px) {
  .recovery-card {
    padding: 24px 18px;
  }
  .logo {
    width: 165px;
  }
  .otp-box {
    font-size: 1.2rem;
  }
}
</style>