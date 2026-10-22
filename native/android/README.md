# Native Android job notifications

This is a Capacitor 8 Android wrapper for the existing Mobile Mechanic AI site.
It prepares a dedicated Android notification category named New Customer Jobs.
The website/PWA and its existing Chrome Web Push continue to operate.

## What the number badge represents

The FCM message includes the number of intake_submissions with status=new in
the current shop. Android controls the final icon badge presentation. Samsung
may display the number of active posted notifications instead, and the badge
can disappear if notifications are dismissed. The app dashboard count remains
the authoritative pending-intake count.

## Required before installing

1. Create a Firebase Android app with package app.mobilemechanic.ai.
2. Download google-services.json and place it in
   native/android/android/app/google-services.json AFTER generating Android.
   Keep it out of source control.
3. Configure the Supabase Edge Function secret FIREBASE_SERVICE_ACCOUNT_JSON
   with that Firebase project's service-account JSON. NEVER put the private key
   in GitHub or in the Android app.
4. Review the new native_push_tokens SQL migration and apply it against the
   verified production schema. Do not replay the repository's entire migration
   history, which may not match the live database.
5. Deploy the updated push-notifications Edge Function including native-fcm.ts.
   Ensure the existing intake notification trigger is still operating.

## Generate an Android project

Developer prerequisites: Node 22 or later, Android Studio and Android SDK.

From native/android run:

    npm install
    npm run android:init
    npm run android:channel
    # copy google-services.json to android/app/google-services.json
    npm run android:sync
    npm run android:open

Install the debug app from Android Studio on a real Samsung phone.
Build/sign a production APK or AAB separately before distribution.

Important: This interim Capacitor wrapper loads the existing live HTTPS site
remotely to preserve auth, integration, and payment origin behavior. A production
security review of the remote WebView, Capacitor bridge, signing, and Android
behavior is required before distributing it to other shops.

## Samsung verification

1. Install and launch the Android APK; log in to the target shop.
2. In the app Settings screen enable New Customer Jobs notifications.
3. Samsung Settings > Apps > Mobile Mechanic AI > Notifications >
   Notification categories > New Customer Jobs should now exist.
   Choose the sound there without altering Chrome notification sounds.
4. Samsung Settings > Notifications > Advanced settings > App icon badges:
   enable badges and choose Number (wording varies by One UI version).
5. With the app closed, submit two new customer intakes. Confirm native alerts,
   the correct shop, and badge presentation.
6. Close or convert intakes and confirm the in-app waiting count decreases.
   Android's badge may depend on remaining visible notifications.
7. Sign out; confirm this device token is disabled and future alerts stop.
8. Test a previously registered Chrome Web Push subscriber to catch regressions.

## Limitations

This source alone does NOT create an installable APK. Firebase configuration,
native build, Supabase migration, backend deployment, and real-device testing
remain mandatory. No live Android delivery is claimed yet.
