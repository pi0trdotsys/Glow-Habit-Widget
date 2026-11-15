package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.List;

/** The "Postęp dnia" Live Update content (LiveProgress): bar segments, fill, texts. */
public class LiveProgressTest {
    private static JSONObject build(String id, int amount, int target, String color) throws Exception {
        return new JSONObject().put("id", id).put("name", id).put("kind", "build").put("colorHex", color)
            .put("goal", target == 1 ? "check" : "count").put("amount", amount).put("target", target);
    }

    @Test
    public void segmentsAreMostCompleteFirstAndFillIsTheSumOfFractions() throws Exception {
        JSONArray rows = new JSONArray()
            .put(build("read", 0, 1, "#fdba2f"))
            .put(build("move", 10, 30, "#59e0ad"))
            .put(build("water", 8, 8, "#55c4fe"))
            .put(build("med", 0, 1, "#b180fc"));
        List<LiveProgress.Seg> s = LiveProgress.segments(rows);
        assertEquals("water", s.get(0).id); // done first
        assertEquals("move", s.get(1).id);  // then the partial one
        assertEquals("read", s.get(2).id);  // then the rest, in plan order
        assertEquals("med", s.get(3).id);
        // a build habit's segment takes the row's colour (Color.parseColor is stubbed on the JVM)
        assertEquals(WidgetShared.color(rows.getJSONObject(2)), s.get(0).color);
        assertEquals(400, LiveProgress.max(s));
        // 1 + 10/30 = 1.333 habits -> 133 units: water full, a third of move
        assertEquals(133, LiveProgress.progress(s));
        assertEquals(33, LiveProgress.percent(s));
    }

    @Test
    public void stepsHalfwayShowInTheBar() throws Exception {
        JSONArray rows = new JSONArray().put(build("steps", 6000, 8000, "#a9e85e")).put(build("read", 0, 1, "#fdba2f"));
        List<LiveProgress.Seg> s = LiveProgress.segments(rows);
        assertEquals(75, LiveProgress.progress(s));
        assertEquals(38, LiveProgress.percent(s));
        assertEquals("38%", LiveProgress.chip(LiveProgress.percent(s)));
    }

    @Test
    public void avoidRowsAreRedAndUndecidedNightsAreLeftOut() throws Exception {
        JSONArray rows = new JSONArray()
            .put(new JSONObject().put("id", "fast").put("name", "fast").put("kind", "avoid")
                .put("status", "clean").put("target", 1).put("colorHex", "#59e0ad"))
            .put(new JSONObject().put("id", "late").put("name", "late").put("kind", "avoid")
                .put("source", "screen").put("status", "pending").put("target", 1));
        List<LiveProgress.Seg> s = LiveProgress.segments(rows);
        assertEquals(1, s.size());
        assertEquals(WidgetShared.AVOID, s.get(0).color);
        assertEquals(100, LiveProgress.progress(s));
    }

    @Test
    public void emptyDayAndChipBounds() {
        List<LiveProgress.Seg> s = LiveProgress.segments(new JSONArray());
        assertEquals(0, LiveProgress.percent(s));
        assertEquals(100, LiveProgress.max(s));
        assertEquals("100%", LiveProgress.chip(140));
        assertEquals("0%", LiveProgress.chip(-5));
    }

    @Test
    public void texts() throws Exception {
        JSONObject next = build("Ruch 30 min", 10, 30, "#59e0ad");
        assertEquals("Teraz: Ruch 30 min (10/30 min)", LiveProgress.title(next, "10/30 min", false));
        assertEquals("Now: Ruch 30 min", LiveProgress.title(next, "", true));
        assertEquals("Dziś 1/8 · 17% · potem: Czytanie · ⏳ 2 h",
            LiveProgress.text(1, 8, 17, "Czytanie", "⏳ 2 h", false));
        assertEquals("Today 1/8 · 17%", LiveProgress.text(1, 8, 17, "", "", true));
    }
}
