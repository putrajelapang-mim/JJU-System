let toastEl = null;
let hideTimer = null;

export function toast(message, type = 'info') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    document.body.appendChild(toastEl);
  }
  toastEl.className = `toast${type === 'error' ? ' error' : ''}`;
  toastEl.textContent = message;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toastEl.remove();
    toastEl = null;
  }, 3000);
}
