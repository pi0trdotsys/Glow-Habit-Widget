package app.lovable.glow_habit_widget;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.Build;
import android.os.Process;

import java.util.Calendar;

/**
 * Screen-on time from UsageStatsManager, for avoid habits like "Telefon do
 * późna" that are judged automatically (source "screen"): if the screen was
 * on for more than `limit` minutes after `after` (e.g. 23:30) until 05:00,
 * the day counts as a slip; otherwise it's confirmed clean the next morning.
 * Needs the special "usage access" permission granted by the user.
 */
final class ScreenTime {
    /** Late-night window ends at 05:00 the next morning. */
    static final int NIGHT_END = 5 * 60;

    private ScreenTime() {}

    static boolean granted(Context c) {
        if (Build.VERSION.SDK_INT < 28) return false;
        AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        if (ops == null) return false;
        int mode = Build.VERSION.SDK_INT >= 29
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** Minutes the screen was interactive between two instants (ms). -1 if unavailable. */
    static int minutesOn(Context c, long from, long to) {
        if (!granted(c) || to <= from) return granted(c) ? 0 : -1;
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return -1;
        // Start earlier so we know whether the screen was already on at `from`.
        UsageEvents events = usm.queryEvents(from - 12 * 3600_000L, to);
        UsageEvents.Event e = new UsageEvents.Event();
        boolean on = false;
        long onSince = 0;
        long total = 0;
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            long t = e.getTimeStamp();
            int type = e.getEventType();
            if (type == UsageEvents.Event.SCREEN_INTERACTIVE) {
                if (!on) {
                    on = true;
                    onSince = t;
                }
            } else if (type == UsageEvents.Event.SCREEN_NON_INTERACTIVE) {
                if (on) {
                    total += overlap(onSince, t, from, to);
                    on = false;
                }
            }
        }
        if (on) total += overlap(onSince, to, from, to);
        return (int) (total / 60_000L);
    }

    private static long overlap(long a, long b, long from, long to) {
        return Math.max(0, Math.min(b, to) - Math.max(a, from));
    }

    /**
     * Late-night screen minutes for the habit day `daysAgo` (0 = today): from
     * `afterMin` that day until min(now, 05:00 the next day).
     */
    static int lateMinutes(Context c, int daysAgo, int afterMin) {
        Calendar start = Calendar.getInstance();
        start.add(Calendar.DAY_OF_YEAR, -daysAgo);
        start.set(Calendar.HOUR_OF_DAY, 0);
        start.set(Calendar.MINUTE, 0);
        start.set(Calendar.SECOND, 0);
        start.set(Calendar.MILLISECOND, 0);
        long dayStart = start.getTimeInMillis();
        long from = dayStart + afterMin * 60_000L;
        long end = dayStart + (24 * 60 + NIGHT_END) * 60_000L;
        long to = Math.min(end, System.currentTimeMillis());
        if (to <= from) return 0;
        return minutesOn(c, from, to);
    }

    /** True once the late-night window of that habit day is over (after 05:00 next day). */
    static boolean windowClosed(int daysAgo) {
        if (daysAgo >= 2) return true;
        if (daysAgo == 0) return false;
        Calendar now = Calendar.getInstance();
        return now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE) >= NIGHT_END;
    }
}
