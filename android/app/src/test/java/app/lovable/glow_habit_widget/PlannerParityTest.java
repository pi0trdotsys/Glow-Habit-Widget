package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.BeforeClass;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * The widgets/notifications (Java) and the app (TypeScript) must rank and
 * schedule identically. Both sides are checked against the same vectors,
 * generated from the TS implementation by tests/gen-vectors.ts.
 */
public class PlannerParityTest {
    private static JSONObject vectors;

    @BeforeClass
    public static void load() throws Exception {
        // Gradle runs unit tests with the module (android/app) as working dir.
        Path p = Paths.get("..", "..", "tests", "planner-vectors.json");
        vectors = new JSONObject(new String(Files.readAllBytes(p), StandardCharsets.UTF_8));
    }

    @Test
    public void nextUnitMinute() throws Exception {
        JSONArray a = vectors.getJSONArray("nextUnit");
        for (int i = 0; i < a.length(); i++) {
            JSONObject v = a.getJSONObject(i);
            assertEquals(v.toString(), v.getInt("expected"),
                WidgetShared.nextMinute(v.getInt("start"), v.getInt("end"), v.getInt("units"),
                    v.getInt("done"), v.getInt("now")));
        }
    }

    @Test
    public void rankKey() throws Exception {
        JSONArray a = vectors.getJSONArray("rank");
        for (int i = 0; i < a.length(); i++) {
            JSONObject v = a.getJSONObject(i);
            assertEquals(v.toString(), v.getDouble("expected"),
                WidgetShared.rankKey(v.getInt("due"), v.getInt("now"), v.getBoolean("avoid"), v.getBoolean("multi")),
                1e-9);
        }
    }

    @Test
    public void tauntSlots() throws Exception {
        JSONArray a = vectors.getJSONArray("slots");
        for (int i = 0; i < a.length(); i++) {
            JSONObject v = a.getJSONObject(i);
            JSONArray exp = v.getJSONArray("expected");
            int[] expected = new int[exp.length()];
            for (int j = 0; j < exp.length(); j++) expected[j] = exp.getInt(j);
            assertArrayEquals(v.toString(), expected,
                HabitNotifier.tauntSlots(v.getInt("n"), v.getInt("wake"), v.getInt("bedtime")));
        }
    }

    @Test
    public void escalationTier() throws Exception {
        JSONArray a = vectors.getJSONArray("tier");
        for (int i = 0; i < a.length(); i++) {
            JSONObject v = a.getJSONObject(i);
            assertEquals(v.toString(), v.getInt("expected"),
                HabitNotifier.tier(v.getInt("overdue"), v.getInt("jabs")));
        }
    }

    @Test
    public void quietHoursCrossMidnight() {
        assertEquals(true, HabitNotifier.isQuiet(22 * 60, 9 * 60, 23 * 60));
        assertEquals(true, HabitNotifier.isQuiet(22 * 60, 9 * 60, 8 * 60));
        assertEquals(false, HabitNotifier.isQuiet(22 * 60, 9 * 60, 12 * 60));
        assertEquals(true, HabitNotifier.isQuiet(1 * 60, 7 * 60, 3 * 60));
    }
}
