package app.lovable.glow_habit_widget;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Last night's sleep from the band (Health Connect SleepSessionRecord, written
 * by Mi Fitness & co.) - the pure part, unit-tested in SleepCalcTest. HealthSleep
 * reads the sessions; this picks the source, the main sleep and sums the stages.
 *
 * The night filed under day D is the evening of D to the morning of D+1:
 * sessions overlapping [D 18:00, D+1 14:00]. Of one source only (two apps
 * writing the same night would count it twice): the preferred package, or
 * "auto" = Mi Fitness when it wrote anything, else the app with the most sleep.
 * Sessions chained by short gaps (woke up at 3, back to sleep) are one night;
 * of several such chains the longest is the main sleep (an evening nap isn't).
 */
final class SleepCalc {
    // SleepSessionRecord.STAGE_TYPE_* (same numbers as Health Connect).
    static final int STAGE_UNKNOWN = 0, STAGE_AWAKE = 1, STAGE_SLEEPING = 2, STAGE_OUT_OF_BED = 3,
        STAGE_LIGHT = 4, STAGE_DEEP = 5, STAGE_REM = 6, STAGE_AWAKE_IN_BED = 7;

    static final long MIN = 60_000L;
    static final long HOUR = 60 * MIN;
    /** The night window after the day's midnight: 18:00 .. 14:00 next day. */
    static final long WINDOW_FROM = 18 * HOUR;
    static final long WINDOW_TO = 38 * HOUR;
    /** Sessions closer than this are the same night. */
    static final long CHAIN_GAP = 2 * HOUR;
    /** Shorter than this isn't a night's sleep (a nap, a forgotten band). */
    static final long MIN_NIGHT = HOUR;
    /** Bill thresholds: under 6 h = short night, 7 h+ = rested. */
    static final int SHORT_MIN = 6 * 60;
    static final int RESTED_MIN = 7 * 60;
    /** "Fell asleep X min after the phone went down" only when the two are this close. */
    static final int FELL_MAX = 6 * 60;
    static final int UNKNOWN = Integer.MIN_VALUE;

    static final String AUTO = "auto";
    static final String MI_FITNESS = "com.xiaomi.wearable";

    private SleepCalc() {}

    static final class Stage {
        final long start, end;
        final int type;

        Stage(long start, long end, int type) {
            this.start = start;
            this.end = end;
            this.type = type;
        }
    }

    static final class Session {
        final long start, end;
        final String source;
        final List<Stage> stages;

        Session(long start, long end, String source, List<Stage> stages) {
            this.start = start;
            this.end = end;
            this.source = source == null ? "" : source;
            this.stages = stages == null ? Collections.<Stage>emptyList() : stages;
        }
    }

    /** One night's sleep; stage minutes are -1 when the source wrote no stages. */
    static final class Night {
        long start, end;
        int minutes;
        int deep = -1, rem = -1, light = -1, awake = -1;
        String source = "";
    }

    static boolean isAwake(int type) {
        return type == STAGE_AWAKE || type == STAGE_AWAKE_IN_BED || type == STAGE_OUT_OF_BED;
    }

    /** [from, to] of the night filed under the day starting at `dayStart` (ms). */
    static long[] window(long dayStart) {
        return new long[]{dayStart + WINDOW_FROM, dayStart + WINDOW_TO};
    }

    /** Sessions overlapping [from, to]. */
    static List<Session> overlapping(List<Session> all, long from, long to) {
        List<Session> out = new ArrayList<>();
        for (Session s : all) if (s.end > from && s.start < to && s.end > s.start) out.add(s);
        return out;
    }

    /** Time covered by the intervals (overlaps counted once). */
    static long unionMs(List<long[]> intervals) {
        List<long[]> l = new ArrayList<>(intervals);
        Collections.sort(l, (a, b) -> Long.compare(a[0], b[0]));
        long total = 0;
        long curStart = 0, curEnd = Long.MIN_VALUE;
        for (long[] i : l) {
            if (i[1] <= i[0]) continue;
            if (i[0] > curEnd) {
                if (curEnd > curStart) total += curEnd - curStart;
                curStart = i[0];
                curEnd = i[1];
            } else if (i[1] > curEnd) {
                curEnd = i[1];
            }
        }
        if (curEnd > curStart) total += curEnd - curStart;
        return total;
    }

    private static long sessionsMs(List<Session> s) {
        List<long[]> l = new ArrayList<>();
        for (Session x : s) l.add(new long[]{x.start, x.end});
        return unionMs(l);
    }

    /** Sleep time per writing app (overlaps counted once), in first-seen order. */
    static Map<String, Long> perSource(List<Session> sessions) {
        Map<String, List<Session>> by = new LinkedHashMap<>();
        for (Session s : sessions) {
            List<Session> l = by.get(s.source);
            if (l == null) by.put(s.source, l = new ArrayList<>());
            l.add(s);
        }
        Map<String, Long> out = new LinkedHashMap<>();
        for (Map.Entry<String, List<Session>> e : by.entrySet()) out.put(e.getKey(), sessionsMs(e.getValue()));
        return out;
    }

    /**
     * Whose sleep to use: `preferred` when it wrote any, otherwise ("auto")
     * Mi Fitness when present, else the app with the most sleep. Null = no sessions.
     */
    static String pickSource(List<Session> sessions, String preferred) {
        Map<String, Long> per = perSource(sessions);
        if (per.isEmpty()) return null;
        if (preferred != null && !preferred.isEmpty() && !AUTO.equals(preferred) && per.containsKey(preferred))
            return preferred;
        if (per.containsKey(MI_FITNESS)) return MI_FITNESS;
        String best = null;
        long bestMs = -1;
        for (Map.Entry<String, Long> e : per.entrySet()) {
            if (e.getValue() > bestMs) {
                bestMs = e.getValue();
                best = e.getKey();
            }
        }
        return best;
    }

    /** The main sleep: sessions chained by gaps under CHAIN_GAP, the chain with the most sleep. */
    static List<Session> mainChain(List<Session> sessions) {
        List<Session> sorted = new ArrayList<>(sessions);
        Collections.sort(sorted, (a, b) -> Long.compare(a.start, b.start));
        List<Session> best = new ArrayList<>();
        long bestMs = -1;
        List<Session> cur = new ArrayList<>();
        long curEnd = Long.MIN_VALUE;
        for (Session s : sorted) {
            if (!cur.isEmpty() && s.start - curEnd >= CHAIN_GAP) {
                long ms = sessionsMs(cur);
                if (ms > bestMs) {
                    bestMs = ms;
                    best = cur;
                }
                cur = new ArrayList<>();
                curEnd = Long.MIN_VALUE;
            }
            cur.add(s);
            curEnd = Math.max(curEnd, s.end);
        }
        if (!cur.isEmpty() && sessionsMs(cur) > bestMs) best = cur;
        return best;
    }

    /** Start/end, asleep minutes (awake stages left out) and stage sums of a chain. */
    static Night summarize(List<Session> chain) {
        Night n = new Night();
        if (chain.isEmpty()) return n;
        n.start = Long.MAX_VALUE;
        n.end = Long.MIN_VALUE;
        long deep = 0, rem = 0, light = 0, awake = 0;
        boolean staged = false;
        for (Session s : chain) {
            n.start = Math.min(n.start, s.start);
            n.end = Math.max(n.end, s.end);
            for (Stage st : s.stages) {
                long ms = Math.max(0, Math.min(st.end, s.end) - Math.max(st.start, s.start));
                if (ms == 0) continue;
                staged = true;
                if (isAwake(st.type)) awake += ms;
                else if (st.type == STAGE_DEEP) deep += ms;
                else if (st.type == STAGE_REM) rem += ms;
                else if (st.type == STAGE_LIGHT) light += ms;
            }
        }
        n.source = chain.get(0).source;
        long total = sessionsMs(chain);
        n.minutes = (int) Math.round(Math.max(0, total - awake) / (double) MIN);
        if (staged) {
            n.deep = (int) Math.round(deep / (double) MIN);
            n.rem = (int) Math.round(rem / (double) MIN);
            n.light = (int) Math.round(light / (double) MIN);
            n.awake = (int) Math.round(awake / (double) MIN);
        }
        return n;
    }

    /** The whole pick for the night filed under the day starting at `dayStart`; null = no sleep found. */
    static Night night(List<Session> all, long dayStart, String preferred) {
        long[] w = window(dayStart);
        List<Session> in = overlapping(all, w[0], w[1]);
        String source = pickSource(in, preferred);
        if (source == null) return null;
        List<Session> mine = new ArrayList<>();
        for (Session s : in) if (s.source.equals(source)) mine.add(s);
        List<Session> chain = mainChain(mine);
        if (sessionsMs(chain) < MIN_NIGHT) return null;
        return summarize(chain);
    }

    /**
     * Minutes from putting the phone down to falling asleep (both minutes of
     * day, across midnight); negative = the phone went down after falling
     * asleep; UNKNOWN when either is missing or they're too far apart to compare.
     */
    static int fellAfter(int asleepMin, int sleepStartMin) {
        if (asleepMin < 0 || sleepStartMin < 0) return UNKNOWN;
        int d = ((sleepStartMin - asleepMin) % 1440 + 1440) % 1440;
        if (d >= 720) d -= 1440;
        return Math.abs(d) > FELL_MAX ? UNKNOWN : d;
    }

    /** "6 h 12 min", "7 h", "45 min" (same in both languages; mirrors fmtSleep in night.ts). */
    static String duration(int minutes) {
        int h = minutes / 60;
        int m = minutes % 60;
        if (h == 0) return m + " min";
        return m == 0 ? h + " h" : h + " h " + m + " min";
    }

    /** "00:48–07:00". */
    static String range(int startMin, int endMin) {
        return WidgetShared.fmtMinute(startMin) + "–" + WidgetShared.fmtMinute(endMin);
    }

    /**
     * Which comment pools fit a night (mirrors billPools in night.ts): a short
     * night (< 6 h) gets the short-sleep jabs (plus the social ones if it also
     * scrolled), scrolling gets "bad", a clean 7 h+ night "good" + "rested".
     * `sleepMin` < 0 = sleep unknown.
     */
    static String[] billPools(int social, int sleepMin) {
        boolean bad = social > 0;
        if (sleepMin >= 0 && sleepMin < SHORT_MIN) return bad ? new String[]{"bad", "short"} : new String[]{"short"};
        if (bad) return new String[]{"bad"};
        if (sleepMin >= RESTED_MIN) return new String[]{"good", "rested"};
        return new String[]{"good"};
    }

    static int minuteOfDay(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
    }

    /** The report's "sleep": {start, end (minutes of day), minutes, deep?, rem?, light?, awake?, source}. */
    static JSONObject toJson(Night n) throws JSONException {
        JSONObject o = new JSONObject()
            .put("start", minuteOfDay(n.start))
            .put("end", minuteOfDay(n.end))
            .put("minutes", n.minutes)
            .put("source", n.source);
        if (n.awake >= 0) {
            o.put("deep", n.deep).put("rem", n.rem).put("light", n.light).put("awake", n.awake);
        }
        return o;
    }

    /** Debug-friendly one-liner ("6 h 12 min (00:48–07:00)"). */
    static String summary(JSONObject sleep) {
        return String.format(Locale.US, "%s (%s)", duration(sleep.optInt("minutes")),
            range(sleep.optInt("start"), sleep.optInt("end")));
    }
}
