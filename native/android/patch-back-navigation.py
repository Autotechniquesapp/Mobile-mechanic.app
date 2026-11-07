"""Apply AppBackPressedCallback to an apktool-decoded Mobile Mechanic APK.

Usage: python3 native/android/patch-back-navigation.py DECODED_DIRECTORY
Preserves existing app code, notification channels, resources, and permissions.
"""
from pathlib import Path
import sys

root = Path(sys.argv[1])
matches = list(root.glob('smali*/app/mobilemechanic/ai/MainActivity.smali'))
if len(matches) != 1:
    raise SystemExit('Expected exactly one MainActivity')
activity = matches[0]
source = activity.read_text()
marker = '    invoke-super {p0, p1}, Lcom/getcapacitor/BridgeActivity;->onCreate(Landroid/os/Bundle;)V'
registration = '''
    invoke-virtual {p0}, Lapp/mobilemechanic/ai/MainActivity;->getOnBackPressedDispatcher()Landroidx/activity/OnBackPressedDispatcher;
    move-result-object v0
    new-instance v1, Lapp/mobilemechanic/ai/AppBackPressedCallback;
    invoke-direct {v1, p0}, Lapp/mobilemechanic/ai/AppBackPressedCallback;-><init>(Lcom/getcapacitor/BridgeActivity;)V
    invoke-virtual {v0, p0, v1}, Landroidx/activity/OnBackPressedDispatcher;->addCallback(Landroidx/lifecycle/LifecycleOwner;Landroidx/activity/OnBackPressedCallback;)V
'''
if 'Lapp/mobilemechanic/ai/AppBackPressedCallback;' not in source:
    if source.count(marker) != 1 or '.locals 7' not in source:
        raise SystemExit('Unexpected MainActivity; review its registers before patching')
    activity.write_text(source.replace(marker, marker + '\n' + registration))

(activity.parent / 'AppBackPressedCallback.smali').write_text('''.class public final Lapp/mobilemechanic/ai/AppBackPressedCallback;
.super Landroidx/activity/OnBackPressedCallback;
.source "AppBackPressedCallback.java"

.field private final activity:Lcom/getcapacitor/BridgeActivity;

.method public constructor <init>(Lcom/getcapacitor/BridgeActivity;)V
    .locals 1
    const/4 v0, 0x1
    invoke-direct {p0, v0}, Landroidx/activity/OnBackPressedCallback;-><init>(Z)V
    iput-object p1, p0, Lapp/mobilemechanic/ai/AppBackPressedCallback;->activity:Lcom/getcapacitor/BridgeActivity;
    return-void
.end method

.method public handleOnBackPressed()V
    .locals 3
    iget-object v0, p0, Lapp/mobilemechanic/ai/AppBackPressedCallback;->activity:Lcom/getcapacitor/BridgeActivity;
    invoke-virtual {v0}, Lcom/getcapacitor/BridgeActivity;->getBridge()Lcom/getcapacitor/Bridge;
    move-result-object v0
    invoke-virtual {v0}, Lcom/getcapacitor/Bridge;->getWebView()Landroid/webkit/WebView;
    move-result-object v0
    const-string v1, "if(window.MobileMechanicBack){window.MobileMechanicBack();}else if(location.hash!=='#dashboard'){location.hash='#dashboard';}"
    const/4 v2, 0x0
    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    return-void
.end method
''')
config = root / 'apktool.yml'
settings = config.read_text().replace('versionCode: 2', 'versionCode: 3').replace('versionName: 1.1', 'versionName: 1.2')
config.write_text(settings)
print('Registered lifecycle-aware Android Back callback; version 1.2 (3).')
