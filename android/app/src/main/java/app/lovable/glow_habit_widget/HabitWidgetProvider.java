package app.lovable.glow_habit_widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Simple list widget: today's habits + progress count. Reads the snapshot the
 * web app mirrors into SharedPreferences (see {@link WidgetShared}); tapping a
 * row toggles the habit.
 */
public class HabitWidgetProvider extends AppWidgetProvider {

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
        RemoteViews rv = build(context, widgetId, WidgetPrefs.opacity(context, widgetId),
            WidgetTheme.forWidget(context, widgetId), false);
        mgr.updateAppWidget(widgetId, rv);
        mgr.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_list);
        // The host caches non-collection views on a full update that re-binds the
        // adapter; a partial update reliably refreshes the header text.
        RemoteViews head = new RemoteViews(context.getPackageName(), R.layout.widget_root);
        head.setTextViewText(R.id.widget_title, headerTitle(context));
        head.setTextViewText(R.id.widget_subtitle, headerSubtitle(context));
        mgr.partiallyUpdateAppWidget(widgetId, head);
    }

    /**
     * The widget's views. `preview` (WidgetConfigActivity) leaves out the list
     * adapter - a RemoteViewsService can't be bound outside a widget host - and
     * shows the first habit names in the empty view instead.
     */
    static RemoteViews build(Context context, int widgetId, int opacity, WidgetTheme theme, boolean preview) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_root);
        theme.background(rv, opacity);
        rv.setTextColor(R.id.widget_title, theme.text);
        rv.setTextColor(R.id.widget_subtitle, theme.muted);
        rv.setTextColor(R.id.widget_empty, theme.muted);
        rv.setTextViewText(R.id.widget_title, headerTitle(context));
        rv.setTextViewText(R.id.widget_subtitle, headerSubtitle(context));
        rv.setTextViewText(R.id.widget_empty, WidgetShared.tr(context, "Brak zadań na dziś", "No habits for today"));
        if (preview) {
            rv.setViewVisibility(R.id.widget_list, android.view.View.GONE);
            String names = previewNames(context);
            if (!names.isEmpty()) {
                rv.setTextViewText(R.id.widget_empty, names);
                rv.setTextColor(R.id.widget_empty, theme.text);
                rv.setInt(R.id.widget_empty, "setGravity", android.view.Gravity.START | android.view.Gravity.TOP);
            }
            return rv;
        }

        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) {
            PendingIntent openPi = PendingIntent.getActivity(
                context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            rv.setOnClickPendingIntent(R.id.widget_header, openPi);
        }

        Intent svc = new Intent(context, HabitWidgetService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        rv.setRemoteAdapter(R.id.widget_list, svc);
        rv.setEmptyView(R.id.widget_list, R.id.widget_empty);

        // Row taps open the hold-to-complete overlay (fill-in intents add the habit id).
        Intent hold = HoldActivity.intent(context, null, false, null);
        PendingIntent togglePi = PendingIntent.getActivity(
            context, 0, hold,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        rv.setPendingIntentTemplate(R.id.widget_list, togglePi);
        return rv;
    }

    /** "●  Woda\n✓  Czytanie" - up to four of today's rows for the config preview. */
    private static String previewNames(Context context) {
        org.json.JSONArray habits = WidgetShared.habits(context);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(4, habits.length()); i++) {
            org.json.JSONObject h = habits.optJSONObject(i);
            if (h == null) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append(WidgetShared.isDone(h) ? "✓  " : "●  ").append(h.optString("name", ""));
        }
        return sb.toString();
    }

    private static String headerTitle(Context context) {
        int total = WidgetShared.countedTotal(context);
        if (total == 0) return "Loop";
        return WidgetShared.doneCount(context) + " / " + total + WidgetShared.tr(context, " dziś", " today");
    }

    private static String headerSubtitle(Context context) {
        String name = WidgetShared.userName(context);
        return name.isEmpty() ? WidgetShared.tr(context, "Dzisiejsze zadania", "Today's habits")
            : WidgetShared.tr(context, "Cześć, ", "Hi, ") + name;
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
            WidgetShared.normalizeIfStale(context);
            WidgetShared.updateAll(context);
        }
    }
}
