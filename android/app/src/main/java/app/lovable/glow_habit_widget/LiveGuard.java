package app.lovable.glow_habit_widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Real-time night intervention: between `from` and `until` (default 00:00-05:00)
 * LiveGuardService watches which app is in the foreground (usage access) and,
 * the moment a social media app opens, Szpila pops up (heads-up notification).
 * Staying in the app brings a harsher jab every {@link #ESCALATE_MIN} minutes.
 * This class holds the pure logic (unit-tested) and the start/stop plumbing.
 */
final class LiveGuard {
    static final int ESCALATE_MIN = 5;
    /** After this many jabs in one session the next one is the full-screen block. */
    static final int BLOCK_AFTER = 3;
    /** Holding the "I really must" button this long lets you through (for SNOOZE_MIN). */
    static final long HOLD_THROUGH_MS = 10_000L;
    static final String ACTION_START = "app.lovable.glow_habit_widget.LIVE_START";
    static final String ACTION_SNOOZE = "app.lovable.glow_habit_widget.LIVE_SNOOZE";
    private static final String PREFS = "loop_live";

    /** Watched social apps: package -> [key for lines, label]. Mirrors SOCIAL_APPS in src/lib/live.ts. */
    static final Map<String, String[]> SOCIAL = new LinkedHashMap<>();

    static {
        SOCIAL.put("com.zhiliaoapp.musically", new String[]{"tiktok", "TikTok"});
        SOCIAL.put("com.ss.android.ugc.trill", new String[]{"tiktok", "TikTok"});
        SOCIAL.put("com.instagram.android", new String[]{"instagram", "Instagram"});
        SOCIAL.put("com.instagram.lite", new String[]{"instagram", "Instagram Lite"});
        SOCIAL.put("com.instagram.barcelona", new String[]{"threads", "Threads"});
        SOCIAL.put("com.facebook.katana", new String[]{"facebook", "Facebook"});
        SOCIAL.put("com.facebook.lite", new String[]{"facebook", "Facebook Lite"});
        SOCIAL.put("com.google.android.youtube", new String[]{"youtube", "YouTube"});
        SOCIAL.put("com.twitter.android", new String[]{"x", "X"});
        SOCIAL.put("com.reddit.frontpage", new String[]{"reddit", "Reddit"});
        SOCIAL.put("com.snapchat.android", new String[]{"snapchat", "Snapchat"});
        SOCIAL.put("com.pinterest", new String[]{"pinterest", "Pinterest"});
        SOCIAL.put("tv.twitch.android.app", new String[]{"twitch", "Twitch"});
        SOCIAL.put("com.linkedin.android", new String[]{"linkedin", "LinkedIn"});
    }

    private LiveGuard() {}

    // ------------------------------------------------------------------ pure logic

    /** Is `now` inside [from, until)? Handles windows crossing midnight (e.g. 23:00-05:00). */
    static boolean inWindow(int nowMin, int from, int until) {
        if (from == until) return false;
        return from < until ? (nowMin >= from && nowMin < until) : (nowMin >= from || nowMin < until);
    }

    /** What to do on a poll: nothing, the first jab of a session, or an escalation. */
    static final int NONE = 0, FIRST = 1, ESCALATE = 2;

    /**
     * Per-session state machine. A session = one continuous stay in a watched
     * app. First jab immediately, then one every ESCALATE_MIN minutes;
     * snoozing mutes jabs until `snoozeUntil` without ending the session.
     */
    static final class Tracker {
        String pkg;
        long since;
        int jabs;

        int onForeground(String foregroundPkg, boolean watched, long now, long snoozeUntil) {
            if (!watched || foregroundPkg == null) {
                pkg = null;
                jabs = 0;
                return NONE;
            }
            if (!foregroundPkg.equals(pkg)) {
                pkg = foregroundPkg;
                since = now;
                jabs = 0;
            }
            if (now < snoozeUntil) return NONE;
            long minutes = (now - since) / 60_000L;
            if (jabs == 0 || minutes >= (long) jabs * ESCALATE_MIN) {
                jabs++;
                return jabs == 1 ? FIRST : ESCALATE;
            }
            return NONE;
        }

        int minutesIn(long now) {
            return pkg == null ? 0 : (int) ((now - since) / 60_000L);
        }

        void reset() {
            pkg = null;
            jabs = 0;
        }
    }

    /** The jab number `jabs` (1-based) of a session becomes the full-screen block. */
    static boolean shouldBlock(int jabs) {
        return jabs > BLOCK_AFTER;
    }

    /** Resolve {app} {m} {time} {count} in a line. */
    static String fill(String line, String app, int minutes, String time, int count) {
        return line.replace("{app}", app).replace("{m}", String.valueOf(minutes))
            .replace("{time}", time).replace("{count}", String.valueOf(count));
    }

    /** The habit day a night belongs to: before noon it's still "last night". */
    static String habitDay(int nowMin, String today, String yesterday) {
        return nowMin < 12 * 60 ? yesterday : today;
    }

    // ------------------------------------------------------------------ settings (from the snapshot)

    static JSONObject settings(Context c) {
        JSONObject l = WidgetShared.state(c).optJSONObject("live");
        return l != null ? l : new JSONObject();
    }

    static boolean enabled(Context c) {
        return settings(c).optBoolean("enabled", false) && ScreenTime.granted(c);
    }

    static int from(Context c) {
        return settings(c).optInt("from", 0);
    }

    static int until(Context c) {
        return settings(c).optInt("until", ScreenTime.NIGHT_END);
    }

    /** Watched and not switched off by the user. */
    static boolean watched(Context c, String pkg) {
        if (pkg == null || !SOCIAL.containsKey(pkg)) return false;
        JSONArray off = settings(c).optJSONArray("off");
        if (off != null) for (int i = 0; i < off.length(); i++) if (pkg.equals(off.optString(i))) return false;
        return true;
    }

    /** Watched packages (all known social apps minus the ones switched off). */
    static java.util.Set<String> watchedSet(Context c) {
        java.util.Set<String> out = new java.util.HashSet<>();
        for (String pkg : SOCIAL.keySet()) if (watched(c, pkg)) out.add(pkg);
        return out;
    }

    /** The full-screen block is on (setting) and allowed (draw over other apps). */
    static boolean blockEnabled(Context c) {
        return settings(c).optBoolean("block", true) && android.provider.Settings.canDrawOverlays(c);
    }

    static boolean installed(Context c, String pkg) {
        try {
            c.getPackageManager().getApplicationInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ prefs: snooze + hits

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static long snoozeUntil(Context c) {
        return prefs(c).getLong("snooze_until", 0);
    }

    static void snooze(Context c, int minutes) {
        prefs(c).edit().putLong("snooze_until", System.currentTimeMillis() + minutes * 60_000L).apply();
    }

    /** Count one night-time social media visit for the habit day; returns the night's total. */
    static synchronized int countHit(Context c) {
        int now = WidgetShared.nowMinute();
        String day = habitDay(now, WidgetShared.today(), WidgetShared.dateKey(1));
        try {
            JSONObject hits = new JSONObject(prefs(c).getString("hits", "{}"));
            int n = hits.optInt(day, 0) + 1;
            hits.put(day, n);
            // keep ~90 days
            JSONArray names = hits.names();
            if (names != null && names.length() > 90) {
                String oldest = null;
                for (int i = 0; i < names.length(); i++) {
                    String k = names.getString(i);
                    if (oldest == null || k.compareTo(oldest) < 0) oldest = k;
                }
                hits.remove(oldest);
            }
            prefs(c).edit().putString("hits", hits.toString()).apply();
            return n;
        } catch (Exception e) {
            return 1;
        }
    }

    /** Per-night counters for the stats: "blocks", "passes" (held through), "slept" (took the way out). */
    static synchronized void countEvent(Context c, String key) {
        String day = habitDay(WidgetShared.nowMinute(), WidgetShared.today(), WidgetShared.dateKey(1));
        try {
            JSONObject o = new JSONObject(prefs(c).getString(key, "{}"));
            o.put(day, o.optInt(day, 0) + 1);
            prefs(c).edit().putString(key, o.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    static JSONObject counts(Context c, String key) {
        try {
            return new JSONObject(prefs(c).getString(key, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static JSONObject hits(Context c) {
        try {
            return new JSONObject(prefs(c).getString("hits", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    // ------------------------------------------------------------------ start / schedule

    /** Start the guard now if it should be running (in the window, enabled, access granted). */
    static void ensure(Context c) {
        if (!enabled(c) || LiveGuardService.running) return;
        if (!inWindow(WidgetShared.nowMinute(), from(c), until(c))) return;
        try {
            Intent i = new Intent(c, LiveGuardService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception ignored) {
            // Background start not allowed right now (no exemption) - the exact alarm will do it.
        }
    }

    /** Arm an exact alarm for the next window start (exact alarms may start a foreground service). */
    static void scheduleStart(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, NotifierReceiver.class).setAction(ACTION_START);
        PendingIntent pi = PendingIntent.getBroadcast(c, 7600, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (!enabled(c)) {
            am.cancel(pi);
            return;
        }
        Calendar at = Calendar.getInstance();
        int now = at.get(Calendar.HOUR_OF_DAY) * 60 + at.get(Calendar.MINUTE);
        int from = from(c);
        at.set(Calendar.HOUR_OF_DAY, from / 60);
        at.set(Calendar.MINUTE, from % 60);
        at.set(Calendar.SECOND, 2);
        at.set(Calendar.MILLISECOND, 0);
        if (from <= now) at.add(Calendar.DAY_OF_YEAR, 1);
        try {
            boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.getTimeInMillis(), pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.getTimeInMillis(), pi);
        } catch (SecurityException ignored) {
        }
    }
}
