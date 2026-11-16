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
        // the tip right after the comment, the lists last (cut first on phones that cut)
        assertTrue(big, big.startsWith("Ola, ok 55% (2/5).\n\n💡 Woda: rano.\n\n✅")); // water got the least done
        // the coach server gets facts only, and the rest of the text stays the app's own
        JSONObject f = new JSONObject(t[3]);
        assertEquals(55, f.getInt("pct"));
        assertEquals("pl", f.getString("lang"));
        assertEquals("Kroki", f.getJSONArray("missing").getString(0));
        assertEquals("Fast food", f.getJSONArray("slips").getString(0));
        assertEquals(t[1] + t[4], t[2]);
        // the notification: the comment + the tip only, the lists stay on the recap screen
        assertEquals("\n\n💡 Woda: rano.", t[5]);
        assertFalse(t[1] + t[5], (t[1] + t[5]).contains("✅"));
        assertTrue(t[4], t[4].startsWith(t[5]));
    }

    @Test
    public void theAiCommentIsMarked() {
        assertEquals("🤖 Piotr, w połowie drogi.", HabitNotifier.coachText("  Piotr, w połowie drogi. "));
    }

    @Test
    public void coachServerMustBeHttps() {
        assertEquals("https://szpila.example.eu", CoachClient.normalizeUrl(" https://szpila.example.eu/ "));
        assertEquals("https://box.local:8443/coach", CoachClient.normalizeUrl("https://box.local:8443/coach"));
        assertEquals("", CoachClient.normalizeUrl("http://szpila.example.eu"));
        assertEquals("", CoachClient.normalizeUrl("https://evil.example/?x=<script>"));
        assertEquals("", CoachClient.normalizeUrl(null));
    }

    @Test
    public void aFullDayGetsTheGeneralTip() throws Exception {
        JSONArray rows = new JSONArray().put(build("teeth", "Mycie zębów", 2, 2));
        String[] t = DaySummary.compose(rows, summary(), true, DaySummary.FIRST);
        assertEquals("🍻 Day recap · 100%", t[0]);
        assertTrue(t[2], t[2].contains("💡 Zacznij przed 10:00.\n\n✅"));
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
        assertFalse(t[3].contains("dyskretne"));
    }

    @Test
    public void reviewsCountDiscreetHabitsWithTheRightPolishForm() {
        assertEquals("🔒 +1 dyskretne", HabitNotifier.discreetLine(1, false));
        assertEquals("🔒 +3 dyskretne", HabitNotifier.discreetLine(3, false));
        assertEquals("🔒 +5 dyskretnych", HabitNotifier.discreetLine(5, false));
        assertEquals("🔒 +12 dyskretnych", HabitNotifier.discreetLine(12, false));
        assertEquals("🔒 +2 discreet", HabitNotifier.discreetLine(2, true));
    }

    @Test
    public void recapHistoryKeepsOnePerDayNewestFirst() throws Exception {
        JSONArray log = new JSONArray();
        log = HabitNotifier.pushRecap(log, new JSONObject().put("day", "2026-11-14").put("text", "a"), 3);
        log = HabitNotifier.pushRecap(log, new JSONObject().put("day", "2026-11-15").put("text", "b"), 3);
        // the AI comment for the same day replaces the plain one
        log = HabitNotifier.pushRecap(log, new JSONObject().put("day", "2026-11-15").put("text", "🤖 b"), 3);
        assertEquals(2, log.length());
        assertEquals("🤖 b", log.getJSONObject(0).getString("text"));
        assertEquals("a", log.getJSONObject(1).getString("text"));
        log = HabitNotifier.pushRecap(log, new JSONObject().put("day", "2026-11-16").put("text", "c"), 3);
        log = HabitNotifier.pushRecap(log, new JSONObject().put("day", "2026-11-17").put("text", "d"), 3);
        assertEquals(3, log.length()); // the oldest one went
        assertEquals("d", log.getJSONObject(0).getString("text"));
        assertEquals("🤖 b", log.getJSONObject(2).getString("text"));
    }

    @Test
    public void theWeekInNumbersAndForTheCoach() throws Exception {
        JSONObject wk = new JSONObject().put("pct", 35).put("prev", 52).put("slips", 3)
            .put("best", new JSONArray().put("Mycie zębów"))
            .put("worst", new JSONArray().put("Siłownia").put("Czytanie"));
        assertEquals("🗓️ Twój tydzień · 35%", HabitNotifier.weekTitle(wk, false));
        assertEquals("📊 35% · tydzień temu 52%\n✅ Najlepiej: Mycie zębów\n⏳ Najsłabiej: Siłownia, Czytanie\n💥 Wpadki: 3",
            HabitNotifier.weekStats(wk, false));
        JSONObject f = new JSONObject(HabitNotifier.weekFacts(wk, "Piotr", "hard", false));
        assertEquals("week", f.getString("kind"));
        assertEquals(52, f.getInt("prev"));
        assertEquals("Siłownia", f.getJSONArray("worst").getString(0));
        // the first week: nothing to compare with
        JSONObject first = new JSONObject().put("pct", 60).put("prev", JSONObject.NULL);
        assertEquals("📊 60%", HabitNotifier.weekStats(first, true));
        assertFalse(new JSONObject(HabitNotifier.weekFacts(first, "", "soft", true)).has("prev"));
        assertEquals("", HabitNotifier.weekStats(null, false));
        assertEquals("🗓️ Your week", HabitNotifier.weekTitle(null, true));
    }

    @Test
    public void aWeekAndADayOfTheSameDateBothStayInTheHistory() throws Exception {
        JSONArray log = new JSONArray();
        log = HabitNotifier.pushRecap(log, new JSONObject().put("day", "2026-11-15").put("kind", "week").put("text", "w"), 5);
        log = HabitNotifier.pushRecap(log, new JSONObject().put("day", "2026-11-15").put("kind", "day").put("text", "d"), 5);
        log = HabitNotifier.pushRecap(log, new JSONObject().put("day", "2026-11-15").put("kind", "week").put("text", "🤖 w"), 5);
        assertEquals(2, log.length());
        assertEquals("🤖 w", log.getJSONObject(0).getString("text"));
        assertEquals("d", log.getJSONObject(1).getString("text"));
    }

    @Test
    public void theForecastForTheCoachHasRisksWithReasonsAndTodaysPlan() throws Exception {
        Forecast.Item gym = new Forecast.Item("g", 0.7, "x");
        gym.name = "Siłownia";
        gym.reason = "sleep";
        JSONArray rows = new JSONArray()
            .put(build("g", "Siłownia", 0, 1))
            .put(build("w", "Woda", 8, 8))                       // done: not in the plan
            .put(avoid("s", "Słodycze", "pending"))              // avoid: a risk, not a plan item
            .put(avoid("p", "Sekret", "pending").put("discreet", true));
        JSONObject f = new JSONObject(Forecast.coachFacts(java.util.Collections.singletonList(gym), rows, 1, "Piotr", "hard", false));
        assertEquals("forecast", f.getString("kind"));
        assertEquals(1, f.getInt("wd"));
        assertEquals("sleep", f.getJSONArray("risks").getJSONObject(0).getString("reason"));
        assertEquals(1, f.getJSONArray("plan").length());
        assertEquals("Siłownia", f.getJSONArray("plan").getString(0));
        assertFalse(f.toString().contains("Sekret"));
    }
}
