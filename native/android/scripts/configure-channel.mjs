// Run after npm run android:init or android:sync.
import fs from 'node:fs';
const file='android/app/src/main/AndroidManifest.xml';
if(!fs.existsSync(file))throw Error('Android project missing: run npm run android:init first.');
let xml=fs.readFileSync(file,'utf8');
const entry='<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="new_customer_jobs_v1" />';
if(!xml.includes('com.google.firebase.messaging.default_notification_channel_id')){
  if(!xml.includes('</application>'))throw Error('Expected Android application manifest element.');
  xml=xml.replace('</application>','    '+entry+'\n    </application>');
  fs.writeFileSync(file,xml);
}
console.log('Native job notification fallback channel configured.');
