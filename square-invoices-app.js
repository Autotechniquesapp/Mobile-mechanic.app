(() => {
'use strict';
const ANDROID=/Android/i.test(navigator.userAgent||'');
const APP_INTENT='intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.squareup.invoicesapp;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.squareup.invoicesapp;end';
const WEB='https://squareup.com/dashboard/sales/invoices';
function openSquareInvoices(){
  if(ANDROID){location.href=APP_INTENT;return;}
  window.open(WEB,'_blank','noopener');
}
function upgrade(){
  document.querySelectorAll('[data-nxe-open-square]').forEach(old=>{
    old.style.setProperty('display','none','important');
    const parent=old.parentElement;
    if(parent&&!parent.querySelector('[data-open-square-invoices-app]')){
      const b=document.createElement('button');
      b.type='button';b.className='btn btn-primary';b.dataset.openSquareInvoicesApp='1';
      b.textContent=ANDROID?'Open Square Invoices App':'Open Square Invoices';
      parent.insertBefore(b,old);
    }
  });
}
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-open-square-invoices-app]');
  if(!b)return;
  e.preventDefault();e.stopPropagation();openSquareInvoices();
},true);
new MutationObserver(()=>setTimeout(upgrade,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(upgrade,100));
setTimeout(upgrade,300);
})();