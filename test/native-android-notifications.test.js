const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const native=fs.readFileSync('native-android-notifications.js','utf8');
const web=fs.readFileSync('push-notifications.js','utf8');
const fcm=fs.readFileSync('supabase/functions/push-notifications/native-fcm.ts','utf8');
const backend=fs.readFileSync('supabase/functions/push-notifications/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/202610210001_native_android_push_tokens.sql','utf8');
const html=fs.readFileSync('index.html','utf8');
const config=JSON.parse(fs.readFileSync('native/android/capacitor.config.json','utf8'));

test('native JS bridge parses and is Android-only',()=>{
  cp.execFileSync(process.execPath,['--check','native-android-notifications.js']);
  assert.match(native,/cap\.getPlatform\?\.\(\)!=='android'/);
  assert.match(native,/if\(!cap\?\.isNativePlatform/);
});

test('dedicated native channel supports Android settings and phone badges',()=>{
  assert.match(native,/new_customer_jobs_v1/);
  assert.match(native,/name:'New Customer Jobs'/);
  assert.match(native,/importance:4/);
  assert.match(native,/vibration:true/);
  assert.match(fcm,/channel_id:CHANNEL_ID/);
  assert.match(fcm,/notification_count:Math\.max\(1,args\.pendingCount\)/);
});

test('backend registers tokens only for current authenticated shop member',()=>{
  assert.match(backend,/action==="native_subscribe"/);
  assert.match(backend,/eq\("shop_id",sid\)\.eq\("user_id",user\.id\)\.eq\("status","active"\)/);
  assert.match(backend,/native_push_tokens/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on public\.native_push_tokens from anon, authenticated/);
});

test('native and web notifications coexist without exposing FCM credentials',()=>{
  assert.ok(html.indexOf('native-android-notifications.js')<html.indexOf('push-notifications.js'));
  assert.match(web,/nativeSupported/);
  assert.match(fcm,/Deno\.env\.get\('FIREBASE_SERVICE_ACCOUNT_JSON'\)/);
  assert.doesNotMatch(native,/FIREBASE_SERVICE_ACCOUNT_JSON|private_key/);
  assert.match(backend,/sendNativeIntakePush/);
  assert.match(backend,/webpush\.sendNotification/);
});

test('app config identifies stable native Android package and HTTPS origin',()=>{
  assert.equal(config.appId,'app.mobilemechanic.ai');
  assert.equal(config.server.url,'https://mobile-mechanic.app');
  assert.equal(config.server.cleartext,false);
});

test('native tokens are revoked before both logout paths',()=>{
  assert.match(fs.readFileSync('logout-screen.js','utf8'),/MobileMechanicNativeAndroidPush\?\.disable/);
  assert.match(fs.readFileSync('supabase-production.js','utf8'),/MobileMechanicNativeAndroidPush\?\.disable/);
});
