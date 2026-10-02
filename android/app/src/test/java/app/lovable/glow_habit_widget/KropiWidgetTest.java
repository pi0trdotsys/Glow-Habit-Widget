package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** Water from Kropi on the native side, and widgets without forbidden habits. */
public class KropiWidgetTest {
    private static JSONObject water(String source) throws Exception {
        return new JSONObject().put("v", 2).put("id", "w").put("kind", "build").put("goal", "count")
            .put("amount", 500).put("target", 2000).put("step", 250).put("source", source);
    }

    @Test
    public void kropiDayBecomesTheAmountAndTarget() throws Exception {
        JSONObject row = water("kropi");
        assertTrue(Kropi.applyTo(row, "2026-10-02", new Kropi.Day("2026-10-02", 2250, 2400)));
        assertEquals(2250, row.getInt("amount"));
        assertEquals(2400, row.getInt("target"));
        assertFalse(row.getBoolean("done"));
        // same values again: nothing changes
        assertFalse(Kropi.applyTo(row, "2026-10-02", new Kropi.Day("2026-10-02", 2250, 2400)));
        // reaching the goal
        assertTrue(Kropi.applyTo(row, "2026-10-02", new Kropi.Day("2026-10-02", 2500, 2400)));
        assertTrue(row.getBoolean("done"));
        // no goal from Kropi: keep the row's target
        JSONObject r2 = water("kropi");
        assertTrue(Kropi.applyTo(r2, "2026-10-02", new Kropi.Day("2026-10-02", 750, 0)));
        assertEquals(2000, r2.getInt("target"));
    }

    @Test
    public void otherDaysAndOtherSourcesAreLeftAlone() throws Exception {
        JSONObject row = water("kropi");
        assertFalse(Kropi.applyTo(row, "2026-10-02", new Kropi.Day("2026-10-01", 1500, 2000)));
        assertEquals(500, row.getInt("amount"));
        assertFalse(Kropi.applyTo(water(""), "2026-10-02", new Kropi.Day("2026-10-02", 1500, 2000)));
        assertFalse(Kropi.applyTo(water("steps"), "2026-10-02", new Kropi.Day("2026-10-02", 1500, 2000)));
        assertFalse(Kropi.applyTo(row, "2026-10-02", null));
        assertTrue(Kropi.isKropi(water("kropi")));
        assertFalse(Kropi.isKropi(null));
    }

    @Test
    public void widgetsNeverShowForbiddenHabits() throws Exception {
        JSONArray all = new JSONArray()
            .put(new JSONObject().put("v", 2).put("id", "a").put("kind", "build").put("goal", "check"))
            .put(new JSONObject().put("v", 2).put("id", "p").put("kind", "avoid").put("goal", "check").put("name", "Nie bądź zboczeńcem"))
            .put(new JSONObject().put("v", 2).put("id", "b").put("kind", "build").put("goal", "count"))
            .put(new JSONObject().put("v", 2).put("id", "f").put("kind", "avoid").put("goal", "check"));
        JSONArray shown = WidgetShared.withoutAvoid(all);
        assertEquals(2, shown.length());
        for (int i = 0; i < shown.length(); i++) assertFalse(WidgetShared.isAvoid(shown.getJSONObject(i)));
        assertEquals("a", shown.getJSONObject(0).getString("id"));
        assertEquals("b", shown.getJSONObject(1).getString("id"));
        assertEquals(0, WidgetShared.withoutAvoid(null).length());
    }

    @Test
    public void everyWidgetUsesTheFilteredRows() throws Exception {
        String dir = "src/main/java/app/lovable/glow_habit_widget/";
        for (String f : new String[]{"HabitWidgetProvider.java", "HabitWidget2Provider.java",
            "HabitRemoteViewsFactory.java", "NextTaskWidgetProvider.java"}) {
            String src = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(dir + f)), "UTF-8");
            assertFalse(f + " reads all rows", src.contains("WidgetShared.habits("));
            assertFalse(f + " uses the unfiltered plan", src.contains("WidgetShared.plan("));
            assertFalse(f + " counts forbidden habits", src.contains("WidgetShared.countedTotal(") || src.contains("WidgetShared.doneCount("));
        }
        String szpila = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(dir + "SzpilaWidgetProvider.java")), "UTF-8");
        assertTrue(szpila.contains("withoutForbidden(WidgetShared.plan(c))"));
    }
}
