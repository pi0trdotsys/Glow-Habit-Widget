package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.List;

/**
 * Today's percentage on the widgets is fractional: a goal habit that is partly done
 * (6000 of 8000 steps) counts as 0.75 of a habit, not 0 - the same rule as the
 * "Postęp dnia" notification and the app's todayProgress().
 */
public class ProgressFractionTest {
    private static JSONObject build(String id, int amount, int target) throws Exception {
        return new JSONObject().put("id", id).put("name", id).put("kind", "build")
            .put("goal", target == 1 ? "check" : "count").put("amount", amount).put("target", target);
    }

    private static JSONObject screenNight(String status) throws Exception {
        return new JSONObject().put("id", "late").put("name", "late").put("kind", "avoid")
            .put("source", "screen").put("status", status).put("target", 1);
    }

    @Test
    public void stepsHalfwayCountsAsAFraction() throws Exception {
        JSONArray rows = new JSONArray()
            .put(build("steps", 6000, 8000))   // 0.75
            .put(build("read", 0, 1))          // 0
            .put(build("water", 4, 8));        // 0.5
        assertEquals(1.25f / 3f, WidgetShared.dayFraction(rows), 1e-6);
        assertEquals(42, WidgetShared.percentOf(WidgetShared.dayFraction(rows)));
        assertEquals(0.75f, WidgetShared.fraction(rows.getJSONObject(0)), 1e-6);
    }

    @Test
    public void overTheGoalCapsAtOneAndEmptyIsZero() throws Exception {
        JSONArray rows = new JSONArray().put(build("steps", 12000, 8000));
        assertEquals(1f, WidgetShared.dayFraction(rows), 1e-6);
        assertEquals(100, WidgetShared.percentOf(WidgetShared.dayFraction(rows)));
        assertEquals(0f, WidgetShared.dayFraction(new JSONArray()), 1e-6);
        assertEquals(0, WidgetShared.percentOf(-0.3f));
    }

    @Test
    public void undecidedScreenNightDoesNotCount() throws Exception {
        JSONArray rows = new JSONArray()
            .put(build("steps", 4000, 8000))
            .put(screenNight("pending"));      // neither done nor missed: left out
        assertEquals(0.5f, WidgetShared.dayFraction(rows), 1e-6);
        rows.put(screenNight("clean"));
        assertEquals(1.5f / 2f, WidgetShared.dayFraction(rows), 1e-6);
    }

    @Test
    public void widgetTickerShowsTheFractionalPercent() throws Exception {
        NextWidgetContent.Inputs in = new NextWidgetContent.Inputs();
        in.now = 12 * 60;
        in.counted = 4;
        in.done = 0;
        in.plan.add(build("steps", 6000, 8000).put("start", 0).put("end", 24 * 60));
        // without a fraction: the old done / counted rule (0%)
        assertEquals(0, NextWidgetContent.percent(in));
        // 6000/8000 steps + 1/2 + 0 + 0 of four habits = 1.25 / 4
        in.fraction = 1.25f / 4f;
        assertEquals(31, NextWidgetContent.percent(in));
        List<NextWidgetContent.Line> t = NextWidgetContent.normalTicker(in, in.plan.get(0));
        String progress = null;
        for (NextWidgetContent.Line l : t) if ("progress".equals(l.kind)) progress = l.text;
        assertEquals("Dziś 0/4 · 31%", progress);
    }
}
