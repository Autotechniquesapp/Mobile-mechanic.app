package app.mobilemechanic.ai;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/** Native Android dictation, requested only after the user taps a microphone. */
@CapacitorPlugin(name = "NativeDictation", permissions = {
    @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO})
})
public class NativeDictationPlugin extends Plugin {
    private boolean busy;

    private boolean trustedPage() {
        Uri uri = Uri.parse(getBridge().getWebView().getUrl());
        return "https".equals(uri.getScheme()) &&
            ("mobile-mechanic.app".equals(uri.getHost()) || "www.mobile-mechanic.app".equals(uri.getHost()));
    }

    @PluginMethod
    public void start(final PluginCall call) {
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override public void run() {
                if (!trustedPage()) { call.reject("Open Mobile Mechanic AI before dictating.", "UNTRUSTED_PAGE"); return; }
                if (busy) { call.reject("Dictation is already open.", "BUSY"); return; }
                busy = true;
                if (getPermissionState("microphone") != PermissionState.GRANTED) {
                    requestPermissionForAlias("microphone", call, "microphonePermissionResult");
                } else { launchRecognizer(call); }
            }
        });
    }

    @PermissionCallback
    private void microphonePermissionResult(PluginCall call) {
        if (call == null) { busy = false; return; }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            busy = false;
            call.reject("Microphone access was denied. Allow it in Android Settings > Apps > Mobile Mechanic AI > Permissions > Microphone, then try again.", "MICROPHONE_DENIED");
            return;
        }
        launchRecognizer(call);
    }

    private void launchRecognizer(PluginCall call) {
        if (!trustedPage()) { busy = false; call.reject("Reopen the app before dictating.", "UNTRUSTED_PAGE"); return; }
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("language", "en-US"));
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak your repair notes");
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try { startActivityForResult(call, intent, "speechResult"); }
        catch (ActivityNotFoundException error) {
            busy = false;
            call.reject("No Android speech service is available. Enable Google speech recognition or use your keyboard microphone.", "SPEECH_UNAVAILABLE");
        } catch (Exception error) {
            busy = false; call.reject("Android could not start dictation. Please try again.", "SPEECH_FAILED");
        }
    }

    @ActivityCallback
    private void speechResult(PluginCall call, ActivityResult result) {
        busy = false;
        if (call == null) { return; }
        if (!trustedPage()) { call.reject("The app page changed during dictation.", "UNTRUSTED_PAGE"); return; }
        Intent data = result.getData();
        ArrayList<String> matches = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        JSObject response = new JSObject();
        response.put("text", result.getResultCode() == Activity.RESULT_OK && matches != null && !matches.isEmpty() ? matches.get(0) : "");
        response.put("cancelled", result.getResultCode() != Activity.RESULT_OK);
        call.resolve(response);
    }
}
