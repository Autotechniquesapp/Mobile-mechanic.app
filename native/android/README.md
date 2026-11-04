# Native Android job notifications

This is a Capacitor 8 Android wrapper for the existing Mobile Mechanic AI site.
It prepares a dedicated Android notification category named New Customer Jobs.
The website/PWA and its existing Chrome Web Push continue to operate.

Shared customer, job, invoice, schedule and account code loads from the live
website, so publishing those web fixes updates the Android experience too.
The shell packages only its Android notification integration. Launcher branding,
native reminder code, permissions and native plugin changes need a new APK or
Play Store release; they cannot be delivered by changing the website alone.

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

    npm ci
    npm run android:init
    npm run android:channel
    # copy google-services.json to android/app/google-services.json
    npm run android:sync
    npm run android:open

Install the debug app from Android Studio on a real Samsung phone.
Build/sign a production APK or AAB separately before distribution.

## Launcher branding

The launcher and activity name are Mobile Mechanic AI. The launcher uses the
existing red-wrench-and-white-car artwork from app-icon.svg. Both legacy PNG
icons and Android adaptive icons are configured after every init/sync. The
adaptive icon uses a unique foreground resource to avoid the default Capacitor
drawable-v24 overriding the intended artwork.

Use the same signing key as the installed app for an in-place update. Keep that
key in durable private storage outside Git; generating another debug key does
not produce a compatible update. Increase versionCode for each delivered build.

## Scheduled job reminders

The Android shell includes @capacitor/local-notifications and a separate
Scheduled Jobs channel. In Schedule or Settings, choose the reminder lead time
(at appointment time, 15/30 minutes, 1/2 hours, or Off) and tap Enable reminders.
The default is 30 minutes before the appointment. Allow Android notifications;
use Allow on-time alerts to grant the Alarms & reminders timing permission.
Without that permission Android may delay a reminder.

Reminders are scheduled on the phone and can fire while the app is closed.
Opening/refreshing the app reconciles appointments with the selected shop's
saved schedule. Rescheduling replaces the previous reminder; completion, full
payment, removal from the schedule, deletion and logout cancel its reminders.
Changes made elsewhere while this phone is offline are reconciled when the app
next refreshes. The feature cancels only its own local reminders, preserving
other notification categories. Tapping a reminder opens its job only when the
matching shop and user are signed in.

Native checks still required: build/sign with the original key, update the
installed app, confirm launcher branding, grant notifications/timing permission,
and verify a reminder with the screen locked. Then move/cancel an appointment
and confirm its old reminder no longer fires. These are native-device checks;
the DOM/unit tests do not establish delivery on a Samsung phone.

The APK creates the stable `new_customer_jobs_v1` channel at first launch,
before JavaScript or Firebase registration. In Settings, the New Customer Jobs
sound button opens that exact Android channel. General and Messages channels
are not used for intake alerts.

The APK bundles the native notification controller plus the two logout/auth
integration scripts. Its WebView substitutes those exact script paths only
for HTTPS requests to `mobile-mechanic.app` on the default HTTPS port. All
other requests use Capacitor's standard handling. This allows private device
testing before the website portion is merged; no website deployment is needed.
Run `npm run android:channel` after editing those scripts to refresh the APK assets.
App backup is disabled so WebView sessions are not copied by Android backup.

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

## Server readiness

The existing `public_key` action returns a `native_configured` boolean alongside
the public web-push key. It never returns Firebase credentials. False means the
`FIREBASE_SERVICE_ACCOUNT_JSON` secret is missing or cannot be parsed into the
required service account fields. Saving `google-services.json` in that server
secret will not work; that is the separate Android client configuration.

Native token registration requires an authenticated, active shop member. Native
delivery also rechecks active membership, so removing a user stops future
customer alerts even if an old device token is still stored. Logout deletes
the device's FCM registration, including when server unsubscribe fails.
Only a structured FCM `UNREGISTERED` error retires a token; a generic 404 does not.
