// Run after npm run android:init or android:sync.
import fs from 'node:fs';
import path from 'node:path';
const file='android/app/src/main/AndroidManifest.xml';
if(!fs.existsSync(file))throw Error('Android project missing: run npm run android:init first.');
let xml=fs.readFileSync(file,'utf8');
const entry='<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="new_customer_jobs_v1" />';
if(!xml.includes('com.google.firebase.messaging.default_notification_channel_id')){
  if(!xml.includes('</application>'))throw Error('Expected Android application manifest element.');
  xml=xml.replace('</application>','    '+entry+'\n    </application>');
  fs.writeFileSync(file,xml);
}
xml=fs.readFileSync(file,'utf8').replace('android:allowBackup="true"','android:allowBackup="false"');
if(!xml.includes('android.permission.POST_NOTIFICATIONS'))xml=xml.replace('</manifest>','    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>');
fs.writeFileSync(file,xml);
const drawable='android/app/src/main/res/drawable';
fs.mkdirSync(drawable,{recursive:true});
for(const name of ['ic_launcher_foreground.xml','ic_stat_job.xml'])fs.copyFileSync(path.join('templates',name),path.join(drawable,name));
if(!xml.includes('com.google.firebase.messaging.default_notification_icon')){
  xml=xml.replace('</application>','    <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_job" />\n    </application>');
  fs.writeFileSync(file,xml);
}
const java='android/app/src/main/java/app/mobilemechanic/ai';
fs.mkdirSync(java,{recursive:true});
for(const name of ['MainActivity.java','JobNotificationSettingsPlugin.java','JobAlertsWebViewClient.java'])fs.copyFileSync(path.join('templates',name),path.join(java,name));
// Use a unique adaptive foreground so Android cannot pick the generated
// Capacitor drawable-v24 placeholder instead of our restored icon.
fs.copyFileSync('templates/ic_launcher_foreground.xml',path.join(drawable,'mma_launcher_foreground.xml'));
fs.writeFileSync(path.join(drawable,'mma_launcher_background.xml'),'<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="#07090c" /></shape>');
const adaptive='android/app/src/main/res/mipmap-anydpi-v26';fs.mkdirSync(adaptive,{recursive:true});
for(const name of ['ic_launcher.xml','ic_launcher_round.xml'])fs.writeFileSync(path.join(adaptive,name),'<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@drawable/mma_launcher_background" /><foreground android:drawable="@drawable/mma_launcher_foreground" /></adaptive-icon>');
for(const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']){
  const dir=`android/app/src/main/res/mipmap-${density}`;fs.mkdirSync(dir,{recursive:true});
  for(const name of ['ic_launcher.png','ic_launcher_round.png'])fs.copyFileSync(`resources/launcher-${density}.png`,path.join(dir,name));
}
const strings='android/app/src/main/res/values/strings.xml';
let labels=fs.readFileSync(strings,'utf8');
for(const name of ['app_name','title_activity_main'])labels=labels.replace(new RegExp(`(<string name="${name}">)[^<]*(</string>)`),'$1Mobile Mechanic AI$2');
fs.writeFileSync(strings,labels);
const gradle='android/app/build.gradle';
if(fs.existsSync(gradle))fs.writeFileSync(gradle,fs.readFileSync(gradle,'utf8').replace(/versionCode\s+1\b/,'versionCode 2').replace(/versionName\s+"1\.0"/,'versionName "1.1"'));
if(!xml.includes('android.permission.SCHEDULE_EXACT_ALARM')){
  xml=xml.replace('</manifest>','    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />\n</manifest>');fs.writeFileSync(file,xml);
}
const assets='android/app/src/main/assets/native-alerts';
fs.mkdirSync(assets,{recursive:true});
for(const name of ['native-android-notifications.js'])fs.copyFileSync(path.join('../..',name),path.join(assets,name));
// Shared account/workflow code must always come from the live site, so web
// fixes reach Android too. Remove snapshots left by older build setups.
for(const name of ['logout-screen.js','supabase-production.js'])fs.rmSync(path.join(assets,name),{force:true});
// The current site loads push-notifications.js already. Initialize native support
// immediately before that controller so an unmerged web change is not required.
fs.writeFileSync(path.join(assets,'push-notifications.js'),
  fs.readFileSync('../../native-android-notifications.js','utf8')+'\n;\n'+fs.readFileSync('../../native-schedule-reminders.js','utf8')+'\n;\n'+fs.readFileSync('templates/push-notifications.js','utf8'));
console.log('New Customer Jobs channel and Android settings shortcut configured.');
