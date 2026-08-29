(() => {
'use strict';

const DBKEY='mobile_mechanic_ai_approved_v7';
function cache(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function shop(){const d=cache(),sid=d.session?.shopId;return sid?d.shops?.[sid]:null;}
function intakeUrl(){const s=shop();return s?.slug?`${location.origin}/?intake=${encodeURIComponent(s.slug)}`:'';}
function toast(msg,type=''){document.querySelector('.settings-enh-toast')?.remove();const d=document.createElement('div');d.className=`toast settings-enh-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),4200);}

async function copyText(text){
  try{await navigator.clipboard.writeText(text);toast('Intake link copied.','good');}
  catch{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();toast('Intake link copied.','good');}
}
async function shareLink(url){
  const s=shop();
  if(navigator.share){
    try{await navigator.share({title:`${s?.name||'Shop'} customer intake`,text:`Fill out your vehicle information here: ${url}`,url});return;}catch(err){if(err?.name==='AbortError')return;}
  }
  await copyText(url);
}

function removeDeadIdentity(){
  if((location.hash||'').split('?')[0]!=='#settings')return;
  const inputs=[...document.querySelectorAll('main.content input[readonly]')];
  inputs.forEach(input=>{
    const field=input.closest('.field');
    const label=field?.querySelector('label')?.textContent||'';
    if(/Mobile Mechanic AI Shop Identity/i.test(label))field.remove();
  });
}

function upgradeIntakeIdentity(){
  if((location.hash||'').split('?')[0]!=='#settings')return;
  const main=document.querySelector('main.content');if(!main)return;
  const sections=[...main.querySelectorAll('section.card')];
  const sec=sections.find(x=>/SHOP INTAKE IDENTITY/i.test(x.textContent||''));
  if(!sec||sec.dataset.intakeIdentityUpgraded==='1')return;
  sec.dataset.intakeIdentityUpgraded='1';
  const url=intakeUrl();
  sec.innerHTML=`<div class="card-title">SHOP INTAKE LINK</div><div class="section-note">This is the customer intake link for this shop.</div><div class="divider"></div><div class="field"><label>Customer Intake URL</label><input data-shop-intake-url value="${url.replace(/"/g,'&quot;')}" readonly></div><div class="list-actions"><button type="button" class="btn btn-primary" data-copy-intake-link>Copy Link</button><button type="button" class="btn btn-soft" data-share-intake-link>Share Link</button><button type="button" class="btn btn-soft" data-open-intake-link>Open Intake Form</button></div>`;
}

function bind(){
  document.querySelector('[data-copy-intake-link]')?.addEventListener('click',e=>{e.preventDefault();copyText(intakeUrl());},{once:true});
  document.querySelector('[data-share-intake-link]')?.addEventListener('click',e=>{e.preventDefault();shareLink(intakeUrl());},{once:true});
  document.querySelector('[data-open-intake-link]')?.addEventListener('click',e=>{e.preventDefault();window.open(intakeUrl(),'_blank','noopener');},{once:true});
}
function apply(){removeDeadIdentity();upgradeIntakeIdentity();bind();}
let scheduled=false;
new MutationObserver(()=>{if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;apply();},80);}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(apply,120));
setTimeout(apply,220);
})();
