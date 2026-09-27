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

            int n = ev.screenAt.size();
            long[] st = new long[n];
            boolean[] so = new boolean[n];
            for (int i = 0; i < n; i++) {
                st[i] = ev.screenAt.get(i);
                so[i] = ev.screenOn.get(i);
            }
            out.put("screen", socialTo > w[0] ? (int) (ScreenTime.interactiveMs(st, so, false, w[0], socialTo) / 60_000L) : 0);
            long asleep = sleepTo > sleepFrom ? longestOffStart(st, so, false, sleepFrom, sleepTo, MIN_SLEEP_MS) : -1;
            if (asleep > 0) {
                Calendar a = Calendar.getInstance();
                a.setTimeInMillis(asleep);
                out.put("asleep", a.get(Calendar.HOUR_OF_DAY) * 60 + a.get(Calendar.MINUTE));
            } else {
                out.put("asleep", -1);
            }
            out.put("closed", ScreenTime.windowClosed(daysAgo));
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

    /** Resolve {social} {screen} {asleep} {visits} {apps} in a Szpila line. */
    static String fill(String line, JSONObject r) {
        int asleep = r.optInt("asleep", -1);
        return line.replace("{social}", String.valueOf(r.optInt("social")))
            .replace("{screen}", String.valueOf(r.optInt("screen")))
            .replace("{visits}", String.valueOf(r.optInt("visits")))
            .replace("{asleep}", asleep < 0 ? "?" : WidgetShared.fmtMinute(asleep))
            .replace("{apps}", appsLine(r.optJSONArray("apps")));
    }
}
