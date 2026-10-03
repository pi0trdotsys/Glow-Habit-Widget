package app.lovable.glow_habit_widget;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Minutes from apps (habit source "apps", e.g. "Ucz się języka" from Duolingo
 * and Busuu): foreground time of chosen packages per local day, from usage
 * events (usage access). The day's amount = app minutes + a manual adjustment
 * (row field "appMin" = the app minutes the amount is based on), so a sync
 * never wipes what the user added or took away by hand. The pure parts are
 * unit-tested (AppMinutesTest); src/lib/apps.ts mirrors the adjustment math.
 */
final class AppMinutes {
    static final int RESUME = 1, PAUSE = 2, OFF = 3;
    private static final long DAY_MS = 24 * 3600_000L;

    private AppMinutes() {}

    // ------------------------------------------------------------------ pure logic

    /**
     * Foreground ms per package inside [from, to] from chronological events.
     * RESUME/PAUSE carry package + activity class; OFF (screen off, shutdown)
     * ends whatever was in front. Another app coming to the front ends the
     * previous one; the app stays in front until its last resumed activity is
     * paused (activity switches inside one app don't split the session). A
     * session still open at `to` runs until `to`. `watched` null = every package.
     */
    static Map<String, Long> foregroundMs(long[] t, int[] kind, String[] pkg, String[] cls,
                                          Set<String> watched, long from, long to) {
        Map<String, Long> out = new LinkedHashMap<>();
        String cur = null;
        long since = 0;
        Set<String> open = new HashSet<>();
        for (int i = 0; i < t.length; i++) {
            String p = pkg[i];
            String c = cls != null && cls[i] != null ? cls[i] : "";
            if (kind[i] == RESUME) {
                if (p == null) continue;
                if (!p.equals(cur)) {
                    if (cur != null) add(out, watched, cur, since, t[i], from, to);
                    cur = p;
                    since = t[i];
                    open.clear();
                }
                open.add(c);
            } else if (kind[i] == PAUSE) {
                if (cur == null || !cur.equals(p)) continue;
                open.remove(c);
                if (open.isEmpty()) {
                    add(out, watched, cur, since, t[i], from, to);
                    cur = null;
                }
            } else if (kind[i] == OFF) {
                if (cur != null) add(out, watched, cur, since, t[i], from, to);
                cur = null;
                open.clear();
            }
        }
        if (cur != null) add(out, watched, cur, since, to, from, to);
        return out;
    }

    private static void add(Map<String, Long> out, Set<String> watched, String p, long a, long b, long from, long to) {
        if (watched != null && !watched.contains(p)) return;
        long ms = Math.max(0, Math.min(b, to) - Math.max(a, from));
        if (ms <= 0) return;
        Long old = out.get(p);
        out.put(p, (old == null ? 0 : old) + ms);
    }

    /** Whole minutes (rounded) per package, packages under half a minute left out. */
    static Map<String, Integer> minutes(Map<String, Long> ms) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : ms.entrySet()) {
            int m = Math.round(e.getValue() / 60_000f);
            if (m > 0) out.put(e.getKey(), m);
        }
        return out;
    }

    /** Sum of the (rounded) minutes of `apps`, so the total matches the per-app list. */
    static int total(Map<String, Integer> minutes, Iterable<String> apps) {
        int s = 0;
        for (String p : apps) {
            Integer m = minutes.get(p);
            if (m != null) s += m;
        }
        return s;
    }

    /**
     * New amount when the app minutes go from `oldAppMin` to `newAppMin`: the
     * manual adjustment (amount - oldAppMin) stays on top, never below 0.
     */
    static int adjusted(int amount, int oldAppMin, int newAppMin) {
        return Math.max(0, amount + newAppMin - oldAppMin);
    }

    /**
     * A widget tap on an apps habit: below the goal it adds a step (on top of
     * the app minutes, capped at the goal); once done it takes back only the
     * manual part (back to the app minutes). Returns the new amount (= amount
     * when there's nothing to change).
     */
    static int tapAmount(int amount, int appMin, int target, int step) {
        if (amount < target) return Math.min(target, amount + Math.max(1, step));
        return Math.min(amount, Math.max(0, appMin));
    }

    // ------------------------------------------------------------------ device reads

    static long dayStart(int daysAgo) {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, -daysAgo);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    /**
     * Minutes per package for today (index 0) and the `days` days before, or
     * null without usage access. `watched` null = every package.
     */
    static List<Map<String, Integer>> perDay(Context c, Set<String> watched, int days) {
        if (!ScreenTime.granted(c)) return null;
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return null;
        long now = System.currentTimeMillis();
        long first = dayStart(days);
        // Start earlier so an app already in front at midnight is known.
        UsageEvents events = usm.queryEvents(first - 6 * 3600_000L, now);
        UsageEvents.Event e = new UsageEvents.Event();
        List<Long> at = new ArrayList<>();
        List<Integer> kinds = new ArrayList<>();
        List<String> pkgs = new ArrayList<>();
        List<String> classes = new ArrayList<>();
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            int type = e.getEventType();
            int k = type == UsageEvents.Event.ACTIVITY_RESUMED ? RESUME
                : type == UsageEvents.Event.ACTIVITY_PAUSED || type == 23 /* ACTIVITY_STOPPED */ ? PAUSE
                : type == UsageEvents.Event.SCREEN_NON_INTERACTIVE || type == 26 /* DEVICE_SHUTDOWN */ ? OFF : 0;
            if (k == 0) continue;
            at.add(e.getTimeStamp());
            kinds.add(k);
            pkgs.add(e.getPackageName());
            classes.add(e.getClassName());
        }
        int n = at.size();
        long[] t = new long[n];
        int[] kd = new int[n];
        String[] p = new String[n];
        String[] cl = new String[n];
        for (int i = 0; i < n; i++) {
            t[i] = at.get(i);
            kd[i] = kinds.get(i);
            p[i] = pkgs.get(i);
            cl[i] = classes.get(i);
        }
        List<Map<String, Integer>> out = new ArrayList<>();
        for (int d = 0; d <= days; d++) {
            long from = dayStart(d);
            long to = Math.min(now, d == 0 ? from + DAY_MS : dayStart(d - 1));
            out.add(to > from ? minutes(foregroundMs(t, kd, p, cl, watched, from, to)) : new LinkedHashMap<>());
        }
        return out;
    }

    /** Packages of a row's "apps" array. */
    static List<String> apps(JSONObject h) {
        List<String> out = new ArrayList<>();
        JSONArray a = h != null ? h.optJSONArray("apps") : null;
        for (int i = 0; a != null && i < a.length(); i++) {
            String s = a.optString(i, "");
            if (!s.isEmpty()) out.add(s);
        }
        return out;
    }

    static boolean isApps(JSONObject h) {
        return h != null && "apps".equals(h.optString("source")) && !apps(h).isEmpty();
    }

    /** {pkg: minutes} of `apps` with any minutes. */
    static JSONObject split(Map<String, Integer> minutes, List<String> apps) {
        JSONObject o = new JSONObject();
        try {
            for (String p : apps) {
                Integer m = minutes.get(p);
                if (m != null && m > 0) o.put(p, m);
            }
        } catch (Exception ignored) {
        }
        return o;
    }

    static boolean sameSplit(JSONObject a, JSONObject b) {
        if (a == null) a = new JSONObject();
        if (b == null) b = new JSONObject();
        if (a.length() != b.length()) return false;
        for (Iterator<String> it = a.keys(); it.hasNext(); ) {
            String k = it.next();
            if (a.optInt(k) != b.optInt(k, -1)) return false;
        }
        return true;
    }

    /**
     * Today's app minutes into one row (amount keeps its manual adjustment).
     * Returns the op for the app (absolute amount + the app minutes it's based
     * on), or null when nothing changed.
     */
    static JSONObject applyTo(JSONObject h, Map<String, Integer> today) throws Exception {
        List<String> apps = apps(h);
        int m = total(today, apps);
        int old = h.optInt("appMin", 0);
        JSONObject sp = split(today, apps);
        if (m == old && sameSplit(sp, h.optJSONObject("appSplit"))) return null;
        int a = adjusted(WidgetShared.amount(h), old, m);
        h.put("amount", a);
        h.put("appMin", m);
        h.put("appSplit", sp);
        h.put("done", a >= WidgetShared.target(h));
        return new JSONObject().put("amount", a).put("appMin", m).put("appSplit", sp);
    }
}
