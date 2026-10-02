package app.lovable.glow_habit_widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Aesthetic icon widget: a progress ring, time left in the day, and a fixed grid
 * of habit icon chips (tap opens the hold-to-complete overlay). Uses direct per-cell PendingIntents (no
 * collection) so taps deliver reliably. Shows up to {@link #MAX_CELLS} habits.
 */
public class HabitWidget2Provider extends AppWidgetProvider {
    private static final int MAX_CELLS = 8;

    private static final int[] ROOT = {
        R.id.cell0_root, R.id.cell1_root, R.id.cell2_root, R.id.cell3_root,
        R.id.cell4_root, R.id.cell5_root, R.id.cell6_root, R.id.cell7_root,
    };
    private static final int[] BG = {
        R.id.cell0_bg, R.id.cell1_bg, R.id.cell2_bg, R.id.cell3_bg,
        R.id.cell4_bg, R.id.cell5_bg, R.id.cell6_bg, R.id.cell7_bg,
    };
    private static final int[] ICON = {
        R.id.cell0_icon, R.id.cell1_icon, R.id.cell2_icon, R.id.cell3_icon,
        R.id.cell4_icon, R.id.cell5_icon, R.id.cell6_icon, R.id.cell7_icon,
    };
    private static final int[] NAME = {
        R.id.cell0_name, R.id.cell1_name, R.id.cell2_name, R.id.cell3_name,
        R.id.cell4_name, R.id.cell5_name, R.id.cell6_name, R.id.cell7_name,
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(context, mgr, id);
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        WidgetPrefs.delete(context, ids);
    }

    static void updateWidget(Context context, AppWidgetManager mgr, int widgetId) {
        WidgetShared.normalizeIfStale(context);
        mgr.updateAppWidget(widgetId, build(context, widgetId, WidgetPrefs.opacity(context, widgetId),
            WidgetTheme.forWidget(context, widgetId)));
    }

    /** The widget's views with the given opacity and palette (also the WidgetConfigActivity preview). */
    static RemoteViews build(Context context, int widgetId, int opacity, WidgetTheme theme) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget2_root);
        theme.background(rv, opacity);
        rv.setTextColor(R.id.widget2_title, theme.text);
        rv.setTextColor(R.id.widget2_timeleft, theme.accent);
        rv.setTextColor(R.id.widget2_empty, theme.muted);

        JSONArray habits = WidgetShared.widgetHabits(context);
        int total = WidgetShared.widgetTotal(context);
        int done = WidgetShared.widgetDone(context);
        int n = Math.min(habits.length(), MAX_CELLS); // every row gets a cell; `total` only drives the ring

        rv.setImageViewBitmap(R.id.widget2_ring, WidgetShared.progressRing(context, done, total, theme));
        boolean en = WidgetShared.en(context);
        rv.setTextViewText(R.id.widget2_title, total > 0 ? (en ? "Today" : "Dziś") : "Loop");
        rv.setTextViewText(R.id.widget2_timeleft, total > 0 ? WidgetShared.timeLeft(en) : "");
        rv.setTextViewText(R.id.widget2_empty, en ? "No habits for today" : "Brak zadań na dziś");

        PendingIntent openPi = WidgetShared.openAppIntent(context, 1);
        if (openPi != null) rv.setOnClickPendingIntent(R.id.widget2_header, openPi);

        for (int i = 0; i < MAX_CELLS; i++) {
            if (i < n) {
                JSONObject h = habits.optJSONObject(i);
                bindCell(context, rv, i, h, widgetId, theme);
                rv.setViewVisibility(ROOT[i], View.VISIBLE);
            } else {
                rv.setViewVisibility(ROOT[i], View.INVISIBLE);
            }
        }
        rv.setViewVisibility(R.id.widget2_row1, n > 0 ? View.VISIBLE : View.GONE);
        rv.setViewVisibility(R.id.widget2_row2, n > 4 ? View.VISIBLE : View.GONE);
        rv.setViewVisibility(R.id.widget2_empty, n == 0 ? View.VISIBLE : View.GONE);
        return rv;
    }

    private static void bindCell(Context context, RemoteViews rv, int i, JSONObject h, int widgetId,
                                 WidgetTheme theme) {
        String id = h.optString("id");
        String name = h.optString("name", "");
        boolean done = WidgetShared.isDone(h);
        float frac = WidgetShared.fraction(h);
        int color = theme.habit(WidgetShared.color(h));
        String amount = WidgetShared.amountText(h);

        rv.setImageViewResource(ICON[i], WidgetShared.iconRes(context, h.optString("icon", "")));
        if (done) {
            rv.setInt(BG[i], "setColorFilter", 0xFF000000 | (color & 0xFFFFFF));
            rv.setInt(ICON[i], "setColorFilter", theme.onFill);
        } else {
            // Partial progress deepens the chip tint: 25% idle -> ~60% almost done.
            int alpha = 0x40 + Math.round(frac * 0x60);
            rv.setInt(BG[i], "setColorFilter", (alpha << 24) | (color & 0xFFFFFF));
            rv.setInt(ICON[i], "setColorFilter", color);
        }
        // Mid-way count goals show their progress ("3/8 szklanek") instead of the name.
        rv.setTextViewText(NAME[i], !done && frac > 0 && !amount.isEmpty() ? amount : name);
        rv.setInt(NAME[i], "setTextColor", done ? theme.text : theme.muted);

        // A tap opens the hold-to-complete overlay; nothing is logged until the ring is held.
        Intent t = HoldActivity.intent(context, id, false, "w2/" + widgetId + "/" + id);
        PendingIntent pi = PendingIntent.getActivity(
            context, 100 + i, t,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(ROOT[i], pi);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (WidgetShared.ACTION_TOGGLE.equals(action)) {
            WidgetShared.tapInBackground(goAsync(), context, intent.getStringExtra(WidgetShared.EXTRA_HABIT_ID), false);
        } else if (Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            // New day (or clock change): reset the snapshot and re-render.
            WidgetShared.normalizeIfStale(context);
            WidgetShared.updateAll(context);
        }
    }
}
