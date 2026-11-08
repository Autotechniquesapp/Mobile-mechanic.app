# Android microphone and dictation

Android v1.3 (version code 4) declares `RECORD_AUDIO`. Tapping Dictate Findings
or Speak Concern uses `NativeDictation.start`, requests the Android runtime
permission when needed, then opens the Android speech recognition activity.
Recognized text is appended to the visible field. Findings are saved using the
captured job ID and shop ID. A cancelled/denied request leaves the field alone;
changing jobs while dictation is open discards the late result.

The web handler is `native-dictation.js`, loaded before other dictation handlers.
Browsers retain their existing Web Speech handlers. Older APKs need the v1.3
update to acquire the manifest permission and native plugin.

## Native integration

Use `native/android/templates/NativeDictationPlugin.java` in the Android app's
`app.mobilemechanic.ai` package. Register it in MainActivity before
`super.onCreate`: `registerPlugin(NativeDictationPlugin.class)`.
Declare `android.permission.RECORD_AUDIO`, `android.permission.MODIFY_AUDIO_SETTINGS`,
and the `android.speech.action.RECOGNIZE_SPEECH` intent in manifest queries.
Microphone hardware is optional (`android:required="false"`).

For the retained APK-based build workflow, compile the plugin against the
existing Capacitor classes, convert its classes with D8 (min API 24), disassemble
the plugin dex with APKTool, then run:

```sh
python3 native/android/patch-dictation.py DECODED_APK PLUGIN_SMALI_DIRECTORY
```

Rebuild with APKTool, align and sign with the existing Android signing key.
Keep that key private. The patch retains notification channels and back-button
handling. An update must use the same application ID and signing certificate.

## Verification

- Plugin Java compilation and dex assembly pass.
- Signed APK manifest includes the recording permission and version 1.3.
- JS tests cover returned speech, permission denial, cancellation, job switching,
  older APK handling, and browser fallback.
- Validate on a phone: install as an update; open Findings; tap Dictate Findings;
  allow microphone access; speak; verify the text appears and survives reopening.
  Also deny/cancel once and confirm the existing notes remain.

The runtime does not provide an Android emulator or connected phone, so the
physical permission dialog and microphone recording require that device check.
