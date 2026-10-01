package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** "Nigdy dwa razy" + the weekly focus on the native side (mirrors src/lib/habits/chain.ts). */
public class ChainTest {
    private static JSONObject build(int amount, int target, int minimum) throws Exception {
        return new JSONObject().put("v", 2).put("kind", "build").put("goal", "minutes")
            .put("amount", amount).put("target", target).put("step", 10).put("minimum", minimum)
            .put("done", amount >= target);
    }

    private static JSONObject avoid(String status) throws Exception {
        return new JSONObject().put("v", 2).put("kind", "avoid").put("goal", "check").put("status", status)
            .put("target", 1).put("step", 1);
    }

    @Test
    public void yesterdayBelowTheMinimumIsAMiss() throws Exception {
        assertTrue(WidgetShared.missed(build(4, 20, 5)));
        assertFalse(WidgetShared.missed(build(5, 20, 5)));
        assertTrue(WidgetShared.missed(build(15, 20, 0))); // no minimum: the goal
        assertFalse(WidgetShared.missed(build(20, 20, 0)));
        assertTrue(WidgetShared.missed(avoid("slip")));
        assertFalse(WidgetShared.missed(avoid("pending"))); // unknown is not a miss
        assertFalse(WidgetShared.missed(avoid("clean")));
        assertFalse(WidgetShared.missed(null));
    }

    @Test
    public void rescueLastsUntilTheMinimum() throws Exception {
        JSONObject h = build(0, 20, 5).put("rescue", true);
        assertTrue(WidgetShared.rescueNow(h));
        h.put("amount", 5);
        assertFalse(WidgetShared.rescueNow(h));
        assertFalse(WidgetShared.rescueNow(build(0, 20, 5))); // no flag
        assertTrue(WidgetShared.rescueNow(avoid("pending").put("rescue", true)));
        assertFalse(WidgetShared.rescueNow(avoid("clean").put("rescue", true)));
    }

    @Test
    public void boostedRowsGoFirstOnceDue() {
        assertTrue(WidgetShared.boosted(-1.2, true) < -2.9);
        assertTrue(WidgetShared.boosted(30, true) < -2.9);
        assertEquals(300.0, WidgetShared.boosted(300, true), 0.0);
        assertEquals(-1.2, WidgetShared.boosted(-1.2, false), 0.0);
    }

    @Test
    public void rescueAndFocusPools() throws Exception {
        JSONArray rescue = new JSONArray().put("ratunek");
        JSONArray focus = new JSONArray().put("cel");
        JSONObject h = build(0, 20, 5).put("rescue", true).put("rescueLines", rescue)
            .put("focus", true).put("focusLines", focus);
        assertSame(rescue, HabitNotifier.chainPool(h, 10));
        assertSame(focus, HabitNotifier.chainPool(build(0, 20, 5).put("focus", true).put("focusLines", focus), 10));
        // rolls past the chances
        assertNull(HabitNotifier.chainPool(h, HabitNotifier.CHAIN_RESCUE));
        assertSame(focus, HabitNotifier.chainPool(h.put("amount", 5), 10)); // minimum in: no rescue, focus still
        assertNull(HabitNotifier.chainPool(build(0, 20, 5), 0));
        assertNull(HabitNotifier.chainPool(build(0, 20, 5).put("rescue", true).put("rescueLines", new JSONArray()), 0));
        assertTrue(HabitNotifier.CHAIN_RESCUE > HabitNotifier.CHAIN_FOCUS);
    }
}
