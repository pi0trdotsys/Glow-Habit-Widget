package app.lovable.glow_habit_widget;

import android.view.View;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * 4x1 "Szpila": the mean cat with one jab. Jabs come ONLY from habits to do -
 * forbidden habits never appear on the home screen (anyone can see it). The
 * current jab sticks for {@link #STICK_MS} so the text doesn't jump on every
 * refresh; it changes when the cat is tapped, when its task gets done, or
 * when it gets old. Tap the text to open the app.
 */
public class SzpilaWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REROLL = "app.lovable.glow_habit_widget.SZPILA_REROLL";
    private static final String PREFS = "loop_szpila_widget";
    private static final long STICK_MS = 30 * 60_000L;
    private static final Random RNG = new Random();

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(context, mgr, id);
    }

    /**
     * "Kot w domu" (catCondition in gamification.ts): a neglected cat is always
     * offended (angry), a groomed one is pleased instead of merely smug.
     */
    static int condMood(String cond, int mood) {
        if ("neglected".equals(cond)) return 1;
        if ("groomed".equals(cond) && mood == 0) return 2;
        return mood;
    }

    static int condDrawable(String cond) {
        if ("neglected".equals(cond)) return R.drawable.ic_szpila_cond_neglected;
        if ("groomed".equals(cond)) return R.drawable.ic_szpila_cond_groomed;
        return 0;
    }

    static String title(String cond, int mood) {
        return title(cond, mood, false);
    }

    static String title(String cond, int mood, boolean en) {
        String emoji = mood == 1 ? HabitNotifier.EMOJI_ANGRY : mood == 2 ? HabitNotifier.EMOJI_IMPRESSED : HabitNotifier.EMOJI_NORMAL;
        String state = "neglected".equals(cond) ? (en ? "  ·  neglected and offended" : "  ·  zaniedbany i obrażony")
            : "groomed".equals(cond) ? (en ? "  ·  well-groomed ✨" : "  ·  zadbany ✨") : "";
        return "SZPILA  " + emoji + state;
    }

    /** The unlocked face (gamification.ts FACES) x mood: 0 smug, 1 angry, 2 impressed. */
    static int catDrawable(String face, int mood) {
        int[] set;
        switch (face == null ? "" : face) {
            case "kujon": set = new int[]{R.drawable.ic_szpila_kujon_smug, R.drawable.ic_szpila_kujon_angry, R.drawable.ic_szpila_kujon_impressed}; break;
            case "diabel": set = new int[]{R.drawable.ic_szpila_diabel_smug, R.drawable.ic_szpila_diabel_angry, R.drawable.ic_szpila_diabel_impressed}; break;
            case "krol": set = new int[]{R.drawable.ic_szpila_krol_smug, R.drawable.ic_szpila_krol_angry, R.drawable.ic_szpila_krol_impressed}; break;
            case "zloty": set = new int[]{R.drawable.ic_szpila_zloty_smug, R.drawable.ic_szpila_zloty_angry, R.drawable.ic_szpila_zloty_impressed}; break;
            case "dj": set = new int[]{R.drawable.ic_szpila_dj_smug, R.drawable.ic_szpila_dj_angry, R.drawable.ic_szpila_dj_impressed}; break;
            default: set = new int[]{R.drawable.ic_szpila_smug, R.drawable.ic_szpila_angry, R.drawable.ic_szpila_impressed};
        }
        return set[Math.max(0, Math.min(2, mood))];
    }

    static void updateWidget(Context context, AppWidgetManager mgr, int widgetId) {
        WidgetShared.normalizeIfStale(context);
        Jab jab = currentJab(context);
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget4_root);
        rv.setTextViewText(R.id.szpila_text, jab.text);
        String cond = WidgetShared.state(context).optString("cat", "normal");
        int mood = condMood(cond, jab.mood);
        rv.setImageViewResource(R.id.szpila_cat, catDrawable(WidgetShared.state(context).optString("face"), mood));
        int condRes = condDrawable(cond);
        if (condRes != 0) {
            rv.setImageViewResource(R.id.szpila_cond, condRes);
            rv.setViewVisibility(R.id.szpila_cond, View.VISIBLE);
        } else {
            rv.setViewVisibility(R.id.szpila_cond, View.GONE);
        }
        rv.setTextViewText(R.id.szpila_title, title(cond, mood, WidgetShared.en(context)));

        Intent reroll = new Intent(context, SzpilaWidgetProvider.class);
        reroll.setAction(ACTION_REROLL);
        PendingIntent rerollPi = PendingIntent.getBroadcast(context, 400, reroll,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(R.id.szpila_cat_box, rerollPi);
        PendingIntent open = WidgetShared.openAppIntent(context, 401);
        if (open != null) rv.setOnClickPendingIntent(R.id.szpila_text_box, open);

        mgr.updateAppWidget(widgetId, rv);
    }

    /** mood: 0 smug, 1 angry, 2 impressed. */
    private static final class Jab {
        final String text;
        final int mood;

        Jab(String text, int mood) {
            this.text = text;
            this.mood = mood;
        }
    }

    /** Pending habits to DO (never forbidden ones), most urgent first. */
    private static List<JSONObject> buildPlan(Context c) {
        return withoutForbidden(WidgetShared.plan(c));
    }

    /** Home-screen privacy: forbidden habits never reach this widget. */
    static List<JSONObject> withoutForbidden(List<JSONObject> plan) {
        List<JSONObject> out = new ArrayList<>();
        for (JSONObject h : plan) if (!WidgetShared.isAvoid(h)) out.add(h);
        return out;
    }

    private static Jab currentJab(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        List<JSONObject> plan = buildPlan(c);
        String habitId = p.getString("habit", null);
        long at = p.getLong("at", 0);
        boolean fresh = System.currentTimeMillis() - at < STICK_MS
            && WidgetShared.today().equals(p.getString("date", ""))
            && p.getBoolean("en", false) == WidgetShared.en(c); // language switch = new jab
        boolean stillPending = habitId == null ? plan.isEmpty() : containsId(plan, habitId);
        if (fresh && stillPending && p.contains("text")) {
            JSONObject h = habitId == null ? null : WidgetShared.row(c, habitId);
            String text = p.getString("text", "");
            // Amounts may have changed since the pick ({done}/{left} are stored unresolved).
            return new Jab(h != null ? WidgetShared.fill(text, h) : text, p.getInt("mood", 0));
        }
        return pick(c, plan);
    }

    private static boolean containsId(List<JSONObject> plan, String id) {
        for (JSONObject h : plan) if (id.equals(h.optString("id"))) return true;
        return false;
    }

    /** Pick a new jab and remember it. */
    private static Jab pick(Context c, List<JSONObject> plan) {
        String raw;
        String habitId = null;
        int mood;
        JSONObject target = null;
        boolean en = WidgetShared.en(c);
        if (WidgetShared.habits(c).length() == 0) {
            raw = en ? "Mrrr. Add some habits in the app and I'll start picking on you."
                : "Mrrr. Dodaj zadania w Loop, a zacznę się czepiać.";
            mood = 0;
        } else if (plan.isEmpty()) {
            raw = WidgetShared.pick(WidgetShared.state(c).optJSONArray("allDone"));
            if (raw.isEmpty()) raw = en ? "All done. Nothing left to pick on." : "Wszystko zrobione. Nie mam się do czego przyczepić.";
            mood = 2;
        } else {
            // Mostly the most urgent task, sometimes one of the next two for variety.
            target = plan.get(plan.size() > 1 ? RNG.nextInt(Math.min(3, plan.size())) : 0);
            habitId = target.optString("id");
            int overdue = WidgetShared.nowMinute() - WidgetShared.nextMinute(target);
            mood = HabitNotifier.tier(overdue, 0);
            JSONArray pool = mood == 1 ? target.optJSONArray("rage") : target.optJSONArray("nag");
            if (pool == null || pool.length() == 0) pool = target.optJSONArray("nag");
            raw = WidgetShared.pick(pool);
            if (raw.isEmpty()) raw = en ? "“" + target.optString("name") + "” is waiting." : "„" + target.optString("name") + "” czeka.";
        }
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("text", raw)
            .putBoolean("en", en)
            .putString("habit", habitId)
            .putInt("mood", mood)
            .putLong("at", System.currentTimeMillis())
            .putString("date", WidgetShared.today())
            .apply();
        return new Jab(target != null ? WidgetShared.fill(raw, target) : raw, mood);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (ACTION_REROLL.equals(action)) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("at").apply();
            WidgetShared.updateAll(context);
        } else if (Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            WidgetShared.normalizeIfStale(context);
            WidgetShared.updateAll(context);
        }
    }
}
