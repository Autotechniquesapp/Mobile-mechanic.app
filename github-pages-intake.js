(() => {
'use strict';

function stableIntakeUrlFromValue(value='') {
  try {
    const u = new URL(value, location.origin);
    const existing = u.searchParams.get('intake');
    if (existing) return `${location.origin}/?intake=${encodeURIComponent(existing)}`;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'intake' && parts[1]) return `${location.origin}/?intake=${encodeURIComponent(decodeURIComponent(parts[1]))}`;
  } catch {}
  return '';
}

function currentStableUrl() {
  const input = document.getElementById('intakeLink');
  const fromInput = stableIntakeUrlFromValue(input?.value || '');
  if (fromInput) return fromInput;
  try {
    const db = JSON.parse(localStorage.getItem('mobile_mechanic_ai_approved_v7') || '{}');
    const shop = db.shops?.[db.session?.shopId];
    if (shop?.slug) return `${location.origin}/?intake=${encodeURIComponent(shop.slug)}`;
  } catch {}
  return '';
}

function normalizeDisplayedLink() {
  const input = document.getElementById('intakeLink');
  if (!input) return;
  const stable = currentStableUrl();
  if (stable && input.value !== stable) input.value = stable;
}

async function copyStable() {
  const url = currentStableUrl();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const input = document.getElementById('intakeLink');
    input?.select?.();
    document.execCommand?.('copy');
  }
}

async function shareStable() {
  const url = currentStableUrl();
  if (!url) return;
  let shopName = 'your mechanic';
  try {
    const db = JSON.parse(localStorage.getItem('mobile_mechanic_ai_approved_v7') || '{}');
    shopName = db.shops?.[db.session?.shopId]?.name || shopName;
  } catch {}
  const text = `Please fill out this vehicle intake for ${shopName}.`;
  if (navigator.share) {
    try { await navigator.share({ title: `${shopName} Customer Intake`, text, url }); return; } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  await copyStable();
}

// Capture before app.js' older /intake/... handler.
document.addEventListener('click', e => {
  const share = e.target.closest?.('[data-action="share-intake"]');
  if (share) {
    e.preventDefault();
    e.stopImmediatePropagation();
    shareStable();
    return;
  }
  const copy = e.target.closest?.('[data-action="copy-intake"]');
  if (copy) {
    e.preventDefault();
    e.stopImmediatePropagation();
    copyStable();
  }
}, true);

new MutationObserver(normalizeDisplayedLink).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', () => setTimeout(normalizeDisplayedLink, 30));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizeDisplayedLink);
else normalizeDisplayedLink();
})();
