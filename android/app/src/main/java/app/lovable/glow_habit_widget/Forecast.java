package app.lovable.glow_habit_widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * "Prognoza na dziś" for the morning notification - the native mirror of
 * src/lib/habits/forecast.ts. The app exports each habit's compact naive Bayes
 * model in the snapshot ("forecast": base miss rate + log likelihood ratios for
 * a bad night, short sleep, the previous due day missed and the weekday), plus
 * the line pools and reason phrases. Here we only apply it to last night's
 * NightStats report, so it works when the app wasn't opened since the evening.
 * Shared vectors: tests/forecast-vectors.json (ForecastTest).
 */
final class Forecast {
    static final double WARN_P = 0.6;
    static final double WARN_LIFT = 0.15;
    static final double REASON_MIN = 0.1;
    static final int MAX_PCT = 97;
    static final int MAX_ITEMS = 2;
    static final int BAD_SCREEN_MIN = 30;

    private Forecast() {}

    static final class Result {
        final double p;
        final int pct;
        /** night / sleep / nightSleep / rescue / wd, null = nothing to name. */
        final String reason;
        final boolean warn;

        Result(double p, int pct, String reason, boolean warn) {
            this.p = p;
            this.pct = pct;
            this.reason = reason;
            this.warn = warn;
        }
    }

    /** One habit's warning for this morning. */
    static final class Item {
        final String id;
        final double p;
        final String text;

        Item(String id, double p, String text) {
            this.id = id;
            this.p = p;
            this.text = text;
        }
    }

    private static Double value(JSONObject b, Boolean v) {
        if (b == null || v == null) return null;
        String k = v ? "y" : "n";
        return b.has(k) && !b.isNull(k) ? b.optDouble(k) : null;
    }

    private static Double weekday(JSONObject m, int wd) {
        JSONArray a = m.optJSONArray("wd");
        JSONObject w = a != null ? a.optJSONObject(wd) : null;
        return w != null && w.has("l") ? w.optDouble("l") : null;
    }

    /** P(miss) and the reason (mirrors posterior in forecast.ts). Null features = unknown. */
    static Result posterior(JSONObject m, Boolean bad, Boolean shortSleep, int wd, Boolean rescue) {
        double base = m.optDouble("base", 0.5);
        double logit = Math.log(base / (1 - base));
        Double night = value(m.optJSONObject("night"), bad);
        Double sleep = value(m.optJSONObject("sleep"), shortSleep);
        Double resc = value(m.optJSONObject("rescue"), rescue);
        Double day = weekday(m, wd);
        for (Double v : new Double[]{night, sleep, resc, day}) if (v != null) logit += v;
        double p = 1 / (1 + Math.exp(-logit));
        String[] keys = {"night", "sleep", "rescue", "wd"};
        Double[] cands = {
            Boolean.TRUE.equals(bad) ? night : null,
            Boolean.TRUE.equals(shortSleep) ? sleep : null,
            Boolean.TRUE.equals(rescue) ? resc : null,
            day,
        };
        String reason = null;
        double best = REASON_MIN;
        for (int i = 0; i < keys.length; i++) {
            Double v = cands[i];
            if (v != null && v >= best && (reason == null || v > best)) {
                reason = keys[i];
                best = v;
            }
        }
        if ("night".equals(reason) || "sleep".equals(reason)) {
            Double other = "night".equals(reason) ? cands[1] : cands[0];
            if (other != null && other >= REASON_MIN) reason = "nightSleep";
        }
        int pct = (int) Math.min(MAX_PCT, Math.round(p * 100));
        boolean warn = reason != null && p >= WARN_P && p >= base + WARN_LIFT;
        return new Result(p, pct, reason, warn);
    }

    /** The reason as text (mirrors reasonText). `sleep` = minutes asleep, -1 = unknown. */
    static String reasonText(String key, JSONObject m, int wd, int social, int screen, int sleep, JSONObject ph) {
        boolean soc = social > 0;
        String t;
        if ("night".equals(key)) t = ph.optString(soc ? "nightSocial" : "night");
        else if ("sleep".equals(key)) t = ph.optString("sleep");
        else if ("nightSleep".equals(key)) t = ph.optString(soc ? "nightSocialSleep" : "nightSleep");
        else if ("rescue".equals(key)) t = ph.optString("avoid".equals(m.optString("kind")) ? "rescueAvoid" : "rescue");
        else {
            JSONArray a = m.optJSONArray("wd");
            JSONObject w = a != null ? a.optJSONObject(wd) : null;
            boolean group = w != null && w.optInt("g") == 1;
            if (group) t = ph.optString(wd == 0 || wd == 6 ? "weekend" : "workday");
            else {
                JSONArray names = ph.optJSONArray("wd");
                t = names != null ? names.optString(wd) : "";
            }
        }
        return t.replace("{social}", String.valueOf(social))
            .replace("{screen}", String.valueOf(screen))
            .replace("{sleep}", sleep >= 0 ? SleepCalc.duration(sleep) : "?");
    }

    /** "12:00" before 10:00, "14:00" later (mirrors untilMinute). */
    static int until(int nowMin) {
        return nowMin < 10 * 60 ? 12 * 60 : 14 * 60;
    }

    /** Same as lineHash in forecast.ts ((h * 31 + c) as uint32). */
    static long hash(String s) {
        long h = 0;
        for (int i = 0; i < s.length(); i++) h = (h * 31 + s.charAt(i)) & 0xffffffffL;
        return h;
    }

    /** Fill a forecast line and capitalise it (mirrors fillForecast). */
    static String fill(String line, String habit, int pct, String reason, String min, String until) {
        String out = line.replace("{reason}", reason)
            .replace("{habit}", habit)
            .replace("{pct}", String.valueOf(pct))
            .replace("{min}", min)
            .replace("{until}", until);
        return out.isEmpty() ? out : out.substring(0, 1).toUpperCase(Locale.ROOT) + out.substring(1);
    }

    /** The pool for a model: avoid / build with a minimum / plain build (mirrors poolOf). */
    static String poolOf(JSONObject m) {
        if ("avoid".equals(m.optString("kind"))) return "avoid";
        return m.optString("min", "").isEmpty() ? "build" : "buildMin";
    }

    /** The warning text for one model, or null when it doesn't warn. */
    static Item item(JSONObject m, JSONObject fc, Boolean bad, Boolean shortSleep, int wd, Boolean rescue,
                     int social, int screen, int sleep, String date, int nowMin) {
        Result r = posterior(m, bad, shortSleep, wd, rescue);
        if (!r.warn || r.reason == null) return null;
        JSONObject lines = fc.optJSONObject("lines");
        JSONArray pool = lines != null ? lines.optJSONArray(poolOf(m)) : null;
        if (pool == null || pool.length() == 0) return null;
        String id = m.optString("id");
        String line = pool.optString((int) (hash(date + "|" + id) % pool.length()));
        JSONObject ph = fc.optJSONObject("reasons");
        String reason = reasonText(r.reason, m, wd, social, screen, sleep, ph != null ? ph : new JSONObject());
        return new Item(id, r.p, fill(line, m.optString("name"), r.pct, reason, m.optString("min", ""),
            WidgetShared.fmtMinute(until(nowMin))));
    }

    /**
     * This morning's warnings (riskiest first, at most two) from the snapshot and
     * last night's NightStats report (null / not granted = night unknown).
     * `yesterday` = yesterday's date key: the rows' rescue flags only count when
     * the snapshot's "yesterday" is really yesterday.
     */
    static List<String> morning(JSONObject state, JSONObject report, int wd, String date, String yesterday, int nowMin) {
        List<String> out = new ArrayList<>();
        JSONObject fc = state != null ? state.optJSONObject("forecast") : null;
        JSONArray models = fc != null ? fc.optJSONArray("models") : null;
        if (models == null) return out;
        boolean night = report != null && report.optBoolean("granted");
        int social = night ? report.optInt("social") : 0;
        int screen = night ? report.optInt("screen") : 0;
        int sleep = night ? NightStats.sleepMinutes(report) : -1;
        Boolean bad = night ? (Boolean) (social > 0 || screen >= BAD_SCREEN_MIN) : null;
        Boolean shortSleep = sleep >= 0 ? (Boolean) (sleep < SleepCalc.SHORT_MIN) : null;
        Map<String, JSONObject> rows = new HashMap<>();
        JSONArray hs = state.optJSONArray("habits");
        for (int i = 0; hs != null && i < hs.length(); i++) {
            JSONObject h = hs.optJSONObject(i);
            if (h != null) rows.put(h.optString("id"), h);
        }
        JSONObject y = state.optJSONObject("yesterday");
        boolean rescueKnown = y != null && yesterday.equals(y.optString("date"));
        List<Item> items = new ArrayList<>();
        for (int i = 0; i < models.length(); i++) {
            JSONObject m = models.optJSONObject(i);
            if (m == null || !dueOn(m, wd)) continue;
            JSONObject row = rows.get(m.optString("id"));
            if (row != null && settled(row)) continue;
            Boolean rescue = rescueKnown && row != null ? (Boolean) row.optBoolean("rescue", false) : null;
            Item it = item(m, fc, bad, shortSleep, wd, rescue, social, screen, sleep, date, nowMin);
            if (it != null) items.add(it);
        }
        Collections.sort(items, (a, b) -> Double.compare(b.p, a.p));
        for (int i = 0; i < Math.min(MAX_ITEMS, items.size()); i++) out.add(items.get(i).text);
        return out;
    }

    static boolean dueOn(JSONObject m, int wd) {
        JSONArray d = m.optJSONArray("days");
        for (int i = 0; d != null && i < d.length(); i++) if (d.optInt(i, -1) == wd) return true;
        return false;
    }

    /** Today is already safe: the minimum reached, or the avoid habit answered. */
    static boolean settled(JSONObject row) {
        if (WidgetShared.isAvoid(row)) {
            String st = row.optString("status", "");
            return !st.isEmpty() && !"pending".equals(st);
        }
        return !WidgetShared.missed(row);
    }

    /** The block appended to the night bill ("" when nothing stands out). */
    static String block(List<String> lines) {
        StringBuilder sb = new StringBuilder();
        for (String l : lines) sb.append(sb.length() == 0 ? "" : "\n").append("🔮 ").append(l);
        return sb.toString();
    }
}
