(() => {
'use strict';
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
const supported=!!(sb&&window.isSecureContext&&('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window));

function cache(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}');}catch{return {};}}
function shopId(){return cache().session?.shopId||null;}
function standalone(){return window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;}
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

function setButtonState(text,disabled=false,good=false){
  const b=document.querySelector('[data-enable-phone-alerts]');if(!b)return;
  b.textContent=text;b.disabled=disabled;
  if(good){b.classList.remove('btn-primary');b.classList.add('btn-soft');}
}

async function enablePush(){
  const button=document.querySelector('[data-enable-phone-alerts]');
  if(button?.dataset.busy==='1')return false;
  if(button)button.dataset.busy='1';
  setButtonState('ENABLING PHONE ALERTS…',true);
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
    setButtonState('✓ PHONE ALERTS ENABLED',true,true);
    toast('Phone alerts enabled. New customer intakes can notify this phone even when the app is closed.','good');
    try{navigator.vibrate?.([120,60,120]);}catch{}
    return true;
  }catch(err){
    console.error('Push enable failed',err);
    const msg=err?.message||'Could not enable phone alerts.';
    setButtonState(Notification?.permission==='denied'?'NOTIFICATIONS BLOCKED':'ENABLE PHONE ALERTS',Notification?.permission==='denied',false);
    toast(msg,'bad');
    // Keep a visible message even if another app toast layer hides ours.
    const card=document.querySelector('[data-push-alert-card]');
    if(card){let p=card.querySelector('[data-push-error]');if(!p){p=document.createElement('p');p.dataset.pushError='1';p.className='small';p.style.cssText='margin:8px 0 0;color:#ff7378';card.appendChild(p);}p.textContent=msg;}
    return false;
  }finally{
    if(button)button.dataset.busy='0';
  }
}

async function syncExisting(){
  if(!supported||!shopId()||Notification.permission!=='granted')return;
  try{const sub=await currentSubscription();if(sub)await saveSubscription(sub);}catch(err){console.warn('Push subscription sync failed',err);}
}

function bindButton(card){
  const b=card?.querySelector('[data-enable-phone-alerts]');
  if(!b||b.dataset.bound==='1')return;
  b.dataset.bound='1';
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();enablePush();});
  b.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();enablePush();},{passive:false});
}

function inject(){
  if(!shopId()||!document.querySelector('.dash-head')||document.querySelector('[data-push-alert-card]'))return;
  const card=document.createElement('div');card.dataset.pushAlertCard='1';card.className='card card-pad';card.style.margin='10px 0';
  const denied=supported&&Notification.permission==='denied';
  const granted=supported&&Notification.permission==='granted';
  const label=!supported?'PHONE ALERTS NOT SUPPORTED':granted?'✓ PHONE ALERTS ENABLED':denied?'NOTIFICATIONS BLOCKED':'ENABLE PHONE ALERTS';
  card.innerHTML=`<div class="card-title">NEW CUSTOMER PHONE ALERTS</div><p class="small muted" style="margin:6px 0 10px">Get a normal phone notification and sound when a customer submits intake, even when Mobile Mechanic AI is closed.</p><button type="button" class="btn ${granted?'btn-soft':'btn-primary'}" data-enable-phone-alerts ${granted||denied||!supported?'disabled':''}>${label}</button>${denied?'<p class="small muted" style="margin:8px 0 0">Allow notifications for this site/app in your phone settings, then reopen Mobile Mechanic AI.</p>':''}${!supported?'<p class="small muted" style="margin:8px 0 0">Use the secure HTTPS site in Chrome on Android, or install the Home Screen app on iPhone.</p>':''}`;
  const target=document.querySelector('.dash-status')||document.querySelector('.dashboard-grid')||document.querySelector('.dash-head');
  target?.insertAdjacentElement('afterend',card);
  bindButton(card);
}

// Capture fallback in case the dashboard is re-rendered and another script replaces the button.
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-enable-phone-alerts]');if(b&&b.dataset.bound!=='1'){e.preventDefault();e.stopImmediatePropagation();enablePush();}},true);
new MutationObserver(()=>{inject();const card=document.querySelector('[data-push-alert-card]');if(card)bindButton(card);}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(inject,100));
window.MobileMechanicEnablePush=enablePush;
setTimeout(()=>{inject();syncExisting();},350);
})();
