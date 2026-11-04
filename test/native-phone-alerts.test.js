const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const bridge=fs.readFileSync('native-phone-alert-bridge.js','utf8');
const controller=fs.readFileSync('phone-alerts.js','utf8');
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
async function fixture({native=true,fail=false,webSupported=false}={}){
  const dom=new JSDOM('<main class="content"></main>',{url:'https://www.mobile-mechanic.app/#settings',runScripts:'outside-only'}),w=dom.window;
  const listeners={},calls=[];
  const push={createChannel:async()=>{},addListener:async(k,fn)=>{listeners[k]=fn;},checkPermissions:async()=>({receive:'granted'}),register:async()=>{calls.push('register');if(fail)throw new Error('Registration failed');},unregister:async()=>{}};
  w.Capacitor={isNativePlatform:()=>native,getPlatform:()=>native?'android':'web',registerPlugin:name=>name==='PushNotifications'?push:{open:async()=>{}}};
  w.MobileMechanicSupabase={functions:{invoke:async(_,{body})=>{calls.push(body.action);return {data:{ok:true}};}},auth:{onAuthStateChange:()=>{}}};
  if(webSupported){
    Object.defineProperty(w,'isSecureContext',{value:true});
    w.Notification={permission:'granted'};w.PushManager=function(){};
    const registration={pushManager:{getSubscription:async()=>({toJSON:()=>({endpoint:'https://push.example/device'})})}};
    Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>{},ready:Promise.resolve(registration)}});
  }
  w.localStorage.setItem('mobile_mechanic_ai_approved_v7',JSON.stringify({session:{shopId:'shop'}}));
  // Deliberately no browser Notification, PushManager or service worker APIs.
  w.console.warn=()=>{};w.console.error=()=>{};
  w.eval(bridge);w.eval(controller);await settle();await new Promise(r=>w.setTimeout(r,400));
  return {dom,w,listeners,calls};
}
test('Android without web push APIs loads native controls, registers and becomes enabled',async()=>{
  const h=await fixture();try{
    assert.match(h.w.document.body.textContent,/Native Android job alerts/);
    assert.doesNotMatch(h.w.document.body.textContent,/not supported/);
    assert.equal(await h.w.MobileMechanicEnablePush(),true);
    await h.listeners.registration({value:'device-token'});await settle();
    assert.ok(h.calls.includes('native_subscribe'));
    assert.match(h.w.document.body.textContent,/Native Android job alerts enabled/);
  }finally{h.dom.window.close();}
});
test('failed native enable resets the button and permits retry',async()=>{
  const h=await fixture({fail:true});try{
    assert.equal(await h.w.MobileMechanicEnablePush(),false);
    const button=h.w.document.querySelector('[data-enable-phone-alerts]');
    assert.equal(button.disabled,false);assert.equal(button.textContent,'ENABLE PHONE ALERTS');
    assert.match(h.w.document.body.textContent,/Registration failed/);
    const count=h.calls.length;await h.w.MobileMechanicEnablePush();assert.ok(h.calls.length>count);
  }finally{h.dom.window.close();}
});
test('native registration errors are displayed safely and the bridge initializes only once',async()=>{
  const h=await fixture();try{
    const instance=h.w.MobileMechanicNativeAndroidPush;h.w.eval(bridge);
    assert.equal(h.w.MobileMechanicNativeAndroidPush,instance);
    h.listeners.registrationError({error:'<img src=x onerror=alert(1)>'});await settle();
    assert.match(h.w.document.body.textContent,/<img src=x/);
    assert.equal(h.w.document.querySelector('img'),null);
  }finally{h.dom.window.close();}
});
test('regular web context keeps browser notification flow',async()=>{
  const h=await fixture({native:false});try{
    assert.equal(h.w.MobileMechanicNativeAndroidPush,undefined);
    assert.equal(h.calls.length,0);
    assert.match(h.w.document.body.textContent,/Phone alerts not supported/);
  }finally{h.dom.window.close();}
});
test('supported browsers still save web push subscriptions without native registration',async()=>{
  const h=await fixture({native:false,webSupported:true});try{
    assert.equal(await h.w.MobileMechanicEnablePush(),true);
    assert.ok(h.calls.includes('subscribe'));assert.ok(!h.calls.includes('register'));
    assert.match(h.w.document.body.textContent,/Phone alerts enabled/);
  }finally{h.dom.window.close();}
});
test('live bootstrap uses URLs outside the installed APK interception and correct order',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.ok(html.indexOf('supabase-production.js')<html.indexOf('native-phone-alert-bridge.js'));
  assert.ok(html.indexOf('native-phone-alert-bridge.js')<html.indexOf('src="phone-alerts.js'));
  assert.doesNotMatch(html,/src="(?:push-notifications|native-android-notifications)\.js/);
});
