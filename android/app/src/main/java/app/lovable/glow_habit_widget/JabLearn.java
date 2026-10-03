package app.lovable.glow_habit_widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * "Co na ciebie działa": Szpila learns which jabs get you moving.
 *
 * A contextual multi-armed bandit. An arm is the pool a jab came from (nag, rage,
 * memory, ctx:zero/almost/late/morning, rescue, focus) x the part of the day.
 * Every jab HabitNotifier posts is appended to a capped log (own prefs file) with
 * the habit's amount/status at that moment; {@link #evaluate} (on every refresh,
 * i.e. after each tap, tick and app publish) marks it 1 when the habit progressed
 * within {@link #WINDOW_MIN} minutes, 0 when the window closed without progress.
 * The app pulls the log (HabitWidgetPlugin.jabStats), aggregates it in the store
 * and exports the totals in the snapshot ("jabs": arms/since/until); selection
 * samples from those totals plus this log's newer entries, so it learns offline too.
 *
 * Pure parts mirror src/lib/habits/jabs.ts bit for bit (mulberry32 RNG, Java
 * hashCode, style tags, order-statistic Beta sampling) - shared vectors in
 * tests/jab-vectors.json (JabLearnTest / tests/jabs.test.ts).
 */
final class JabLearn {
    static final String[] KINDS = {
        "nag", "rage", "memory", "ctx:zero", "ctx:almost", "ctx:late", "ctx:morning", "rescue", "focus",
    };
    static final int WINDOW_MIN = 30;
    static final int LOG_CAP = 500;
    static final int EXPLORE_PCT = 15;
    static final int PRIOR_A = 1;
    static final int PRIOR_B = 1;
    static final int SAMPLE_CAP = 30;
    static final int AFTERNOON_FROM = 12 * 60;
    static final int EVENING_FROM = 18 * 60;

    private static final String PREFS = "loop_jabs";
    private static final String KEY_LOG = "log";
    private static final String KEY_LAST = "last_lines"; // {habitId: hash of the last raw line}

    private JabLearn() {}

    // ------------------------------------------------------------------
    // Pure helpers (mirrored in jabs.ts)
    // ------------------------------------------------------------------

    /** mulberry32 - bit-identical to rng() in jabs.ts. */
    static final class Rng {
        private int a;

        Rng(int seed) {
            a = seed;
        }

        double next() {
            a += 0x6D2B79F5;
            int t = (a ^ (a >>> 15)) * (1 | a);
            t = (t + (t ^ (t >>> 7)) * (61 | t)) ^ t;
            return ((t ^ (t >>> 14)) & 0xFFFFFFFFL) / 4294967296.0;
        }

        int nextInt(int n) {
            return (int) Math.floor(next() * n);
        }
    }

    static String daypart(int minute) {
        return minute < AFTERNOON_FROM ? "morning" : minute < EVENING_FROM ? "afternoon" : "evening";
    }

    static String armKey(String kind, String part) {
        return kind + "@" + part;
    }

    static int hash(String s) {
        return s == null ? 0 : s.hashCode();
    }

    private static final Pattern SWEAR = Pattern.compile(
        "kurw|chuj|pierdol|jeb|dup[aąeiy]|gówn|pizd|cholera|szlag|fuck|shit|damn|bitch|crap|bastard|arse",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /** "swear", "name", "q" (comma-joined in that order) or "plain" - mirrors styleOf(). */
    static String style(String text, String userName) {
        StringBuilder b = new StringBuilder();
        if (SWEAR.matcher(text).find()) b.append("swear");
        String name = userName == null ? "" : userName.trim().toLowerCase(Locale.ROOT);
        if (!name.isEmpty() && text.toLowerCase(Locale.ROOT).contains(name)) b.append(b.length() > 0 ? "," : "").append("name");
        if (text.contains("?")) b.append(b.length() > 0 ? "," : "").append("q");
        return b.length() > 0 ? b.toString() : "plain";
    }

    /** {s, n} capped at SAMPLE_CAP (proportionally) - mirrors effective(). */
    static int[] effective(int s, int n) {
        if (n <= SAMPLE_CAP) return new int[]{s, n};
        return new int[]{(int) Math.round(s * (double) SAMPLE_CAP / n), SAMPLE_CAP};
    }

    /** Beta(PRIOR_A + s, PRIOR_B + n - s) as the a-th smallest of a+b-1 uniforms - mirrors betaSample(). */
    static double beta(int s, int n, Rng r) {
        int[] e = effective(Math.max(0, s), Math.max(0, n));
        int es = Math.min(e[0], e[1]);
        int a = PRIOR_A + es;
        int b = PRIOR_B + e[1] - es;
        double[] u = new double[a + b - 1];
        for (int i = 0; i < u.length; i++) u[i] = r.next();
        Arrays.sort(u);
        return u[a - 1];
    }

    /** Index of the highest Beta sample ({s, n} per candidate; first wins ties). */
    static int thompson(int[][] sn, Rng r) {
        int best = -1;
        double bestV = -1;
        for (int i = 0; i < sn.length; i++) {
            double v = beta(sn[i][0], sn[i][1], r);
            if (v > bestV) {
                best = i;
                bestV = v;
            }
        }
        return best;
    }

    /** Candidate to use, or -1 = the old random choice (exploration floor / no evidence yet). */
    static int choose(int[][] sn, Rng r) {
        double roll = r.next() * 100;
        if (sn.length == 0 || roll < EXPLORE_PCT) return -1;
        boolean any = false;
        for (int[] x : sn) if (x[1] > 0) any = true;
        return any ? thompson(sn, r) : -1;
    }

    /** A random raw line of `pool`, never the one hashing to `lastHash` when there's another. */
    static String pickLine(JSONArray pool, Rng r, Integer lastHash) {
        if (pool == null || pool.length() == 0) return "";
        int n = pool.length();
        int i = r.nextInt(n);
        if (n > 1 && lastHash != null && hash(pool.optString(i)) == lastHash) {
            i = (i + 1 + r.nextInt(n - 1)) % n;
        }
        return pool.optString(i, "");
    }

    /** {s, n} of one arm in a stats object ({key: {n, s}}). */
    static int[] statOf(JSONObject stats, String key) {
        JSONObject o = stats != null ? stats.optJSONObject(key) : null;
        if (o == null) return new int[]{0, 0};
        int n = Math.max(0, o.optInt("n"));
        return new int[]{Math.min(n, Math.max(0, o.optInt("s"))), n};
    }

    /**
     * Totals to sample from: the app's aggregate (snapshot "jabs") plus this log's
     * decided entries the app hasn't counted yet (ts > until, ts >= since).
     */
    static JSONObject stats(JSONObject snap, JSONArray log) {
        JSONObject out = new JSONObject();
        try {
            JSONObject arms = snap != null ? snap.optJSONObject("arms") : null;
            if (arms != null) {
                for (java.util.Iterator<String> it = arms.keys(); it.hasNext(); ) {
                    String k = it.next();
                    int[] st = statOf(arms, k);
                    out.put(k, new JSONObject().put("n", st[1]).put("s", st[0]));
                }
            }
            long since = snap != null ? snap.optLong("since", 0) : 0;
            long until = snap != null ? snap.optLong("until", 0) : 0;
            for (int i = 0; log != null && i < log.length(); i++) {
                JSONObject e = log.optJSONObject(i);
                if (e == null) continue;
                long ts = e.optLong("ts");
                int o = e.optInt("outcome", -1);
                if (o < 0 || ts <= until || ts < since) continue;
                String k = armKey(e.optString("arm"), e.optString("daypart"));
                int[] st = statOf(out, k);
                out.put(k, new JSONObject().put("n", st[1] + 1).put("s", st[0] + (o == 1 ? 1 : 0)));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    /** Appends and keeps the newest LOG_CAP entries. */
    static JSONArray append(JSONArray log, JSONObject entry) {
        JSONArray src = log != null ? log : new JSONArray();
        int from = Math.max(0, src.length() + 1 - LOG_CAP);
        JSONArray out = new JSONArray();
        for (int i = from; i < src.length(); i++) out.put(src.opt(i));
        out.put(entry);
        return out;
    }

    /** The row moved since the jab: more amount (build) / confirmed clean (avoid). */
    static boolean progressed(JSONObject e, JSONObject row) {
        if (row == null) return false;
        if (WidgetShared.isAvoid(row)) {
            return "clean".equals(row.optString("status")) && !"clean".equals(e.optString("status"));
        }
        return WidgetShared.amount(row) > e.optInt("amount");
    }

    /**
     * Settles open entries against the snapshot rows of `date`: 1 when the row
     * progressed within the window, 0 once the window (or the day) is over without
     * it. Returns true when anything changed.
     */
    static boolean evaluate(JSONArray log, String date, JSONArray rows, long now) {
        boolean changed = false;
        for (int i = 0; log != null && i < log.length(); i++) {
            JSONObject e = log.optJSONObject(i);
            if (e == null || e.optInt("outcome", -1) >= 0) continue;
            try {
                boolean open = now - e.optLong("ts") <= WINDOW_MIN * 60_000L;
                JSONObject row = date != null && date.equals(e.optString("date")) ? find(rows, e.optString("habitId")) : null;
                if (row != null && progressed(e, row)) {
                    e.put("outcome", open ? 1 : 0);
                    changed = true;
                } else if (!open || row == null) {
                    e.put("outcome", 0);
                    changed = true;
                }
            } catch (Exception ignored) {
            }
        }
        return changed;
    }

    private static JSONObject find(JSONArray rows, String id) {
        for (int i = 0; rows != null && i < rows.length(); i++) {
            JSONObject h = rows.optJSONObject(i);
            if (h != null && id.equals(h.optString("id"))) return h;
        }
        return null;
    }

    /** What HabitNotifier.pickJab chose. */
    static final class Pick {
        final String text;
        final String raw;
        final String kind;
        final boolean explore;

        Pick(String text, String raw, String kind, boolean explore) {
            this.text = text;
            this.raw = raw;
            this.kind = kind;
            this.explore = explore;
        }
    }

    /** A log entry for a posted jab (JabEntry in jabs.ts). */
    static JSONObject entry(Pick p, JSONObject row, long ts, String date, int minute, String userName) throws Exception {
        return new JSONObject()
            .put("id", ts + ":" + row.optString("id"))
            .put("ts", ts)
            .put("date", date)
            .put("min", minute)
            .put("habitId", row.optString("id"))
            .put("arm", p.kind)
            .put("daypart", daypart(minute))
            .put("hash", hash(p.raw))
            .put("style", style(p.text, userName))
            .put("amount", WidgetShared.amount(row))
            .put("status", row.optString("status", ""))
            .put("explore", p.explore)
            .put("outcome", -1);
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONArray log(Context c) {
        try {
            return new JSONArray(prefs(c).getString(KEY_LOG, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** Logs a posted jab and remembers its line for the habit (no repeats). */
    static synchronized void record(Context c, Pick p, JSONObject row) {
        if (p == null || row == null) return;
        try {
            long now = System.currentTimeMillis();
            JSONObject e = entry(p, row, now, WidgetShared.today(), WidgetShared.nowMinute(), WidgetShared.userName(c));
            JSONObject last = lastLines(c);
            last.put(row.optString("id"), hash(p.raw));
            prefs(c).edit()
                .putString(KEY_LOG, append(log(c), e).toString())
                .putString(KEY_LAST, last.toString())
                .apply();
        } catch (Exception ignored) {
        }
    }

    /** Settles open entries against the current snapshot (cheap when nothing is open). */
    static synchronized void evaluate(Context c) {
        JSONArray log = log(c);
        if (log.length() == 0) return;
        JSONObject state = WidgetShared.state(c);
        if (evaluate(log, state.optString("date", ""), state.optJSONArray("habits"), System.currentTimeMillis())) {
            prefs(c).edit().putString(KEY_LOG, log.toString()).apply();
        }
    }

    private static JSONObject lastLines(Context c) {
        try {
            return new JSONObject(prefs(c).getString(KEY_LAST, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** Hash of the last raw line jabbed for this habit, or null. */
    static Integer lastHash(Context c, String habitId) {
        JSONObject last = lastLines(c);
        return last.has(habitId) ? last.optInt(habitId) : null;
    }

    /** Totals to sample from right now (snapshot aggregate + newer native entries). */
    static JSONObject currentStats(Context c) {
        return stats(WidgetShared.state(c).optJSONObject("jabs"), log(c));
    }
}
