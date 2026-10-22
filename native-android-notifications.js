(() => {
'use strict';
// Native only. Chrome/PWA users continue using the existing Web Push flow.
const cap=window.Capacitor;
if(!cap?.isNativePlatform?.() || cap.getPlatform?.()!=='android')return;
const push=cap.registerPlugin?.('PushNotifications')||cap.Plugins?.PushNotifications;
if(!push)return;
const sb=window.MobileMechanicSupabase;
const DBKEY='mobile_mechanic_ai_approved_v7';
const CHANNEL_ID='new_customer_jobs_v1';
let started=null, registrationReady=false, token='', enabled=false;

function shopId(){try{return JSON.parse(localStorage.getItem(DBKEY)||'{}')?.session?.shopId||null;}catch{return null;}}
function showError(error){console.warn('Native Android push:',error?.message||error);}
async function subscribe(value){
  if(!sb||!shopId())throw new Error('Sign in to a shop before enabling native notifications.');
  const {data,error}=await sb.functions.invoke('push-notifications',{body:{action:'native_subscribe',shop_id:shopId(),token:value}});
  if(error||data?.error)throw new Error(error?.message||data.error);
  token=value;enabled=true;
  window.dispatchEvent(new CustomEvent('mma-native-push-status',{detail:{enabled:true}}));
}
async function init(){
  if(started)return started;
  started=(async()=>{
    // Stable ID: Android lets users set the sound once for this channel.
    await push.createChannel({
      id:CHANNEL_ID,name:'New Customer Jobs',
      description:'New customer intake and job requests',
      importance:4,vibration:true,visibility:0,lights:true,lightColor:'#ef2a31'
    });
    await push.addListener('registration',async ({value})=>{
      try{await subscribe(value);}catch(err){enabled=false;showError(err);}
    });
    await push.addListener('registrationError',showError);
    await push.addListener('pushNotificationActionPerformed',()=>{
      location.hash='#dashboard';
      window.dispatchEvent(new CustomEvent('mma-native-job-alert-opened'));
    });
    registrationReady=true;
  })();
  try{await started;}catch(err){started=null;showError(err);throw err;}
  return started;
}
async function registerIfAllowed(){
  await init();
  if(!shopId())return false;
  const status=await push.checkPermissions();
  if(status.receive!=='granted')return false;
  await push.register();
  return true;
}
async function enable(){
  await init();
  if(!shopId())throw new Error('Sign in to the shop before enabling new-job notifications.');
  let permissions=await push.checkPermissions();
  if(permissions.receive!=='granted')permissions=await push.requestPermissions();
  if(permissions.receive!=='granted')throw new Error('Allow notifications for Mobile Mechanic AI in Android settings.');
  await push.register();
  // 'registration' delivers the FCM token asynchronously; do not claim delivery yet.
  return true;
}
async function disable(){
  if(!token||!sb)return;
  try{
    await sb.functions.invoke('push-notifications',{body:{action:'native_unsubscribe',token}});
  }finally{enabled=false;token='';}
}
// Android launcher badges represent active notifications. FCM receives the
// number of new intakes (notification_count), but Samsung may choose to
// display its own active-notification count instead.
window.MobileMechanicNativeAndroidPush={
  channelId:CHANNEL_ID,
  enable,disable,init,
  isSupported:()=>true,
  isEnabled:()=>enabled,
  getToken:()=>token,
  check:async()=>{await init();return (await push.checkPermissions()).receive==='granted';}
};
init().then(registerIfAllowed).catch(showError);
window.addEventListener('mma-shop-session-ready',()=>registerIfAllowed().catch(showError));
})();