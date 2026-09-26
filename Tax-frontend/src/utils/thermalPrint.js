export function printThermalReceipt() {
  const root = document.documentElement;
  const modeClass = 'thermal-receipt-print';
  const cleanup = () => {
    root.classList.remove(modeClass);
    window.removeEventListener('afterprint', cleanup);
  };

  root.classList.add(modeClass);
  window.addEventListener('afterprint', cleanup, { once: true });

  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
