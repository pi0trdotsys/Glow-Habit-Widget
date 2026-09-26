package app.lovable.glow_habit_widget;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.Build;
import android.os.Process;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Screen-on time from UsageStatsManager, for avoid habits like "Scrollowanie
 * w łóżku" that are judged automatically (source "screen"): if the screen was
 * on for more than `limit` minutes after `after` until 05:00, the habit day
 * counts as a slip; otherwise it's confirmed clean once the night is over.
 * Until then the day is undecided - never pre-ticked either way.
 *
 * Times are local (Calendar = the phone's current time zone). An `after`
 * before 05:00 (e.g. 00:00) means "after midnight" of that night, i.e. the
 * next calendar day - not the start of the habit day.
 */
final class ScreenTime {
    /** Late-night window ends at 05:00 the next morning. */
    static final int NIGHT_END = 5 * 60;
    private static final int DAY = 24 * 60;

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

    /** Minutes after the habit day's midnight where "late" starts: 23:30 -> 1410, 00:30 -> 1470. */
    static int effectiveAfter(int afterMin) {
        return afterMin < NIGHT_END ? afterMin + DAY : afterMin;
    }

    /** [from, end] in ms of the late window for the habit day starting at `dayStartMs`. */
    static long[] window(long dayStartMs, int afterMin) {
        long from = dayStartMs + effectiveAfter(afterMin) * 60_000L;
        long end = dayStartMs + (DAY + NIGHT_END) * 60_000L;
        return new long[]{from, end};
    }

    /**
     * Interactive screen time (ms) inside [from, to] from a chronological list of
     * screen events. `screenOnAtStart` = the state before the first event.
     */
    static long interactiveMs(long[] times, boolean[] on, boolean screenOnAtStart, long from, long to) {
        boolean isOn = screenOnAtStart;
        long since = Long.MIN_VALUE;
        long total = 0;
        for (int i = 0; i < times.length; i++) {
            if (on[i] && !isOn) {
                isOn = true;
                since = times[i];
            } else if (!on[i] && isOn) {
                total += overlap(since, times[i], from, to);
                isOn = false;
            }
        }
        if (isOn) total += overlap(since, to, from, to);
        return total;
    }

    private static long overlap(long a, long b, long from, long to) {
        return Math.max(0, Math.min(b, to) - Math.max(a, from));
    }

    /** Minutes the screen was interactive between two instants (ms). -1 if unavailable. */
    static int minutesOn(Context c, long from, long to) {
        if (!granted(c)) return -1;
        if (to <= from) return 0;
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return -1;
        // Start earlier so we know whether the screen was already on at `from`.
        UsageEvents events = usm.queryEvents(from - 12 * 3600_000L, to);
        UsageEvents.Event e = new UsageEvents.Event();
        List<Long> times = new ArrayList<>();
        List<Boolean> states = new ArrayList<>();
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            int type = e.getEventType();
            if (type == UsageEvents.Event.SCREEN_INTERACTIVE || type == UsageEvents.Event.SCREEN_NON_INTERACTIVE) {
                times.add(e.getTimeStamp());
                states.add(type == UsageEvents.Event.SCREEN_INTERACTIVE);
            }
        }
        long[] t = new long[times.size()];
        boolean[] s = new boolean[states.size()];
        for (int i = 0; i < t.length; i++) {
            t[i] = times.get(i);
            s[i] = states.get(i);
        }
        return (int) (interactiveMs(t, s, false, from, to) / 60_000L);
    }

    /**
     * Late-night screen minutes for the habit day `daysAgo` (0 = today): from its
     * late start (see effectiveAfter) until min(now, 05:00 the next day).
     */
    static int lateMinutes(Context c, int daysAgo, int afterMin) {
        Calendar start = Calendar.getInstance();
        start.add(Calendar.DAY_OF_YEAR, -daysAgo);
        start.set(Calendar.HOUR_OF_DAY, 0);
        start.set(Calendar.MINUTE, 0);
        start.set(Calendar.SECOND, 0);
        start.set(Calendar.MILLISECOND, 0);
        long[] w = window(start.getTimeInMillis(), afterMin);
        long to = Math.min(w[1], System.currentTimeMillis());
        if (to <= w[0]) return granted(c) ? 0 : -1;
        return minutesOn(c, w[0], to);
    }

    /** True once the late-night window of that habit day is over (after 05:00 next day). */
    static boolean windowClosed(int daysAgo) {
        if (daysAgo >= 2) return true;
        if (daysAgo == 0) return false;
        Calendar now = Calendar.getInstance();
        return now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE) >= NIGHT_END;
    }
}
