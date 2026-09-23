package app.lovable.glow_habit_widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.List;

/**
 * 1x1 "Następne zadanie" widget. Shows the planner's pick for right now (see
 * WidgetShared.plan - same ranking as planDay() in the web app): overdue
 * items first, count goals spread over their window (e.g. water every
 * ~1.5h), forbidden-habit confirmations only near their time. Tapping the
 * ring opens the hold-to-complete overlay (HoldActivity) - holding it logs one
 * step; tapping the text opens the app. Re-ranked on every update, including
 * the 30-min system tick and HabitNotifier's hourly alarm.
 */
public class NextTaskWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(context, mgr, id);
        HabitNotifier.scheduleNext(context);
    }

    static void updateWidget(Context context, AppWidgetManager mgr, int widgetId) {
        WidgetShared.normalizeIfStale(context);
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget3_root);
        List<JSONObject> plan = WidgetShared.plan(context);
        int total = WidgetShared.habits(context).length();

        PendingIntent openPi = WidgetShared.openAppIntent(context, 3);
        if (openPi != null) {
            rv.setOnClickPendingIntent(R.id.next_text, openPi);
            rv.setOnClickPendingIntent(R.id.next_root, openPi);
        }

        if (plan.isEmpty()) {
            // All done (or nothing scheduled): full ring + check.
            rv.setImageViewBitmap(R.id.next_ring,
                WidgetShared.ring(context, 48, 5, total > 0 ? 1f : 0f, WidgetShared.ACCENT, false));
            rv.setImageViewResource(R.id.next_icon, WidgetShared.iconRes(context, total > 0 ? "Trophy" : "Sparkles"));
            rv.setInt(R.id.next_icon, "setColorFilter", WidgetShared.ACCENT);
            rv.setTextViewText(R.id.next_name, total > 0 ? "Komplet!" : "Loop");
            rv.setTextViewText(R.id.next_sub, total > 0 ? "wszystko zrobione" : "dodaj zadania");
            rv.setTextColor(R.id.next_sub, WidgetShared.ACCENT);
            if (openPi != null) rv.setOnClickPendingIntent(R.id.next_ring_box, openPi);
            mgr.updateAppWidget(widgetId, rv);
            return;
        }

        JSONObject h = plan.get(0);
        boolean avoid = WidgetShared.isAvoid(h);
        int color = WidgetShared.color(h);
        rv.setImageViewBitmap(R.id.next_ring,
            WidgetShared.ring(context, 48, 5, WidgetShared.fraction(h), color, avoid));
        rv.setImageViewResource(R.id.next_icon, WidgetShared.iconRes(context, h.optString("icon", "")));
        rv.setInt(R.id.next_icon, "setColorFilter", color);
        rv.setTextViewText(R.id.next_name, h.optString("name", ""));

        String amount = WidgetShared.amountText(h);
        String when = WidgetShared.whenLabel(h);
        String sub = avoid ? "potwierdź · " + when : amount.isEmpty() ? when : amount;
        rv.setTextViewText(R.id.next_sub, sub);
        boolean overdue = when.startsWith("zaległe") || when.equals("teraz");
        rv.setTextColor(R.id.next_sub, avoid || overdue ? WidgetShared.AVOID : WidgetShared.ACCENT);

        // A tap opens the hold-to-complete overlay; nothing is logged until the ring is held.
        Intent t = HoldActivity.intent(context, h.optString("id"), true, "next/" + widgetId + "/" + h.optString("id"));
        PendingIntent pi = PendingIntent.getActivity(
            context, 300 + widgetId % 1000, t,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(R.id.next_ring_box, pi);

        mgr.updateAppWidget(widgetId, rv);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (WidgetShared.ACTION_TOGGLE.equals(action)) {
            WidgetShared.tapInBackground(goAsync(), context, intent.getStringExtra(WidgetShared.EXTRA_HABIT_ID), true);
        } else if (Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            WidgetShared.normalizeIfStale(context);
            WidgetShared.updateAll(context);
        }
    }
}
