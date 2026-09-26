package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Night guard ("Szpila na żywo"): window, per-session jabs, snooze, placeholders. */
public class LiveGuardTest {
    private static final long MIN = 60_000L;
    private static final String TT = "com.zhiliaoapp.musically";
    private static final String IG = "com.instagram.android";

    @Test
    public void windowCrossesMidnight() {
        assertTrue(LiveGuard.inWindow(30, 0, 300));
        assertFalse(LiveGuard.inWindow(300, 0, 300));
        assertFalse(LiveGuard.inWindow(23 * 60 + 59, 0, 300));
        assertTrue(LiveGuard.inWindow(23 * 60 + 30, 23 * 60, 300));
        assertTrue(LiveGuard.inWindow(120, 23 * 60, 300));
        assertFalse(LiveGuard.inWindow(600, 23 * 60, 300));
        assertFalse(LiveGuard.inWindow(0, 0, 0));
    }

    @Test
    public void firstJabImmediatelyThenEveryFiveMinutes() {
        LiveGuard.Tracker t = new LiveGuard.Tracker();
        long t0 = 1_000_000L;
        assertEquals(LiveGuard.FIRST, t.onForeground(TT, true, t0, 0));
        assertEquals(LiveGuard.NONE, t.onForeground(TT, true, t0 + 2_000, 0));
        assertEquals(LiveGuard.NONE, t.onForeground(TT, true, t0 + 4 * MIN, 0));
        assertEquals(LiveGuard.ESCALATE, t.onForeground(TT, true, t0 + 5 * MIN, 0));
        assertEquals(5, t.minutesIn(t0 + 5 * MIN));
        assertEquals(LiveGuard.NONE, t.onForeground(TT, true, t0 + 7 * MIN, 0));
        assertEquals(LiveGuard.ESCALATE, t.onForeground(TT, true, t0 + 10 * MIN, 0));
    }

    @Test
    public void leavingOrSwitchingAppsStartsANewSession() {
        LiveGuard.Tracker t = new LiveGuard.Tracker();
        long t0 = 0;
        assertEquals(LiveGuard.FIRST, t.onForeground(TT, true, t0, 0));
        // back on the home screen / an unwatched app
        assertEquals(LiveGuard.NONE, t.onForeground("com.android.launcher", false, t0 + MIN, 0));
        assertEquals(LiveGuard.FIRST, t.onForeground(TT, true, t0 + 2 * MIN, 0));
        // switching TikTok -> Instagram is a fresh jab for Instagram
        assertEquals(LiveGuard.FIRST, t.onForeground(IG, true, t0 + 3 * MIN, 0));
        // screen off resets too
        t.reset();
        assertEquals(LiveGuard.FIRST, t.onForeground(IG, true, t0 + 4 * MIN, 0));
    }

    @Test
    public void snoozeMutesWithoutEndingTheSession() {
        LiveGuard.Tracker t = new LiveGuard.Tracker();
        long t0 = 0;
        assertEquals(LiveGuard.FIRST, t.onForeground(TT, true, t0, 0));
        long snooze = t0 + 6 * MIN;
        assertEquals(LiveGuard.NONE, t.onForeground(TT, true, t0 + 5 * MIN, snooze));
        // after the snooze the overdue escalation comes right away
        assertEquals(LiveGuard.ESCALATE, t.onForeground(TT, true, t0 + 6 * MIN, snooze));
        assertEquals(6, t.minutesIn(t0 + 6 * MIN));
    }

    @Test
    public void snoozedOpenStillGetsAJabLater() {
        LiveGuard.Tracker t = new LiveGuard.Tracker();
        long snooze = 3 * MIN;
        assertEquals(LiveGuard.NONE, t.onForeground(TT, true, 0, snooze));
        assertEquals(LiveGuard.FIRST, t.onForeground(TT, true, 3 * MIN, snooze));
    }

    @Test
    public void placeholdersAndHabitDay() {
        assertEquals("TikTok o 01:12, 3. raz, 7 min",
            LiveGuard.fill("{app} o {time}, {count}. raz, {m} min", "TikTok", 7, "01:12", 3));
        assertEquals("2026-09-25", LiveGuard.habitDay(90, "2026-09-26", "2026-09-25")); // 01:30 = last night
        assertEquals("2026-09-26", LiveGuard.habitDay(23 * 60, "2026-09-26", "2026-09-25"));
    }

    @Test
    public void socialListHasLabels() {
        assertTrue(LiveGuard.SOCIAL.containsKey(TT));
        assertEquals("TikTok", LiveGuard.SOCIAL.get(TT)[1]);
        for (String[] v : LiveGuard.SOCIAL.values()) {
            assertEquals(2, v.length);
            assertFalse(v[0].isEmpty());
        }
    }
}
