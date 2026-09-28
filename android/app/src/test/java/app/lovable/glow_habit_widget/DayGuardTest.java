package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.Arrays;
import java.util.List;

/** Morning lock ("najpierw zadania, potem Instagram"), daily limit and the guard phases. */
public class DayGuardTest {
    private static int hm(int h, int m) {
        return h * 60 + m;
    }

    private static DayGuard.Config cfg(boolean night, boolean morning, boolean day) {
        DayGuard.Config c = new DayGuard.Config();
        c.night = night;
        c.nightStart = hm(23, 30);
        c.nightEnd = hm(5, 0);
        c.morning = morning;
        c.morningUntil = hm(11, 0);
        c.day = day;
        return c;
    }

    @Test
    public void phasesFollowTheClock() {
        DayGuard.Config all = cfg(true, true, true);
        assertEquals(DayGuard.NIGHT, DayGuard.phase(hm(23, 45), all, true));
        assertEquals(DayGuard.NIGHT, DayGuard.phase(hm(2, 0), all, true));
        // 05:00: the night is over, morning habits pending -> morning lock
        assertEquals(DayGuard.MORNING, DayGuard.phase(hm(5, 0), all, true));
        assertEquals(DayGuard.MORNING, DayGuard.phase(hm(8, 30), all, true));
        // habits done -> the daily limit takes over
        assertEquals(DayGuard.DAY, DayGuard.phase(hm(8, 30), all, false));
        // after 11:00 the lock gives up even with pending habits
        assertEquals(DayGuard.DAY, DayGuard.phase(hm(11, 0), all, true));
        assertEquals(DayGuard.DAY, DayGuard.phase(hm(22, 0), all, true));
    }

    @Test
    public void onlyTheEnabledFeaturesRun() {
        assertEquals(DayGuard.OFF, DayGuard.phase(hm(12, 0), cfg(true, true, false), true));
        assertEquals(DayGuard.OFF, DayGuard.phase(hm(9, 0), cfg(true, false, false), true));
        assertEquals(DayGuard.MORNING, DayGuard.phase(hm(9, 0), cfg(false, true, false), true));
        // without the night guard, 00:00-05:00 isn't "day" either
        assertEquals(DayGuard.OFF, DayGuard.phase(hm(2, 0), cfg(false, true, true), true));
        assertEquals(DayGuard.OFF, DayGuard.phase(hm(12, 0), cfg(false, false, false), true));
    }

    @Test
    public void nextStartAlarm() {
        List<Integer> starts = DayGuard.phaseStarts(cfg(true, true, false));
        assertEquals(Arrays.asList(hm(23, 30), DayGuard.DAY_START), starts);
        assertEquals(hm(1, 0), DayGuard.minutesToNextStart(hm(22, 30), starts)); // -> 23:30
        assertEquals(hm(1, 0), DayGuard.minutesToNextStart(hm(4, 0), starts)); // -> 05:00
        assertEquals(24 * 60, DayGuard.minutesToNextStart(hm(5, 0), Arrays.asList(hm(5, 0)))); // tomorrow, not now
        assertEquals(-1, DayGuard.minutesToNextStart(hm(5, 0), Arrays.asList()));
        assertTrue(DayGuard.phaseStarts(cfg(false, false, false)).isEmpty());
    }

    private static JSONObject row(String id, String name, String goal, int amount, int target, int step) throws Exception {
        return new JSONObject().put("id", id).put("name", name).put("kind", "build").put("goal", goal)
            .put("amount", amount).put("target", target).put("step", step);
    }

    @Test
    public void aMorningHabitCountsOnceTheFirstUnitIsIn() throws Exception {
        assertFalse(DayGuard.morningDone(row("t", "Mycie zębów", "count", 0, 2, 1)));
        assertTrue(DayGuard.morningDone(row("t", "Mycie zębów", "count", 1, 2, 1))); // morning brush = enough
        assertFalse(DayGuard.morningDone(row("w", "Picie wody", "count", 0, 8, 1)));
        assertTrue(DayGuard.morningDone(row("w", "Picie wody", "count", 1, 8, 1))); // first glass
        assertFalse(DayGuard.morningDone(row("r", "Czytanie", "minutes", 5, 20, 10)));
        assertTrue(DayGuard.morningDone(row("r", "Czytanie", "minutes", 10, 20, 10)));
        assertTrue(DayGuard.morningDone(row("c", "Witaminy", "check", 1, 1, 1)));
        JSONObject avoid = new JSONObject().put("id", "a").put("kind", "avoid").put("status", "pending");
        assertTrue(DayGuard.morningDone(avoid)); // forbidden habits never block the morning
    }

    @Test
    public void pendingMorningHabitsInTheChosenOrder() throws Exception {
        JSONArray rows = new JSONArray()
            .put(row("w", "Picie wody", "count", 0, 8, 1))
            .put(row("t", "Mycie zębów", "count", 1, 2, 1))
            .put(row("r", "Czytanie", "minutes", 0, 20, 10));
        JSONArray ids = new JSONArray(Arrays.asList("t", "w", "missing"));
        List<JSONObject> pending = DayGuard.morningPending(rows, ids);
        assertEquals(1, pending.size());
        assertEquals("w", pending.get(0).optString("id"));
        assertEquals("Picie wody", DayGuard.names(pending));
        assertTrue(DayGuard.morningPending(rows, null).isEmpty());
    }

    @Test
    public void dailyLimitStates() {
        assertEquals(DayGuard.LIMIT_OK, DayGuard.limitState(30, 60));
        assertEquals(DayGuard.LIMIT_WARN, DayGuard.limitState(50, 60)); // 10 min left
        assertEquals(DayGuard.LIMIT_OVER, DayGuard.limitState(60, 60));
        assertEquals(DayGuard.LIMIT_OVER, DayGuard.limitState(95, 60));
        assertEquals(DayGuard.LIMIT_OVER, DayGuard.limitState(15, 15)); // small limit: no warning step
        assertEquals(DayGuard.LIMIT_OK, DayGuard.limitState(10, 15));
        assertEquals(DayGuard.LIMIT_OK, DayGuard.limitState(500, 0)); // no limit
    }

    @Test
    public void foregroundTimeIsCountedPerPollAndCapped() {
        assertEquals(4_000, DayGuard.tickMs(10_000, 14_000, true, 10_000));
        assertEquals(0, DayGuard.tickMs(10_000, 14_000, false, 10_000)); // not a social app
        assertEquals(10_000, DayGuard.tickMs(10_000, 600_000, true, 10_000)); // long gap (screen was off)
        assertEquals(0, DayGuard.tickMs(0, 14_000, true, 10_000)); // first poll
    }

    @Test
    public void ongoingNotificationPerPhase() {
        String[] m = LiveGuardService.guardText(DayGuard.MORNING, false, hm(11, 0), "Instagram", "Mycie zębów, Picie wody", 0, 60);
        assertTrue(m[0].contains("Rano najpierw zadania"));
        assertTrue(m[1].contains("Mycie zębów, Picie wody") && m[1].contains("11:00"));
        String[] d = LiveGuardService.guardText(DayGuard.DAY, false, 0, "", "", 42, 60);
        assertTrue(d[0].contains("42/60 min"));
        assertTrue(d[1].startsWith("Zostało 18 min"));
        String[] over = LiveGuardService.guardText(DayGuard.DAY, true, 0, "", "", 75, 60);
        assertTrue(over[1].startsWith("Over the limit by 15 min"));
        String[] n = LiveGuardService.guardText(DayGuard.NIGHT, false, hm(5, 0), "Instagram, YouTube", "", 0, 60);
        assertTrue(n[0].contains("czuwa do 05:00") && n[1].contains("Instagram, YouTube"));
    }
}
