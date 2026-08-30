(() => {
'use strict';

// Legacy filename retained only so older cached HTML cannot resurrect the old
// Stripe-only repair-payment panel. Customer repair payments now follow the
// shop's actual payment processor record (Square for Autotechniques).
function removeLegacyRepairPaymentPanel(){
  document.querySelectorAll('[data-stripe-job-panel], .stripe-job-toast').forEach(el=>el.remove());

  // Defensive cleanup for a panel rendered by an older cached script before
  // this cleanup file loads.
  document.querySelectorAll('section.card, .card').forEach(el=>{
    const text=(el.textContent||'').replace(/\s+/g,' ').trim();
    if(/CUSTOMER PAYMENT\s*\/\s*STRIPE INVOICE/i.test(text) ||
       /Create Stripe Invoice/i.test(text) ||
       /Stripe payment page is ready/i.test(text)){
      el.remove();
    }
  });
}

removeLegacyRepairPaymentPanel();
new MutationObserver(removeLegacyRepairPaymentPanel).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',removeLegacyRepairPaymentPanel);
window.addEventListener('hashchange',()=>setTimeout(removeLegacyRepairPaymentPanel,0));
})();
