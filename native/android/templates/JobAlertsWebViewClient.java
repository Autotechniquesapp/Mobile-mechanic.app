package app.mobilemechanic.ai;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.IOException;
import java.util.Map;
import java.util.HashMap;
import java.util.Collections;

/** Bundle notification integration with the APK without publishing website changes. */
public class JobAlertsWebViewClient extends BridgeWebViewClient {
    private final Bridge bridge;
    private static final Map<String,String> SCRIPTS = new HashMap<>();
    static {
        SCRIPTS.put("/native-android-notifications.js", "native-alerts/native-android-notifications.js");
        SCRIPTS.put("/push-notifications.js", "native-alerts/push-notifications.js");
        SCRIPTS.put("/logout-screen.js", "native-alerts/logout-screen.js");
        SCRIPTS.put("/supabase-production.js", "native-alerts/supabase-production.js");
    }

    public JobAlertsWebViewClient(Bridge bridge) { super(bridge); this.bridge = bridge; }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        String asset = SCRIPTS.get(url.getPath());
        if ("GET".equals(request.getMethod()) && "https".equals(url.getScheme())
                && ("mobile-mechanic.app".equals(url.getHost()) || "www.mobile-mechanic.app".equals(url.getHost()))
                && (url.getPort() == -1 || url.getPort() == 443)
                && asset != null) {
            try {
                return new WebResourceResponse("application/javascript", "UTF-8", 200, "OK",
                    Collections.singletonMap("Cache-Control", "no-store"), bridge.getContext().getAssets().open(asset));
            } catch (IOException e) {
                // Keep normal web behavior if a packaged asset is missing.
            }
        }
        return super.shouldInterceptRequest(view, request);
    }
}
