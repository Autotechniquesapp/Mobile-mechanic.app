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
const assets='android/app/src/main/assets/native-alerts';
fs.mkdirSync(assets,{recursive:true});
for(const name of ['native-android-notifications.js','logout-screen.js','supabase-production.js'])fs.copyFileSync(path.join('../..',name),path.join(assets,name));
// The current site loads push-notifications.js already. Initialize native support
// immediately before that controller so an unmerged web change is not required.
fs.writeFileSync(path.join(assets,'push-notifications.js'),
  fs.readFileSync('../../native-android-notifications.js','utf8')+'\n;\n'+fs.readFileSync('../../push-notifications.js','utf8'));
console.log('New Customer Jobs channel and Android settings shortcut configured.');
