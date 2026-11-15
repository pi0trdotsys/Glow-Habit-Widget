package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.List;

/** "Podsumowanie dnia" (DaySummary) and "dyskretne" on the native side. */
public class DaySummaryTest {
    private static JSONObject build(String id, String name, int amount, int target) throws Exception {
        return new JSONObject().put("id", id).put("name", name).put("kind", "build")
            .put("goal", target == 1 ? "check" : "count").put("amount", amount).put("target", target)
            .put("unit", "kroków").put("start", 9 * 60).put("end", 21 * 60);
    }

    private static JSONObject avoid(String id, String name, String status) throws Exception {
        return new JSONObject().put("id", id).put("name", name).put("kind", "avoid")
            .put("goal", "check").put("target", 1).put("amount", 0).put("status", status).put("start", 20 * 60);
    }

    private static JSONObject summary() throws Exception {
        JSONObject lines = new JSONObject();
        for (String t : new String[]{"full", "great", "ok", "weak", "zero"}) {
            lines.put(t, new JSONArray().put("Ola, " + t + " {pct}% ({done}/{total})."));
        }
        return new JSONObject().put("at", 22 * 60).put("lines", lines)
            .put("tips", new JSONObject()
                .put("steps", new JSONArray().put("Kroki: zejdź na 7000."))
                .put("water", new JSONArray().put("Woda: rano.")))
            .put("general", new JSONArray().put("Zacznij przed 10:00."));
    }

    @Test
    public void tiersMatchTheApp() {
        assertEquals("full", DaySummary.tier(100));
        assertEquals("great", DaySummary.tier(75));
        assertEquals("ok", DaySummary.tier(45));
        assertEquals("weak", DaySummary.tier(1));
        assertEquals("zero", DaySummary.tier(0));
    }

    @Test
    public void sentAtTheLearnedMinuteOrEarlyWhenEverythingIsDone() {
        assertFalse(DaySummary.due(21 * 60 + 59, 22 * 60, false));
        assertTrue(DaySummary.due(22 * 60, 22 * 60, false));
        assertTrue(DaySummary.due(23 * 60 + 30, 22 * 60, false));
        assertFalse(DaySummary.due(22 * 60 + 181, 22 * 60, false)); // too late, a new night
        assertTrue(DaySummary.due(18 * 60 + 5, 22 * 60, true));     // all done after 18:00
        assertFalse(DaySummary.due(17 * 60, 22 * 60, true));
    }

    @Test
    public void recapListsTheDayAndAdvisesOnTheHabitThatGotTheLeastDone() throws Exception {
        JSONArray rows = new JSONArray()
            .put(build("teeth", "Mycie zębów", 2, 2))
            .put(build("steps", "Kroki", 6000, 8000))
            .put(build("water", "Woda", 0, 8))
            .put(avoid("food", "Fast food", "slip"))
            .put(avoid("sweets", "Słodycze", "clean"));
        String[] t = DaySummary.compose(rows, summary(), false, DaySummary.FIRST);
        // (1 + 0.75 + 0 + 0 + 1) / 5 = 55%
        assertEquals("🍻 Podsumowanie dnia · 55%", t[0]);
        assertEquals("Ola, ok 55% (2/5).", t[1]);
        String big = t[2];
        assertTrue(big, big.contains("✅ Zrobione: Mycie zębów"));
        assertTrue(big, big.contains("⏳ Zabrakło: Kroki (6000/8000), Woda"));
        assertTrue(big, big.contains("💥 Wpadki: Fast food"));
        assertTrue(big, big.endsWith("💡 Woda: rano.")); // water got the least done (0%)
    }

    @Test
    public void aFullDayGetsTheGeneralTip() throws Exception {
        JSONArray rows = new JSONArray().put(build("teeth", "Mycie zębów", 2, 2));
        String[] t = DaySummary.compose(rows, summary(), true, DaySummary.FIRST);
        assertEquals("🍻 Day recap · 100%", t[0]);
        assertTrue(t[2], t[2].endsWith("💡 Zacznij przed 10:00."));
        assertFalse(t[2].contains("⏳"));
    }

    @Test
    public void discreetRowsNeverReachThePlanOrTheRecap() throws Exception {
        JSONObject secret = avoid("p", "Zadanie dyskretne", "pending").put("discreet", true);
        JSONArray rows = new JSONArray().put(build("water", "Woda", 0, 8)).put(secret);
        List<JSONObject> plan = WidgetShared.plan(rows, 20 * 60);
        assertEquals(1, plan.size());
        assertEquals("water", plan.get(0).optString("id"));
        JSONArray open = WidgetShared.withoutDiscreet(rows);
        assertEquals(1, open.length());
        String[] t = DaySummary.compose(open, summary(), false, DaySummary.FIRST);
        assertFalse(t[2].contains("dyskretne"));
    }

    @Test
    public void reviewsCountDiscreetHabitsWithTheRightPolishForm() {
        assertEquals("🔒 +1 dyskretne", HabitNotifier.discreetLine(1, false));
        assertEquals("🔒 +3 dyskretne", HabitNotifier.discreetLine(3, false));
        assertEquals("🔒 +5 dyskretnych", HabitNotifier.discreetLine(5, false));
        assertEquals("🔒 +12 dyskretnych", HabitNotifier.discreetLine(12, false));
        assertEquals("🔒 +2 discreet", HabitNotifier.discreetLine(2, true));
    }
}
