(() => {
  'use strict';

  // Enhance displayed customer/job contact data. Editing controls are left alone.
  const DBKEY = 'mobile_mechanic_ai_approved_v7';
  const NOT_CONTACT = /^(?:no (?:service )?location|not entered|unknown|n\/a|none|pending)$/i;
  const SKIP = 'a,button,input,textarea,select,option,script,style,code,pre,[contenteditable],[data-mma-contact-picker]';
  let pending = false;

  function phoneTarget(value) {
    const raw = String(value || '').trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return '';
    return (raw.startsWith('+') ? '+' : '') + digits;
  }

  function contactRecords() {
    let db = {};
    try { db = JSON.parse(localStorage.getItem(DBKEY) || '{}'); } catch {}
    const shop = db.shops?.[db.session?.shopId];
    const contacts = new Map();

    function add(kind, value) {
      const raw = String(value ?? '').trim();
      if (!raw || raw.length > 250 || NOT_CONTACT.test(raw)) return;
      if (kind === 'phone' && !phoneTarget(raw)) return;
      if (kind === 'address' && raw.length < 5) return;
      const key = kind + ':' + raw;
      if (!contacts.has(key)) contacts.set(key, { kind, value: raw });
    }

    if (shop) {
      add('phone', shop.phone);
      add('address', shop.address);
      add('address', shop.settings?.address);
      for (const c of shop.customers || []) {
        add('phone', c.phone);
        add('address', c.address);
      }
      for (const j of [...(shop.jobs || []), ...(shop.completedJobs || [])]) {
        add('phone', j.phone);
        add('phone', j.intake?.phone);
        add('address', j.location);
        add('address', j.address);
        add('address', j.intake?.address);
        add('address', j.intake?.current_location?.raw);
      }
    }
    return [...contacts.values()].sort((a, b) => b.value.length - a.value.length);
  }

  function fieldContact(node) {
    const parent = node.parentElement;
    if (!parent) return null;
    let label = '';
    if (parent.matches('td')) label = parent.previousElementSibling?.textContent || '';
    if (!label && parent.parentElement?.matches('.mma-tech-field')) {
      label = parent.parentElement.querySelector('b,strong,label')?.textContent || '';
    }
    if (!label) return null;
    const kind = /^(phone|cell|mobile)(?: number)?\s*:?$/i.test(label.trim()) ? 'phone' :
      /^(address|service (?:location|address)|location)\s*:?$/i.test(label.trim()) ? 'address' : '';
    if (!kind) return null;
    const value = String(node.nodeValue || '').trim();
    if (!value || value.length > 250 || NOT_CONTACT.test(value)) return null;
    if (kind === 'phone' ? !phoneTarget(value) : value.length < 5) return null;
    return { kind, value };
  }

  function navigationUrl(address) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(address) + '&travelmode=driving&dir_action=navigate';
  }

  function linkFor(contact, shown) {
    const link = document.createElement('a');
    link.className = 'mma-contact-link';
    link.dataset.mmaContactKind = contact.kind;
    link.dataset.mmaContactValue = contact.value;
    link.textContent = shown;
    if (contact.kind === 'address') {
      link.href = navigationUrl(contact.value);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'Navigate to ' + contact.value + ' with Google Maps');
      link.title = 'Open Google Maps directions';
    } else {
      link.href = 'tel:' + phoneTarget(contact.value);
      link.setAttribute('aria-label', 'Call or text ' + contact.value);
      link.title = 'Call or text this number';
    }
    return link;
  }

  function eligibleNode(node) {
    if (!node.nodeValue?.trim() || !node.parentElement) return false;
    if (node.parentElement.closest(SKIP)) return false;
    return Boolean(node.parentElement.closest('#app, .modal-backdrop, [data-mma-calendar]'));
  }

  function linkText(node, contacts) {
    if (!eligibleNode(node)) return;
    const original = node.nodeValue;
    const fallback = fieldContact(node);
    const candidates = fallback ? [fallback, ...contacts] : contacts;
    let pos = 0, didMatch = false;
    const frag = document.createDocumentFragment();

    while (pos < original.length) {
      let match = null, at = original.length;
      for (const c of candidates) {
        const index = original.indexOf(c.value, pos);
        if (index < 0 || index > at) continue;
        if (c.kind === 'phone' &&
            (/\d/.test(original[index - 1] || '') ||
             /\d/.test(original[index + c.value.length] || ''))) continue;
        if (index < at || (index === at && c.value.length > (match?.value.length || 0))) {
          match = c;
          at = index;
        }
      }
      if (!match) break;
      if (at > pos) frag.appendChild(document.createTextNode(original.slice(pos, at)));
      frag.appendChild(linkFor(match, original.slice(at, at + match.value.length)));
      pos = at + match.value.length;
      didMatch = true;
    }
    if (!didMatch) return;
    if (pos < original.length) frag.appendChild(document.createTextNode(original.slice(pos)));
    node.replaceWith(frag);
  }

  function enhance() {
    pending = false;
    if (!document.body) return;
    const contacts = contactRecords();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (eligibleNode(walker.currentNode)) nodes.push(walker.currentNode);
    for (const node of nodes) linkText(node, contacts);
  }

  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(enhance, 70);
  }

  function closePicker() {
    const dialog = document.querySelector('[data-mma-contact-picker]');
    const returnTo = dialog?._returnTo;
    dialog?.remove();
    if (returnTo?.isConnected) returnTo.focus();
  }

  function showPhoneActions(value, returnTo) {
    const number = phoneTarget(value);
    if (!number) return;
    closePicker();
    const backdrop = document.createElement('div');
    backdrop.dataset.mmaContactPicker = '1';
    backdrop.className = 'mma-contact-backdrop';
    backdrop._returnTo = returnTo;
    const panel = document.createElement('section');
    panel.className = 'mma-contact-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Call or text customer');
    const heading = document.createElement('h2');
    heading.textContent = 'Contact ' + value;
    const actions = document.createElement('div');
    actions.className = 'mma-contact-actions';
    for (const [label, scheme] of [['Call', 'tel:'], ['Text', 'sms:']]) {
      const a = document.createElement('a');
      a.className = 'btn btn-primary';
      a.href = scheme + number;
      a.textContent = label;
      a.addEventListener('click', () => closePicker());
      actions.appendChild(a);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-soft';
    close.textContent = 'Cancel';
    close.addEventListener('click', closePicker);
    panel.append(heading, actions, close);
    backdrop.appendChild(panel);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) closePicker(); });
    document.body.appendChild(backdrop);
    close.focus();
  }

  function installStyles() {
    if (document.getElementById('mma-contact-styles')) return;
    const style = document.createElement('style');
    style.id = 'mma-contact-styles';
    style.textContent = [
      '.mma-contact-link{color:#ff777d!important;text-decoration:underline;text-underline-offset:3px;cursor:pointer;overflow-wrap:anywhere}',
      '.mma-contact-link:focus-visible{outline:2px solid #ff777d;outline-offset:3px;border-radius:3px}',
      '.mma-contact-backdrop{position:fixed;inset:0;z-index:20000;background:#000b;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.mma-contact-panel{background:#10151c;color:#fff;border:1px solid #ef2a31;border-radius:12px;max-width:390px;width:100%;padding:20px;box-shadow:0 18px 70px #0009}',
      '.mma-contact-panel h2{font-size:18px;overflow-wrap:anywhere;margin:0 0 18px}',
      '.mma-contact-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}',
      '.mma-contact-panel .btn{min-height:48px;display:flex;align-items:center;justify-content:center;text-align:center}'
    ].join('');
    document.head.appendChild(style);
  }

  // Capture on window before calendar/job tile handlers that otherwise open the
  // whole job when a nested address or phone is clicked.
  window.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-mma-contact-kind]');
    const nativePhone = !target && event.target?.closest?.('a[href^="tel:"]');
    const numericPhone = nativePhone && /\d/.test(nativePhone.textContent || '') &&
      phoneTarget(nativePhone.getAttribute('href').slice(4));
    if (!target && !numericPhone) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const kind = target?.dataset.mmaContactKind || 'phone';
    const value = target?.dataset.mmaContactValue || nativePhone.getAttribute('href').slice(4);
    if (kind === 'address') {
      window.open(navigationUrl(value), '_blank', 'noopener,noreferrer');
    } else {
      showPhoneActions(value, target || nativePhone);
    }
  }, true);

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.querySelector('[data-mma-contact-picker]')) {
      event.preventDefault();
      closePicker();
    }
    const target = event.target?.closest?.('[data-mma-contact-kind]');
    if (target && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      target.click();
    }
  }, true);

  installStyles();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('storage', schedule);
  schedule();
})();