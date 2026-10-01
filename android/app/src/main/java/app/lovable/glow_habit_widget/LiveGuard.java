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
import java.util.Set;
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

    /** In the last stretch before the deadline (bedtime mode) the block comes one jab sooner. */
    static boolean shouldBlock(int jabs, boolean pre) {
        return jabs > (pre ? BLOCK_AFTER - 1 : BLOCK_AFTER);
    }

    // ------------------------------------------------------------------ curfew ("cisza nocna")

    /** An urgent pass through the curfew block lasts this long. */
    static final int CURFEW_PASS_MIN = 3;
    /** The first pass of a night needs a 10 s hold, every next one twice as long (max 60 s). */
    static final long CURFEW_HOLD_MS = 10_000L;
    static final long CURFEW_HOLD_MAX_MS = 60_000L;

    /**
     * Always allowed during the curfew, whatever the allow list says: the system
     * UI, phone calls, alarms, settings and permission screens (on top of the
     * home screen, dialer, clock and keyboard apps resolved on the device).
     */
    static final Set<String> BASE_ESSENTIAL = new java.util.HashSet<>(java.util.Arrays.asList(
        "android", "com.android.systemui", "com.android.settings", "com.android.phone",
        "com.android.incallui", "com.android.server.telecom", "com.google.android.dialer",
        "com.android.dialer", "com.android.deskclock", "com.google.android.deskclock",
        "com.android.permissioncontroller", "com.google.android.permissioncontroller",
        "com.android.packageinstaller", "com.google.android.packageinstaller",
        "com.miui.securitycenter", "com.lbe.security.miui", "com.miui.aod", "com.android.emergency",
        "com.google.android.apps.safetyhub", "com.android.stk", "com.android.mms",
        "com.google.android.apps.messaging", "com.android.cellbroadcastreceiver"));

    /** Curfew time = after the deadline until the morning (bedtime mode before it only jabs). */
    static boolean curfewNow(int now, int deadline, int until) {
        return inWindow(now, deadline, until);
    }

    /** Does the curfew cover this foreground app? */
    static boolean curfewBlocks(String pkg, Set<String> essential, Set<String> allowed) {
        if (pkg == null || pkg.isEmpty()) return false;
        if (essential != null && essential.contains(pkg)) return false;
        return allowed == null || !allowed.contains(pkg);
    }

    /** Hold time for the n-th urgent pass of the night (0-based): 10 s, 20 s, 40 s, 60 s... */
    static long curfewHoldMs(int passesTonight) {
        long ms = CURFEW_HOLD_MS;
        for (int i = 0; i < passesTonight && ms < CURFEW_HOLD_MAX_MS; i++) ms *= 2;
        return Math.min(ms, CURFEW_HOLD_MAX_MS);
    }

    /** Night filter opacity during a pass: from 0.3 up to 0.7 by its end (stays below the touch-blocking 0.8). */
    static float dimAlpha(long sinceMs, long passMs) {
        if (passMs <= 0) return 0.7f;
        float p = Math.max(0f, Math.min(1f, sinceMs / (float) passMs));
        return 0.3f + 0.4f * p;
    }

    static boolean curfewOn(Context c) {
        return settings(c).optBoolean("curfew", false);
    }

    static boolean curfewDim(Context c) {
        return settings(c).optBoolean("curfewDim", true);
    }

    /** Apps the user lets through the curfew (music, a sleep app, a messenger...). */
    static Set<String> curfewAllowed(Context c) {
        Set<String> out = new java.util.HashSet<>();
        JSONArray a = settings(c).optJSONArray("curfewAllow");
        if (a != null) for (int i = 0; i < a.length(); i++) out.add(a.optString(i));
        return out;
    }

    /** BASE_ESSENTIAL + this device's home screens, dialers, clocks and keyboards + Szpila. */
    static Set<String> essentialApps(Context c) {
        Set<String> out = new java.util.HashSet<>(BASE_ESSENTIAL);
        out.add(c.getPackageName());
        PackageManager pm = c.getPackageManager();
        Intent[] intents = {
            new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),
            new Intent(Intent.ACTION_DIAL),
            new Intent(android.provider.AlarmClock.ACTION_SHOW_ALARMS),
        };
        for (Intent i : intents) {
            try {
                for (android.content.pm.ResolveInfo r : pm.queryIntentActivities(i, 0)) {
                    if (r.activityInfo != null) out.add(r.activityInfo.packageName);
                }
            } catch (Exception ignored) {
            }
        }
        try {
            android.view.inputmethod.InputMethodManager imm =
                (android.view.inputmethod.InputMethodManager) c.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) for (android.view.inputmethod.InputMethodInfo m : imm.getEnabledInputMethodList()) out.add(m.getPackageName());
        } catch (Exception ignored) {
        }
        try {
            android.telecom.TelecomManager tm = (android.telecom.TelecomManager) c.getSystemService(Context.TELECOM_SERVICE);
            if (tm != null && tm.getDefaultDialerPackage() != null) out.add(tm.getDefaultDialerPackage());
        } catch (Exception ignored) {
        }
        return out;
    }

    static String appLabel(Context c, String pkg) {
        String[] social = SOCIAL.get(pkg);
        if (social != null) return social[1];
        try {
            PackageManager pm = c.getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return pkg;
        }
    }

    static long curfewPassUntil(Context c) {
        return prefs(c).getLong("curfew_pass_until", 0);
    }

    static void curfewPass(Context c, long untilMs) {
        prefs(c).edit().putLong("curfew_pass_until", untilMs).apply();
    }

    /** Count for tonight (habit day) of a per-night counter. */
    static int tonight(Context c, String key) {
        String day = habitDay(WidgetShared.nowMinute(), WidgetShared.today(), WidgetShared.dateKey(1));
        return counts(c, key).optInt(day, 0);
    }

    /** First "phone on the charger" of the night (minute of day), for the night bill. */
    static synchronized boolean markCharged(Context c) {
        String day = habitDay(WidgetShared.nowMinute(), WidgetShared.today(), WidgetShared.dateKey(1));
        try {
            JSONObject o = new JSONObject(prefs(c).getString("charged", "{}"));
            if (o.has(day)) return false;
            o.put(day, WidgetShared.nowMinute());
            prefs(c).edit().putString("charged", o.toString()).apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Resolve {app} {m} {time} {count} in a line. */
    static String fill(String line, String app, int minutes, String time, int count) {
        return line.replace("{app}", app).replace("{m}", String.valueOf(minutes))
            .replace("{time}", time).replace("{count}", String.valueOf(count));
    }

    /** Minutes from `now` until `target` (minutes of day), going forward across midnight. */
    static int minutesTo(int now, int target) {
        return ((target - now) % (24 * 60) + 24 * 60) % (24 * 60);
    }

    /**
     * When the guard starts: at bedtime ("przed snem") if that's before the
     * deadline the same night (within 12 h), otherwise at the deadline itself.
     */
    static int start(boolean bedtimeOn, int bedtime, int deadline) {
        int lead = minutesTo(bedtime, deadline);
        return bedtimeOn && lead > 0 && lead < 12 * 60 ? bedtime : deadline;
    }

    /** Between bedtime and the deadline: countdown jabs ("odkładaj, za {left} min północ"). */
    static boolean prePhase(int now, int start, int deadline) {
        return start != deadline && inWindow(now, start, deadline);
    }

    /** Resolve {left} (minutes to the deadline) and {deadline} (its clock time). */
    static String fillLeft(String line, int left, String deadline) {
        return line.replace("{left}", String.valueOf(left)).replace("{deadline}", deadline);
    }

    /** The habit day a night belongs to: before noon it's still "last night". */
    static String habitDay(int nowMin, String today, String yesterday) {
        return nowMin < 12 * 60 ? yesterday : today;
    }

    // ------------------------------------------------------------------ settings (from the snapshot)

    private static String cachedRaw;
    private static JSONObject cachedLive;

    /**
     * The snapshot's "live" part. The guard asks for it several times per poll, so
     * it's parsed once per snapshot (SharedPreferences hands back the same String
     * until the app writes a new one). Read-only for callers.
     */
    static synchronized JSONObject settings(Context c) {
        String raw = WidgetShared.rawState(c);
        if (raw != null && raw == cachedRaw && cachedLive != null) return cachedLive;
        JSONObject l = WidgetShared.state(c).optJSONObject("live");
        cachedRaw = raw;
        cachedLive = l != null ? l : new JSONObject();
        return cachedLive;
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

    static boolean bedtimeOn(Context c) {
        return settings(c).optBoolean("bedtime", false);
    }

    static int bedtimeAt(Context c) {
        return settings(c).optInt("bedtimeAt", 23 * 60 + 30);
    }

    /** Guard start tonight (bedtime or the deadline), see start(). */
    static int start(Context c) {
        return start(bedtimeOn(c), bedtimeAt(c), from(c));
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

    // ------------------------------------------------------------------ bedtime reminder

    static final int ID_BEDTIME = 7520;

    /** At bedtime (once a night): "odłóż telefon za 30 min" - from then on the guard is on. */
    static void maybeBedtimeReminder(Context c) {
        if (!bedtimeOn(c)) return;
        int now = WidgetShared.nowMinute();
        int bed = bedtimeAt(c);
        int deadline = from(c);
        if (start(c) != bed || !prePhase(now, bed, deadline) || minutesTo(bed, now) > 20) return;
        String day = WidgetShared.today();
        if (day.equals(prefs(c).getString("bedtime_day", ""))) return;
        prefs(c).edit().putString("bedtime_day", day).apply();
        if (android.os.Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        LiveGuardService.ensureChannels(c);
        int left = minutesTo(now, deadline);
        String clock = WidgetShared.fmtMinute(deadline);
        JSONObject lines = settings(c).optJSONObject("lines");
        String text = lines != null ? WidgetShared.pick(lines.optJSONArray("bedtime")) : "";
        if (text.isEmpty()) {
            text = WidgetShared.tr(c, "Za {left} min {deadline}. Odkładaj telefon i szykuj się do spania.",
                "{deadline} in {left} min. Put the phone down and get ready for bed.");
        }
        text = fillLeft(text, left, clock);
        boolean curfew = curfewOn(c);
        if (curfew) {
            text += WidgetShared.tr(c, " Od " + clock + " cisza nocna: działa tylko budzik i telefon. Ładowarka najlepiej poza łóżkiem.",
                " From " + clock + " it's curfew: only the alarm and calls work. Best put the charger away from the bed.");
        }
        String title = WidgetShared.tr(c, "Odłóż telefon za " + left + " min", "Put the phone down in " + left + " min");
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent sleep = PendingIntent.getActivity(c, 7521, home, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        androidx.core.app.NotificationCompat.Builder b = new androidx.core.app.NotificationCompat.Builder(c, LiveGuardService.CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle(HabitNotifier.EMOJI_NORMAL + " " + title)
            .setContentText(text)
            .setStyle(new androidx.core.app.NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setTimeoutAfter(left * 60_000L)
            .addAction(0, curfew ? WidgetShared.tr(c, "🔌 Na ładowarkę i spać", "🔌 Charger, then bed")
                : WidgetShared.tr(c, "😴 Idę spać", "😴 Going to bed"), sleep);
        PendingIntent open = WidgetShared.openAppIntent(c, 7522);
        if (open != null) b.setContentIntent(open);
        try {
            androidx.core.app.NotificationManagerCompat.from(c).notify(ID_BEDTIME, b.build());
        } catch (SecurityException ignored) {
        }
    }

    // ------------------------------------------------------------------ start / schedule

    /** Start the guard now if it should be running (in the window, enabled, access granted). */
    static void ensure(Context c) {
        if (LiveGuardService.running) return;
        // Night guard, morning lock or daily limit - whichever phase is active now.
        if (DayGuard.phase(c) == DayGuard.OFF) return;
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
        // Next start of any phase (night / morning lock / daily limit), plus the bedtime
        // reminder, which works without usage access.
        java.util.List<Integer> starts = DayGuard.phaseStarts(DayGuard.config(c));
        if (bedtimeOn(c)) starts.add(bedtimeAt(c));
        Calendar at = Calendar.getInstance();
        int now = at.get(Calendar.HOUR_OF_DAY) * 60 + at.get(Calendar.MINUTE);
        int next = DayGuard.minutesToNextStart(now, starts);
        if (next < 0) {
            am.cancel(pi);
            return;
        }
        at.set(Calendar.SECOND, 2);
        at.set(Calendar.MILLISECOND, 0);
        at.add(Calendar.MINUTE, next);
        try {
            boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.getTimeInMillis(), pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.getTimeInMillis(), pi);
        } catch (SecurityException ignored) {
        }
    }
}
