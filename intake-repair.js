(() => {
'use strict';
const DBKEY='mobile_mechanic_ai_approved_v7';
function db(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function currentShop(){const d=db(),sid=d.session?.shopId;return sid?d.shops?.[sid]:null;}
function intakeUrl(shop){return shop?.slug?`${location.origin}/?intake=${encodeURIComponent(shop.slug)}`:'';}
function toast(msg,type=''){document.querySelector('.intake-link-toast')?.remove();const d=document.createElement('div');d.className=`toast intake-link-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),3500);}
function refreshLinkField(){const input=document.getElementById('intakeLink'),shop=currentShop();if(input&&shop?.slug){const u=intakeUrl(shop);if(input.value!==u)input.value=u;}}
async function shareIntake(){const shop=currentShop();if(!shop?.slug)return toast('Shop intake link is not ready.','bad');const url=intakeUrl(shop);const text=`Please fill out this vehicle intake for ${shop.name||'the shop'}.`;const fallbackText=`${text}\n${url}`;try{if(navigator.share){await navigator.share({title:`${shop.name||'Shop'} Customer Intake`,text,url});}else if(navigator.clipboard){await navigator.clipboard.writeText(fallbackText);toast('Intake link copied.','good');}else{location.href=`sms:?body=${encodeURIComponent(fallbackText)}`;}}catch(err){if(err?.name!=='AbortError'){try{await navigator.clipboard?.writeText(fallbackText);toast('Intake link copied.','good');}catch{}}}}
async function copyIntake(){const shop=currentShop();if(!shop?.slug)return toast('Shop intake link is not ready.','bad');const url=intakeUrl(shop);try{await navigator.clipboard.writeText(url);toast('Shop intake link copied.','good');}catch{const input=document.getElementById('intakeLink');input?.select?.();toast('Press and hold the link to copy it.','');}}
document.addEventListener('click',e=>{const share=e.target.closest?.('[data-action="share-intake"]');if(share){e.preventDefault();e.stopImmediatePropagation();shareIntake();return;}const copy=e.target.closest?.('[data-action="copy-intake"]');if(copy){e.preventDefault();e.stopImmediatePropagation();copyIntake();}},true);
new MutationObserver(()=>refreshLinkField()).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(refreshLinkField,30));
setTimeout(refreshLinkField,300);

function loadOnce(key,src){
  if(window[key])return;
  window[key]=true;
  const s=document.createElement('script');s.src=src;document.head.appendChild(s);
}
loadOnce('__MMAIntakeSchedulingLoaded','intake-scheduling.js?v=20260829-0045');
loadOnce('__MMASettingsEnhancementsLoaded','settings-enhancements.js?v=20260829-0045');
loadOnce('__MMAIntakeDashboardFixLoaded','intake-dashboard-fix.js?v=20260905-0518');
})();
