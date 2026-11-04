package app.mobilemechanic.ai;

import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "JobNotificationSettings")
public class JobNotificationSettingsPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS : Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        intent.putExtra(Settings.EXTRA_CHANNEL_ID, "new_customer_jobs_v1");
        getActivity().startActivity(intent);
        call.resolve();
    }
}
