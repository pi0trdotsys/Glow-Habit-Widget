package app.lovable.glow_habit_widget;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What really happened at night, from usage events (usage access):
 * - social media visits + minutes per app after midnight ("rachunek za noc"),
 * - the social minutes that judge "Scrollowanie w łóżku" (only social media
 *   counts - an alarm, music or a podcast with the screen on doesn't),
 * - roughly when the phone went down for the night (start of the longest
 *   screen-off stretch between 21:00 and 12:00).
 * The pure parts are unit-tested (NightStatsTest).
 */
final class NightStats {
    /** Coming back to the same app within this long is the same visit. */
    static final long SAME_VISIT_MS = 60_000L;
    /** The longest screen-off stretch must be at least this long to count as sleep. */
    static final long MIN_SLEEP_MS = 3 * 3600_000L;
    static final int SLEEP_FROM = 21 * 60;
    static final int SLEEP_TO = 12 * 60;

    private NightStats() {}

    static final class AppUse {
        int visits;
        long ms;
    }

    // ------------------------------------------------------------------ pure logic

    /**
     * Foreground time and visits of watched apps inside [from, to] from a
     * chronological list of activity events (resumed = true, paused = false).
     */
    static Map<String, AppUse> socialUse(long[] t, String[] pkg, boolean[] resumed, Set<String> watched, long from, long to) {
        Map<String, AppUse> out = new LinkedHashMap<>();
        String cur = null;
        long since = 0;
        String lastPaused = null;
        long lastPausedAt = Long.MIN_VALUE / 2;
        for (int i = 0; i < t.length; i++) {
            String p = pkg[i];
            if (resumed[i]) {
                if (p.equals(cur)) continue; // another activity of the same app
                if (cur != null) add(out, watched, cur, since, t[i], from, to);
                boolean sameVisit = p.equals(lastPaused) && t[i] - lastPausedAt < SAME_VISIT_MS;
                if (watched.contains(p) && !sameVisit && t[i] >= from && t[i] < to) use(out, p).visits++;
                cur = p;
                since = t[i];
            } else if (p.equals(cur)) {
                add(out, watched, cur, since, t[i], from, to);
                lastPaused = p;
                lastPausedAt = t[i];
                cur = null;
            }
        }
        if (cur != null) add(out, watched, cur, since, to, from, to);
        return out;
    }

    private static AppUse use(Map<String, AppUse> out, String p) {
        AppUse u = out.get(p);
        if (u == null) {
            u = new AppUse();
            out.put(p, u);
        }
        return u;
    }

    private static void add(Map<String, AppUse> out, Set<String> watched, String p, long a, long b, long from, long to) {
        if (!watched.contains(p)) return;
        long ms = Math.max(0, Math.min(b, to) - Math.max(a, from));
        if (ms > 0) use(out, p).ms += ms;
    }

    static long totalMs(Map<String, AppUse> use) {
        long s = 0;
        for (AppUse u : use.values()) s += u.ms;
        return s;
    }

    /**
     * Start of the longest screen-off stretch inside [from, to] (ms), or -1 if
     * none is at least `minGap` long. `onAtStart` = screen state before the first event.
     */
    static long longestOffStart(long[] t, boolean[] on, boolean onAtStart, long from, long to, long minGap) {
        boolean isOn = onAtStart;
        long offSince = onAtStart ? -1 : from;
        long bestStart = -1;
        long best = 0;
        for (int i = 0; i < t.length; i++) {
            if (t[i] < from) {
                isOn = on[i];
                offSince = isOn ? -1 : from;
                continue;
            }
            if (t[i] > to) break;
            if (on[i] && !isOn) {
                long gap = t[i] - offSince;
                if (gap > best) {
                    best = gap;
                    bestStart = offSince;
                }
                isOn = true;
            } else if (!on[i] && isOn) {
                isOn = false;
                offSince = t[i];
            }
        }
        if (!isOn && to - offSince > best) {
            best = to - offSince;
            bestStart = offSince;
        }
        return best >= minGap ? bestStart : -1;
    }

    // ------------------------------------------------------------------ real sessions (not just a lit screen)

    /** Screen/device events for awakePeriods(). */
    static final int SCREEN_ON = 1, SCREEN_OFF = 2, UNLOCK = 3, SHUTDOWN = 4, STARTUP = 5;
    /** A screen-on without an unlock counts as use only if it lasts at least this long. */
    static final long MIN_AWAKE_MS = 2 * 60_000L;

    /**
     * When the phone was really in use: screen-on stretches that include an
     * unlock, or last at least MIN_AWAKE_MS. Brief wake-ups without an unlock -
     * notifications, raise-to-wake, the "scheduled power off" prompt - don't
     * count, and a switched-off phone (shutdown .. startup) is simply off.
     * Returns [start, end] pairs (ms), chronological; a session still open is closed at `to`.
     */
    static List<long[]> awakePeriods(long[] t, int[] kind, long to) {
        List<long[]> out = new ArrayList<>();
        boolean on = false;
        boolean unlocked = false;
        long since = 0;
        for (int i = 0; i < t.length; i++) {
            switch (kind[i]) {
                case SCREEN_ON:
                    if (!on) {
                        on = true;
                        unlocked = false;
                        since = t[i];
                    }
                    break;
                case UNLOCK:
                    if (!on) {
                        on = true;
                        since = t[i];
                    }
                    unlocked = true;
                    break;
                case SCREEN_OFF:
                case SHUTDOWN:
                    if (on && (unlocked || t[i] - since >= MIN_AWAKE_MS)) out.add(new long[]{since, t[i]});
                    on = false;
                    unlocked = false;
                    break;
                default: // STARTUP: the screen-on / unlock events that follow open the session
                    break;
            }
        }
        if (on && (unlocked || to - since >= MIN_AWAKE_MS)) out.add(new long[]{since, to});
        return out;
    }

    /** Total in-use time of the periods inside [from, to] (ms). */
    static long awakeMs(List<long[]> periods, long from, long to) {
        long s = 0;
        for (long[] p : periods) s += Math.max(0, Math.min(p[1], to) - Math.max(p[0], from));
        return s;
    }

    /**
     * When the phone went down for the night: the end of the last session before
     * the longest stretch without use inside [from, to]; -1 if no stretch is at
     * least `minGap` long. A session running at `from` counts from its end.
     */
    static long asleepAt(List<long[]> periods, long from, long to, long minGap) {
        long cursor = from;
        long bestStart = -1;
        long best = 0;
        for (long[] p : periods) {
            if (p[1] <= from) continue;
            if (p[0] >= to) break;
            long gap = p[0] - cursor;
            if (gap > best) {
                best = gap;
                bestStart = cursor;
            }
            cursor = Math.max(cursor, p[1]);
        }
        if (to - cursor > best) {
            best = to - cursor;
            bestStart = cursor;
        }
        return best >= minGap ? bestStart : -1;
    }

    // ------------------------------------------------------------------ device reads

    private static long dayStart(int daysAgo) {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, -daysAgo);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    private static final class Events {
        final List<Long> at = new ArrayList<>();
        final List<String> pkg = new ArrayList<>();
        final List<Boolean> resumed = new ArrayList<>();
        final List<Long> screenAt = new ArrayList<>();
        final List<Boolean> screenOn = new ArrayList<>();
        /** Screen/unlock/shutdown events (kinds for awakePeriods). */
        final List<Long> sessAt = new ArrayList<>();
        final List<Integer> sessKind = new ArrayList<>();

        List<long[]> awake(long to) {
            int n = sessAt.size();
            long[] t = new long[n];
            int[] k = new int[n];
            for (int i = 0; i < n; i++) {
                t[i] = sessAt.get(i);
                k[i] = sessKind.get(i);
            }
            return awakePeriods(t, k, to);
        }
    }

    private static Events read(Context c, long from, long to) {
        Events ev = new Events();
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return ev;
        UsageEvents events = usm.queryEvents(from, to);
        UsageEvents.Event e = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            int type = e.getEventType();
            if (type == UsageEvents.Event.ACTIVITY_RESUMED || type == UsageEvents.Event.ACTIVITY_PAUSED) {
                ev.at.add(e.getTimeStamp());
                ev.pkg.add(e.getPackageName());
                ev.resumed.add(type == UsageEvents.Event.ACTIVITY_RESUMED);
            } else if (type == UsageEvents.Event.SCREEN_INTERACTIVE || type == UsageEvents.Event.SCREEN_NON_INTERACTIVE) {
                ev.screenAt.add(e.getTimeStamp());
                ev.screenOn.add(type == UsageEvents.Event.SCREEN_INTERACTIVE);
                ev.sessAt.add(e.getTimeStamp());
                ev.sessKind.add(type == UsageEvents.Event.SCREEN_INTERACTIVE ? SCREEN_ON : SCREEN_OFF);
            } else if (type == 18 /* KEYGUARD_HIDDEN */ || type == 26 /* DEVICE_SHUTDOWN */ || type == 27 /* DEVICE_STARTUP */) {
                ev.sessAt.add(e.getTimeStamp());
                ev.sessKind.add(type == 18 ? UNLOCK : type == 26 ? SHUTDOWN : STARTUP);
            }
        }
        return ev;
    }

    private static Map<String, AppUse> socialUse(Events ev, Set<String> watched, long from, long to) {
        int n = ev.at.size();
        long[] t = new long[n];
        String[] p = new String[n];
        boolean[] r = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = ev.at.get(i);
            p[i] = ev.pkg.get(i);
            r[i] = ev.resumed.get(i);
        }
        return socialUse(t, p, r, watched, from, to);
    }

    /** Social media foreground time between two instants (ms); 0 without access. */
    static long socialMsBetween(Context c, long from, long to) {
        if (!ScreenTime.granted(c) || to <= from) return 0;
        Events ev = read(c, from - 6 * 3600_000L, to);
        return totalMs(socialUse(ev, LiveGuard.watchedSet(c), from, to));
    }

    /**
     * Social media minutes of the habit day `daysAgo` after `afterMin` (see
     * ScreenTime.effectiveAfter) until min(now, 05:00 next day). -1 = no access.
     */
    static int socialMinutes(Context c, int daysAgo, int afterMin) {
        if (!ScreenTime.granted(c)) return -1;
        long[] w = ScreenTime.window(dayStart(daysAgo), afterMin);
        long to = Math.min(w[1], System.currentTimeMillis());
        if (to <= w[0]) return 0;
        Events ev = read(c, w[0] - 6 * 3600_000L, to);
        return (int) (totalMs(socialUse(ev, LiveGuard.watchedSet(c), w[0], to)) / 60_000L);
    }

    /**
     * The night after habit day `daysAgo`: social media after midnight per app,
     * screen minutes after midnight, and when the phone went down.
     */
    static JSONObject report(Context c, int daysAgo) {
        JSONObject out = new JSONObject();
        try {
            out.put("date", WidgetShared.dateKey(daysAgo));
            if (!ScreenTime.granted(c)) return out.put("granted", false);
            out.put("granted", true);
            long day = dayStart(daysAgo);
            long now = System.currentTimeMillis();
            long[] w = ScreenTime.window(day, 0); // after midnight .. 05:00
            long sleepFrom = day + SLEEP_FROM * 60_000L;
            long sleepTo = Math.min(now, day + (24 * 60 + SLEEP_TO) * 60_000L);
            Events ev = read(c, sleepFrom - 6 * 3600_000L, Math.max(sleepFrom, sleepTo));

            long socialTo = Math.min(now, w[1]);
            Map<String, AppUse> use = socialTo > w[0] ? socialUse(ev, LiveGuard.watchedSet(c), w[0], socialTo) : new LinkedHashMap<>();
            JSONArray apps = new JSONArray();
            int visits = 0;
            for (Map.Entry<String, AppUse> e : use.entrySet()) {
                AppUse u = e.getValue();
                if (u.visits == 0 && u.ms < 60_000L) continue;
                String[] meta = LiveGuard.SOCIAL.get(e.getKey());
                apps.put(new JSONObject().put("pkg", e.getKey()).put("label", meta != null ? meta[1] : e.getKey())
                    .put("visits", Math.max(1, u.visits)).put("minutes", Math.round(u.ms / 60_000f)));
                visits += Math.max(1, u.visits);
            }
            out.put("apps", apps);
            out.put("visits", visits);
            out.put("social", (int) Math.round(totalMs(use) / 60_000.0));

            // Only real sessions: brief wake-ups (notifications, the scheduled power-off prompt) don't count.
            List<long[]> awake = ev.awake(Math.max(sleepFrom, sleepTo));
            out.put("screen", socialTo > w[0] ? (int) (awakeMs(awake, w[0], socialTo) / 60_000L) : 0);
            long asleep = sleepTo > sleepFrom ? asleepAt(awake, sleepFrom, sleepTo, MIN_SLEEP_MS) : -1;
            if (asleep > 0) {
                Calendar a = Calendar.getInstance();
                a.setTimeInMillis(asleep);
                out.put("asleep", a.get(Calendar.HOUR_OF_DAY) * 60 + a.get(Calendar.MINUTE));
            } else {
                out.put("asleep", -1);
            }
            out.put("closed", ScreenTime.windowClosed(daysAgo));
            // Curfew + charger (LiveGuardService counters, keyed by the evening's date).
            String key = WidgetShared.dateKey(daysAgo);
            out.put("curfewBlocks", LiveGuard.counts(c, "curfew_blocks").optInt(key, 0));
            out.put("curfewPasses", LiveGuard.counts(c, "curfew_passes").optInt(key, 0));
            out.put("unplugs", LiveGuard.counts(c, "unplugs").optInt(key, 0));
            out.put("charged", LiveGuard.counts(c, "charged").optInt(key, -1));
            // Sleep from the band (Health Connect), when granted and already synced.
            JSONObject sleep = HealthSleep.night(c, day);
            if (sleep != null) out.put("sleep", sleep);
        } catch (Exception ignored) {
        }
        return out;
    }

    /** "3× Instagram (22 min) · 1× YouTube (25 min)". */
    static String appsLine(JSONArray apps) {
        return appsLine(apps, false);
    }

    /** appsLine in the app language - "3× Instagram (22 min)" reads the same in English. */
    static String appsLine(JSONArray apps, boolean en) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; apps != null && i < apps.length(); i++) {
            JSONObject a = apps.optJSONObject(i);
            if (sb.length() > 0) sb.append(" · ");
            sb.append(a.optInt("visits")).append("× ").append(a.optString("label"))
                .append(" (").append(a.optInt("minutes")).append(" min)");
        }
        return sb.toString();
    }

    /** Minutes slept (band), -1 = unknown. */
    static int sleepMinutes(JSONObject r) {
        JSONObject s = r.optJSONObject("sleep");
        return s != null ? s.optInt("minutes", -1) : -1;
    }

    /** Minutes from the phone going down to falling asleep (SleepCalc.fellAfter), UNKNOWN when not both known. */
    static int fellAfter(JSONObject r) {
        JSONObject s = r.optJSONObject("sleep");
        return s == null ? SleepCalc.UNKNOWN : SleepCalc.fellAfter(r.optInt("asleep", -1), s.optInt("start", -1));
    }

    /** Whether a line's placeholders can be filled for this night ({asleep}, {sleep}, {fell} may be unknown). */
    static boolean usable(String line, JSONObject r) {
        if (line.contains("{asleep}") && r.optInt("asleep", -1) < 0) return false;
        if (line.contains("{sleep}") && sleepMinutes(r) < 0) return false;
        int fell = fellAfter(r);
        return !line.contains("{fell}") || (fell != SleepCalc.UNKNOWN && fell >= 0);
    }

    /** Resolve {social} {screen} {asleep} {visits} {apps} {sleep} {fell} in a Szpila line. */
    static String fill(String line, JSONObject r) {
        int asleep = r.optInt("asleep", -1);
        int sleep = sleepMinutes(r);
        int fell = fellAfter(r);
        return line.replace("{social}", String.valueOf(r.optInt("social")))
            .replace("{screen}", String.valueOf(r.optInt("screen")))
            .replace("{visits}", String.valueOf(r.optInt("visits")))
            .replace("{asleep}", asleep < 0 ? "?" : WidgetShared.fmtMinute(asleep))
            .replace("{sleep}", sleep < 0 ? "?" : SleepCalc.duration(sleep))
            .replace("{fell}", fell == SleepCalc.UNKNOWN ? "?" : String.valueOf(Math.abs(fell)))
            .replace("{apps}", appsLine(r.optJSONArray("apps")));
    }
}
