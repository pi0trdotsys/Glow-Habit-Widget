package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.BeforeClass;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The morning forecast (Forecast.java) must match src/lib/habits/forecast.ts:
 * the same posterior, reason and warning text for the shared vectors in
 * tests/forecast-vectors.json (bun tests/gen-forecast-vectors.ts).
 */
public class ForecastTest {
    private static JSONObject vectors;
    private static final Map<String, JSONObject> MODELS = new HashMap<>();

    @BeforeClass
    public static void load() throws Exception {
        // Gradle runs unit tests with the module (android/app) as working dir.
        Path p = Paths.get("..", "..", "tests", "forecast-vectors.json");
        vectors = new JSONObject(new String(Files.readAllBytes(p), StandardCharsets.UTF_8));
        JSONArray models = vectors.getJSONArray("models");
        for (int i = 0; i < models.length(); i++) {
            JSONObject m = models.getJSONObject(i);
            MODELS.put(m.getString("id"), m);
        }
    }

    private static Boolean opt(JSONObject f, String k) throws Exception {
        return f.isNull(k) ? null : f.getBoolean(k);
    }

    @Test
    public void posteriorMatchesTs() throws Exception {
        JSONArray cases = vectors.getJSONArray("cases");
        assertTrue(cases.length() > 100);
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            JSONObject f = c.getJSONObject("f");
            Forecast.Result r = Forecast.posterior(MODELS.get(c.getString("model")), opt(f, "bad"),
                opt(f, "short"), f.getInt("wd"), opt(f, "rescue"));
            String msg = c.toString();
            assertEquals(msg, c.getDouble("p"), r.p, 1e-8);
            assertEquals(msg, c.getInt("pct"), r.pct);
            assertEquals(msg, c.isNull("reason") ? null : c.getString("reason"), r.reason);
            assertEquals(msg, c.getBoolean("warn"), r.warn);
        }
    }

    @Test
    public void textsMatchTs() throws Exception {
        JSONArray cases = vectors.getJSONArray("cases");
        JSONArray nights = vectors.getJSONArray("nights");
        JSONObject texts = vectors.getJSONObject("texts");
        int n = 0;
        for (String key : new String[]{"pl_hard", "pl_soft", "en_hard", "en_soft"}) {
            JSONObject t = texts.getJSONObject(key);
            JSONObject fc = new JSONObject().put("lines", t.getJSONObject("lines")).put("reasons", t.getJSONObject("reasons"));
            JSONArray tc = t.getJSONArray("cases");
            for (int i = 0; i < tc.length(); i++) {
                JSONObject v = tc.getJSONObject(i);
                JSONObject c = cases.getJSONObject(v.getInt("i"));
                JSONObject f = c.getJSONObject("f");
                JSONObject night = nights.getJSONObject(c.getInt("night"));
                Forecast.Item it = Forecast.item(MODELS.get(c.getString("model")), fc, opt(f, "bad"), opt(f, "short"),
                    f.getInt("wd"), opt(f, "rescue"), night.getInt("social"), night.getInt("screen"),
                    night.getInt("sleep"), v.getString("date"), v.getInt("nowMin"));
                assertEquals(key + " " + v, v.getString("text"), it == null ? null : it.text);
                n++;
            }
        }
        assertTrue(n >= 40);
    }

    @Test
    public void hashMatchesTs() {
        assertEquals(0, Forecast.hash(""));
        // (h * 31 + c) as uint32 - wraps like JS ">>> 0"
        long h = 0;
        for (char ch : "zzzzzzzzzzzzzzzzzzzz".toCharArray()) h = (h * 31 + ch) % 4294967296L;
        assertEquals(h, Forecast.hash("zzzzzzzzzzzzzzzzzzzz"));
    }

    /** A snapshot like the app writes it, with last night's NightStats report. */
    private static JSONObject state(String yesterday, JSONArray rows) throws Exception {
        JSONObject t = vectors.getJSONObject("texts").getJSONObject("pl_hard");
        JSONArray models = new JSONArray()
            .put(MODELS.get("read")).put(MODELS.get("water")).put(MODELS.get("food")).put(MODELS.get("walk"));
        return new JSONObject()
            .put("forecast", new JSONObject().put("models", models).put("lines", t.getJSONObject("lines"))
                .put("reasons", t.getJSONObject("reasons")))
            .put("yesterday", new JSONObject().put("date", yesterday).put("items", new JSONArray()))
            .put("habits", rows);
    }

    private static JSONObject report(int social, int screen, int sleep) throws Exception {
        JSONObject r = new JSONObject().put("granted", true).put("social", social).put("screen", screen);
        if (sleep >= 0) r.put("sleep", new JSONObject().put("minutes", sleep).put("start", 60).put("end", 60 + sleep));
        return r;
    }

    @Test
    public void morningAfterABadNight() throws Exception {
        // Wednesday: reading (night + sleep) and fast food (Wednesdays) - the riskiest first.
        List<String> out = Forecast.morning(state("2026-09-22", new JSONArray()), report(52, 61, 330), 3,
            "2026-09-23", "2026-09-22", 8 * 60 + 30);
        assertEquals(2, out.size());
        assertTrue(out.get(0), out.get(0).contains("o nocy z 52 min scrollowania i 5 h 30 min snu"));
        assertTrue(out.get(0), out.get(0).contains("„Czytanie”"));
        assertTrue(out.get(1), out.get(1).contains("„Fast food”"));
        String block = Forecast.block(out);
        assertTrue(block.startsWith("🔮 "));
        assertEquals(2, block.split("\n").length);
    }

    @Test
    public void morningSkipsSettledAndUnknown() throws Exception {
        // Reading already at its minimum, fast food answered clean -> nothing to warn about.
        JSONArray rows = new JSONArray()
            .put(new JSONObject().put("id", "read").put("kind", "build").put("amount", 5).put("target", 20).put("minimum", 5))
            .put(new JSONObject().put("id", "food").put("kind", "avoid").put("status", "clean"));
        assertTrue(Forecast.morning(state("2026-09-22", rows), report(52, 61, 330), 3,
            "2026-09-23", "2026-09-22", 9 * 60).isEmpty());
        // A clean night on a Thursday: nothing stands out.
        assertTrue(Forecast.morning(state("2026-09-23", new JSONArray()), report(0, 5, 470), 4,
            "2026-09-24", "2026-09-23", 9 * 60).isEmpty());
        // No snapshot forecast (older app) -> nothing.
        assertTrue(Forecast.morning(new JSONObject(), report(52, 61, 330), 3, "2026-09-23", "2026-09-22", 540).isEmpty());
        // Without night data the night can't be blamed, but the weekday still can.
        List<String> noNight = Forecast.morning(state("2026-09-22", new JSONArray()), null, 3,
            "2026-09-23", "2026-09-22", 540);
        assertEquals(1, noNight.size());
        assertTrue(noNight.get(0), noNight.get(0).contains("„Fast food”"));
    }

    @Test
    public void rescueFlagOnlyFromYesterdaysSnapshot() throws Exception {
        JSONObject gym = new JSONObject().put("id", "gym").put("name", "Siłownia").put("kind", "build").put("min", "")
            .put("base", 0.35).put("days", new JSONArray("[0,1,2,3,4,5,6]"))
            .put("rescue", new JSONObject().put("y", 1.5).put("n", -0.3))
            .put("wd", new JSONArray("[null,null,null,null,null,null,null]"));
        JSONObject st = state("2026-09-22", new JSONArray().put(new JSONObject().put("id", "gym").put("kind", "build")
            .put("amount", 0).put("target", 1).put("rescue", true)));
        st.getJSONObject("forecast").put("models", new JSONArray().put(gym));
        // Yesterday missed (row flag from yesterday's snapshot) -> warned, named as the reason.
        List<String> out = Forecast.morning(st, report(0, 5, 470), 3, "2026-09-23", "2026-09-22", 540);
        assertEquals(out.toString(), 1, out.size());
        assertTrue(out.get(0), out.get(0).contains("dzień po odpuszczeniu"));
        // A stale snapshot (its "yesterday" isn't yesterday): rescue unknown -> no warning.
        st.put("yesterday", new JSONObject().put("date", "2026-09-20"));
        assertTrue(Forecast.morning(st, report(0, 5, 470), 3, "2026-09-23", "2026-09-22", 540).isEmpty());
        // Not due today -> nothing.
        gym.put("days", new JSONArray("[1]"));
        st.put("yesterday", new JSONObject().put("date", "2026-09-22"));
        assertTrue(Forecast.morning(st, report(0, 5, 470), 3, "2026-09-23", "2026-09-22", 540).isEmpty());
        assertNull(Forecast.item(gym, new JSONObject(), false, false, 3, null, 0, 5, 470, "2026-09-23", 540));
    }
}
