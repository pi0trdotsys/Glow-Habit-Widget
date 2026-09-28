package app.lovable.glow_habit_widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * "Następne zadanie" widget. Shows the planner's pick for right now (see
 * WidgetShared.plan - same ranking as planDay() in the web app): overdue
 * items first, count goals spread over their window (e.g. water every
 * ~1.5h), forbidden-habit confirmations only near their time. Tapping the
 * ring opens the hold-to-complete overlay (HoldActivity) - holding it logs one
 * step; tapping the text opens the app. Re-ranked on every update, including
 * the 30-min system tick and HabitNotifier's hourly alarm.
 *
 * 1x1 uses widget3_root; from ~110dp wide it's widget3_wide: name + status
 * next to the ring and Szpila with a rotating line (tap the cat for the next
 * one) or the guard's banner. What to show is decided in NextWidgetContent.
 */
public class NextTaskWidgetProvider extends AppWidgetProvider {
    static final String ACTION_TICKER = "app.lovable.glow_habit_widget.NEXT_TICKER";
    private static final String PREFS = "loop_next_widget";
    /** Width (dp) from which the wide layout is used. */
    static final int WIDE_MIN_DP = 110;

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(context, mgr, id);
        HabitNotifier.scheduleNext(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr, int widgetId, Bundle newOptions) {
        updateWidget(context, mgr, widgetId);
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        WidgetPrefs.delete(context, ids);
    }

    static void updateWidget(Context context, AppWidgetManager mgr, int widgetId) {
        WidgetShared.normalizeIfStale(context);
        NextWidgetContent.Content content = content(context, WidgetPrefs.lines(context, widgetId));
        int opacity = WidgetPrefs.opacity(context, widgetId);

        RemoteViews small = render(context, content, widgetId, false, opacity);
        RemoteViews rv;
        if (Build.VERSION.SDK_INT >= 31) {
            Map<SizeF, RemoteViews> bySize = new HashMap<>();
            bySize.put(new SizeF(40f, 40f), small);
            bySize.put(new SizeF(WIDE_MIN_DP, 40f), render(context, content, widgetId, true, opacity));
            rv = new RemoteViews(bySize);
        } else {
            rv = isWide(mgr, widgetId) ? render(context, content, widgetId, true, opacity) : small;
        }
        mgr.updateAppWidget(widgetId, rv);
    }

    /** What the widget shows with these ticker lines on (WidgetPrefs; null = all). */
    static NextWidgetContent.Content content(Context context, java.util.Set<String> lines) {
        NextWidgetContent.Inputs in = inputs(context);
        in.lines = lines;
        return NextWidgetContent.build(in);
    }

    /** Before Android 12: the launcher's reported width (portrait = min width). */
    private static boolean isWide(AppWidgetManager mgr, int widgetId) {
        try {
            Bundle o = mgr.getAppWidgetOptions(widgetId);
            return o != null && o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) >= WIDE_MIN_DP;
        } catch (Exception e) {
            return false;
        }
    }

    /** Gathers the snapshot, planner and guard state for NextWidgetContent. */
    static NextWidgetContent.Inputs inputs(Context c) {
        NextWidgetContent.Inputs in = new NextWidgetContent.Inputs();
        JSONObject state = WidgetShared.state(c);
        in.en = WidgetShared.en(c);
        in.now = WidgetShared.nowMinute();
        in.plan = WidgetShared.plan(c);
        in.total = WidgetShared.habits(c).length();
        in.counted = WidgetShared.countedTotal(c);
        in.done = WidgetShared.doneCount(c);
        JSONObject forma = state.optJSONObject("forma");
        if (forma != null) {
            in.formaCurrent = forma.optInt("current", 0);
            in.formaBest = forma.optInt("best", 0);
        }
        in.cond = state.optString("cat", "normal");
        in.allDoneLines = state.optJSONArray("allDone");
        in.taps = prefs(c).getInt("taps", 0);
        try {
            DayGuard.Config cfg = DayGuard.config(c);
            List<JSONObject> morning = cfg.morning ? DayGuard.morningPending(c) : new java.util.ArrayList<>();
            in.morningPending = morning;
            int phase = DayGuard.phase(in.now, cfg, !morning.isEmpty());
            NextWidgetContent.guard(in, phase, morning.size(), cfg.day, DayGuard.usedMin(c), DayGuard.limit(c),
                cfg.night, LiveGuard.bedtimeOn(c), cfg.nightStart, LiveGuard.from(c), cfg.nightEnd);
        } catch (Exception ignored) {
            // guard state unreadable - just the planner
        }
        return in;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** One size of the widget (also the WidgetConfigActivity preview). */
    static RemoteViews render(Context context, NextWidgetContent.Content content, int widgetId, boolean wide,
                              int opacity) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), wide ? R.layout.widget3_wide : R.layout.widget3_root);
        WidgetPrefs.applyOpacity(rv, opacity);
        JSONObject h = content.main;

        PendingIntent openPi = WidgetShared.openAppIntent(context, 3);
        if (openPi != null) {
            rv.setOnClickPendingIntent(R.id.next_text, openPi);
            rv.setOnClickPendingIntent(R.id.next_root, openPi);
        }

        int color = h != null ? WidgetShared.color(h) : content.ringColor;
        rv.setImageViewBitmap(R.id.next_ring,
            WidgetShared.ring(context, wide ? 38 : 48, wide ? 4 : 5, content.ringFraction, color, content.ringDashed));
        rv.setImageViewResource(R.id.next_icon,
            WidgetShared.iconRes(context, h != null ? h.optString("icon", "") : content.icon));
        rv.setInt(R.id.next_icon, "setColorFilter", color);

        String name = !wide && content.smallName != null ? content.smallName : content.name;
        rv.setTextViewText(R.id.next_name, name);
        rv.setTextViewText(R.id.next_sub, wide ? content.status : content.smallSub);
        rv.setTextColor(R.id.next_sub, wide ? content.statusColor : content.smallSubColor);

        if (h != null) {
            // A tap opens the hold-to-complete overlay; nothing is logged until the ring is held.
            Intent t = HoldActivity.intent(context, h.optString("id"), true, "next/" + widgetId + "/" + h.optString("id"));
            PendingIntent pi = PendingIntent.getActivity(
                context, 300 + widgetId % 1000, t,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            rv.setOnClickPendingIntent(R.id.next_ring_box, pi);
        } else if (openPi != null) {
            rv.setOnClickPendingIntent(R.id.next_ring_box, openPi);
        }

        if (wide) {
            JSONObject state = WidgetShared.state(context);
            rv.setImageViewResource(R.id.next_cat, SzpilaWidgetProvider.catDrawable(state.optString("face"), content.mood));
            int condRes = SzpilaWidgetProvider.condDrawable(state.optString("cat", "normal"));
            if (condRes != 0) {
                rv.setImageViewResource(R.id.next_cond, condRes);
                rv.setViewVisibility(R.id.next_cond, View.VISIBLE);
            } else {
                rv.setViewVisibility(R.id.next_cond, View.GONE);
            }
            NextWidgetContent.Line line = content.line;
            rv.setTextViewText(R.id.next_ticker, line != null ? line.text : "");
            rv.setTextColor(R.id.next_ticker, line != null ? line.color : NextWidgetContent.C_MUTED);

            Intent tick = new Intent(context, NextTaskWidgetProvider.class);
            tick.setAction(ACTION_TICKER);
            PendingIntent tickPi = PendingIntent.getBroadcast(context, 310, tick,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            rv.setOnClickPendingIntent(R.id.next_cat_row, tickPi);
            rv.setOnClickPendingIntent(R.id.next_cat_box, tickPi);
        }
        return rv;
    }

    /** Re-renders just this widget's instances (a ticker tap doesn't touch anything else). */
    private static void updateMine(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        for (int id : mgr.getAppWidgetIds(new ComponentName(context, NextTaskWidgetProvider.class))) {
            updateWidget(context, mgr, id);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (ACTION_TICKER.equals(action)) {
            SharedPreferences p = prefs(context);
            p.edit().putInt("taps", (p.getInt("taps", 0) + 1) % 100_000).apply();
            updateMine(context);
        } else if (WidgetShared.ACTION_TOGGLE.equals(action)) {
            WidgetShared.tapInBackground(goAsync(), context, intent.getStringExtra(WidgetShared.EXTRA_HABIT_ID), true);
        } else if (Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            WidgetShared.normalizeIfStale(context);
            WidgetShared.updateAll(context);
        }
    }
}
