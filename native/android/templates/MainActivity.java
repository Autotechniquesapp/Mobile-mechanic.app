package app.mobilemechanic.ai;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JobNotificationSettingsPlugin.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "new_customer_jobs_v1", "New Customer Jobs", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("New customer intake and job requests");
            channel.enableVibration(true);
            channel.setShowBadge(true);
            channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
            // Android preserves the user's choices when this channel already exists.
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        super.onCreate(savedInstanceState);
        getBridge().setWebViewClient(new JobAlertsWebViewClient(getBridge()));
    }
}
