package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Night stats, the full-screen block, quick-log buttons and the cat's condition on the widget. */
public class NightStatsTest {
    private static final long M = 60_000L;
    private static final String IG = "com.instagram.android";
    private static final String YT = "com.google.android.youtube";
    private static final String CLOCK = "com.android.deskclock";
    private static final String MUSIC = "com.spotify.music";
    private static final Set<String> WATCHED = new HashSet<>(Arrays.asList(IG, YT));

    private static Map<String, NightStats.AppUse> use(Object... ev) {
        int n = ev.length / 3;
        long[] t = new long[n];
        String[] p = new String[n];
        boolean[] r = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = ((Number) ev[i * 3]).longValue() * M;
            p[i] = (String) ev[i * 3 + 1];
            r[i] = (Boolean) ev[i * 3 + 2];
        }
        return NightStats.socialUse(t, p, r, WATCHED, 0, 300 * M);
    }

    @Test
    public void socialMinutesAndVisitsPerApp() {
        Map<String, NightStats.AppUse> u = use(
            10, IG, true, 30, IG, false, // 20 min Instagram
            31, YT, true, 56, YT, false, // 25 min YouTube
            60, IG, true, 62, IG, false); // 2 min Instagram again
        assertEquals(2, u.get(IG).visits);
        assertEquals(22 * M, u.get(IG).ms);
        assertEquals(1, u.get(YT).visits);
        assertEquals(47 * M, NightStats.totalMs(u));
    }

    @Test
    public void alarmAndMusicDontCount() {
        Map<String, NightStats.AppUse> u = use(10, CLOCK, true, 100, CLOCK, false, 101, MUSIC, true, 200, MUSIC, false);
        assertEquals(0, NightStats.totalMs(u));
        assertFalse(u.containsKey(CLOCK));
    }

    @Test
    public void activitiesOfTheSameAppAndQuickReturnsAreOneVisit() {
        // two activities inside Instagram, then back within 30 s after a notification shade peek
        Map<String, NightStats.AppUse> u = NightStats.socialUse(
            new long[]{0, 5 * M, 10 * M, 10 * M + 30_000, 20 * M},
            new String[]{IG, IG, IG, IG, IG},
            new boolean[]{true, true, false, true, false}, WATCHED, 0, 300 * M);
        assertEquals(1, u.get(IG).visits);
        assertEquals(19 * M + 30_000, u.get(IG).ms);
    }

    @Test
    public void onlyTheWindowCounts() {
        // Instagram from 23:30 (before the window, -30 min) to 00:20 -> 20 min, visit started before -> not counted
        Map<String, NightStats.AppUse> u = use(-30, IG, true, 20, IG, false);
        assertEquals(20 * M, u.get(IG).ms);
        assertEquals(0, u.get(IG).visits);
        // still open at the end of the window -> counted up to `to`
        Map<String, NightStats.AppUse> open = use(290, YT, true);
        assertEquals(10 * M, open.get(YT).ms);
    }

    @Test
    public void asleepIsTheStartOfTheLongestScreenOffStretch() {
        long h = 60 * M;
        // window 21:00 (0) .. 12:00 (15h). Off 21:00-22:00 (TV), on until 01:40, off till 03:00 (pee), 03:05 off till 08:00
        long[] t = {1 * h, 4 * h + 40 * M, 6 * h, 6 * h + 5 * M, 11 * h};
        boolean[] on = {true, false, true, false, true};
        assertEquals(6 * h + 5 * M, NightStats.longestOffStart(t, on, false, 0, 15 * h, NightStats.MIN_SLEEP_MS));
        // no stretch of 3 h -> unknown
        assertEquals(-1, NightStats.longestOffStart(new long[]{h, 2 * h, 3 * h}, new boolean[]{false, true, false}, true, 0, 5 * h, NightStats.MIN_SLEEP_MS));
        // still asleep at the end of the window
        assertEquals(2 * h, NightStats.longestOffStart(new long[]{2 * h}, new boolean[]{false}, true, 0, 9 * h, NightStats.MIN_SLEEP_MS));
    }

    @Test
    public void billTextAndPlaceholders() throws Exception {
        JSONObject r = new JSONObject().put("social", 47).put("screen", 61).put("visits", 4).put("asleep", 100)
            .put("apps", new JSONArray()
                .put(new JSONObject().put("label", "Instagram").put("visits", 3).put("minutes", 22))
                .put(new JSONObject().put("label", "YouTube").put("visits", 1).put("minutes", 25)));
        assertEquals("3× Instagram (22 min) · 1× YouTube (25 min)", NightStats.appsLine(r.optJSONArray("apps")));
        assertEquals("47/61/4/01:40", NightStats.fill("{social}/{screen}/{visits}/{asleep}", r));
        JSONObject lines = new JSONObject().put("bad", new JSONArray().put("Spałeś od {asleep}? {social} min."))
            .put("good", new JSONArray().put("Czysto."));
        String[] t = HabitNotifier.billText(r, lines);
        assertTrue(t[0].contains("4× social media, 47 min"));
        assertTrue(t[1].startsWith("Po północy: 3× Instagram"));
        assertTrue(t[1].contains("61 min z telefonem po północy"));
        assertTrue(t[1].contains("ok. 01:40"));
        assertTrue(t[1].endsWith("od 01:40? 47 min."));
        // clean night, unknown sleep: {asleep} lines are skipped
        JSONObject clean = new JSONObject().put("social", 0).put("screen", 2).put("visits", 0).put("asleep", -1)
            .put("apps", new JSONArray());
        JSONObject l2 = new JSONObject().put("good", new JSONArray().put("Od {asleep} spokój.").put("Czysta noc."));
        String[] c = HabitNotifier.billText(clean, l2);
        assertTrue(c[0].endsWith("czysto"));
        assertTrue(c[1].startsWith("Zero social mediów"));
        assertTrue(c[1].endsWith("Czysta noc."));
        assertFalse(c[1].contains("odłożony"));
    }

    @Test
    public void judgingBasisDefaultsToSocial() throws Exception {
        assertTrue(HabitNotifier.socialBasis(new JSONObject()));
        assertTrue(HabitNotifier.socialBasis(new JSONObject().put("lateBasis", "social")));
        assertFalse(HabitNotifier.socialBasis(new JSONObject().put("lateBasis", "screen")));
    }

    @Test
    public void blockComesAfterTheThirdJab() {
        assertFalse(LiveGuard.shouldBlock(1));
        assertFalse(LiveGuard.shouldBlock(3));
        assertTrue(LiveGuard.shouldBlock(4));
        // with the tracker: jabs at 0, 5, 10 min, the 4th (15 min) is the block
        LiveGuard.Tracker t = new LiveGuard.Tracker();
        assertEquals(LiveGuard.FIRST, t.onForeground(IG, true, 0, 0));
        assertEquals(LiveGuard.ESCALATE, t.onForeground(IG, true, 5 * M, 0));
        assertFalse(LiveGuard.shouldBlock(t.jabs));
        assertEquals(LiveGuard.ESCALATE, t.onForeground(IG, true, 10 * M, 0));
        assertFalse(LiveGuard.shouldBlock(t.jabs));
        assertEquals(LiveGuard.ESCALATE, t.onForeground(IG, true, 15 * M, 0));
        assertTrue(LiveGuard.shouldBlock(t.jabs));
    }

    private static JSONObject row(String id, String name, String goal, int amount, int target, int step, String unit) throws Exception {
        JSONObject o = new JSONObject().put("id", id).put("name", name).put("kind", "build").put("goal", goal)
            .put("amount", amount).put("target", target).put("step", step).put("unit", unit);
        if ("szklanek".equals(unit)) o.put("unitForms", new JSONArray(Arrays.asList("szklanka", "szklanki", "szklanek")));
        return o;
    }

    @Test
    public void quickLogButtons() throws Exception {
        JSONObject water = row("w", "Picie wody", "count", 3, 8, 1, "szklanek");
        JSONObject read = row("r", "Czytanie książki", "minutes", 10, 20, 15, "min");
        JSONObject teeth = row("t", "Mycie zębów", "check", 0, 1, 1, "");
        JSONObject steps = row("s", "8000 kroków", "count", 100, 8000, 1000, "kroków").put("source", "steps");
        JSONObject avoid = new JSONObject().put("id", "a").put("name", "Fast food").put("kind", "avoid").put("status", "pending");
        assertEquals("+1 szklanka", HabitNotifier.quickLabel(water));
        assertEquals("+10 min Czytanie", HabitNotifier.quickLabel(read)); // capped at what's left
        assertEquals("✓ Mycie", HabitNotifier.quickLabel(teeth));
        List<JSONObject> q = HabitNotifier.quickRows(Arrays.asList(avoid, steps, water, read, teeth, row("x", "X", "check", 0, 1, 1, "")), 3);
        assertEquals(3, q.size());
        assertEquals("w", q.get(0).optString("id")); // forbidden and step-synced habits are skipped
        assertEquals("r", q.get(1).optString("id"));
        assertEquals("t", q.get(2).optString("id"));
    }

    @Test
    public void catConditionOnTheWidget() {
        assertEquals(1, SzpilaWidgetProvider.condMood("neglected", 2)); // offended whatever it says
        assertEquals(2, SzpilaWidgetProvider.condMood("groomed", 0));
        assertEquals(1, SzpilaWidgetProvider.condMood("groomed", 1));
        assertEquals(0, SzpilaWidgetProvider.condMood("normal", 0));
        assertEquals(0, SzpilaWidgetProvider.condDrawable("normal"));
        assertTrue(SzpilaWidgetProvider.title("neglected", 1).contains("obrażony"));
        assertTrue(SzpilaWidgetProvider.title("groomed", 2).contains("zadbany"));
    }
}
