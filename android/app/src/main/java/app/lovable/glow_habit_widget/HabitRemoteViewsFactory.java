package app.lovable.glow_habit_widget;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Builds one row per habit from the "widget_state" snapshot. */
public class HabitRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {
    private static final int NAME_ACTIVE = Color.parseColor("#f4f5f9");
    private static final int NAME_DONE = Color.parseColor("#9398a5");

    private final Context context;
    private final List<JSONObject> items = new ArrayList<>();

    HabitRemoteViewsFactory(Context context) {
        this.context = context;
    }

    @Override
    public void onCreate() {
    }

    @Override
    public void onDestroy() {
        items.clear();
    }

    @Override
    public int getCount() {
        return items.size();
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public boolean hasStableIds() {
        return false;
    }

    @Override
    public RemoteViews getLoadingView() {
        return null;
    }

    @Override
    public int getViewTypeCount() {
        return 1;
    }

    @Override
    public void onDataSetChanged() {
        items.clear();
        JSONArray habits = WidgetShared.habits(context);
        for (int i = 0; i < habits.length(); i++) {
            items.add(habits.optJSONObject(i));
        }
    }

    @Override
    public RemoteViews getViewAt(int position) {
        JSONObject h = items.get(position);
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_row);

        String name = h.optString("name", "");
        boolean done = WidgetShared.isDone(h);
        boolean avoid = WidgetShared.isAvoid(h);
        int color = WidgetShared.color(h);
        String amount = WidgetShared.amountText(h);

        rv.setTextViewText(R.id.row_name, avoid ? "⛔ " + name : name);
        rv.setInt(R.id.row_dot, "setTextColor", color);
        rv.setInt(R.id.row_name, "setTextColor", done ? NAME_DONE : NAME_ACTIVE);
        String check = done ? "✓" : "slip".equals(h.optString("status")) ? "✗" : amount.isEmpty() ? "" : amount;
        rv.setTextViewText(R.id.row_check, check);
        rv.setFloat(R.id.row_check, "setTextSize", check.length() > 2 ? 11f : 16f);
        rv.setInt(R.id.row_check, "setTextColor", color);

        Intent fill = new Intent();
        fill.putExtra(WidgetShared.EXTRA_HABIT_ID, h.optString("id"));
        rv.setOnClickFillInIntent(R.id.row_root, fill);
        return rv;
    }
}
