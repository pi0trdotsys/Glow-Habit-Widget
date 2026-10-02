package app.lovable.glow_habit_widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Kropi logged water (or changed its goal): pull today's millilitres into the
 * "kropi" habits and refresh the widgets, even with Szpila closed. Only Kropi
 * can send it (the manifest guards it with Kropi's signature permission).
 */
public class KropiReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Kropi.ACTION_CHANGED.equals(intent.getAction())) return;
        final PendingResult pending = goAsync();
        final Context app = context.getApplicationContext();
        final String date = intent.getStringExtra("date");
        final int ml = intent.getIntExtra("ml", -1);
        final int goal = intent.getIntExtra("goal", 0);
        new Thread(() -> {
            try {
                Kropi.Day day = date != null && ml >= 0 ? new Kropi.Day(date, ml, goal) : Kropi.today(app);
                if (WidgetShared.syncWater(app, day)) WidgetShared.updateAll(app);
            } finally {
                pending.finish();
            }
        }).start();
    }
}
