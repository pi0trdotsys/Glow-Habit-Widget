package app.lovable.glow_habit_widget;

import static app.lovable.glow_habit_widget.NightStats.SCREEN_OFF;
import static app.lovable.glow_habit_widget.NightStats.SCREEN_ON;
import static app.lovable.glow_habit_widget.NightStats.SHUTDOWN;
import static app.lovable.glow_habit_widget.NightStats.STARTUP;
import static app.lovable.glow_habit_widget.NightStats.UNLOCK;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * "Rachunek za noc": when did the phone really go down? Replays the real night
 * 27->28.09 from the phone: last unlock 01:04, lots of brief wake-ups without an
 * unlock, the scheduled power-off prompt at 03:00 (screen on 10 s), shutdown at
 * 03:00:31, startup + unlock at 09:44. Expected: 01:04, not 03:00.
 */
public class NightSessionsTest {
    private static final long S = 1000L;
    private static final long M = 60 * S;
    private static final long H = 60 * M;
    /** 21:00 of the evening = 0 (the sleep window starts there). */
    private static long at(int h, int m, int s) {
        long t = (h < 21 ? h + 24 - 21 : h - 21) * H + m * M + s * S;
        return t;
    }

    private final List<Long> t = new ArrayList<>();
    private final List<Integer> k = new ArrayList<>();

    private void ev(long time, int kind) {
        t.add(time);
        k.add(kind);
    }

    private List<long[]> periods(long to) {
        long[] tt = new long[t.size()];
        int[] kk = new int[k.size()];
        for (int i = 0; i < tt.length; i++) {
            tt[i] = t.get(i);
            kk[i] = k.get(i);
        }
        return NightStats.awakePeriods(tt, kk, to);
    }

    private void realNight() {
        // evening use
        ev(at(23, 50, 0), SCREEN_ON);
        ev(at(23, 50, 2), UNLOCK);
        ev(at(23, 58, 0), SCREEN_OFF);
        ev(at(23, 59, 10), SCREEN_ON);
        ev(at(23, 59, 15), UNLOCK);
        ev(at(0, 2, 30), SCREEN_OFF);
        // the last real session
        ev(at(1, 4, 37), SCREEN_ON);
        ev(at(1, 4, 38), UNLOCK);
        ev(at(1, 4, 45), SCREEN_OFF);
        // brief wake-ups without an unlock (notifications, raise to wake)
        for (int i = 0; i < 12; i++) {
            ev(at(1, 20 + i * 3, 0), SCREEN_ON);
            ev(at(1, 20 + i * 3, 6), SCREEN_OFF);
        }
        // scheduled power off: the prompt lights the screen for 10 s, then shutdown
        ev(at(3, 0, 1), SCREEN_ON);
        ev(at(3, 0, 11), SCREEN_OFF);
        ev(at(3, 0, 31), SHUTDOWN);
        // scheduled power on + unlock in the morning
        ev(at(9, 44, 7), STARTUP);
        ev(at(9, 44, 7), SCREEN_ON);
        ev(at(9, 44, 7), UNLOCK);
        ev(at(9, 50, 0), SCREEN_OFF);
    }

    @Test
    public void phoneDownIsTheLastRealSessionNotTheScheduledShutdown() {
        realNight();
        long to = at(11, 59, 0);
        List<long[]> p = periods(to);
        long asleep = NightStats.asleepAt(p, 0, to, NightStats.MIN_SLEEP_MS);
        assertEquals(at(1, 4, 45), asleep); // 01:04, not 03:00
    }

    @Test
    public void briefWakeUpsAreNotPhoneUse() {
        realNight();
        long midnight = at(0, 0, 0);
        long five = at(5, 0, 0);
        List<long[]> p = periods(at(11, 59, 0));
        // after midnight: 00:00-00:02:30 (the session from 23:59) + 7 s at 01:04 - the
        // 12 six-second wake-ups and the 10 s power-off prompt don't count
        assertEquals(2 * M + 30 * S + 8 * S, NightStats.awakeMs(p, midnight, five));
    }

    @Test
    public void aLongScreenOnWithoutUnlockStillCounts() {
        ev(at(0, 10, 0), SCREEN_ON);
        ev(at(0, 13, 0), SCREEN_OFF); // 3 min reading on the lock screen
        List<long[]> p = periods(at(5, 0, 0));
        assertEquals(1, p.size());
        assertEquals(3 * M, NightStats.awakeMs(p, 0, at(5, 0, 0)));
    }

    @Test
    public void unlockWithoutScreenEventAndSessionOpenAtTheEnd() {
        ev(at(0, 30, 0), UNLOCK); // unlock implies the screen is on
        List<long[]> p = periods(at(0, 40, 0));
        assertEquals(10 * M, NightStats.awakeMs(p, 0, at(0, 40, 0)));
    }

    @Test
    public void noLongStretchMeansUnknown() {
        for (int i = 0; i < 10; i++) {
            ev(at(22, 0, 0) + i * H, SCREEN_ON);
            ev(at(22, 0, 1) + i * H, UNLOCK);
            ev(at(22, 30, 0) + i * H, SCREEN_OFF);
        }
        List<long[]> p = periods(at(8, 0, 0));
        assertEquals(-1, NightStats.asleepAt(p, 0, at(8, 0, 0), NightStats.MIN_SLEEP_MS));
    }

    @Test
    public void stillAsleepAtTheEndOfTheWindow() {
        ev(at(23, 0, 0), SCREEN_ON);
        ev(at(23, 0, 1), UNLOCK);
        ev(at(23, 40, 0), SCREEN_OFF);
        List<long[]> p = periods(at(8, 0, 0));
        assertEquals(at(23, 40, 0), NightStats.asleepAt(p, 0, at(8, 0, 0), NightStats.MIN_SLEEP_MS));
    }
}
