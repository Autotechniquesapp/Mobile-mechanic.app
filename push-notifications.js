(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
if(!sb||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return;

function cache(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function shopId(){return cache().session?.shopId||null;}
function standalone(){return window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;}
function toast(msg,type=''){document.querySelector('.push-toast')?.remove();const d=document.createElement('div');d.className=`toast push-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),5200);}
function b64(s){const pad='='.repeat((4-s.length%4)%4),base=(s+pad).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}

async function fn(body){const {data,error}=await sb.functions.invoke('push-notifications',{body});if(error)throw error;if(data?.error)throw new Error(data.error);return data;}
async function registration(){return navigator.serviceWorker.ready;}
async function currentSubscription(){const r=await registration();return r.pushManager.getSubscription();}
async function saveSubscription(sub){const j=sub.toJSON();await fn({action:'subscribe',subscription:j});return sub;}

async function enablePush(){
  if(!shopId()){toast('Sign in to the shop before enabling phone alerts.','bad');return false;}
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  if(ios&&!standalone()){
    toast('On iPhone, add Mobile Mechanic AI to the Home Screen first, then enable alerts.');
    window.MobileMechanicInstallApp?.();
    return false;
  }
  let permission=Notification.permission;
  if(permission==='default')permission=await Notification.requestPermission();
  if(permission!=='granted'){toast('Phone notifications are blocked. Allow notifications in your browser/app settings.','bad');return false;}
  try{
    const r=await registration();
    let sub=await r.pushManager.getSubscription();
    if(!sub){
      const k=await fn({action:'public_key'});
      sub=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(k.public_key)});
    }
    await saveSubscription(sub);
    toast('Phone alerts enabled — new customer intakes can notify you even when the app is closed.','good');
    refreshButton(true);
    return true;
  }catch(err){console.error('Push enable failed',err);toast(err?.message||'Could not enable phone alerts.','bad');return false;}
}

async function syncExisting(){
  if(!shopId()||Notification.permission!=='granted')return;
  try{const sub=await currentSubscription();if(sub)await saveSubscription(sub);}catch(err){console.warn('Push subscription sync failed',err);}
}

function refreshButton(enabled=false){
  const b=document.querySelector('[data-enable-phone-alerts]');if(!b)return;
  if(enabled||Notification.permission==='granted'){b.textContent='✓ PHONE ALERTS ENABLED';b.disabled=true;b.classList.remove('btn-primary');b.classList.add('btn-soft');}
}

function inject(){
  if(!shopId()||!document.querySelector('.dash-head')||document.querySelector('[data-push-alert-card]'))return;
  const card=document.createElement('div');card.dataset.pushAlertCard='1';card.className='card card-pad';card.style.margin='10px 0';
  const denied=Notification.permission==='denied';
  card.innerHTML=`<div class="card-title">NEW CUSTOMER PHONE ALERTS</div><p class="small muted" style="margin:6px 0 10px">Get a normal phone notification and sound when a customer submits intake, even when Mobile Mechanic AI is closed.</p><button type="button" class="btn ${Notification.permission==='granted'?'btn-soft':'btn-primary'}" data-enable-phone-alerts ${Notification.permission==='granted'||denied?'disabled':''}>${Notification.permission==='granted'?'✓ PHONE ALERTS ENABLED':denied?'NOTIFICATIONS BLOCKED':'ENABLE PHONE ALERTS'}</button>${denied?'<p class="small muted" style="margin:8px 0 0">Allow notifications for this site/app in your phone settings, then reopen Mobile Mechanic AI.</p>':''}`;
  const target=document.querySelector('.dash-status')||document.querySelector('.dashboard-grid')||document.querySelector('.dash-head');
  target?.insertAdjacentElement('afterend',card);
}

document.addEventListener('click',e=>{const b=e.target.closest?.('[data-enable-phone-alerts]');if(b){e.preventDefault();enablePush();}},true);
new MutationObserver(()=>inject()).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(inject,100));
window.MobileMechanicEnablePush=enablePush;
setTimeout(()=>{inject();syncExisting();},350);
})();
