(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
const supported=!!(sb&&window.isSecureContext&&('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window));
let pushActive=false;
let checkingSubscription=false;

function cache(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function shopId(){return cache().session?.shopId||null;}
function standalone(){return window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;}
function route(){return (location.hash||'#dashboard').slice(1).split('?')[0];}
function toast(msg,type=''){document.querySelector('.push-toast')?.remove();const d=document.createElement('div');d.className=`toast push-toast ${type}`;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),6500);}
function b64(s){const pad='='.repeat((4-s.length%4)%4),base=(s+pad).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
function timeout(p,ms,message){return Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),ms))]);}

async function fn(body){const {data,error}=await sb.functions.invoke('push-notifications',{body});if(error)throw error;if(data?.error)throw new Error(data.error);return data;}
async function registration(){
  if(!('serviceWorker' in navigator))throw new Error('Service workers are not supported on this phone/browser.');
  try{await navigator.serviceWorker.register('./service-worker.js');}catch(err){throw new Error(err?.message||'Could not start phone notification service.');}
  return timeout(navigator.serviceWorker.ready,10000,'Phone notification service did not become ready. Reload the app and try again.');
}
async function currentSubscription(){const r=await registration();return r.pushManager.getSubscription();}
async function saveSubscription(sub){const j=sub.toJSON();await fn({action:'subscribe',subscription:j});return sub;}

function notificationState(){
  if(!supported)return {key:'unsupported',label:'Phone alerts not supported',detail:'Use the secure HTTPS site in Chrome on Android, or the installed Home Screen app on iPhone.'};
  if(Notification.permission==='denied')return {key:'blocked',label:'Notifications blocked',detail:'Allow notifications for Mobile Mechanic AI in your phone settings, then reopen the app.'};
  if(pushActive)return {key:'enabled',label:'Phone alerts enabled',detail:'New customer intakes can notify this phone even when the app is closed.'};
  return {key:'off',label:'Phone alerts not enabled',detail:'Turn on alerts to get a normal phone notification and sound for new customer intakes.'};
}

function removeOldDashboardCard(){document.querySelectorAll('[data-push-alert-card]').forEach(x=>x.remove());}
function removeDashboardReminder(){document.querySelectorAll('[data-push-dashboard-reminder]').forEach(x=>x.remove());}
function removeSettingsCard(){document.querySelectorAll('[data-push-settings-card]').forEach(x=>x.remove());}

function renderSettingsControl(){
  if(!shopId()||route()!=='settings'){removeSettingsCard();return;}
  const main=document.querySelector('main.content');
  if(!main)return;
  const state=notificationState();
  const existing=main.querySelector('[data-push-settings-card]');
  if(existing?.dataset.pushState===state.key){bindEnableButton(existing);return;}
  removeSettingsCard();
  const enabled=state.key==='enabled',blocked=state.key==='blocked',unsupported=state.key==='unsupported';
  const card=document.createElement('section');
  card.dataset.pushSettingsCard='1';
  card.dataset.pushState=state.key;
  card.className='card card-pad';
  card.style.marginTop='10px';
  card.innerHTML=`<div class="card-title">🔔 NOTIFICATIONS</div><div class="divider"></div><div class="list-item" style="align-items:center"><div class="list-icon">🔔</div><div class="list-main"><b>${state.label}</b><p>${state.detail}</p><div class="list-actions"><button type="button" class="btn ${enabled?'btn-soft':'btn-primary'}" data-enable-phone-alerts ${enabled||blocked||unsupported?'disabled':''}>${enabled?'✓ PHONE ALERTS ENABLED':blocked?'NOTIFICATIONS BLOCKED':unsupported?'NOT SUPPORTED':'ENABLE PHONE ALERTS'}</button></div>${blocked?'<p class="small muted" style="margin:8px 0 0">Open your phone Settings → Apps/Browser → Notifications, allow Mobile Mechanic AI, then reopen the app.</p>':''}</div></div>`;
  main.appendChild(card);
  bindEnableButton(card);
}

function renderDashboardReminder(){
  removeOldDashboardCard();
  if(!shopId()||route()!=='dashboard'||pushActive){removeDashboardReminder();return;}
  const main=document.querySelector('main.content');
  if(!main)return;
  if(document.querySelector('[data-push-dashboard-reminder]'))return;
  const reminder=document.createElement('button');
  reminder.type='button';
  reminder.dataset.pushDashboardReminder='1';
  reminder.className='priority-strip';
  reminder.style.cssText='width:100%;margin-top:14px;border:0;text-align:left;cursor:pointer';
  reminder.innerHTML='<span style="font-size:20px">🔔</span><b>Enable notifications</b><span>Notification settings ›</span>';
  reminder.addEventListener('click',e=>{e.preventDefault();location.hash='#settings';});
  main.appendChild(reminder);
}

function refreshUI(){removeOldDashboardCard();renderSettingsControl();renderDashboardReminder();}

async function enablePush(){
  const button=document.querySelector('[data-enable-phone-alerts]');
  if(button?.dataset.busy==='1')return false;
  if(button){button.dataset.busy='1';button.disabled=true;button.textContent='ENABLING PHONE ALERTS…';}
  try{
    if(!supported)throw new Error(!window.isSecureContext?'Phone alerts require the secure HTTPS version of the app.':'This browser does not support web push notifications. Try Chrome on Android or the installed Home Screen app on iPhone.');
    if(!shopId())throw new Error('Sign in to the shop before enabling phone alerts.');
    const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
    if(ios&&!standalone()){
      window.MobileMechanicInstallApp?.();
      throw new Error('On iPhone, add Mobile Mechanic AI to the Home Screen first, open it from the new icon, then enable alerts.');
    }
    let permission=Notification.permission;
    if(permission==='default')permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('Notifications are blocked. Allow notifications for Mobile Mechanic AI in your phone/browser settings.');
    const r=await registration();
    let sub=await r.pushManager.getSubscription();
    if(!sub){
      const k=await fn({action:'public_key'});
      if(!k?.public_key)throw new Error('Push notification key is not configured yet.');
      sub=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(k.public_key)});
    }
    await saveSubscription(sub);
    pushActive=true;
    toast('Phone alerts enabled. New customer intakes can notify this phone even when the app is closed.','good');
    try{navigator.vibrate?.([120,60,120]);}catch{}
    refreshUI();
    return true;
  }catch(err){
    console.error('Push enable failed',err);
    pushActive=false;
    toast(err?.message||'Could not enable phone alerts.','bad');
    refreshUI();
    return false;
  }finally{if(button)button.dataset.busy='0';}
}

function bindEnableButton(root=document){
  const b=root.querySelector?.('[data-enable-phone-alerts]');
  if(!b||b.dataset.bound==='1')return;
  b.dataset.bound='1';
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();enablePush();});
  b.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();enablePush();},{passive:false});
}

async function syncExisting(){
  if(checkingSubscription||!supported||!shopId())return;
  checkingSubscription=true;
  try{
    if(Notification.permission==='granted'){
      const sub=await currentSubscription();
      pushActive=!!sub;
      if(sub)await saveSubscription(sub);
    }else pushActive=false;
  }catch(err){console.warn('Push subscription sync failed',err);pushActive=false;}
  finally{checkingSubscription=false;refreshUI();}
}

// Fallback if the Settings page is re-rendered after the control was inserted.
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-enable-phone-alerts]');
  if(b&&b.dataset.bound!=='1'){e.preventDefault();e.stopImmediatePropagation();enablePush();}
},true);

let refreshScheduled=false;
new MutationObserver(()=>{
  if(refreshScheduled)return;
  refreshScheduled=true;
  setTimeout(()=>{refreshScheduled=false;refreshUI();bindEnableButton(document);},80);
}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(()=>{refreshUI();bindEnableButton(document);},120));
window.MobileMechanicEnablePush=enablePush;
setTimeout(()=>{removeOldDashboardCard();refreshUI();syncExisting();},350);
})();
