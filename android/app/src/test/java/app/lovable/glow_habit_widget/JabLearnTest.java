package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.BeforeClass;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.Set;

/**
 * "Co na ciebie działa": the native half of the jab bandit (JabLearn + HabitNotifier.pickJab).
 * The RNG, hash, style tags and sampling must match src/lib/habits/jabs.ts exactly -
 * both sides check tests/jab-vectors.json (tests/jabs.test.ts).
 */
public class JabLearnTest {
    private static JSONObject v;

    @BeforeClass
    public static void load() throws Exception {
        Path p = Paths.get("..", "..", "tests", "jab-vectors.json");
        v = new JSONObject(new String(Files.readAllBytes(p), StandardCharsets.UTF_8));
    }

    private static int at(int h, int m) {
        return h * 60 + m;
    }

    // ------------------------------------------------------------------
    // Parity with jabs.ts
    // ------------------------------------------------------------------

    @Test
    public void constantsMatchTs() throws Exception {
        JSONObject c = v.getJSONObject("constants");
        assertEquals(c.getInt("windowMin"), JabLearn.WINDOW_MIN);
        assertEquals(c.getInt("logCap"), JabLearn.LOG_CAP);
        assertEquals(c.getInt("explorePct"), JabLearn.EXPLORE_PCT);
        assertEquals(c.getInt("priorA"), JabLearn.PRIOR_A);
        assertEquals(c.getInt("priorB"), JabLearn.PRIOR_B);
        assertEquals(c.getInt("sampleCap"), JabLearn.SAMPLE_CAP);
        assertEquals(c.getInt("afternoonFrom"), JabLearn.AFTERNOON_FROM);
        assertEquals(c.getInt("eveningFrom"), JabLearn.EVENING_FROM);
        JSONArray kinds = c.getJSONArray("kinds");
        assertEquals(kinds.length(), JabLearn.KINDS.length);
        for (int i = 0; i < kinds.length(); i++) assertEquals(kinds.getString(i), JabLearn.KINDS[i]);
    }

    @Test
    public void rngHashStyleDaypartsMatchTs() throws Exception {
        for (String k : new String[]{"rng", "rngNeg"}) {
            JSONObject r = v.getJSONObject(k);
            JabLearn.Rng rng = new JabLearn.Rng(r.getInt("seed"));
            JSONArray vals = r.getJSONArray("values");
            for (int i = 0; i < vals.length(); i++) assertEquals(vals.getDouble(i), rng.next(), 0);
        }
        JSONArray h = v.getJSONArray("hashes");
        for (int i = 0; i < h.length(); i++) {
            assertEquals(h.getJSONArray(i).getInt(1), JabLearn.hash(h.getJSONArray(i).getString(0)));
        }
        JSONArray s = v.getJSONArray("styles");
        for (int i = 0; i < s.length(); i++) {
            JSONArray x = s.getJSONArray(i);
            String name = x.isNull(1) ? null : x.getString(1);
            assertEquals(x.toString(), x.getString(2), JabLearn.style(x.getString(0), name));
        }
        JSONArray d = v.getJSONArray("dayparts");
        for (int i = 0; i < d.length(); i++) {
            assertEquals(d.getJSONArray(i).getString(1), JabLearn.daypart(d.getJSONArray(i).getInt(0)));
        }
        JSONArray e = v.getJSONArray("effective");
        for (int i = 0; i < e.length(); i++) {
            JSONArray x = e.getJSONArray(i);
            assertArrayEquals(new int[]{x.getInt(2), x.getInt(3)}, JabLearn.effective(x.getInt(0), x.getInt(1)));
        }
    }

    @Test
    public void betaAndChoiceMatchTs() throws Exception {
        JSONArray b = v.getJSONArray("beta");
        for (int i = 0; i < b.length(); i++) {
            JSONObject x = b.getJSONObject(i);
            assertEquals(x.toString(), x.getDouble("v"),
                JabLearn.beta(x.getInt("s"), x.getInt("n"), new JabLearn.Rng(x.getInt("seed"))), 0);
        }
        JSONArray c = v.getJSONArray("choose");
        for (int i = 0; i < c.length(); i++) {
            JSONObject x = c.getJSONObject(i);
            JSONArray cands = x.getJSONArray("cands");
            int[][] sn = new int[cands.length()][];
            for (int j = 0; j < sn.length; j++) sn[j] = new int[]{cands.getJSONArray(j).getInt(0), cands.getJSONArray(j).getInt(1)};
            assertEquals(x.toString(), x.getInt("expected"), JabLearn.choose(sn, new JabLearn.Rng(x.getInt("seed"))));
        }
    }

    // ------------------------------------------------------------------
    // Sampling
    // ------------------------------------------------------------------

    @Test
    public void thompsonFavoursWhatWorksAndExplorationFloorHolds() {
        JabLearn.Rng r = new JabLearn.Rng(11);
        int[] wins = new int[3];
        for (int i = 0; i < 3000; i++) wins[JabLearn.thompson(new int[][]{{2, 20}, {16, 20}, {0, 0}}, r)]++;
        assertTrue(wins[1] > 2000);
        assertTrue(wins[2] > 50);
        int legacy = 0;
        for (int seed = 0; seed < 4000; seed++) {
            if (JabLearn.choose(new int[][]{{9, 10}, {1, 10}}, new JabLearn.Rng(seed)) == -1) legacy++;
        }
        assertTrue(legacy > 480 && legacy < 720); // ~15%
        assertEquals(-1, JabLearn.choose(new int[0][], new JabLearn.Rng(1)));
        assertEquals(-1, JabLearn.choose(new int[][]{{0, 0}}, new JabLearn.Rng(99)));
    }

    @Test
    public void pickLineNeverRepeats() throws Exception {
        JSONArray pool = new JSONArray().put("a").put("b").put("c");
        for (int seed = 0; seed < 200; seed++) {
            assertNotEquals("b", JabLearn.pickLine(pool, new JabLearn.Rng(seed), "b".hashCode()));
        }
        assertEquals("only", JabLearn.pickLine(new JSONArray().put("only"), new JabLearn.Rng(1), "only".hashCode()));
        assertEquals("", JabLearn.pickLine(new JSONArray(), new JabLearn.Rng(1), null));
        assertEquals("", JabLearn.pickLine(null, new JabLearn.Rng(1), null));
    }

    // ------------------------------------------------------------------
    // HabitNotifier.pickJab
    // ------------------------------------------------------------------

    private static JSONObject water(int amount) throws Exception {
        return new JSONObject().put("id", "w").put("kind", "build").put("goal", "count")
            .put("amount", amount).put("target", 8).put("step", 1).put("unit", "szklanek")
            .put("start", at(9, 0)).put("end", at(21, 0)).put("units", 8)
            .put("nag", new JSONArray().put("Nag 1").put("Nag 2"))
            .put("rage", new JSONArray().put("Rage 1"))
            .put("memory", new JSONArray())
            .put("ctx", new JSONObject().put("zero", new JSONArray().put("Zero 1").put("Zero 2")).put("late", new JSONArray()));
    }

    private static JSONObject stats(Object... kv) throws Exception {
        JSONObject o = new JSONObject();
        for (int i = 0; i < kv.length; i += 3) o.put((String) kv[i], new JSONObject().put("n", kv[i + 1]).put("s", kv[i + 2]));
        return o;
    }

    @Test
    public void pickJabFollowsStatsAndNeverPicksEmptyPools() throws Exception {
        JSONObject h = water(0);
        // memory/rescue/focus look great, but this row has no such lines
        JSONObject st = stats("memory@afternoon", 30, 30, "rescue@afternoon", 30, 30, "focus@afternoon", 30, 30,
            "ctx:zero@afternoon", 20, 18, "nag@afternoon", 20, 1);
        Set<String> kinds = new HashSet<>();
        int ctx = 0;
        int explore = 0;
        for (int seed = 0; seed < 400; seed++) {
            JabLearn.Pick p = HabitNotifier.pickJab(h, 0, at(15, 0), st, new JabLearn.Rng(seed), null);
            kinds.add(p.kind);
            assertFalse(p.text.isEmpty());
            if ("ctx:zero".equals(p.kind)) ctx++;
            if (p.explore) explore++;
        }
        assertFalse(kinds.contains("memory"));
        assertFalse(kinds.contains("rescue"));
        assertFalse(kinds.contains("focus"));
        assertFalse(kinds.contains("ctx:late"));
        assertTrue(ctx > 300); // learned ~85% + half of the exploration
        assertTrue(explore > 30 && explore < 100);
    }

    @Test
    public void pickJabWithoutStatsKeepsTheOldMix() throws Exception {
        JSONObject h = water(0);
        int ctx = 0;
        for (int seed = 0; seed < 1000; seed++) {
            JabLearn.Pick p = HabitNotifier.pickJab(h, 0, at(15, 0), null, new JabLearn.Rng(seed), null);
            assertTrue(p.explore);
            if ("ctx:zero".equals(p.kind)) ctx++;
        }
        assertTrue("ctx=" + ctx, ctx > 400 && ctx < 600); // CTX_CHANCE 50%
        // tier 1 (3+ jabs today): rage replaces nag
        JabLearn.Pick p = HabitNotifier.pickJab(water(0), 5, at(15, 0), stats("rage@afternoon", 10, 10), new JabLearn.Rng(3), null);
        assertTrue(p.kind.equals("rage") || p.kind.equals("ctx:zero"));
    }

    @Test
    public void pickJabAvoidsTheLastLine() throws Exception {
        JSONObject h = water(0);
        JSONObject st = stats("nag@afternoon", 10, 9);
        for (int seed = 0; seed < 100; seed++) {
            JabLearn.Pick p = HabitNotifier.pickJab(h, 0, at(12, 30), st, new JabLearn.Rng(seed), "Nag 1".hashCode());
            assertNotEquals("Nag 1", p.raw);
        }
    }

    // ------------------------------------------------------------------
    // Log + outcomes
    // ------------------------------------------------------------------

    private static JSONObject entry(long ts, String habit, int amount, String status) throws Exception {
        return new JSONObject().put("ts", ts).put("date", "2026-09-23").put("habitId", habit)
            .put("arm", "nag").put("daypart", "afternoon").put("amount", amount).put("status", status).put("outcome", -1);
    }

    @Test
    public void logIsCapped() throws Exception {
        JSONArray log = new JSONArray();
        for (int i = 0; i < JabLearn.LOG_CAP + 20; i++) log = JabLearn.append(log, new JSONObject().put("ts", i));
        assertEquals(JabLearn.LOG_CAP, log.length());
        assertEquals(20, log.getJSONObject(0).getLong("ts"));
        assertEquals(JabLearn.LOG_CAP + 19, log.getJSONObject(log.length() - 1).getLong("ts"));
        assertEquals(1, JabLearn.append(null, new JSONObject()).length());
    }

    @Test
    public void entryRecordsArmDaypartStyleAndAmount() throws Exception {
        JabLearn.Pick p = new JabLearn.Pick("Ola, gdzie woda? Kurwa.", "{u}, gdzie woda? Kurwa.", "ctx:zero", false);
        JSONObject e = JabLearn.entry(p, water(3), 1000L, "2026-09-23", at(19, 5), "Ola");
        assertEquals("ctx:zero", e.getString("arm"));
        assertEquals("evening", e.getString("daypart"));
        assertEquals("swear,name,q", e.getString("style"));
        assertEquals(3, e.getInt("amount"));
        assertEquals("{u}, gdzie woda? Kurwa.".hashCode(), e.getInt("hash"));
        assertEquals(-1, e.getInt("outcome"));
        assertEquals("w", e.getString("habitId"));
    }

    @Test
    public void outcomesAreSettledAgainstTheSnapshot() throws Exception {
        long t = 1_000_000_000L;
        long min = 60_000L;
        JSONObject avoid = new JSONObject().put("id", "f").put("kind", "avoid").put("target", 1).put("status", "clean");
        JSONArray rows = new JSONArray().put(water(4)).put(avoid);
        JSONArray log = new JSONArray()
            .put(entry(t, "w", 3, ""))              // 0: moved 3 -> 4 within 30 min -> 1
            .put(entry(t, "w", 4, ""))              // 1: no progress, window open -> stays -1
            .put(entry(t - 40 * min, "w", 4, ""))   // 2: no progress, window over -> 0
            .put(entry(t - 40 * min, "w", 2, ""))   // 3: progress, but only seen after the window -> 0
            .put(entry(t, "f", 0, "pending"))       // 4: avoid confirmed clean -> 1
            .put(entry(t, "gone", 0, ""))           // 5: habit not in today's snapshot -> 0
            .put(entry(t, "w", 0, "").put("date", "2026-09-22")) // 6: another day -> 0
            .put(entry(t, "w", 0, "").put("outcome", 0));         // 7: already settled
        assertTrue(JabLearn.evaluate(log, "2026-09-23", rows, t + 10 * min));
        int[] want = {1, -1, 0, 0, 1, 0, 0, 0};
        for (int i = 0; i < want.length; i++) assertEquals("entry " + i, want[i], log.getJSONObject(i).getInt("outcome"));
        // later: entry 1 closes without progress; nothing else changes
        assertTrue(JabLearn.evaluate(log, "2026-09-23", rows, t + 31 * min));
        assertEquals(0, log.getJSONObject(1).getInt("outcome"));
        assertFalse(JabLearn.evaluate(log, "2026-09-23", rows, t + 90 * min));
    }

    @Test
    public void statsAddNewerNativeEntriesToTheAppsTotals() throws Exception {
        JSONObject snap = new JSONObject().put("arms", stats("nag@afternoon", 4, 1)).put("since", 100).put("until", 500);
        JSONArray log = new JSONArray()
            .put(entry(400, "w", 0, "").put("outcome", 1))   // already counted by the app
            .put(entry(600, "w", 0, "").put("outcome", 1))   // newer: counts
            .put(entry(700, "w", 0, "").put("outcome", 0).put("arm", "ctx:late").put("daypart", "evening"))
            .put(entry(800, "w", 0, ""));                     // open: not yet
        JSONObject st = JabLearn.stats(snap, log);
        assertArrayEquals(new int[]{2, 5}, JabLearn.statOf(st, "nag@afternoon"));
        assertArrayEquals(new int[]{0, 1}, JabLearn.statOf(st, "ctx:late@evening"));
        // after a reset (since = until = 650) only the evening entry is left
        JSONObject reset = new JSONObject().put("arms", new JSONObject()).put("since", 650).put("until", 650);
        st = JabLearn.stats(reset, log);
        assertArrayEquals(new int[]{0, 0}, JabLearn.statOf(st, "nag@afternoon"));
        assertArrayEquals(new int[]{0, 1}, JabLearn.statOf(st, "ctx:late@evening"));
        // no snapshot field (older app): the native log alone
        assertArrayEquals(new int[]{2, 2}, JabLearn.statOf(JabLearn.stats(null, log), "nag@afternoon"));
    }
}
