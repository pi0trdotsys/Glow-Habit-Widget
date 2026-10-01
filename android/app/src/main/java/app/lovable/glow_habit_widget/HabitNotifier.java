package app.lovable.glow_habit_widget;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Random;

/**
 * Native notifications built from the widget snapshot at fire time, so they
 * are never stale (a widget tap updates them immediately):
 *
 *  - "Postęp dnia": a silent, ongoing notification with a progress bar of
 *    today's tasks, the next task (with a one-tap action) and a plan to
 *    finish the day.
 *  - Szpila's jabs: tailored lines (generated per habit by
 *    src/lib/habits/szpila.ts) at evenly spaced slots between wake-up and
 *    bedtime (quiet hours in between). They escalate: a task overdue for 3h+,
 *    or the 4th+ jab of the day, gets the "rage" lines; repeat offenders get
 *    "memory" lines. Each jab carries buttons (+1 / Dziś czysto / Była wpadka
 *    / Odwal się na 1 h).
 *  - Evening review: one notification to settle all forbidden habits.
 *  - Sunday roast: a nasty weekly summary.
 *
 * An inexact alarm ticks at the next full hour / jab slot / review / midnight.
 * Each tick also pulls steps from Health Connect and checks late-night screen
 * time. IDs 7001-7999 are reserved here (see src/lib/notifications.ts).
 */
final class HabitNotifier {
    static final String CH_PROGRESS = "loop_progress";
    static final String CH_SZPILA = "loop_szpila";
    static final String CH_REVIEW = "loop_review";
    static final int ID_PROGRESS = 7001;
    static final int ID_TAUNT = 7100;
    static final int ID_REVIEW = 7200;
    static final int ID_ROAST = 7300;
    static final int ID_PRAISE = 7400;
    static final int ID_MORNING = 7250;
    static final int ID_BILL = 7260;

    static final String ACTION_TICK = "app.lovable.glow_habit_widget.NOTIFIER_TICK";
    static final String ACTION_DO_NEXT = "app.lovable.glow_habit_widget.DO_NEXT";
    static final String ACTION_SLIP = "app.lovable.glow_habit_widget.SLIP";
    static final String ACTION_ALL_CLEAN = "app.lovable.glow_habit_widget.ALL_CLEAN";
    static final String ACTION_SNOOZE = "app.lovable.glow_habit_widget.SNOOZE";
    static final String ACTION_Y_CLEAN = "app.lovable.glow_habit_widget.YESTERDAY_CLEAN";
    static final String ACTION_Y_SLIP = "app.lovable.glow_habit_widget.YESTERDAY_SLIP";
    static final String EXTRA_CANCEL_ID = "cancelId";

    private static final String PREFS = "loop_notifier";
    private static final String KEY_LAST_TAUNT = "last_taunt";
    private static final String KEY_JABS = "jabs_today"; // "yyyy-mm-dd:n"
    private static final String KEY_SNOOZE = "snooze_until";
    private static final String KEY_LAST_REVIEW = "last_review";
    private static final String KEY_LAST_ROAST = "last_roast";
    private static final String KEY_LATE_JAB = "late_jab";
    private static final String KEY_LATE_EVAL = "late_eval";
    private static final String KEY_LAST_MORNING = "last_morning";
    private static final String KEY_LAST_BILL = "last_bill";
    /** Yesterday stays answerable until noon - mirrors AVOID_GRACE_MIN in utils.ts. */
    static final int GRACE_MIN = 12 * 60;
    /** A jab fires if its slot passed less than this many minutes ago (MIUI delays alarms). */
    private static final int SLOT_GRACE = 60;
    private static final int ROAST_MINUTE = 20 * 60; // Sunday 20:00
    private static final Random RNG = new Random();
    /** Szpila is a mean cat - mirrors SZPILA_EMOJI in szpila.ts. */
    static final String EMOJI_NORMAL = "😼";
    static final String EMOJI_ANGRY = "😾";
    static final String EMOJI_IMPRESSED = "😸";

    private HabitNotifier() {}

    /** Re-render the progress notification and reschedule the next tick. */
    static void refresh(Context c) {
        try {
            ensureChannels(c);
            updateProgress(c);
        } catch (Exception ignored) {
            // never let a notification problem break widget updates
        }
        scheduleNext(c);
        try {
            LiveGuard.scheduleStart(c);
            LiveGuard.ensure(c);
        } catch (Exception ignored) {
        }
    }

    /** Alarm tick (background thread): sync sensors, maybe jab/review/roast, refresh everything. */
    static void onTick(Context c) {
        WidgetShared.normalizeIfStale(c);
        try {
            ensureChannels(c);
            WidgetShared.syncSteps(c);
            checkLateScreen(c);
            maybeTaunt(c);
            maybeReview(c);
            maybeMorningReview(c);
            maybeNightBill(c);
            maybeRoast(c);
        } catch (Exception ignored) {
        }
        BackupStore.autoBackupIfDue(c);
        WidgetShared.updateAll(c); // also calls refresh()
    }

    // ------------------------------------------------------------------
    // Settings
    // ------------------------------------------------------------------

    private static JSONObject settings(Context c) {
        JSONObject s = WidgetShared.state(c).optJSONObject("settings");
        return s != null ? s : new JSONObject();
    }

    private static SharedPreferences own(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Wake-up minute (quiet hours end). */
    static int wake(JSONObject s) {
        return s.optInt("quietTo", 9 * 60);
    }

    /** Bedtime minute (quiet hours start). */
    static int bedtime(JSONObject s) {
        return s.optInt("quietFrom", 22 * 60);
    }

    static boolean isQuiet(int from, int to, int now) {
        return from > to ? (now >= from || now < to) : (now >= from && now < to);
    }

    private static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    /** Posts a notification after an explicit permission check (it can be revoked at any time). */
    private static void post(Context c, int id, NotificationCompat.Builder b) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            NotificationManagerCompat.from(c).notify(id, b.build());
        } catch (SecurityException ignored) {
        }
    }

    private static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        // Names follow the app language: upsertChannel re-creates a channel whose name changed.
        NotificationChannel progress = new NotificationChannel(CH_PROGRESS,
            WidgetShared.tr(c, "Postęp dnia", "Daily progress"), NotificationManager.IMPORTANCE_LOW);
        progress.setDescription(WidgetShared.tr(c, "Pasek postępu dzisiejszych zadań i plan na resztę dnia",
            "Progress bar for today's habits and a plan for the rest of the day"));
        progress.setShowBadge(false);
        WidgetShared.upsertChannel(nm, progress);
        NotificationChannel szpila = new NotificationChannel(CH_SZPILA, "Szpila", NotificationManager.IMPORTANCE_DEFAULT);
        szpila.setDescription(WidgetShared.tr(c, "Złośliwe przytyki, gdy zadania leżą odłogiem",
            "Snarky jabs when your habits are left undone"));
        WidgetShared.upsertChannel(nm, szpila);
        NotificationChannel review = new NotificationChannel(CH_REVIEW,
            WidgetShared.tr(c, "Rozliczenie dnia", "Daily review"), NotificationManager.IMPORTANCE_DEFAULT);
        review.setDescription(WidgetShared.tr(c, "Wieczorne potwierdzenie zakazanych zadań",
            "Evening check-in for forbidden habits"));
        WidgetShared.upsertChannel(nm, review);
    }

    private static String plural(int n, boolean en) {
        if (en) return n == 1 ? "habit" : "habits";
        if (n == 1) return "zadanie";
        int d = n % 10, dd = n % 100;
        return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? "zadania" : "zadań";
    }

    // ------------------------------------------------------------------
    // Action buttons
    // ------------------------------------------------------------------

    private static PendingIntent action(Context c, String action, String habitId, int cancelId, int req) {
        Intent i = new Intent(c, NotifierReceiver.class);
        i.setAction(action);
        if (habitId != null) i.putExtra(WidgetShared.EXTRA_HABIT_ID, habitId);
        i.putExtra(EXTRA_CANCEL_ID, cancelId);
        i.setData(Uri.parse("loop://notif/" + action + "/" + cancelId + "/" + habitId));
        return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String actionLabel(JSONObject h, boolean en) {
        if (WidgetShared.isAvoid(h)) return en ? "Clean today" : "Dziś czysto";
        if ("check".equals(h.optString("goal", "check"))) return en ? "Done" : "Zrobione";
        if ("steps".equals(h.optString("source"))) return en ? "Refresh steps" : "Odśwież kroki";
        int step = Math.min(WidgetShared.step(h), WidgetShared.target(h) - WidgetShared.amount(h));
        return ("+" + step + " " + WidgetShared.unit(h, step)).trim();
    }

    /** Pending build habits worth a one-tap button, in plan order (not step-synced ones). */
    static List<JSONObject> quickRows(List<JSONObject> plan, int max) {
        List<JSONObject> out = new ArrayList<>();
        for (JSONObject h : plan) {
            if (out.size() >= max) break;
            if (WidgetShared.isAvoid(h) || "steps".equals(h.optString("source")) || WidgetShared.isDone(h)) continue;
            out.add(h);
        }
        return out;
    }

    /** "+1 szklanka" / "+15 min Czytanie" / "✓ Mycie" - short enough for a notification button. */
    static String quickLabel(JSONObject h) {
        return quickLabel(h, false);
    }

    /**
     * quickLabel in the app language. The glue ("+", "min", "✓") reads the same in
     * English; names and units already come from the snapshot in the right language.
     */
    static String quickLabel(JSONObject h, boolean en) {
        String first = h.optString("name").trim().split("\\s+")[0];
        String goal = h.optString("goal", "check");
        if ("check".equals(goal)) return "✓ " + first;
        int step = Math.max(1, Math.min(WidgetShared.step(h), WidgetShared.target(h) - WidgetShared.amount(h)));
        if ("minutes".equals(goal)) return "+" + step + " min " + first;
        String unit = WidgetShared.unit(h, step);
        return unit.isEmpty() ? "+" + step + " " + first : "+" + step + " " + unit;
    }

    /** After a button: close the jab/review and, if the task got finished, show a short praise. */
    static void afterAction(Context c, Intent intent) {
        int cancelId = intent.getIntExtra(EXTRA_CANCEL_ID, 0);
        if (cancelId != 0 && cancelId != ID_PROGRESS) NotificationManagerCompat.from(c).cancel(cancelId);
        String habitId = intent.getStringExtra(WidgetShared.EXTRA_HABIT_ID);
        if (habitId == null || !canNotify(c)) return;
        JSONObject h = WidgetShared.row(c, habitId);
        if (h == null || !WidgetShared.isDone(h)) return;
        String praise = h.optString("praise", "");
        if (praise.isEmpty()) return;
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_SZPILA)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle(EMOJI_IMPRESSED + " Szpila")
            .setContentText(praise)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(praise))
            .setSilent(true)
            .setAutoCancel(true)
            .setTimeoutAfter(15_000);
        post(c, ID_PRAISE, b);
    }

    static void snooze(Context c, int minutes) {
        own(c).edit().putLong(KEY_SNOOZE, System.currentTimeMillis() + minutes * 60_000L).apply();
    }

    // ------------------------------------------------------------------
    // Progress notification
    // ------------------------------------------------------------------

    private static String planLine(JSONObject h, boolean first, boolean en) {
        String when = first ? WidgetShared.whenLabel(h, en) : WidgetShared.fmtMinute(WidgetShared.nextMinute(h));
        if (WidgetShared.isAvoid(h)) return "• " + when + (en ? "  Confirm: " : "  Potwierdź: ") + h.optString("name");
        String left = "check".equals(h.optString("goal", "check")) ? ""
            : en ? " - " + WidgetShared.leftText(h) + " left" : " - zostało " + WidgetShared.leftText(h);
        return "• " + when + "  " + h.optString("name") + left;
    }

    static void updateProgress(Context c) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        JSONArray rows = WidgetShared.habits(c);
        if (!settings(c).optBoolean("progress", true) || !canNotify(c) || rows.length() == 0) {
            nm.cancel(ID_PROGRESS);
            return;
        }
        WidgetShared.normalizeIfStale(c);
        rows = WidgetShared.habits(c);
        int total = 0;
        int done = 0;
        float sum = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject h = rows.optJSONObject(i);
            if (!WidgetShared.counts(h)) continue; // undecided night: neither done nor missed
            total++;
            if (WidgetShared.isDone(h)) done++;
            sum += WidgetShared.fraction(h);
        }
        int pct = total == 0 ? 0 : Math.round(100f * sum / total);
        List<JSONObject> plan = WidgetShared.plan(c);
        boolean en = WidgetShared.en(c);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_PROGRESS)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setProgress(100, pct, false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        PendingIntent open = WidgetShared.openAppIntent(c, 7001);
        if (open != null) b.setContentIntent(open);

        if (plan.isEmpty()) {
            String line = WidgetShared.pick(WidgetShared.state(c).optJSONArray("allDone"));
            if (line.isEmpty()) line = en ? "All done." : "Wszystko zrobione.";
            b.setContentTitle((en ? "All done for today 🎉 " : "Komplet na dziś 🎉 ") + done + "/" + total)
                .setContentText(line)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(line))
                .setOngoing(false);
        } else {
            JSONObject next = plan.get(0);
            String amount = WidgetShared.amountText(next);
            String now = (en ? "Now: " : "Teraz: ") + next.optString("name") + (amount.isEmpty() ? "" : " (" + amount + ")")
                + " · " + WidgetShared.whenLabel(next, en);
            StringBuilder big = new StringBuilder((en ? "Plan for the rest of the day (" : "Plan na resztę dnia (")
                + plan.size() + " " + plural(plan.size(), en) + "):");
            for (int i = 0; i < Math.min(plan.size(), 6); i++) big.append('\n').append(planLine(plan.get(i), i == 0, en));
            if (plan.size() > 6) {
                big.append(en ? "\n… and " : "\n… i ").append(plan.size() - 6).append(en ? " more" : " więcej");
            }
            big.append("\n⏳ ").append(WidgetShared.timeLeft(en));

            b.setContentTitle((en ? "Today: " : "Dziś: ") + done + "/" + total + " · " + pct + "%")
                .setContentText(now)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(big.toString()))
                .setOngoing(true);
            // Quick log: up to 3 buttons ("+1 szklanka", "+15 min Czytanie", "✓ Mycie") - no need to open the app.
            List<JSONObject> quick = quickRows(plan, 3);
            for (int i = 0; i < quick.size(); i++) {
                JSONObject h = quick.get(i);
                b.addAction(0, quickLabel(h, en), action(c, ACTION_DO_NEXT, h.optString("id"), ID_PROGRESS, 7002 + i));
            }
        }
        post(c, ID_PROGRESS, b);
    }

    // ------------------------------------------------------------------
    // Szpila
    // ------------------------------------------------------------------

    /**
     * Minutes of day for jabs: evenly from wake+30 to bedtime-30 (may cross
     * midnight). Mirrors tauntSlots() in src/lib/notifications.ts.
     */
    static int[] tauntSlots(int n, int wake, int bedtime) {
        int start = wake + 30;
        int end = (bedtime > wake ? bedtime : bedtime + 24 * 60) - 30;
        if (end < start) end = start;
        if (n <= 1) return new int[]{start % (24 * 60)};
        int[] out = new int[n];
        for (int i = 0; i < n; i++) out[i] = (int) (Math.round(start + ((end - start) * (double) i) / (n - 1)) % (24 * 60));
        return out;
    }

    private static int[] slots(JSONObject s) {
        return tauntSlots(s.optInt("tauntsPerDay", 5), wake(s), bedtime(s));
    }

    private static int jabsToday(Context c) {
        String v = own(c).getString(KEY_JABS, "");
        String today = WidgetShared.today();
        if (!v.startsWith(today + ":")) return 0;
        try {
            return Integer.parseInt(v.substring(today.length() + 1));
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * Escalation tier: 0 normal, 1 rage. Rage when the task is 3h+ overdue or
     * Szpila already jabbed 3+ times today. Mirrored by escalationTier() in szpila.ts.
     */
    static int tier(int overdueMin, int jabsToday) {
        return overdueMin >= 180 || jabsToday >= 3 ? 1 : 0;
    }

    // Context rule thresholds - mirror CTX_RULES / CTX_CHANCE in src/lib/habits/szpila.ts.
    static final int CTX_MORNING_FROM = 5 * 60;
    static final int CTX_MORNING_UNTIL = 11 * 60;
    static final int CTX_ZERO_FROM = 14 * 60;
    static final int CTX_LATE_FROM = 19 * 60;
    static final int CTX_ALMOST_PCT = 70;
    static final int CTX_CHANCE = 50;
    static final int CTX_CHANCE_RAGE = 35;

    /**
     * Situation of a pending row (mirrors contextRule() in szpila.ts): "morning"
     * (nothing logged yet, 05:00-11:00), "almost" (70%+ of the target), "late"
     * (19:00+), "zero" (still nothing at 14:00+), or null. Avoid habits only get
     * "morning" and "late". Picks the matching pool of the row's "ctx" object.
     */
    static String contextOf(boolean avoid, int amount, int target, int now) {
        boolean morning = now >= CTX_MORNING_FROM && now < CTX_MORNING_UNTIL;
        if (avoid) return now >= CTX_LATE_FROM ? "late" : morning ? "morning" : null;
        if (amount >= target) return null;
        if (amount <= 0 && morning) return "morning";
        if (amount > 0 && amount * 100L >= target * (long) CTX_ALMOST_PCT) return "almost";
        if (now >= CTX_LATE_FROM) return "late";
        if (amount <= 0 && now >= CTX_ZERO_FROM) return "zero";
        return null;
    }

    static String contextOf(JSONObject h, int now) {
        return contextOf(WidgetShared.isAvoid(h), WidgetShared.amount(h), WidgetShared.target(h), now);
    }

    /** Mirrors CHAIN_CHANCE in src/lib/habits/chain.ts. */
    static final int CHAIN_RESCUE = 60, CHAIN_FOCUS = 45;

    /**
     * "Nigdy dwa razy" / weekly focus: the rescue pool on a rescue day (minimum not
     * reached yet) or the focus pool for this week's focus, when the roll (0..99) says so.
     */
    static JSONArray chainPool(JSONObject h, int roll) {
        if (WidgetShared.rescueNow(h) && roll < CHAIN_RESCUE) {
            JSONArray p = h.optJSONArray("rescueLines");
            if (p != null && p.length() > 0) return p;
        }
        if (h.optBoolean("focus", false) && roll < CHAIN_FOCUS) {
            JSONArray p = h.optJSONArray("focusLines");
            if (p != null && p.length() > 0) return p;
        }
        return null;
    }

    /** Chance (percent) that a jab uses the context pool, per escalation tier. */
    static int ctxChance(int tier) {
        return tier == 1 ? CTX_CHANCE_RAGE : CTX_CHANCE;
    }

    /** The row's context pool for right now, or null (no situation / no lines / old snapshot). */
    static JSONArray contextPool(JSONObject h, int now) {
        String key = contextOf(h, now);
        JSONObject all = h.optJSONObject("ctx");
        if (key == null || all == null) return null;
        JSONArray pool = all.optJSONArray(key);
        return pool != null && pool.length() > 0 ? pool : null;
    }

    /**
     * Escalated line for a pending row; repeat offenders sometimes get a "memory"
     * line, and the situation ("zostało tylko…", evening, morning) often wins.
     */
    static String lineFor(JSONObject h, int jabs) {
        JSONArray memory = h.optJSONArray("memory");
        if (memory != null && memory.length() > 0 && RNG.nextInt(10) < 4) {
            return WidgetShared.fill(WidgetShared.pick(memory), h);
        }
        int now = WidgetShared.nowMinute();
        int tier = tier(now - WidgetShared.nextMinute(h), jabs);
        JSONArray chain = chainPool(h, RNG.nextInt(100));
        if (chain != null) return WidgetShared.fill(WidgetShared.pick(chain), h);
        JSONArray ctx = contextPool(h, now);
        if (ctx != null && RNG.nextInt(100) < ctxChance(tier)) {
            return WidgetShared.fill(WidgetShared.pick(ctx), h);
        }
        JSONArray pool = tier == 1 ? h.optJSONArray("rage") : h.optJSONArray("nag");
        if (pool == null || pool.length() == 0) pool = h.optJSONArray("nag");
        return WidgetShared.fill(WidgetShared.pick(pool), h);
    }

    static void maybeTaunt(Context c) {
        JSONObject s = settings(c);
        if (!s.optBoolean("taunts", true) || !canNotify(c)) return;
        JSONArray rows = WidgetShared.habits(c);
        if (rows.length() == 0) return;
        int[] slots = slots(s);
        int now = WidgetShared.nowMinute();
        int slot = -1;
        for (int m : slots) if (m <= now && now - m <= SLOT_GRACE) slot = m;
        if (slot < 0 || isQuiet(bedtime(s), wake(s), now)) return;
        String key = WidgetShared.today() + "@" + slot;
        SharedPreferences p = own(c);
        if (key.equals(p.getString(KEY_LAST_TAUNT, ""))) return;
        p.edit().putString(KEY_LAST_TAUNT, key).apply();
        if (System.currentTimeMillis() < p.getLong(KEY_SNOOZE, 0)) return; // "Odwal się (1 h)"

        JSONObject state = WidgetShared.state(c);
        List<JSONObject> plan = WidgetShared.plan(c);
        int jabs = jabsToday(c);
        String text;
        JSONObject target = null;
        if (plan.isEmpty()) {
            // Only gloat (grudgingly) once, at the last slot of the day.
            if (slot != slots[slots.length - 1]) return;
            text = WidgetShared.pick(state.optJSONArray("allDone"));
        } else if (now >= bedtime(s) - 150 && plan.size() >= 2 && RNG.nextBoolean()) {
            text = WidgetShared.pick(state.optJSONArray("evening"))
                .replace("{pending}", plan.size() + " " + plural(plan.size(), WidgetShared.en(c)));
            target = plan.get(0);
        } else {
            // Mostly the most urgent task, sometimes the runner-up so it doesn't get repetitive.
            target = plan.get(plan.size() > 1 && RNG.nextInt(3) == 0 ? 1 : 0);
            text = lineFor(target, jabs);
        }
        if (text.isEmpty()) return;
        p.edit().putString(KEY_JABS, WidgetShared.today() + ":" + (jabs + 1)).apply();
        postJab(c, text, target, jabs >= 3);
    }

    /** A jab with buttons. `target` null = no task buttons (just the snooze). */
    static void postJab(Context c, String text, JSONObject target, boolean angry) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_SZPILA)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle((angry ? EMOJI_ANGRY : EMOJI_NORMAL) + " Szpila")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        PendingIntent open = WidgetShared.openAppIntent(c, 7100);
        if (open != null) b.setContentIntent(open);
        boolean en = WidgetShared.en(c);
        if (target != null) {
            String id = target.optString("id");
            b.addAction(0, actionLabel(target, en), action(c, ACTION_DO_NEXT, id, ID_TAUNT, 7101));
            if (WidgetShared.isAvoid(target)) {
                b.addAction(0, en ? "I slipped" : "Była wpadka", action(c, ACTION_SLIP, id, ID_TAUNT, 7102));
            }
        }
        b.addAction(0, en ? "Back off (1 h)" : "Odwal się (1 h)", action(c, ACTION_SNOOZE, null, ID_TAUNT, 7103));
        post(c, ID_TAUNT, b);
    }

    // ------------------------------------------------------------------
    // Evening review + Sunday roast
    // ------------------------------------------------------------------

    static void maybeReview(Context c) {
        JSONObject s = settings(c);
        if (!s.optBoolean("review", true) || !canNotify(c)) return;
        int at = s.optInt("reviewAt", 21 * 60 + 30);
        int now = WidgetShared.nowMinute();
        if (now < at || now - at > 2 * SLOT_GRACE) return;
        SharedPreferences p = own(c);
        if (WidgetShared.today().equals(p.getString(KEY_LAST_REVIEW, ""))) return;

        JSONArray rows = WidgetShared.habits(c);
        List<JSONObject> pending = new ArrayList<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject h = rows.optJSONObject(i);
            // Night habits (e.g. scrolling in bed, due 22:30) happen after the review - they
            // get settled in the morning review instead.
            if (WidgetShared.isAvoid(h) && WidgetShared.isPending(h) && h.optInt("start", 0) <= at + 30) pending.add(h);
        }
        p.edit().putString(KEY_LAST_REVIEW, WidgetShared.today()).apply();
        if (pending.isEmpty()) return;

        boolean en = WidgetShared.en(c);
        StringBuilder big = new StringBuilder(en ? "Confirm you stayed clean today:" : "Potwierdź, że dziś bez:");
        for (JSONObject h : pending) big.append("\n⛔ ").append(h.optString("name"));
        big.append(en ? "\n\nNot confirmed by midnight? Then I count it as a slip."
            : "\n\nBez potwierdzenia do północy liczę to jako wpadki.");
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_REVIEW)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle(en ? "Daily review · " + pending.size() + " to confirm"
                : "Rozliczenie dnia · " + pending.size() + " do potwierdzenia")
            .setContentText(en ? "Confirm your forbidden habits before I count them as slips."
                : "Potwierdź zakazane, zanim uznam je za wpadki.")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(big.toString()))
            .setAutoCancel(true)
            .addAction(0, en ? "✓ All clean" : "✓ Wszystko czysto", action(c, ACTION_ALL_CLEAN, null, ID_REVIEW, 7201));
        for (int i = 0; i < Math.min(2, pending.size()); i++) {
            JSONObject h = pending.get(i);
            b.addAction(0, (en ? "Slip: " : "Wpadka: ") + h.optString("name"), action(c, ACTION_SLIP, h.optString("id"), ID_REVIEW, 7202 + i));
        }
        PendingIntent open = WidgetShared.openAppIntent(c, 7200);
        if (open != null) b.setContentIntent(open);
        post(c, ID_REVIEW, b);
    }

    /** From wake-up until noon: settle yesterday's unanswered forbidden habits. */
    static void maybeMorningReview(Context c) {
        JSONObject s = settings(c);
        if (!s.optBoolean("review", true) || !canNotify(c)) return;
        int now = WidgetShared.nowMinute();
        if (now < wake(s) || now >= GRACE_MIN) return;
        SharedPreferences p = own(c);
        if (WidgetShared.today().equals(p.getString(KEY_LAST_MORNING, ""))) return;
        JSONArray open = WidgetShared.yesterdayOpen(c);
        p.edit().putString(KEY_LAST_MORNING, WidgetShared.today()).apply();
        if (open.length() == 0) return;

        boolean en = WidgetShared.en(c);
        StringBuilder big = new StringBuilder(en ? "Unconfirmed from yesterday:" : "Wczoraj bez potwierdzenia:");
        for (int i = 0; i < open.length(); i++) big.append("\n⛔ ").append(open.optJSONObject(i).optString("name"));
        big.append(en ? "\n\nYou can still settle it until 12:00. After that I count it as a slip."
            : "\n\nDo 12:00 możesz to jeszcze rozliczyć. Potem liczę to jako wpadki.");
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_REVIEW)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle((en ? "Settle yesterday · " : "Rozlicz wczoraj · ") + open.length())
            .setContentText(en ? "How did last night go? You have until 12:00."
                : "Jak minęła wczorajsza noc? Masz czas do 12:00.")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(big.toString()))
            .setAutoCancel(true)
            .addAction(0, en ? "✓ Yesterday was clean" : "✓ Wczoraj czysto", action(c, ACTION_Y_CLEAN, null, ID_MORNING, 7251));
        for (int i = 0; i < Math.min(2, open.length()); i++) {
            JSONObject it = open.optJSONObject(i);
            b.addAction(0, (en ? "Slip: " : "Wpadka: ") + it.optString("name"), action(c, ACTION_Y_SLIP, it.optString("id"), ID_MORNING, 7252 + i));
        }
        PendingIntent openApp = WidgetShared.openAppIntent(c, 7250);
        if (openApp != null) b.setContentIntent(openApp);
        post(c, ID_MORNING, b);
    }

    /**
     * "Rachunek za noc": once in the morning, what last night really looked like -
     * social media per app after midnight, screen minutes, when the phone went down.
     */
    static void maybeNightBill(Context c) {
        JSONObject s = settings(c);
        if (!s.optBoolean("review", true) || !canNotify(c) || !ScreenTime.granted(c)) return;
        int now = WidgetShared.nowMinute();
        if (now < wake(s) || now >= GRACE_MIN) return;
        SharedPreferences p = own(c);
        if (WidgetShared.today().equals(p.getString(KEY_LAST_BILL, ""))) return;
        p.edit().putString(KEY_LAST_BILL, WidgetShared.today()).apply();
        JSONObject r = NightStats.report(c, 1);
        if (!r.optBoolean("granted")) return;
        billPost(c, r);
    }

    /** Title + body of the night bill; the Szpila line comes from the snapshot ("bill"). */
    static String[] billText(JSONObject r, JSONObject lines) {
        return billText(r, lines, false);
    }

    /** billText in the app language (`en` = English glue; the Szpila line comes from the snapshot). */
    static String[] billText(JSONObject r, JSONObject lines, boolean en) {
        int social = r.optInt("social");
        int screen = r.optInt("screen");
        int asleep = r.optInt("asleep", -1);
        boolean bad = social > 0;
        StringBuilder body = new StringBuilder();
        String apps = NightStats.appsLine(r.optJSONArray("apps"), en);
        if (en) body.append(apps.isEmpty() ? "Zero social media after midnight." : "After midnight: " + apps);
        else body.append(apps.isEmpty() ? "Zero social mediów po północy." : "Po północy: " + apps);
        body.append("\n📱 ").append(screen).append(en ? " min on the phone after midnight" : " min z telefonem po północy");
        if (asleep >= 0) {
            body.append(en ? "\n🌙 Phone down around " : "\n🌙 Telefon odłożony ok. ").append(WidgetShared.fmtMinute(asleep));
        }
        // Sleep from the band (Health Connect), when it synced in time.
        JSONObject sleep = r.optJSONObject("sleep");
        int sleepMin = NightStats.sleepMinutes(r);
        if (sleep != null && sleepMin >= 0) {
            body.append("\n😴 ").append(SleepCalc.duration(sleepMin)).append(en ? " of sleep (" : " snu (")
                .append(SleepCalc.range(sleep.optInt("start"), sleep.optInt("end"))).append(")");
            int fell = NightStats.fellAfter(r);
            if (fell != SleepCalc.UNKNOWN) {
                body.append("\n💤 ").append(fell >= 0
                    ? (en ? "Asleep " + fell + " min after the phone went down" : "Zasypiasz " + fell + " min po odłożeniu telefonu")
                    : (en ? "Phone down " + (-fell) + " min after falling asleep?!" : "Telefon odłożony " + (-fell) + " min po zaśnięciu?!"));
            }
        }
        // Comment pools (mirrors billPools in night.ts); older snapshots without sleep pools fall back to bad/good.
        JSONArray pool = billPool(r, lines, SleepCalc.billPools(social, sleepMin));
        if (pool.length() == 0) pool = billPool(r, lines, new String[]{bad ? "bad" : "good"});
        String line = WidgetShared.pick(pool);
        if (!line.isEmpty()) body.append("\n\n").append(NightStats.fill(line, r));
        String title = (en ? "🧾 Night bill · " : "🧾 Rachunek za noc · ")
            + (bad ? r.optInt("visits") + "× social media, " + social + " min" : en ? "clean" : "czysto");
        return new String[]{title, body.toString()};
    }

    /** The snapshot's lines of the given pools whose placeholders this night can fill. */
    static JSONArray billPool(JSONObject r, JSONObject lines, String[] keys) {
        JSONArray pool = new JSONArray();
        for (String k : keys) {
            JSONArray all = lines != null ? lines.optJSONArray(k) : null;
            for (int i = 0; all != null && i < all.length(); i++) {
                String l = all.optString(i);
                if (NightStats.usable(l, r)) pool.put(l);
            }
        }
        return pool;
    }

    private static void billPost(Context c, JSONObject r) {
        String[] t = billText(r, WidgetShared.state(c).optJSONObject("bill"), WidgetShared.en(c));
        String first = t[1].split("\n")[0];
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_REVIEW)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle((r.optInt("social") > 0 ? EMOJI_ANGRY : EMOJI_IMPRESSED) + " " + t[0])
            .setContentText(first)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(t[1]))
            .setAutoCancel(true);
        PendingIntent openApp = WidgetShared.openAppIntent(c, 7261);
        if (openApp != null) b.setContentIntent(openApp);
        post(c, ID_BILL, b);
    }

    static void maybeRoast(Context c) {
        JSONObject s = settings(c);
        if (!s.optBoolean("taunts", true) || !canNotify(c)) return;
        Calendar cal = Calendar.getInstance();
        int now = WidgetShared.nowMinute();
        if (cal.get(Calendar.DAY_OF_WEEK) != Calendar.SUNDAY || now < ROAST_MINUTE || now - ROAST_MINUTE > 120) return;
        SharedPreferences p = own(c);
        if (WidgetShared.today().equals(p.getString(KEY_LAST_ROAST, ""))) return;
        String roast = WidgetShared.state(c).optString("roast", "");
        p.edit().putString(KEY_LAST_ROAST, WidgetShared.today()).apply();
        if (roast.isEmpty()) return;
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_SZPILA)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle(EMOJI_NORMAL + WidgetShared.tr(c, " Szpila: podsumowanie tygodnia", " Szpila: weekly roast"))
            .setContentText(roast)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(roast))
            .setAutoCancel(true);
        PendingIntent open = WidgetShared.openAppIntent(c, 7300);
        if (open != null) b.setContentIntent(open);
        post(c, ID_ROAST, b);
    }

    // ------------------------------------------------------------------
    // Late-night screen time (avoid habits with source "screen")
    // ------------------------------------------------------------------

    static void checkLateScreen(Context c) {
        if (!ScreenTime.granted(c)) return;
        JSONArray rows = WidgetShared.habits(c);
        int now = WidgetShared.nowMinute();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject h = rows.optJSONObject(i);
            if (!WidgetShared.isAutoScreen(h)) continue;
            String id = h.optString("id");
            int after = h.optInt("lateAfter", 23 * 60 + 30);
            int limit = h.optInt("lateLimit", 15);

            // Tonight, before midnight (only when "late" starts before midnight, e.g. 23:30):
            // caught red-handed -> slip + jab right away.
            int eff = ScreenTime.effectiveAfter(after);
            if (eff < 24 * 60 && now >= eff && !"slip".equals(h.optString("status"))) {
                int m = lateUse(c, h, 0, after);
                if (m > limit) {
                    WidgetShared.edit(c, id, (row, date) -> {
                        row.put("status", "slip");
                        row.put("done", false);
                        return new JSONObject().put("status", "slip").put("auto", true);
                    });
                    lateJab(c, h, m, after, WidgetShared.today());
                }
            }

            // After midnight the habit day is yesterday: slip as soon as the limit
            // is crossed, clean once the window closes at 05:00.
            String yKey = WidgetShared.dateKey(1);
            if (wasEvaluated(c, id, yKey)) continue;
            int m = lateUse(c, h, 1, after);
            if (m < 0) continue;
            boolean closed = ScreenTime.windowClosed(1);
            if (m <= limit && !closed) continue;
            try {
                WidgetShared.queueOp(c, new JSONObject()
                    .put("habitId", id).put("date", yKey).put("status", m > limit ? "slip" : "clean").put("auto", true));
            } catch (Exception ignored) {
            }
            if (m > limit && !closed) lateJab(c, h, m, after, yKey);
            markEvaluated(c, id, yKey);
        }
    }

    /**
     * Judge by social media only (default) or by any screen time. With "social",
     * an alarm, music or a podcast with the screen on after midnight isn't a slip.
     */
    static boolean socialBasis(JSONObject h) {
        return !"screen".equals(h.optString("lateBasis", "social"));
    }

    private static int lateUse(Context c, JSONObject h, int daysAgo, int after) {
        return socialBasis(h) ? NightStats.socialMinutes(c, daysAgo, after) : ScreenTime.lateMinutes(c, daysAgo, after);
    }

    private static boolean wasEvaluated(Context c, String id, String date) {
        return own(c).getString(KEY_LATE_EVAL, "").contains("|" + id + "@" + date);
    }

    private static void markEvaluated(Context c, String id, String date) {
        String v = own(c).getString(KEY_LATE_EVAL, "") + "|" + id + "@" + date;
        if (v.length() > 600) v = v.substring(v.length() - 600); // keep it bounded
        own(c).edit().putString(KEY_LATE_EVAL, v).apply();
    }

    private static void lateJab(Context c, JSONObject h, int minutes, int after, String dateKey) {
        SharedPreferences p = own(c);
        String key = h.optString("id") + "@" + dateKey;
        if (key.equals(p.getString(KEY_LATE_JAB, "")) || !canNotify(c)) return;
        p.edit().putString(KEY_LATE_JAB, key).apply();
        String caught = WidgetShared.pick(h.optJSONArray("caught"));
        if (caught.isEmpty()) {
            caught = WidgetShared.tr(c, "Widzę cię. {m} min z telefonem po {after}. Wpadka zapisana.",
                "I see you. {m} min on the phone after {after}. Slip logged.");
        }
        String text = caught.replace("{m}", String.valueOf(minutes)).replace("{after}", WidgetShared.fmtMinute(after));
        postJab(c, text, null, true);
    }

    // ------------------------------------------------------------------
    // Scheduling
    // ------------------------------------------------------------------

    /** Arm one inexact alarm at the next full hour / jab slot / review / roast / screen check / midnight. */
    static void scheduleNext(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        JSONObject s = settings(c);
        Calendar now = Calendar.getInstance();
        int nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);

        int next = (nowMin / 60 + 1) * 60; // next full hour (1440 = midnight)
        List<Integer> candidates = new ArrayList<>();
        if (s.optBoolean("taunts", true)) for (int m : slots(s)) candidates.add(m);
        if (s.optBoolean("review", true)) candidates.add(s.optInt("reviewAt", 21 * 60 + 30));
        if (s.optBoolean("review", true)) candidates.add(wake(s) + 1);
        candidates.add(ROAST_MINUTE);
        JSONArray rows = WidgetShared.habits(c);
        for (int i = 0; i < rows.length(); i++) {
            JSONObject h = rows.optJSONObject(i);
            if (WidgetShared.isAutoScreen(h)) {
                candidates.add(h.optInt("lateAfter", 23 * 60 + 30) + h.optInt("lateLimit", 15) + 5);
                candidates.add(ScreenTime.NIGHT_END + 5);
            }
        }
        for (int m : candidates) if (m > nowMin && m < next) next = m;

        Calendar at = (Calendar) now.clone();
        at.set(Calendar.SECOND, 5);
        at.set(Calendar.MILLISECOND, 0);
        at.set(Calendar.HOUR_OF_DAY, 0);
        at.set(Calendar.MINUTE, 0);
        at.add(Calendar.MINUTE, next);

        Intent tick = new Intent(c, NotifierReceiver.class);
        tick.setAction(ACTION_TICK);
        PendingIntent pi = PendingIntent.getBroadcast(c, 7000, tick,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.getTimeInMillis(), pi);
        } catch (Exception ignored) {
        }
    }
}
