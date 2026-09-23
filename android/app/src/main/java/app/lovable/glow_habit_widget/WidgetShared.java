package app.lovable.glow_habit_widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;
import java.util.Random;

/**
 * Shared state + helpers for the home-screen widgets and native notifications.
 * The web app mirrors a snapshot into SharedPreferences ("CapacitorStorage" /
 * "widget_state", see src/lib/widget/bridge.ts); everything native reads it.
 * Taps update the snapshot and queue an absolute-state op the app reconciles
 * on next open.
 *
 * Row fields (v2): id, name, icon, colorHex, kind ("build"|"avoid"), goal
 * ("check"|"count"|"minutes"), amount, target, step, unit, units, status
 * (avoid: "clean"|"slip"|"pending"), done, start, end (planner window,
 * minutes of day), nag[] (Szpila lines), praise.
 */
final class WidgetShared {
    static final String PREFS = "CapacitorStorage";
    static final String STATE_KEY = "widget_state";
    static final String PENDING_KEY = "widget_pending";
    static final String ACTION_TOGGLE = "app.lovable.glow_habit_widget.TOGGLE";
    static final String EXTRA_HABIT_ID = "habitId";
    static final String EXTRA_DONE = "done";

    static final int ACCENT = 0xFF60E7B4;
    static final int AVOID = 0xFFFF4D5E;
    static final int TRACK = 0xFF2A2E3A;
    static final int TEXT = 0xFFF4F5F9;

    private static final Random RNG = new Random();

    private WidgetShared() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject state(Context c) {
        String json = prefs(c).getString(STATE_KEY, null);
        if (json == null) return new JSONObject();
        try {
            return new JSONObject(json);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static JSONArray habits(Context c) {
        JSONArray a = state(c).optJSONArray("habits");
        return a != null ? a : new JSONArray();
    }

    /** Today's date as YYYY-MM-DD in local time (matches the web app's keys). */
    static String today() {
        Calendar c = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d",
            c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static int nowMinute() {
        Calendar c = Calendar.getInstance();
        return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
    }

    // ------------------------------------------------------------------
    // Row helpers
    // ------------------------------------------------------------------

    static boolean isAvoid(JSONObject h) {
        return "avoid".equals(h.optString("kind"));
    }

    /** Avoid habit judged automatically from late-night screen time (ScreenTime). */
    static boolean isAutoScreen(JSONObject h) {
        return isAvoid(h) && "screen".equals(h.optString("source"));
    }

    /** v1 snapshots only had "done"; v2 rows carry amount/target/status. */
    static boolean isV2(JSONObject h) {
        return h.has("target");
    }

    static int amount(JSONObject h) {
        return h.optInt("amount", h.optBoolean("done") ? 1 : 0);
    }

    static int target(JSONObject h) {
        return Math.max(1, h.optInt("target", 1));
    }

    static int step(JSONObject h) {
        return Math.max(1, h.optInt("step", 1));
    }

    static boolean isDone(JSONObject h) {
        if (!isV2(h)) return h.optBoolean("done");
        // Screen-judged avoid habits count as fine today until the screen time says otherwise.
        if (isAutoScreen(h)) return !"slip".equals(h.optString("status"));
        if (isAvoid(h)) return "clean".equals(h.optString("status"));
        return amount(h) >= target(h);
    }

    static boolean isPending(JSONObject h) {
        if (isAutoScreen(h)) return false;
        if (isAvoid(h)) return "pending".equals(h.optString("status", "pending")) || h.optString("status").isEmpty();
        return !isDone(h);
    }

    static float fraction(JSONObject h) {
        if (isAvoid(h)) return isDone(h) ? 1f : 0f;
        return Math.min(1f, amount(h) / (float) target(h));
    }

    static int color(JSONObject h) {
        try {
            return Color.parseColor(h.optString("colorHex", "#59e0ad"));
        } catch (Exception e) {
            return ACCENT;
        }
    }

    static String unit(JSONObject h) {
        return h.optString("unit", "");
    }

    /** Declined unit for `n` ("1 szklanka", "3 szklanki", "5 szklanek"); falls back to "unit". */
    static String unit(JSONObject h, int n) {
        JSONArray f = h.optJSONArray("unitForms");
        if (f == null || f.length() < 3) return unit(h);
        int a = Math.abs(n), d = a % 10, dd = a % 100;
        if (a == 1) return f.optString(0);
        if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return f.optString(1);
        return f.optString(2);
    }

    /** "3/8 szklanek", "" for single checks and avoid habits. */
    static String amountText(JSONObject h) {
        if (!isV2(h) || isAvoid(h) || "check".equals(h.optString("goal"))) return "";
        return amount(h) + "/" + target(h) + " " + unit(h, target(h));
    }

    static String leftText(JSONObject h) {
        int left = Math.max(0, target(h) - amount(h));
        return (left + " " + unit(h, left)).trim();
    }

    /** Resolve {done}/{left}/{target} (see fill() in src/lib/habits/szpila.ts). */
    static String fill(String line, JSONObject h) {
        return line
            .replace("{done}", String.valueOf(amount(h)))
            .replace("{target}", String.valueOf(target(h)))
            .replace("{left}", leftText(h));
    }

    static String fmtMinute(int m) {
        return String.format(Locale.US, "%02d:%02d", (m / 60) % 24, m % 60);
    }

    // ------------------------------------------------------------------
    // Planner - mirrors nextUnitMinute() / rankKey() in src/lib/habits/utils.ts
    // ------------------------------------------------------------------

    static int nextMinute(JSONObject h) {
        int start = h.optInt("start", 12 * 60);
        if (isAvoid(h)) return start;
        return nextMinute(start, h.optInt("end", start), Math.max(1, h.optInt("units", 1)),
            amount(h) / step(h), nowMinute());
    }

    /**
     * When the next unit of a goal is due: units spread evenly over [start, end];
     * when behind, the latest slot that already passed. Pure - see
     * tests/planner-vectors.json (shared with nextUnitMinute() in utils.ts).
     */
    static int nextMinute(int start, int end, int units, int doneUnits, int now) {
        if (units <= 1 || end <= start) return start;
        int i = Math.min(doneUnits, units - 1);
        while (i < units - 1 && unitAt(start, end, units, i + 1) <= now) i++;
        return unitAt(start, end, units, i);
    }

    private static int unitAt(int start, int end, int units, int i) {
        return (int) Math.round(start + ((end - start) * (double) i) / (units - 1));
    }

    static double rankKey(int due, int now, boolean avoid, boolean multi) {
        int d = due - now;
        if (avoid && d > 30) return 10000 + d;
        if (d < -240 && !multi) return 60 + -d / 1000.0;
        if (d <= 0) return d / 1000.0 - 1;
        return d;
    }

    static double rankKey(JSONObject h, int now) {
        return rankKey(nextMinute(h), now, isAvoid(h), !isAvoid(h) && h.optInt("units", 1) > 1);
    }

    /** Pending rows sorted by what to do next. */
    static java.util.List<JSONObject> plan(Context c) {
        java.util.List<JSONObject> out = new java.util.ArrayList<>();
        JSONArray a = habits(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject h = a.optJSONObject(i);
            if (h != null && isPending(h)) out.add(h);
        }
        final int now = nowMinute();
        java.util.Collections.sort(out, (x, y) -> Double.compare(rankKey(x, now), rankKey(y, now)));
        return out;
    }

    /** "teraz", "za 20 min", "o 17:30", "zaległe od 13:00". */
    static String whenLabel(JSONObject h) {
        int at = nextMinute(h);
        int d = at - nowMinute();
        if (d <= 0 && d > -30) return "teraz";
        if (d <= -30) return "zaległe od " + fmtMinute(at);
        if (d < 60) return "za " + d + " min";
        return "o " + fmtMinute(at);
    }

    static String pick(JSONArray arr) {
        if (arr == null || arr.length() == 0) return "";
        return arr.optString(RNG.nextInt(arr.length()), "");
    }

    // ------------------------------------------------------------------
    // Snapshot mutations
    // ------------------------------------------------------------------

    /**
     * If the mirrored snapshot is from a previous day, reset it for today:
     * clear amounts, "done" flags and avoid confirmations, and stamp today's
     * date. This makes the widgets show a fresh day at midnight even if the app
     * hasn't been opened. The app republishes the correct due-list on next open.
     * Pending taps are left untouched (they carry their own date).
     */
    static void normalizeIfStale(Context c) {
        SharedPreferences p = prefs(c);
        String json = p.getString(STATE_KEY, null);
        if (json == null) return;
        try {
            JSONObject o = new JSONObject(json);
            if (today().equals(o.optString("date", ""))) return;
            o.put("date", today());
            JSONArray habits = o.optJSONArray("habits");
            if (habits != null) {
                for (int i = 0; i < habits.length(); i++) {
                    JSONObject h = habits.getJSONObject(i);
                    h.put("done", false);
                    h.put("amount", 0);
                    if (isAvoid(h)) h.put("status", "pending");
                }
            }
            o.put("doneCount", 0);
            o.put("fraction", 0);
            p.edit().putString(STATE_KEY, o.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    static int doneCount(Context c) {
        JSONArray h = habits(c);
        int d = 0;
        for (int i = 0; i < h.length(); i++) {
            if (isDone(h.optJSONObject(i))) d++;
        }
        return d;
    }

    static String userName(Context c) {
        return state(c).optString("userName", "");
    }

    /** "5h 23m do końca dnia"; computed natively so it's always current. */
    static String timeLeft() {
        Calendar now = Calendar.getInstance();
        Calendar eod = (Calendar) now.clone();
        eod.set(Calendar.HOUR_OF_DAY, 23);
        eod.set(Calendar.MINUTE, 59);
        eod.set(Calendar.SECOND, 59);
        long ms = eod.getTimeInMillis() - now.getTimeInMillis();
        if (ms < 0) ms = 0;
        long h = ms / 3600000L;
        long m = (ms % 3600000L) / 60000L;
        if (h > 0) return h + " h " + m + " min do końca dnia";
        return m + " min do końca dnia";
    }

    /** Edits matching rows; returns the op to queue for the app, or null to skip that row. */
    interface RowEdit {
        JSONObject apply(JSONObject row, String date) throws Exception;
    }

    /**
     * Applies `edit` to every row (or just `habitId` when non-null), saves the
     * snapshot and queues the returned absolute-state ops for the app
     * (reconciled by src/lib/widget/bridge.ts). Synchronized: taps, alarm
     * ticks and notification actions can race on background threads.
     */
    static synchronized boolean edit(Context context, String habitId, RowEdit edit) {
        // A tap on a new day should act on today, not yesterday's snapshot.
        normalizeIfStale(context);
        SharedPreferences p = prefs(context);
        try {
            String json = p.getString(STATE_KEY, null);
            if (json == null) return false;
            JSONObject o = new JSONObject(json);
            String date = o.optString("date", "");
            JSONArray habits = o.optJSONArray("habits");
            if (habits == null) return false;
            JSONArray ops = new JSONArray();
            int done = 0;
            for (int i = 0; i < habits.length(); i++) {
                JSONObject h = habits.getJSONObject(i);
                if (habitId == null || habitId.equals(h.optString("id"))) {
                    JSONObject op = edit.apply(h, date);
                    if (op != null) {
                        op.put("habitId", h.optString("id"));
                        op.put("date", date);
                        op.put("minute", nowMinute());
                        ops.put(op);
                    }
                }
                if (isDone(h)) done++;
            }
            if (ops.length() == 0) return false;
            o.put("doneCount", done);
            o.put("total", habits.length());
            JSONArray pending;
            try {
                pending = new JSONArray(p.getString(PENDING_KEY, "[]"));
            } catch (Exception e) {
                pending = new JSONArray();
            }
            for (int i = 0; i < ops.length(); i++) pending.put(ops.get(i));
            p.edit().putString(STATE_KEY, o.toString()).putString(PENDING_KEY, pending.toString()).commit();
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * Widget tap from a BroadcastReceiver: runs off the main thread (a Health
     * Connect step sync is IPC) while `pending` keeps the receiver alive.
     */
    static void tapInBackground(android.content.BroadcastReceiver.PendingResult pending, Context context,
                                String habitId, boolean forwardOnly) {
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                if (habitId != null) applyTap(app, habitId, forwardOnly);
                updateAll(app);
            } finally {
                pending.finish();
            }
        }, "loop-widget-tap").start();
    }

    static void applyTap(Context context, String habitId) {
        applyTap(context, habitId, false);
    }

    /**
     * One tap on a widget/notification. Build habits add one step toward the
     * goal (a finished habit resets to 0, same as the in-app toggle); habits
     * fed by Health Connect re-sync instead. Avoid habits flip between "clean"
     * and unconfirmed.
     *
     * @param forwardOnly never undo: a finished habit stays finished (used by the
     *                    1x1 widget and notification buttons, which only ever
     *                    show pending items but may be tapped on a stale render).
     */
    static void applyTap(Context context, String habitId, boolean forwardOnly) {
        JSONObject row = row(context, habitId);
        if (row != null && "steps".equals(row.optString("source")) && HealthSteps.available(context)
                && syncSteps(context)) {
            return;
        }
        edit(context, habitId, (h, date) -> {
            if (forwardOnly && isDone(h)) return null;
            JSONObject op = new JSONObject();
            if (!isV2(h)) {
                boolean nd = !h.optBoolean("done");
                h.put("done", nd);
                op.put("done", nd);
            } else if (isAvoid(h)) {
                boolean clean = !"clean".equals(h.optString("status"));
                h.put("status", clean ? "clean" : "pending");
                h.put("done", clean);
                op.put("status", clean ? "clean" : JSONObject.NULL);
            } else {
                int a = amount(h) >= target(h) ? 0 : Math.min(target(h), amount(h) + step(h));
                h.put("amount", a);
                h.put("done", a >= target(h));
                op.put("amount", a);
            }
            return op;
        });
    }

    /** Owns up to a slip on an avoid habit (notification "Była wpadka" button). */
    static void applySlip(Context context, String habitId) {
        edit(context, habitId, (h, date) -> {
            if (!isAvoid(h)) return null;
            h.put("status", "slip");
            h.put("done", false);
            return new JSONObject().put("status", "slip");
        });
    }

    /** Evening review "Wszystko czysto": confirms every still-pending avoid habit. */
    static void confirmAllClean(Context context) {
        edit(context, null, (h, date) -> {
            if (!isAvoid(h) || !isPending(h)) return null;
            h.put("status", "clean");
            h.put("done", true);
            return new JSONObject().put("status", "clean");
        });
    }

    /** Pulls today's steps from Health Connect into habits with source "steps". */
    static boolean syncSteps(Context context) {
        boolean any = false;
        JSONArray a = habits(context);
        for (int i = 0; i < a.length(); i++) {
            if ("steps".equals(a.optJSONObject(i).optString("source"))) any = true;
        }
        if (!any) return false;
        long steps = HealthSteps.today(context);
        if (steps < 0) return false;
        final int value = (int) Math.min(Integer.MAX_VALUE, steps);
        edit(context, null, (h, date) -> {
            if (!"steps".equals(h.optString("source")) || amount(h) == value) return null;
            h.put("amount", value);
            h.put("done", value >= target(h));
            return new JSONObject().put("amount", value);
        });
        return true;
    }

    /** Queues an op for a date that's no longer in the snapshot (e.g. last night's screen time). */
    static synchronized void queueOp(Context context, JSONObject op) {
        SharedPreferences p = prefs(context);
        try {
            JSONArray pending;
            try {
                pending = new JSONArray(p.getString(PENDING_KEY, "[]"));
            } catch (Exception e) {
                pending = new JSONArray();
            }
            if (!op.has("minute")) op.put("minute", nowMinute());
            pending.put(op);
            p.edit().putString(PENDING_KEY, pending.toString()).commit();
        } catch (Exception ignored) {
        }
    }

    static String dateKey(int daysAgo) {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, -daysAgo);
        return String.format(Locale.US, "%04d-%02d-%02d",
            c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static JSONObject row(Context context, String habitId) {
        JSONArray a = habits(context);
        for (int i = 0; i < a.length(); i++) {
            JSONObject h = a.optJSONObject(i);
            if (h != null && habitId.equals(h.optString("id"))) return h;
        }
        return null;
    }

    /** Legacy entry point used by older PendingIntents still sitting on a launcher. */
    static void applyToggle(Context context, String habitId, boolean newDone) {
        applyTap(context, habitId);
    }

    // ------------------------------------------------------------------
    // Rendering helpers
    // ------------------------------------------------------------------

    /** Resolves a lucide icon name (e.g. "BookOpen") to ic_habit_book_open. */
    static int iconRes(Context c, String iconName) {
        String snake = pascalToSnake(iconName);
        int id = c.getResources().getIdentifier("ic_habit_" + snake, "drawable", c.getPackageName());
        if (id == 0) {
            id = c.getResources().getIdentifier("ic_habit_default", "drawable", c.getPackageName());
        }
        return id;
    }

    private static String pascalToSnake(String s) {
        if (s == null || s.isEmpty()) return "default";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (Character.isUpperCase(ch)) {
                if (i > 0) b.append('_');
                b.append(Character.toLowerCase(ch));
            } else {
                b.append(ch);
            }
        }
        return b.toString();
    }

    static int dp(Context c, float v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    /** Draws a circular progress ring with the "done/total" count in the centre. */
    static Bitmap progressRing(Context c, int done, int total) {
        int size = dp(c, 60);
        Bitmap bmp = ring(c, 60, 6, total > 0 ? done / (float) total : 0, ACCENT, false);
        Canvas canvas = new Canvas(bmp);
        Paint txt = new Paint(Paint.ANTI_ALIAS_FLAG);
        txt.setColor(TEXT);
        txt.setTextAlign(Paint.Align.CENTER);
        txt.setFakeBoldText(true);
        txt.setTextSize(dp(c, 15));
        float ty = size / 2f - (txt.descent() + txt.ascent()) / 2f;
        canvas.drawText(done + "/" + total, size / 2f, ty, txt);
        return bmp;
    }

    /** Plain ring bitmap. `dashed` draws a dotted track (unconfirmed avoid habit). */
    static Bitmap ring(Context c, int sizeDp, int strokeDp, float fraction, int color, boolean dashed) {
        int size = dp(c, sizeDp);
        float stroke = dp(c, strokeDp);
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        float pad = stroke / 2f + dp(c, 1);
        RectF r = new RectF(pad, pad, size - pad, size - pad);

        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(stroke);
        track.setColor(dashed ? (0x66000000 | (color & 0xFFFFFF)) : TRACK);
        if (dashed) {
            track.setPathEffect(new android.graphics.DashPathEffect(new float[]{dp(c, 3), dp(c, 4)}, 0));
        }
        canvas.drawArc(r, 0, 360, false, track);

        Paint prog = new Paint(Paint.ANTI_ALIAS_FLAG);
        prog.setStyle(Paint.Style.STROKE);
        prog.setStrokeWidth(stroke);
        prog.setStrokeCap(Paint.Cap.ROUND);
        prog.setColor(color);
        float sweep = 360f * Math.max(0f, Math.min(1f, fraction));
        if (sweep > 0) canvas.drawArc(r, -90, sweep, false, prog);
        return bmp;
    }

    static PendingIntent openAppIntent(Context context, int requestCode) {
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open == null) return null;
        return PendingIntent.getActivity(
            context, requestCode, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Refreshes every widget instance and the native notifications. */
    static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        for (int id : mgr.getAppWidgetIds(new ComponentName(context, HabitWidgetProvider.class))) {
            HabitWidgetProvider.updateWidget(context, mgr, id);
        }
        for (int id : mgr.getAppWidgetIds(new ComponentName(context, HabitWidget2Provider.class))) {
            HabitWidget2Provider.updateWidget(context, mgr, id);
        }
        for (int id : mgr.getAppWidgetIds(new ComponentName(context, NextTaskWidgetProvider.class))) {
            NextTaskWidgetProvider.updateWidget(context, mgr, id);
        }
        HabitNotifier.refresh(context);
    }
}
