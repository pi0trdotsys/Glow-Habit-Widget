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

    /**
     * [title, text, big text, coach facts (JSON), the part after the opener]. `rows` = today's
     * rows without discreet ones; `pick` chooses from pools. The facts go to the optional coach
     * server (CoachJob), which may replace the opener with a comment of its own.
     */
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
        List<String> missingNames = new ArrayList<>();
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
                missingNames.add(name);
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

        // Most important first: the comment, the tip, then the lists (the app shows them anyway) -
        // a long recap gets cut at the end on some phones (HyperOS), so the lists go, not the tip.
        StringBuilder big = new StringBuilder();
        String tip = "";
        if (worst != null) tip = pick.from(summary.optJSONObject("tips").optJSONArray(worst.optString("id")));
        if (tip.isEmpty() && summary != null) tip = pick.from(summary.optJSONArray("general"));
        if (!tip.isEmpty()) big.append("\n\n💡 ").append(tip);
        if (!ok.isEmpty() || !short_.isEmpty() || !slips.isEmpty()) big.append("\n");
        if (!ok.isEmpty()) big.append("\n✅ ").append(en ? "Done: " : "Zrobione: ").append(join(ok, 4, en));
        if (!short_.isEmpty()) big.append("\n⏳ ").append(en ? "Missing: " : "Zabrakło: ").append(join(short_, 4, en));
        if (!slips.isEmpty()) big.append("\n💥 ").append(en ? "Slips: " : "Wpadki: ").append(join(slips, 3, en));

        String title = (en ? "🍻 Day recap · " : "🍻 Podsumowanie dnia · ") + pct + "%";
        String rest = big.toString();
        JSONObject facts = new JSONObject();
        try {
            facts.put("lang", en ? "en" : "pl").put("pct", pct)
                .put("name", summary != null ? summary.optString("name", "") : "")
                .put("level", summary != null ? summary.optString("level", "hard") : "hard")
                .put("done", new JSONArray(ok)).put("missing", new JSONArray(missingNames))
                .put("slips", new JSONArray(slips));
        } catch (Exception ignored) {
        }
        return new String[]{title, opener, opener + rest, facts.toString(), rest};
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
