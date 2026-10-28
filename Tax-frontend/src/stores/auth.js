import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/services/api';

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('tax_user') || 'null');
  } catch {
    localStorage.removeItem('tax_user');
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(readStoredUser());
  const companyProfile = ref(null);
  const loading = ref(false);
  const error = ref('');

  async function register(payload) {
    loading.value = true;
    error.value = '';
    try {
      return await api.register(payload);
    } catch (requestError) {
      error.value = requestError.message;
      throw requestError;
    } finally {
      loading.value = false;
    }
  }

  async function verifyEmail(token) {
    loading.value = true;
    error.value = '';
    try {
      return await api.verifyEmail(token);
    } catch (requestError) {
      error.value = requestError.message;
      throw requestError;
    } finally {
      loading.value = false;
    }
  }

  async function resendVerification(email) {
    loading.value = true;
    error.value = '';
    try {
      return await api.resendVerification(email);
    } catch (requestError) {
      error.value = requestError.message;
      throw requestError;
    } finally {
      loading.value = false;
    }
  }

  async function loadCompanyProfile() {
    loading.value = true;
    error.value = '';
    try {
      companyProfile.value = await api.companyProfile();
      return companyProfile.value;
    } catch (requestError) {
      error.value = requestError.message;
      throw requestError;
    } finally {
      loading.value = false;
    }
  }

  async function refreshUser() {
    error.value = '';
    try {
      user.value = await api.me();
      localStorage.setItem('tax_user', JSON.stringify(user.value));
      return user.value;
    } catch (requestError) {
      error.value = requestError.message;
      throw requestError;
    }
  }

  async function saveCompanyProfile(payload) {
    loading.value = true;
    error.value = '';
    try {
      companyProfile.value = await api.updateCompanyProfile(payload);
      return companyProfile.value;
    } catch (requestError) {
      error.value = requestError.message;
      throw requestError;
    } finally {
      loading.value = false;
    }
  }

  function reset() {
    user.value = null;
    companyProfile.value = null;
    loading.value = false;
    error.value = '';
    localStorage.removeItem('tax_user');
    localStorage.removeItem('tax_token');
  }

  return {
    user,
    companyProfile,
    loading,
    error,
    register,
    verifyEmail,
    resendVerification,
    loadCompanyProfile,
    saveCompanyProfile,
    refreshUser,
    reset,
  };
});
