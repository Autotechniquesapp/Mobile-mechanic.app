const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const native=fs.readFileSync('native-android-notifications.js','utf8');
const controller=fs.readFileSync('push-notifications.js','utf8');

async function phone({registrationError=false}={}){
  const dom=new JSDOM('<main class="content"></main>',{url:'https://mobile-mechanic.app/#settings',runScripts:'outside-only'}),w=dom.window;
  const listeners={},calls=[],timers=[];let opened=0,unregistered=0;
  w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({session:{shopId:'shop'}}));
  w.MutationObserver=class{observe(){}};w.setTimeout=fn=>{timers.push(fn);return 1;};
  const push={createChannel:async x=>calls.push(x),addListener:async(name,fn)=>listeners[name]=fn,checkPermissions:async()=>({receive:'granted'}),register:async()=>{},unregister:async()=>{unregistered++;}};
  w.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android',registerPlugin:name=>name==='PushNotifications'?push:{open:async()=>{opened++;}}};
  w.MobileMechanicSupabase={functions:{invoke:async()=>registrationError?{data:{error:'Native Android push is not configured on the server.'}}:{data:{ok:true}}}};
  w.eval(native);await new Promise(resolve=>setImmediate(resolve));w.eval(controller);timers.splice(0).forEach(fn=>fn());
  return {dom,w,listeners,calls,get opened(){return opened;},get unregistered(){return unregistered;}};
}
test('native settings shortcut opens the dedicated Android channel rather than Chrome settings',async()=>{
  const p=await phone();assert.equal(p.calls[0].id,'new_customer_jobs_v1');
  const b=Array.from(p.w.document.querySelectorAll('button')).find(b=>b.textContent.includes('SOUND & SETTINGS'));assert.ok(b);b.click();await new Promise(r=>setImmediate(r));assert.equal(p.opened,1);p.dom.window.close();
});
test('registration failure is visible and never reports enabled',async()=>{
  const p=await phone({registrationError:true});await p.listeners.registration({value:'valid-device-token'});
  assert.equal(p.w.MobileMechanicNativeAndroidPush.isEnabled(),false);assert.match(p.w.document.body.textContent,/not configured on the server/);p.dom.window.close();
});
test('logout unregisters the device from FCM',async()=>{
  const p=await phone();await p.listeners.registration({value:'valid-device-token'});assert.equal(p.w.MobileMechanicNativeAndroidPush.isEnabled(),true);
  await p.w.MobileMechanicNativeAndroidPush.disable();assert.equal(p.unregistered,1);assert.equal(p.w.MobileMechanicNativeAndroidPush.isEnabled(),false);p.dom.window.close();
});
