package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.Arrays;

/**
 * Context-aware jabs: HabitNotifier.contextOf() must follow the same rule as
 * contextRule() in src/lib/habits/szpila.ts (the same vectors live in
 * tests/szpila-27.test.ts).
 */
public class HabitContextTest {
    private static int at(int h, int m) {
        return h * 60 + m;
    }

    /** avoid, amount, target, now, expected (null = no situation). */
    private static final Object[][] VECTORS = {
        {false, 0, 4, at(8, 0), "morning"},
        {false, 0, 4, at(4, 59), null},
        {false, 0, 4, at(11, 0), null},
        {false, 0, 4, at(13, 59), null},
        {false, 0, 4, at(14, 0), "zero"},
        {false, 0, 4, at(18, 59), "zero"},
        {false, 0, 4, at(19, 0), "late"},
        {false, 3, 4, at(15, 0), "almost"},
        {false, 3, 4, at(9, 0), "almost"},
        {false, 3, 4, at(20, 0), "almost"},
        {false, 1, 2, at(20, 0), "late"},
        {false, 1, 2, at(15, 0), null},
        {false, 1, 2, at(8, 0), null},
        {false, 5600, 8000, at(16, 0), "almost"},
        {false, 5599, 8000, at(16, 0), null},
        {false, 4, 4, at(20, 0), null},
        {false, 9, 4, at(15, 0), null},
        {false, 0, 1, at(20, 0), "late"},
        {false, 0, 1, at(15, 0), "zero"},
        {false, 0, 30, at(10, 59), "morning"},
        {true, 0, 1, at(8, 0), "morning"},
        {true, 0, 1, at(12, 0), null},
        {true, 0, 1, at(19, 30), "late"},
        {true, 0, 1, at(3, 0), null},
    };

    @Test
    public void contextRuleMatchesTheTsVectors() {
        for (Object[] v : VECTORS) {
            String got = HabitNotifier.contextOf((boolean) v[0], (int) v[1], (int) v[2], (int) v[3]);
            assertEquals(Arrays.toString(v), v[4], got);
        }
    }

    @Test
    public void thresholdsAndChances() {
        assertEquals(5 * 60, HabitNotifier.CTX_MORNING_FROM);
        assertEquals(11 * 60, HabitNotifier.CTX_MORNING_UNTIL);
        assertEquals(14 * 60, HabitNotifier.CTX_ZERO_FROM);
        assertEquals(19 * 60, HabitNotifier.CTX_LATE_FROM);
        assertEquals(70, HabitNotifier.CTX_ALMOST_PCT);
        assertEquals(50, HabitNotifier.ctxChance(0));
        assertEquals(35, HabitNotifier.ctxChance(1));
    }

    private static JSONObject water(int amount, JSONObject ctx) throws Exception {
        JSONObject o = new JSONObject().put("id", "w").put("name", "Picie wody").put("kind", "build")
            .put("goal", "count").put("amount", amount).put("target", 4).put("step", 1);
        if (ctx != null) o.put("ctx", ctx);
        return o;
    }

    @Test
    public void picksTheMatchingPoolFromTheSnapshotRow() throws Exception {
        JSONObject ctx = new JSONObject()
            .put("zero", new JSONArray(Arrays.asList("Zero wody o tej porze.")))
            .put("almost", new JSONArray(Arrays.asList("Zostało tylko {left}.")))
            .put("late", new JSONArray())
            .put("morning", new JSONArray(Arrays.asList("Pierwsza szklanka.")));
        assertEquals("Pierwsza szklanka.", HabitNotifier.contextPool(water(0, ctx), at(8, 0)).getString(0));
        assertEquals("Zero wody o tej porze.", HabitNotifier.contextPool(water(0, ctx), at(15, 0)).getString(0));
        assertEquals("Zostało tylko {left}.", HabitNotifier.contextPool(water(3, ctx), at(15, 0)).getString(0));
        // empty pool, no situation, old snapshot without "ctx" -> null (falls back to nag/rage)
        assertNull(HabitNotifier.contextPool(water(0, ctx), at(20, 0)));
        assertNull(HabitNotifier.contextPool(water(0, ctx), at(12, 0)));
        assertNull(HabitNotifier.contextPool(water(0, null), at(15, 0)));
        assertNull(HabitNotifier.contextPool(water(4, ctx), at(15, 0)));
        // placeholders are resolved like every other jab
        String line = WidgetShared.fill(HabitNotifier.contextPool(water(3, ctx), at(15, 0)).getString(0),
            water(3, ctx));
        assertTrue(line, line.startsWith("Zostało tylko 1"));
    }
}
