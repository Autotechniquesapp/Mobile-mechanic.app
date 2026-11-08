"""Add native dictation to a decoded APK without changing signing or app data.

Pass the APKTool directory and the compiled plugin's baksmali directory.
The Java source lives in templates/NativeDictationPlugin.java.
"""
import argparse
import pathlib
import re
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('decoded', type=pathlib.Path)
parser.add_argument('plugin_smali', type=pathlib.Path)
args = parser.parse_args()
manifest = args.decoded / 'AndroidManifest.xml'
text = manifest.read_text()
if 'android.permission.RECORD_AUDIO' not in text:
    text = text.replace('    <application ', '    <uses-permission android:name="android.permission.RECORD_AUDIO"/>\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>\n    <uses-feature android:name="android.hardware.microphone" android:required="false"/>\n    <queries><intent><action android:name="android.speech.action.RECOGNIZE_SPEECH"/></intent></queries>\n    <application ', 1)
manifest.write_text(text)
activity = args.decoded / 'smali/app/mobilemechanic/ai/MainActivity.smali'
text = activity.read_text()
if 'Lapp/mobilemechanic/ai/NativeDictationPlugin;' not in text:
    marker = '    const-class v0, Lapp/mobilemechanic/ai/JobNotificationSettingsPlugin;'
    if marker not in text:
        raise SystemExit('MainActivity registration anchor is missing')
    text = text.replace(marker, '    const-class v0, Lapp/mobilemechanic/ai/NativeDictationPlugin;\n    invoke-virtual {p0, v0}, Lapp/mobilemechanic/ai/MainActivity;->registerPlugin(Ljava/lang/Class;)V\n\n' + marker, 1)
activity.write_text(text)
sources = list((args.plugin_smali / 'app/mobilemechanic/ai').glob('NativeDictationPlugin*.smali'))
if not sources:
    raise SystemExit('Compiled dictation classes are missing')
for source in sources:
    shutil.copy2(source, activity.parent / source.name)
config = args.decoded / 'apktool.yml'
text = re.sub(r'(?m)^  versionCode: .*$', '  versionCode: 4', config.read_text())
text = re.sub(r'(?m)^  versionName: .*$', '  versionName: 1.3', text)
config.write_text(text)
print('Applied native microphone permission and dictation plugin (v1.3).')
