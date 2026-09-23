package app.lovable.glow_habit_widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Handles HabitNotifier's alarm ticks, the action buttons on its
 * notifications, and re-arms everything after a reboot or app update. Work
 * runs off the main thread (Health Connect / usage-stats reads are IPC).
 */
public class NotifierReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult pending = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                handle(app, intent);
            } finally {
                pending.finish();
            }
        }, "loop-notifier").start();
    }

    private static void handle(Context context, Intent intent) {
        String action = intent.getAction();
        String habitId = intent.getStringExtra(WidgetShared.EXTRA_HABIT_ID);
        if (HabitNotifier.ACTION_TICK.equals(action)) {
            HabitNotifier.onTick(context);
        } else if (HabitNotifier.ACTION_DO_NEXT.equals(action)) {
            if (habitId != null) WidgetShared.applyTap(context, habitId, true);
            HabitNotifier.afterAction(context, intent);
            WidgetShared.updateAll(context);
        } else if (HabitNotifier.ACTION_SLIP.equals(action)) {
            if (habitId != null) WidgetShared.applySlip(context, habitId);
            HabitNotifier.afterAction(context, intent);
            WidgetShared.updateAll(context);
        } else if (HabitNotifier.ACTION_ALL_CLEAN.equals(action)) {
            WidgetShared.confirmAllClean(context);
            HabitNotifier.afterAction(context, intent);
            WidgetShared.updateAll(context);
        } else if (HabitNotifier.ACTION_SNOOZE.equals(action)) {
            HabitNotifier.snooze(context, 60);
            HabitNotifier.afterAction(context, intent);
        } else {
            // BOOT_COMPLETED / MY_PACKAGE_REPLACED: alarms were cleared.
            WidgetShared.normalizeIfStale(context);
            WidgetShared.updateAll(context);
        }
    }
}
