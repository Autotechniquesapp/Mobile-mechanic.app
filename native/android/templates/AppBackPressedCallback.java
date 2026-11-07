package app.mobilemechanic.ai;

import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/** Register with getOnBackPressedDispatcher().addCallback(this, new AppBackPressedCallback(this)). */
public final class AppBackPressedCallback extends OnBackPressedCallback {
    private final BridgeActivity activity;

    public AppBackPressedCallback(BridgeActivity activity) {
        super(true);
        this.activity = activity;
    }

    @Override
    public void handleOnBackPressed() {
        WebView view = activity.getBridge().getWebView();
        view.evaluateJavascript("if(window.MobileMechanicBack){window.MobileMechanicBack();}else if(location.hash!=='#dashboard'){location.hash='#dashboard';}", null);
    }
}
