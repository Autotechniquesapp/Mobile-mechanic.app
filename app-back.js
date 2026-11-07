(() => {
  'use strict';
  const KEY = 'mobile_mechanic_ai_approved_v7';
  let screens = [], account = '', returning = false, busy = false;
  const route = () => location.hash || '#dashboard';
  function session() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}').session; return s?.role === 'shop' ? `${s.shopId}:${s.userId}` : ''; }
    catch { return ''; }
  }
  function remember() {
    const current = session();
    if (current !== account) { account = current; screens = []; }
    if (!current) { screens = []; return; }
    if (returning) { returning = false; return; }
    if (screens.at(-1) !== route()) screens.push(route());
    if (screens.length > 100) screens.shift();
  }
  function closePanel() {
    const panels = [...document.querySelectorAll('.modal-backdrop,[data-square-invoices-modal],[data-nxe-import-modal],[data-nxe-history-modal],[data-mma-customer-history]')]
      .filter(el => !el.hidden && el.style.display !== 'none');
    const panel = panels.at(-1);
    if (panel) {
      const close = panel.querySelector('[data-record-close],[data-action="close-modal"],[data-square-close],[data-nxe-import-close],[data-nxe-history-close],[data-mma-history-close],[data-nxe-payment-close],.close-btn,button[aria-label^="Close"]');
      if (close) close.click(); else panel.remove();
      return true;
    }
    if (document.body.classList.contains('drawer-open')) {
      document.querySelector('[data-action="close-menu"]')?.click();
      return true;
    }
    return false;
  }
  window.MobileMechanicBack = async () => {
    if (busy || closePanel()) return;
    if (!session()) return;
    if (session() !== account) remember();
    busy = true;
    try {
      await window.MobileMechanicInvoiceEditor?.flushSave?.();
      if (screens.length > 1) {
        screens.pop(); returning = true;
        await new Promise(resolve => { window.addEventListener('hashchange', resolve, {once: true}); location.hash = screens.at(-1); });
      } else if (route() !== '#dashboard') {
        await new Promise(resolve => { window.addEventListener('hashchange', resolve, {once: true}); location.hash = route() === '#workup' ? '#jobs' : '#dashboard'; });
      }
    } catch (error) {
      const toast = document.createElement('div'); toast.className = 'toast bad';
      toast.textContent = error?.message || 'Could not save your invoice. Try Back again after saving.';
      document.body.appendChild(toast); setTimeout(() => toast.remove(), 4000);
    } finally { busy = false; }
  };
  window.addEventListener('hashchange', remember);
  window.addEventListener('storage', remember);
  remember();
})();
