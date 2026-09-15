(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7';
let loadingInvoice=false;

function read(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function context(){const db=read(),sid=db.session?.shopId,shop=sid?db.shops?.[sid]:null,job=shop?.jobs?.find?.(j=>String(j.id)===String(db.session?.activeJobId))||null,user=shop?.users?.find?.(u=>String(u.id)===String(db.session?.userId))||null;return {db,sid,shop,job,user};}
function canManagePayments(){const {user}=context();return ['owner','shop_owner','manager','service_writer'].includes(String(user?.role||''));}
function route(){return (location.hash||'#login').slice(1).split('?')[0];}
function hideSecondOpinion(){document.querySelectorAll('[data-route="ai-second"],[data-action="second-opinion"]').forEach(el=>el.remove());if(route()==='ai-second'){location.hash='#workup';}}
function injectCss(){if(document.getElementById('simple-job-payment-style'))return;const s=document.createElement('style');s.id='simple-job-payment-style';s.textContent=`
[data-route="ai-second"],[data-action="second-opinion"]{display:none!important}
body.mma-simple-payment .jwo-ai-wrap{display:none!important}
body.mma-simple-payment .mma-hide-on-payment{display:none!important}
`;document.head.appendChild(s);}
function loadInvoice(){if(window.__MMASimpleJobPaymentLoaded||loadingInvoice)return;loadingInvoice=true;const s=document.createElement('script');s.src='next-invoice.js?v=20260915-simple-job-payment1';s.dataset.simpleJobPayment='1';s.onload=()=>{window.__MMASimpleJobPaymentLoaded=true;loadingInvoice=false;setTimeout(simplifyJobPayment,0);};s.onerror=()=>{loadingInvoice=false;};document.head.appendChild(s);}
function paymentActionRow(work){const shell=work?.parentElement;if(!shell)return null;const rows=[...shell.querySelectorAll(':scope > .btn-row')];return rows.find(row=>row.querySelector('[data-route="findings"],[data-route="service-info"],[data-action="ask-vehicle"],[data-route="ai-second"]'))||null;}
function simplifyJobPayment(){hideSecondOpinion();injectCss();const work=document.querySelector('[data-job-work-order]');if(!work||!canManagePayments()){document.body.classList.remove('mma-simple-payment');return;}document.body.classList.add('mma-simple-payment');const title=document.querySelector('.page-title h2');if(title)title.textContent='Job & Payment';const sub=title?.parentElement?.querySelector('p');if(sub)sub.textContent='Parts, labor, deposit, balance, and Square.';document.querySelector('.jwo-ai-wrap')?.classList.add('mma-hide-on-payment');paymentActionRow(work)?.classList.add('mma-hide-on-payment');loadInvoice();}
function run(){hideSecondOpinion();if(route()==='workup')simplifyJobPayment();else document.body.classList.remove('mma-simple-payment');}

new MutationObserver(()=>setTimeout(run,0)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(run,80));
setTimeout(run,500);
})();