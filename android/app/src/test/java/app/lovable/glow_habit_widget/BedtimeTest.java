package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Bedtime mode ("tryb przed snem"): when the guard starts and the countdown phase. */
public class BedtimeTest {
    private static final int BED = 23 * 60 + 30;

    @Test
    public void minutesToCrossesMidnight() {
        assertEquals(30, LiveGuard.minutesTo(BED, 0));
        assertEquals(120, LiveGuard.minutesTo(22 * 60, 0));
        assertEquals(1430, LiveGuard.minutesTo(10, 0));
        assertEquals(0, LiveGuard.minutesTo(0, 0));
    }

    @Test
    public void guardStartsAtBedtimeOnlyWhenItIsBeforeTheDeadline() {
        assertEquals(BED, LiveGuard.start(true, BED, 0));
        assertEquals(0, LiveGuard.start(false, BED, 0));
        assertEquals(0, LiveGuard.start(true, 30, 0)); // 00:30 is after the deadline
        assertEquals(0, LiveGuard.start(true, 0, 0));
        assertEquals(21 * 60, LiveGuard.start(true, 21 * 60, 0));
    }

    @Test
    public void prePhaseIsTheCountdownBeforeTheDeadline() {
        assertTrue(LiveGuard.prePhase(23 * 60 + 40, BED, 0));
        assertFalse(LiveGuard.prePhase(10, BED, 0)); // after midnight: the usual guard
        assertFalse(LiveGuard.prePhase(22 * 60, BED, 0)); // before bedtime
        assertFalse(LiveGuard.prePhase(23 * 60 + 40, 0, 0)); // bedtime mode off
    }

    @Test
    public void countdownPlaceholders() {
        assertEquals("Za 20 min 00:00.", LiveGuard.fillLeft("Za {left} min {deadline}.", 20, "00:00"));
    }
}
