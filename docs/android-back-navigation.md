# Android Back navigation — version 1.2

The Android shell registers a lifecycle-aware AndroidX `OnBackPressedCallback`.
This supports hardware Back and the system Back gesture. It calls
`window.MobileMechanicBack`, supplied by `app-back.js` on the live website.

Back closes the top customer/invoice dialog or navigation drawer first, then
saves invoice edits and returns through previously visited app screens. At the
dashboard it stays in the app. A failed save keeps the current invoice open.
History is cleared when the signed-in shop/account changes.

For a native source build, include `templates/AppBackPressedCallback.java` and
register it after `super.onCreate(savedInstanceState)` in MainActivity:

```java
getOnBackPressedDispatcher().addCallback(this, new AppBackPressedCallback(this));
```

The version 1.2 APK was produced from the user's existing version 1.1 APK using
`patch-back-navigation.py` on an apktool-decoded copy. Only the callback, its
registration, and version metadata changed. Existing Firebase setup, notification
channels, app identity, resources, and permissions were retained. The APK is
signed with the same release certificate as version 1.1 and has versionCode 3.

Verification: app navigation tests, APK rebuild, zip alignment, and matching
v2/v3 signing-certificate verification passed. A real-device Back gesture and
installation check is still required; no device or emulator run is claimed.
