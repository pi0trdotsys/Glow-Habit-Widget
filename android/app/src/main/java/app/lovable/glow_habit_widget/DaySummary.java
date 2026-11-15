package app.lovable.glow_habit_widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * "Podsumowanie dnia": the evening recap, composed at send time from the day's final rows and
 * the snapshot's "summary" (src/lib/habits/day-summary.ts: when, openers, advice from history).
 * Pure (no Android types) so it's JVM-testable (DaySummaryTest). Discreet habits never appear:
 * the caller passes rows without them.
 */
final class DaySummary {
    private DaySummary() {}

    /** All done and at least this late: the day is over, send it now (18:00). */
    static final int EARLY_FROM = 18 * 60;
    /** After the planned minute it may still go out this long (a phone that slept through it). */
    static final int LATE_WINDOW = 3 * 60;

    /** Mirrors tierOf() in day-summary.ts. */
    static String tier(int percent) {
        if (percent >= 100) return "full";
        if (percent >= 75) return "great";
        if (percent >= 45) return "ok";
        if (percent > 0) return "weak";
        return "zero";
    }

    /** Is it time? At the learned minute, or earlier once everything is done after 18:00. */
    static boolean due(int now, int at, boolean allDone) {
        if (now >= at && now - at <= LATE_WINDOW) return true;
        return allDone && now >= EARLY_FROM && now < at;
    }

    /** [title, text, big text]. `rows` = today's rows without discreet ones; `pick` chooses from pools. */
    static String[] compose(JSONArray rows, JSONObject summary, boolean en, Picker pick) {
        List<JSONObject> counted = new ArrayList<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject h = rows.optJSONObject(i);
            if (h != null && WidgetShared.counts(h)) counted.add(h);
        }
        int done = 0;
        float sum = 0f;
        List<String> ok = new ArrayList<>();
        List<String> short_ = new ArrayList<>();
        List<String> slips = new ArrayList<>();
        JSONObject worst = null;
        float worstF = 2f;
        for (JSONObject h : counted) {
            float f = WidgetShared.fraction(h);
            sum += f;
            String name = h.optString("name");
            if (WidgetShared.isDone(h)) {
                done++;
                if (!WidgetShared.isAvoid(h)) ok.add(name);
            } else if (WidgetShared.isAvoid(h)) {
                if ("slip".equals(h.optString("status"))) slips.add(name);
            } else {
                String amount = WidgetShared.amountText(h);
                short_.add(amount.isEmpty() || WidgetShared.amount(h) == 0 ? name
                    : name + " (" + WidgetShared.amount(h) + "/" + WidgetShared.target(h) + ")");
                // advice goes to the habit that got the least done today
                if (f < worstF && hasTips(summary, h)) {
                    worst = h;
                    worstF = f;
                }
            }
        }
        int total = counted.size();
        int pct = total == 0 ? 0 : Math.round(100f * sum / total);
        String t = tier(pct);

        JSONObject lines = summary != null ? summary.optJSONObject("lines") : null;
        String opener = pick.from(lines != null ? lines.optJSONArray(t) : null);
        if (opener.isEmpty()) opener = en ? "Today: {pct}%." : "Dziś: {pct}%.";
        opener = opener.replace("{pct}", String.valueOf(pct))
            .replace("{done}", String.valueOf(done)).replace("{total}", String.valueOf(total));

        StringBuilder big = new StringBuilder(opener);
        if (!ok.isEmpty()) big.append("\n✅ ").append(en ? "Done: " : "Zrobione: ").append(join(ok, 5, en));
        if (!short_.isEmpty()) big.append("\n⏳ ").append(en ? "Missing: " : "Zabrakło: ").append(join(short_, 4, en));
        if (!slips.isEmpty()) big.append("\n💥 ").append(en ? "Slips: " : "Wpadki: ").append(join(slips, 3, en));

        String tip = "";
        if (worst != null) tip = pick.from(summary.optJSONObject("tips").optJSONArray(worst.optString("id")));
        if (tip.isEmpty() && summary != null) tip = pick.from(summary.optJSONArray("general"));
        if (!tip.isEmpty()) big.append("\n\n💡 ").append(tip);

        String title = (en ? "🍻 Day recap · " : "🍻 Podsumowanie dnia · ") + pct + "%";
        return new String[]{title, opener, big.toString()};
    }

    private static boolean hasTips(JSONObject summary, JSONObject h) {
        if (summary == null) return false;
        JSONObject tips = summary.optJSONObject("tips");
        JSONArray a = tips != null ? tips.optJSONArray(h.optString("id")) : null;
        return a != null && a.length() > 0;
    }

    /** "A, B, C i 2 więcej". */
    static String join(List<String> names, int max, boolean en) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(max, names.size()); i++) {
            if (i > 0) sb.append(", ");
            sb.append(names.get(i));
        }
        if (names.size() > max) sb.append(en ? " and " : " i ").append(names.size() - max).append(en ? " more" : " więcej");
        return sb.toString();
    }

    /** Line choice (random in the app, fixed in tests). */
    interface Picker {
        String from(JSONArray pool);
    }

    /** The first line of a pool (tests), "" for none. */
    static final Picker FIRST = pool -> pool != null && pool.length() > 0 ? pool.optString(0) : "";
}
