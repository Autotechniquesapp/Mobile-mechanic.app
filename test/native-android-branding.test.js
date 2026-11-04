const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
test('native init/sync restores legacy and adaptive artwork, labels and reminder permissions idempotently',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mma-native-branding-')),native=path.join(root,'native/android');
  try{
    fs.mkdirSync(native,{recursive:true});
    for(const dir of ['templates','resources'])fs.cpSync(`native/android/${dir}`,path.join(native,dir),{recursive:true});
    fs.mkdirSync(path.join(native,'android/app/src/main/res/values'),{recursive:true});
    fs.writeFileSync(path.join(native,'android/app/src/main/res/values/strings.xml'),'<resources><string name="app_name">Old</string><string name="title_activity_main">Old</string></resources>');
    fs.writeFileSync(path.join(native,'android/app/src/main/AndroidManifest.xml'),'<manifest><application android:allowBackup="true"></application></manifest>');
    fs.writeFileSync(path.join(native,'android/app/build.gradle'),'versionCode 1\nversionName "1.0"');
    const oldAssets=path.join(native,'android/app/src/main/assets/native-alerts');fs.mkdirSync(oldAssets,{recursive:true});
    for(const name of ['supabase-production.js','logout-screen.js'])fs.writeFileSync(path.join(oldAssets,name),'stale shared web code');
    for(const name of ['native-android-notifications.js','native-schedule-reminders.js','push-notifications.js','logout-screen.js','supabase-production.js'])fs.copyFileSync(name,path.join(root,name));
    const script=path.resolve('native/android/scripts/configure-channel.mjs');
    execFileSync(process.execPath,[script],{cwd:native});execFileSync(process.execPath,[script],{cwd:native});
    const manifest=fs.readFileSync(path.join(native,'android/app/src/main/AndroidManifest.xml'),'utf8'),res=path.join(native,'android/app/src/main/res');
    assert.equal((manifest.match(/android.permission.SCHEDULE_EXACT_ALARM/g)||[]).length,1);assert.equal((manifest.match(/default_notification_channel_id/g)||[]).length,1);
    assert.match(fs.readFileSync(path.join(res,'values/strings.xml'),'utf8'),/name="app_name">Mobile Mechanic AI</);assert.match(fs.readFileSync(path.join(res,'values/strings.xml'),'utf8'),/name="title_activity_main">Mobile Mechanic AI</);
    for(const name of ['ic_launcher.xml','ic_launcher_round.xml'])assert.match(fs.readFileSync(path.join(res,'mipmap-anydpi-v26',name),'utf8'),/@drawable\/mma_launcher_foreground/);
    for(const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi'])assert.deepEqual(fs.readFileSync(path.join(res,`mipmap-${density}/ic_launcher.png`)),fs.readFileSync(`native/android/resources/launcher-${density}.png`));
    assert.match(fs.readFileSync(path.join(native,'android/app/build.gradle'),'utf8'),/versionCode 2/);
    assert.match(fs.readFileSync(path.join(native,'android/app/src/main/assets/native-alerts/push-notifications.js'),'utf8'),/MobileMechanicScheduleReminders/);
    for(const name of ['supabase-production.js','logout-screen.js'])assert.equal(fs.existsSync(path.join(oldAssets,name)),false,'shared web code must stay live');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
