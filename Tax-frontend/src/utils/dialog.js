import { reactive } from 'vue';

export const dialogState = reactive({
  open: false,
  title: '',
  message: '',
  variant: 'warning',
  icon: 'bi-exclamation-triangle-fill',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  showCancel: true,
  resolve: null,
});

const defaults = {
  warning: { icon: 'bi-exclamation-triangle-fill' },
  danger: { icon: 'bi-x-circle-fill' },
  success: { icon: 'bi-check-circle-fill' },
  info: { icon: 'bi-info-circle-fill' },
};

function openDialog({ title, message, variant = 'warning', confirmText = 'Confirm', cancelText = 'Cancel', showCancel = true }) {
  return new Promise((resolve) => {
    const preset = defaults[variant] || defaults.warning;
    dialogState.open = true;
    dialogState.title = title;
    dialogState.message = message;
    dialogState.variant = variant;
    dialogState.icon = preset.icon;
    dialogState.confirmText = confirmText;
    dialogState.cancelText = cancelText;
    dialogState.showCancel = showCancel;
    dialogState.resolve = resolve;
  });
}

export function confirmDialog(options) {
  return openDialog({
    showCancel: true,
    variant: 'warning',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    ...options,
  });
}

export function alertDialog(options) {
  return openDialog({
    showCancel: false,
    variant: 'info',
    confirmText: 'OK',
    cancelText: '',
    ...options,
  });
}

export function closeDialog(result = false) {
  if (dialogState.resolve) {
    const resolve = dialogState.resolve;
    dialogState.resolve = null;
    resolve(result);
  }
  dialogState.open = false;
  dialogState.title = '';
  dialogState.message = '';
  dialogState.variant = 'warning';
  dialogState.icon = defaults.warning.icon;
  dialogState.confirmText = 'Confirm';
  dialogState.cancelText = 'Cancel';
  dialogState.showCancel = true;
}
