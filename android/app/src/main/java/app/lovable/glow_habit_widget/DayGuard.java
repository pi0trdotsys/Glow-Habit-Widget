package app.lovable.glow_habit_widget;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The guard outside the night: "najpierw zadania, potem Instagram" in the
 * morning (social media blocked until the morning habits are ticked off) and
 * the daily social media limit (jabs, then the block, once it's exceeded).
 * One foreground service (LiveGuardService) runs whichever phase is active -
 * phase() decides. Pure parts are unit-tested (DayGuardTest).
 */
final class DayGuard {
    static final int OFF = 0, NIGHT = 1, MORNING = 2, DAY = 3;
    /** The morning lock and the day count start when the night ends. */
    static final int DAY_START = ScreenTime.NIGHT_END;
    /** One heads-up "N min left" before the limit (only for limits above this). */
    static final int WARN_BEFORE_MIN = 10;
    /** Holding the block's button lets you through for this long in the morning. */
    static final int MORNING_PASS_MIN = 5;

    private DayGuard() {}

    // ------------------------------------------------------------------ pure logic

    /** Settings the phase depends on (from the snapshot, see src/lib/live.ts liveState). */
    static final class Config {
        boolean night;
        int nightStart; // bedtime or midnight (LiveGuard.start)
        int nightEnd = ScreenTime.NIGHT_END;
        boolean morning;
        int morningUntil = 11 * 60;
        boolean day;
        /** "24 h do namysłu": shopping apps are guarded around the clock (ShopGuard). */
        boolean shop;
    }

    /**
     * Which guard runs now: the night guard wins inside its window; then the
     * morning lock while morning habits are pending (DAY_START..morningUntil);
     * then the daily limit for the rest of the day (not between midnight and
     * DAY_START - that's the night). The shopping guard alone keeps a DAY
     * phase at any hour (the daily limit then stays off - see limitActive).
     */
    static int phase(int now, Config cfg, boolean morningPending) {
        if (cfg.night && LiveGuard.inWindow(now, cfg.nightStart, cfg.nightEnd)) return NIGHT;
        boolean dayTime = now >= DAY_START;
        if (cfg.morning && morningPending && dayTime && now < cfg.morningUntil) return MORNING;
        if (cfg.day && dayTime) return DAY;
        if (cfg.shop) return DAY;
        return OFF;
    }

    /** The daily social media limit counts and jabs only when it's on and the night is over. */
    static boolean limitActive(Config cfg, int now) {
        return cfg.day && now >= DAY_START;
    }

    /**
     * Count today's social media minutes on this poll? Outside the night from
     * DAY_START on, while the morning lock or the daily limit runs - not when
     * the service only runs for the shopping guard.
     */
    static boolean countsSocial(int phase, Config cfg, int now) {
        if (phase == NIGHT || phase == OFF || now < DAY_START) return false;
        return phase == MORNING || cfg.day;
    }

    /** Minutes of day at which some phase may begin (for the start alarm). */
    static List<Integer> phaseStarts(Config cfg) {
        List<Integer> out = new ArrayList<>();
        if (cfg.night) out.add(cfg.nightStart);
        if (cfg.morning || cfg.day || cfg.shop) out.add(DAY_START);
        return out;
    }

    /** The next of `starts` strictly after `now` (minutes from now, across midnight); -1 if none. */
    static int minutesToNextStart(int now, List<Integer> starts) {
        int best = -1;
        for (int s : starts) {
            int d = LiveGuard.minutesTo(now, s);
            if (d == 0) d = 24 * 60;
            if (best < 0 || d < best) best = d;
        }
        return best;
    }

    /** A morning habit counts as done once one unit is in (e.g. the first glass of water). */
    static boolean morningDone(JSONObject h) {
        if (h == null) return true;
        if (WidgetShared.isAvoid(h)) return true; // only habits to do can be required
        int target = WidgetShared.target(h);
        int need = Math.max(1, Math.min(WidgetShared.step(h), target));
        return WidgetShared.isDone(h) || WidgetShared.amount(h) >= need;
    }

    /** Pending morning habits among today's rows, in the order of `ids`. */
    static List<JSONObject> morningPending(JSONArray rows, JSONArray ids) {
        List<JSONObject> out = new ArrayList<>();
        if (rows == null || ids == null) return out;
        for (int i = 0; i < ids.length(); i++) {
            String id = ids.optString(i);
            for (int j = 0; j < rows.length(); j++) {
                JSONObject h = rows.optJSONObject(j);
                if (h != null && id.equals(h.optString("id")) && !morningDone(h)) out.add(h);
            }
        }
        return out;
    }

    /** What the daily limit asks for right now. */
    static final int LIMIT_OK = 0, LIMIT_WARN = 1, LIMIT_OVER = 2;

    static int limitState(int usedMin, int limitMin) {
        if (limitMin <= 0) return LIMIT_OK;
        if (usedMin >= limitMin) return LIMIT_OVER;
        if (limitMin > WARN_BEFORE_MIN * 2 && usedMin >= limitMin - WARN_BEFORE_MIN) return LIMIT_WARN;
        return LIMIT_OK;
    }

    /**
     * Foreground time to add for one poll: the time since the last poll while a
     * watched app was in front, capped (a long gap means we weren't polling -
     * e.g. screen off - and must not count as use).
     */
    static long tickMs(long lastPoll, long now, boolean watchedInFront, long capMs) {
        if (!watchedInFront || lastPoll <= 0 || now <= lastPoll) return 0;
        return Math.min(now - lastPoll, capMs);
    }

    /** "Mycie zębów, Picie wody" - names of pending habits for the block / notification. */
    static String names(List<JSONObject> rows) {
        StringBuilder sb = new StringBuilder();
        for (JSONObject h : rows) {
            if (sb.length() > 0) sb.append(", ");
            sb.append(h.optString("name"));
        }
        return sb.toString();
    }

    // ------------------------------------------------------------------ settings (snapshot)

    static JSONObject morningSettings(Context c) {
        JSONObject m = LiveGuard.settings(c).optJSONObject("morning");
        return m != null ? m : new JSONObject();
    }

    static JSONObject daySettings(Context c) {
        JSONObject d = LiveGuard.settings(c).optJSONObject("day");
        return d != null ? d : new JSONObject();
    }

    /** Today's limit: the set one minus last night's debt (when "the night costs the day" is on). */
    static int limit(Context c) {
        int base = baseLimit(c);
        return base - debt(c, base);
    }

    static int baseLimit(Context c) {
        return daySettings(c).optInt("limit", 60);
    }

    // ------------------------------------------------------------------ night debt

    /** The night can't take more than this off the day: at least this many minutes stay. */
    static final int DEBT_FLOOR_MIN = 15;
    static final int DEBT_PER_SOCIAL_MIN = 2;
    static final int DEBT_PER_PASS = 10;

    /**
     * "Noc kosztuje dzień": minutes off today's limit for last night - 2 per
     * social media minute after midnight and 10 per urgent pass through the
     * curfew, never below DEBT_FLOOR_MIN left.
     */
    static int debtMin(int nightSocialMin, int curfewPasses, int limit) {
        int d = DEBT_PER_SOCIAL_MIN * Math.max(0, nightSocialMin) + DEBT_PER_PASS * Math.max(0, curfewPasses);
        return Math.max(0, Math.min(d, limit - DEBT_FLOOR_MIN));
    }

    /** Last night's raw debt (before the floor), worked out once a day after the night ends. */
    static int rawDebt(Context c) {
        if (!daySettings(c).optBoolean("debt", true)) return 0;
        if (WidgetShared.nowMinute() < DAY_START) return 0; // the night isn't over
        String today = WidgetShared.today();
        android.content.SharedPreferences p = LiveGuard.prefs(c);
        if (today.equals(p.getString("debt_day", ""))) return p.getInt("debt_raw", 0);
        String night = WidgetShared.dateKey(1);
        int social = NightStats.report(c, 1).optInt("social", 0);
        int passes = LiveGuard.counts(c, "curfew_passes").optInt(night, 0);
        int raw = DEBT_PER_SOCIAL_MIN * Math.max(0, social) + DEBT_PER_PASS * Math.max(0, passes);
        p.edit().putString("debt_day", today).putInt("debt_raw", raw).apply();
        return raw;
    }

    static int debt(Context c, int base) {
        int raw = rawDebt(c);
        return Math.max(0, Math.min(raw, base - DEBT_FLOOR_MIN));
    }

    static Config config(Context c) {
        Config cfg = new Config();
        boolean granted = ScreenTime.granted(c);
        cfg.night = granted && LiveGuard.settings(c).optBoolean("enabled", false);
        cfg.nightStart = LiveGuard.start(c);
        cfg.nightEnd = LiveGuard.until(c);
        cfg.morning = granted && morningSettings(c).optBoolean("enabled", false);
        cfg.morningUntil = morningSettings(c).optInt("until", 11 * 60);
        cfg.day = granted && daySettings(c).optBoolean("enabled", false);
        cfg.shop = granted && ShopGuard.enabled(c);
        return cfg;
    }

    static List<JSONObject> morningPending(Context c) {
        WidgetShared.normalizeIfStale(c);
        return morningPending(WidgetShared.habits(c), morningSettings(c).optJSONArray("habits"));
    }

    static int phase(Context c) {
        Config cfg = config(c);
        boolean pending = cfg.morning && !morningPending(c).isEmpty();
        return phase(WidgetShared.nowMinute(), cfg, pending);
    }

    // ------------------------------------------------------------------ today's social minutes

    private static final String KEY_DAY = "day_social_ms";

    /** Social media time today (the day part, from DAY_START), ms. */
    static long usedMs(Context c) {
        try {
            JSONObject o = new JSONObject(LiveGuard.prefs(c).getString(KEY_DAY, "{}"));
            return o.optLong(WidgetShared.today(), 0);
        } catch (Exception e) {
            return 0;
        }
    }

    static int usedMin(Context c) {
        return (int) (usedMs(c) / 60_000L);
    }

    static synchronized void setUsedMs(Context c, long ms) {
        try {
            JSONObject o = new JSONObject(LiveGuard.prefs(c).getString(KEY_DAY, "{}"));
            o.put(WidgetShared.today(), ms);
            // keep ~120 days
            JSONArray names = o.names();
            if (names != null && names.length() > 120) {
                String oldest = null;
                for (int i = 0; i < names.length(); i++) {
                    String k = names.getString(i);
                    if (oldest == null || k.compareTo(oldest) < 0) oldest = k;
                }
                o.remove(oldest);
            }
            LiveGuard.prefs(c).edit().putString(KEY_DAY, o.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** Minutes per day ("yyyy-MM-dd" -> min) for the app's stats and challenges. */
    static JSONObject history(Context c) {
        JSONObject out = new JSONObject();
        try {
            JSONObject o = new JSONObject(LiveGuard.prefs(c).getString(KEY_DAY, "{}"));
            JSONArray names = o.names();
            for (int i = 0; names != null && i < names.length(); i++) {
                String k = names.getString(i);
                out.put(k, (int) (o.optLong(k) / 60_000L));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    /** Once-a-day flags (the "10 min left" warning). */
    static boolean onceToday(Context c, String key) {
        String today = WidgetShared.today();
        if (today.equals(LiveGuard.prefs(c).getString(key, ""))) return false;
        LiveGuard.prefs(c).edit().putString(key, today).apply();
        return true;
    }
}
