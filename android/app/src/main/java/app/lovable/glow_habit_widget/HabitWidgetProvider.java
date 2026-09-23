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

    static void updateWidget(Context context, AppWidgetManager mgr, int widgetId) {
        WidgetShared.normalizeIfStale(context);
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_root);
        rv.setTextViewText(R.id.widget_title, headerTitle(context));
        rv.setTextViewText(R.id.widget_subtitle, headerSubtitle(context));

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

        mgr.updateAppWidget(widgetId, rv);
        mgr.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_list);
        // The host caches non-collection views on a full update that re-binds the
        // adapter; a partial update reliably refreshes the header text.
        RemoteViews head = new RemoteViews(context.getPackageName(), R.layout.widget_root);
        head.setTextViewText(R.id.widget_title, headerTitle(context));
        head.setTextViewText(R.id.widget_subtitle, headerSubtitle(context));
        mgr.partiallyUpdateAppWidget(widgetId, head);
    }

    private static String headerTitle(Context context) {
        int total = WidgetShared.habits(context).length();
        if (total == 0) return "Loop";
        return WidgetShared.doneCount(context) + " / " + total + " dziś";
    }

    private static String headerSubtitle(Context context) {
        String name = WidgetShared.userName(context);
        return name.isEmpty() ? "Dzisiejsze zadania" : ("Cześć, " + name);
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
