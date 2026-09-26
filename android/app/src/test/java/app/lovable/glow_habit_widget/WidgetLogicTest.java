package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.Arrays;
import java.util.List;

/** Pure logic behind the widgets, notifications and screen-time judging. */
public class WidgetLogicTest {

    private static JSONObject build(int amount, int target, String unit) throws Exception {
        return new JSONObject().put("id", "w").put("name", "Picie wody").put("kind", "build")
            .put("goal", "count").put("amount", amount).put("target", target).put("step", 1).put("unit", unit)
            .put("unitForms", new JSONArray(Arrays.asList("szklanka", "szklanki", "szklanek")));
    }

    private static JSONObject avoid(String status, String source) throws Exception {
        JSONObject o = new JSONObject().put("id", "a").put("name", "X").put("kind", "avoid")
            .put("goal", "check").put("target", 1).put("status", status);
        if (source != null) o.put("source", source);
        return o;
    }

    // ------------------------------------------------------------------ rows

    @Test
    public void buildRows() throws Exception {
        JSONObject w = build(3, 8, "szklanek");
        assertFalse(WidgetShared.isDone(w));
        assertTrue(WidgetShared.isPending(w));
        assertEquals(3f / 8f, WidgetShared.fraction(w), 1e-6);
        assertTrue(WidgetShared.isDone(build(8, 8, "szklanek")));
        assertEquals("3/8 szklanek", WidgetShared.amountText(w));
        assertEquals("5 szklanek", WidgetShared.leftText(w));
        assertEquals("Wypite 3 z 8, zostało 5 szklanek.",
            WidgetShared.fill("Wypite {done} z {target}, zostało {left}.", w));
    }

    @Test
    public void unitDeclension() throws Exception {
        JSONObject w = build(0, 8, "szklanek");
        assertEquals("szklanka", WidgetShared.unit(w, 1));
        assertEquals("szklanki", WidgetShared.unit(w, 3));
        assertEquals("szklanek", WidgetShared.unit(w, 5));
        assertEquals("szklanek", WidgetShared.unit(w, 12));
        assertEquals("szklanki", WidgetShared.unit(w, 22));
        assertEquals("1 szklanka", WidgetShared.leftText(build(7, 8, "szklanek")));
        // no forms -> the raw unit
        JSONObject raw = new JSONObject().put("unit", "kroków");
        assertEquals("kroków", WidgetShared.unit(raw, 1));
    }

    @Test
    public void avoidRows() throws Exception {
        assertTrue(WidgetShared.isPending(avoid("pending", null)));
        assertTrue(WidgetShared.isDone(avoid("clean", null)));
        assertFalse(WidgetShared.isDone(avoid("slip", null)));
        assertEquals(0f, WidgetShared.fraction(avoid("slip", null)), 0);
        assertEquals("", WidgetShared.amountText(avoid("pending", null)));
    }

    @Test
    public void screenJudgedRowsAreNeverPreDecided() throws Exception {
        JSONObject undecided = avoid("pending", "screen");
        assertFalse(WidgetShared.isPending(undecided)); // nothing to tap
        assertFalse(WidgetShared.isDone(undecided)); // not pre-ticked
        assertFalse(WidgetShared.counts(undecided)); // out of every counter
        assertTrue(WidgetShared.counts(avoid("clean", "screen")));
        assertTrue(WidgetShared.isDone(avoid("clean", "screen")));
        assertTrue(WidgetShared.counts(avoid("slip", "screen")));
        assertTrue(WidgetShared.counts(build(0, 8, "szklanek")));
    }

    @Test
    public void legacyRows() throws Exception {
        JSONObject v1 = new JSONObject().put("id", "x").put("name", "Old").put("done", true);
        assertTrue(WidgetShared.isDone(v1));
        assertEquals(1, WidgetShared.amount(v1));
        assertEquals("", WidgetShared.amountText(v1));
    }

    @Test
    public void formatting() {
        assertEquals("00:00", WidgetShared.fmtMinute(0));
        assertEquals("21:05", WidgetShared.fmtMinute(21 * 60 + 5));
        assertEquals("00:30", WidgetShared.fmtMinute(24 * 60 + 30));
    }

    // ------------------------------------------------------------------ screen time

    @Test
    public void lateStartAfterMidnightMeansThatNight() {
        assertEquals(24 * 60, ScreenTime.effectiveAfter(0)); // 00:00 -> after midnight
        assertEquals(24 * 60 + 30, ScreenTime.effectiveAfter(30));
        assertEquals(23 * 60 + 30, ScreenTime.effectiveAfter(23 * 60 + 30)); // 23:30 stays that evening
        long day = 1_000_000_000L;
        long[] w = ScreenTime.window(day, 0);
        assertEquals(day + 24 * 3600_000L, w[0]); // starts at the NEXT midnight, not this day's start
        assertEquals(day + 29 * 3600_000L, w[1]); // ends 05:00 next day
        long[] evening = ScreenTime.window(day, 23 * 60);
        assertEquals(day + 23 * 3600_000L, evening[0]);
    }

    @Test
    public void interactiveTimeInsideTheWindow() {
        long m = 60_000L;
        // on 00:10-00:30, on 01:00-01:05; window 00:00-05:00
        long[] t = {10 * m, 30 * m, 60 * m, 65 * m};
        boolean[] on = {true, false, true, false};
        assertEquals(25 * m, ScreenTime.interactiveMs(t, on, false, 0, 300 * m));
        // screen already on before the window, turned off at 00:20 -> only 20 min count
        assertEquals(20 * m, ScreenTime.interactiveMs(new long[]{20 * m}, new boolean[]{false}, true, 0, 300 * m));
        // still on at the end -> counts up to `to`
        assertEquals(15 * m, ScreenTime.interactiveMs(new long[]{285 * m}, new boolean[]{true}, false, 0, 300 * m));
        // daytime usage outside the window never counts
        assertEquals(0, ScreenTime.interactiveMs(new long[]{-600 * m, -300 * m}, new boolean[]{true, false}, false, 0, 300 * m));
        // duplicate "on" events don't double count
        assertEquals(10 * m, ScreenTime.interactiveMs(new long[]{0, 5 * m, 10 * m}, new boolean[]{true, true, false}, false, 0, 300 * m));
    }

    // ------------------------------------------------------------------ notifications / widget

    @Test
    public void szpilaWidgetNeverShowsForbiddenHabits() throws Exception {
        List<JSONObject> plan = Arrays.asList(avoid("pending", null), build(3, 8, "szklanek"), avoid("pending", null));
        List<JSONObject> shown = SzpilaWidgetProvider.withoutForbidden(plan);
        assertEquals(1, shown.size());
        assertEquals("w", shown.get(0).optString("id"));
    }

    @Test
    public void quietHoursAndEscalation() {
        assertTrue(HabitNotifier.isQuiet(22 * 60, 9 * 60, 23 * 60));
        assertFalse(HabitNotifier.isQuiet(22 * 60, 9 * 60, 12 * 60));
        assertEquals(0, HabitNotifier.tier(30, 1));
        assertEquals(1, HabitNotifier.tier(180, 0));
        assertEquals(1, HabitNotifier.tier(0, 3));
    }
}
