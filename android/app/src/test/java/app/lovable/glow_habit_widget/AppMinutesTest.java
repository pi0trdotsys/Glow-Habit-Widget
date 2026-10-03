package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** "Minuty z aplikacji": foreground sessions per app and the manual adjustment on top. */
public class AppMinutesTest {
    private static final long MIN = 60_000L;
    private static final String DUO = "com.duolingo";
    private static final String BUSUU = "com.busuu.android.enc";
    private static final String LAUNCHER = "com.android.launcher";

    /** Builds an event stream: (minute, kind, pkg, class). */
    private static final class Ev {
        final List<Long> t = new ArrayList<>();
        final List<Integer> k = new ArrayList<>();
        final List<String> p = new ArrayList<>();
        final List<String> c = new ArrayList<>();

        Ev at(long minute, int kind, String pkg, String cls) {
            t.add(minute * MIN);
            k.add(kind);
            p.add(pkg);
            c.add(cls);
            return this;
        }

        Ev resume(long m, String pkg) {
            return at(m, AppMinutes.RESUME, pkg, pkg + ".Main");
        }

        Ev pause(long m, String pkg) {
            return at(m, AppMinutes.PAUSE, pkg, pkg + ".Main");
        }

        Ev off(long m) {
            return at(m, AppMinutes.OFF, null, null);
        }

        Map<String, Long> run(Set<String> watched, long fromMin, long toMin) {
            int n = t.size();
            long[] tt = new long[n];
            int[] kk = new int[n];
            for (int i = 0; i < n; i++) {
                tt[i] = t.get(i);
                kk[i] = k.get(i);
            }
            return AppMinutes.foregroundMs(tt, kk, p.toArray(new String[0]), c.toArray(new String[0]),
                watched, fromMin * MIN, toMin * MIN);
        }
    }

    private static Set<String> set(String... s) {
        return new HashSet<>(Arrays.asList(s));
    }

    private static long min(Map<String, Long> m, String pkg) {
        Long v = m.get(pkg);
        return v == null ? 0 : v / MIN;
    }

    @Test
    public void resumedPausedPairsAddUpPerApp() {
        Map<String, Long> m = new Ev()
            .resume(600, DUO).pause(609, DUO)
            .resume(609, LAUNCHER)
            .resume(700, BUSUU).pause(704, BUSUU)
            .resume(800, DUO).pause(803, DUO)
            .run(set(DUO, BUSUU), 0, 1440);
        assertEquals(12, min(m, DUO));
        assertEquals(4, min(m, BUSUU));
        assertFalse(m.containsKey(LAUNCHER));
    }

    @Test
    public void screenOffEndsTheSession() {
        // Duolingo left open, screen off at 10:15 (no pause event), back on at 12:00 (other app).
        Map<String, Long> m = new Ev()
            .resume(600, DUO).off(615)
            .resume(720, LAUNCHER)
            .run(set(DUO), 0, 1440);
        assertEquals(15, min(m, DUO));
    }

    @Test
    public void anotherAppInFrontEndsTheSessionWithoutAPause() {
        Map<String, Long> m = new Ev()
            .resume(600, DUO)
            .resume(605, BUSUU).pause(610, BUSUU)
            .run(set(DUO, BUSUU), 0, 1440);
        assertEquals(5, min(m, DUO));
        assertEquals(5, min(m, BUSUU));
    }

    @Test
    public void activitySwitchesInsideOneAppDontSplitIt() {
        // Lesson activity resumes before the home activity is paused.
        Map<String, Long> m = new Ev()
            .at(600, AppMinutes.RESUME, DUO, "Home")
            .at(602, AppMinutes.RESUME, DUO, "Lesson")
            .at(602, AppMinutes.PAUSE, DUO, "Home")
            .at(610, AppMinutes.PAUSE, DUO, "Lesson")
            .at(610, AppMinutes.PAUSE, DUO, "Lesson") // a stopped event after the pause
            .run(set(DUO), 0, 1440);
        assertEquals(10, min(m, DUO));
    }

    @Test
    public void clippedToTheDayAndOpenSessionsRunToTheEnd() {
        // Started 23:50 the day before, paused 00:10: only 10 min belong to the day.
        Map<String, Long> m = new Ev()
            .resume(-10, DUO).pause(10, DUO)
            .resume(1430, BUSUU) // still open at midnight
            .run(set(DUO, BUSUU), 0, 1440);
        assertEquals(10, min(m, DUO));
        assertEquals(10, min(m, BUSUU));
        // today so far (to = now 10:05): an app in front right now counts until now
        Map<String, Long> now = new Ev().resume(600, DUO).run(set(DUO), 0, 605);
        assertEquals(5, min(now, DUO));
    }

    @Test
    public void nullWatchedCountsEveryApp() {
        Map<String, Long> m = new Ev().resume(600, DUO).resume(603, LAUNCHER).off(605).run(null, 0, 1440);
        assertEquals(3, min(m, DUO));
        assertEquals(2, min(m, LAUNCHER));
    }

    @Test
    public void minutesRoundAndTotalMatchesTheList() {
        Map<String, Long> ms = new LinkedHashMap<>();
        ms.put(DUO, 9 * MIN + 31_000L);
        ms.put(BUSUU, 4 * MIN);
        ms.put("x", 20_000L);
        Map<String, Integer> m = AppMinutes.minutes(ms);
        assertEquals(Integer.valueOf(10), m.get(DUO));
        assertEquals(Integer.valueOf(4), m.get(BUSUU));
        assertFalse(m.containsKey("x"));
        assertEquals(14, AppMinutes.total(m, Arrays.asList(DUO, BUSUU, "missing")));
    }

    @Test
    public void adjustmentStaysOnTopNeverBelowZero() {
        // 9 from apps + 2 by hand = 11; apps go to 13 -> 15
        assertEquals(15, AppMinutes.adjusted(11, 9, 13));
        // took 5 off by hand (9 -> 4); apps 12 -> 7
        assertEquals(7, AppMinutes.adjusted(4, 9, 12));
        // apps dropped (events trimmed): never below 0
        assertEquals(0, AppMinutes.adjusted(1, 9, 0));
    }

    @Test
    public void tapAddsAStepOrTakesBackTheManualPart() {
        assertEquals(10, AppMinutes.tapAmount(5, 5, 15, 5));
        assertEquals(15, AppMinutes.tapAmount(12, 9, 15, 5)); // capped at the goal
        assertEquals(9, AppMinutes.tapAmount(15, 9, 15, 5)); // done: back to the app minutes
        assertEquals(20, AppMinutes.tapAmount(20, 20, 15, 5)); // the apps did it all: nothing to undo
    }

    private static JSONObject row(int amount, int appMin) throws Exception {
        return new JSONObject().put("v", 2).put("id", "lang").put("kind", "build").put("goal", "minutes")
            .put("amount", amount).put("target", 15).put("step", 5).put("source", "apps")
            .put("apps", new JSONArray().put(DUO).put(BUSUU)).put("appMin", appMin);
    }

    @Test
    public void syncIntoARowKeepsTheManualAdjustment() throws Exception {
        JSONObject r = row(11, 9); // 9 from apps + 2 by hand
        Map<String, Integer> today = new LinkedHashMap<>();
        today.put(DUO, 9);
        today.put(BUSUU, 4);
        today.put("com.instagram.android", 30); // not a chosen app
        JSONObject op = AppMinutes.applyTo(r, today);
        assertEquals(15, r.getInt("amount"));
        assertEquals(13, r.getInt("appMin"));
        assertTrue(r.getBoolean("done"));
        assertEquals(15, op.getInt("amount"));
        assertEquals(13, op.getInt("appMin"));
        assertEquals(4, op.getJSONObject("appSplit").getInt(BUSUU));
        // same minutes again: no op
        assertNull(AppMinutes.applyTo(r, today));
        assertTrue(AppMinutes.isApps(r));
        assertFalse(AppMinutes.isApps(row(0, 0).put("apps", new JSONArray())));
        assertFalse(AppMinutes.isApps(row(0, 0).put("source", "steps")));
    }
}
