// Shared toast + confirm modal. Replaces window.alert / window.confirm
// so flows stay on-brand and don't block the browser chrome.

import { esc } from './escape.js';

// Module-level host — created on first toast (no static placeholder in HTML).
let toastHostEl = null;

function ensureToastHost() {
  if (toastHostEl && document.body.contains(toastHostEl)) {
    return toastHostEl;
  }
  const host = document.createElement('div');
  host.className = 'sufra-toast-host';
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-relevant', 'additions');
  document.body.appendChild(host);
  toastHostEl = host;
  return host;
}

/**
 * @param {string} message
 * @param {{ type?: 'info'|'success'|'error', duration?: number }} [opts]
 */
export function toast(message, opts = {}) {
  const type = opts.type || 'info';
  const duration = opts.duration ?? 4000;
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.className = `sufra-toast sufra-toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message == null ? '' : String(message);
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('sufra-toast--show'));
  window.setTimeout(() => {
    el.classList.remove('sufra-toast--show');
    window.setTimeout(() => el.remove(), 200);
  }, duration);
}

/**
 * @param {string} message
 * @param {{ confirmText?: string, cancelText?: string, danger?: boolean, title?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, opts = {}) {
  const confirmText = opts.confirmText || 'Confirm';
  const cancelText = opts.cancelText || 'Cancel';
  const danger = !!opts.danger;
  const title = opts.title || 'Please confirm';

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'sufra-modal-backdrop';
    backdrop.setAttribute('role', 'presentation');

    const dialog = document.createElement('div');
    dialog.className = 'sufra-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'sufra-modal-title');

    dialog.innerHTML = `
      <h2 id="sufra-modal-title" class="sufra-modal-title">${esc(title)}</h2>
      <p class="sufra-modal-body">${esc(message)}</p>
      <div class="sufra-modal-actions">
        <button type="button" class="btn btn-sm sufra-modal-cancel">${esc(cancelText)}</button>
        <button type="button" class="btn btn-sm ${danger ? 'btn-danger' : 'btn-teal'} sufra-modal-ok">${esc(confirmText)}</button>
      </div>
    `;

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    document.body.classList.add('sufra-modal-open');

    const okBtn = dialog.querySelector('.sufra-modal-ok');
    const cancelBtn = dialog.querySelector('.sufra-modal-cancel');
    okBtn.focus();

    function close(result) {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('sufra-modal-open');
      backdrop.remove();
      resolve(result);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    }

    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
    document.addEventListener('keydown', onKey);
  });
}
