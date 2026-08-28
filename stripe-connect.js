(() => {
'use strict';

// Stripe shop onboarding is handled only from the separate Payment Processing page.
// This file now exists only to remove the legacy top-of-Settings Stripe panel if an
// older cached copy or another render cycle leaves one behind.
function removeLegacyStripePanel(){
  document.querySelectorAll('[data-stripe-connect-panel]').forEach(el=>el.remove());
}

new MutationObserver(removeLegacyStripePanel).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',removeLegacyStripePanel);
window.addEventListener('hashchange',removeLegacyStripePanel);
removeLegacyStripePanel();
})();
