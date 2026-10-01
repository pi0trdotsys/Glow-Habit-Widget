package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Curfew ("cisza nocna"), night debt and the steps source: the pure parts. */
public class CurfewTest {
    private static final Set<String> ESSENTIAL = new HashSet<>(Arrays.asList(
        "app.lawnchair", "com.android.deskclock", "com.google.android.dialer"));

    @Test
    public void curfewOnlyAfterTheDeadline() {
        // deadline 00:00, morning 05:00
        assertTrue(LiveGuard.curfewNow(0, 0, 300));
        assertTrue(LiveGuard.curfewNow(4 * 60 + 59, 0, 300));
        assertFalse(LiveGuard.curfewNow(5 * 60, 0, 300));
        assertFalse(LiveGuard.curfewNow(23 * 60 + 40, 0, 300)); // bedtime mode only jabs
        // a deadline before midnight
        assertTrue(LiveGuard.curfewNow(23 * 60 + 40, 23 * 60 + 30, 300));
        assertTrue(LiveGuard.curfewNow(60, 23 * 60 + 30, 300));
    }

    @Test
    public void blocksEverythingButEssentialsAndTheAllowList() {
        Set<String> allowed = Collections.singleton("com.spotify.music");
        assertTrue(LiveGuard.curfewBlocks("com.android.chrome", ESSENTIAL, allowed));
        assertTrue(LiveGuard.curfewBlocks("com.instagram.android", ESSENTIAL, allowed));
        assertFalse(LiveGuard.curfewBlocks("com.spotify.music", ESSENTIAL, allowed));
        assertFalse(LiveGuard.curfewBlocks("app.lawnchair", ESSENTIAL, allowed));
        assertFalse(LiveGuard.curfewBlocks("com.android.deskclock", ESSENTIAL, allowed));
        assertFalse(LiveGuard.curfewBlocks(null, ESSENTIAL, allowed));
        assertFalse(LiveGuard.curfewBlocks("", ESSENTIAL, allowed));
        assertTrue(LiveGuard.curfewBlocks("com.whatsapp", ESSENTIAL, null));
    }

    @Test
    public void baseEssentialsCoverCallsAlarmsAndSettings() {
        for (String p : new String[]{"com.android.systemui", "com.android.settings", "com.android.incallui",
            "com.google.android.dialer", "com.android.deskclock", "com.google.android.permissioncontroller"}) {
            assertTrue(p, LiveGuard.BASE_ESSENTIAL.contains(p));
        }
        for (String social : LiveGuard.SOCIAL.keySet()) assertFalse(social, LiveGuard.BASE_ESSENTIAL.contains(social));
    }

    @Test
    public void everyUrgentPassNeedsALongerHold() {
        assertEquals(10_000L, LiveGuard.curfewHoldMs(0));
        assertEquals(20_000L, LiveGuard.curfewHoldMs(1));
        assertEquals(40_000L, LiveGuard.curfewHoldMs(2));
        assertEquals(60_000L, LiveGuard.curfewHoldMs(3));
        assertEquals(60_000L, LiveGuard.curfewHoldMs(10));
    }

    @Test
    public void nightFilterThickensButLetsTouchesThrough() {
        long pass = LiveGuard.CURFEW_PASS_MIN * 60_000L;
        assertEquals(0.3f, LiveGuard.dimAlpha(0, pass), 0.001f);
        assertEquals(0.5f, LiveGuard.dimAlpha(pass / 2, pass), 0.001f);
        assertEquals(0.7f, LiveGuard.dimAlpha(pass, pass), 0.001f);
        assertEquals(0.7f, LiveGuard.dimAlpha(pass * 5, pass), 0.001f);
        assertTrue(LiveGuard.dimAlpha(pass, pass) < 0.8f); // Android blocks touches through overlays above 0.8
    }

    @Test
    public void beforeTheDeadlineTheBlockComesOneJabSooner() {
        assertFalse(LiveGuard.shouldBlock(2, true));
        assertTrue(LiveGuard.shouldBlock(3, true));
        assertFalse(LiveGuard.shouldBlock(3, false));
        assertTrue(LiveGuard.shouldBlock(4, false));
        assertEquals(LiveGuard.shouldBlock(4), LiveGuard.shouldBlock(4, false));
    }

    @Test
    public void curfewPlaceholders() {
        String s = LiveGuardService.curfewFill("{time} {app}: {count}. wyjątek, do {until} zostało {left} min",
            "Chrome", 60, 300, 2);
        assertEquals("01:00 Chrome: 2. wyjątek, do 05:00 zostało 240 min", s);
    }

    @Test
    public void ongoingNotificationDuringTheCurfew() {
        String[] pl = LiveGuardService.guardText(DayGuard.NIGHT, false, 300, "TikTok", "", 0, 60, true, 2);
        assertEquals("🌙 Cisza nocna do 05:00", pl[0]);
        assertTrue(pl[1].contains("budzik") && pl[1].contains("2 dozwolone"));
        String[] en = LiveGuardService.guardText(DayGuard.NIGHT, true, 300, "TikTok", "", 0, 60, true, 0);
        assertEquals("🌙 Curfew until 05:00", en[0]);
        assertFalse(en[1].contains("allowed apps"));
        // without the curfew: the usual night text
        assertArrayEquals(LiveGuardService.guardText(DayGuard.NIGHT, false, 300, "TikTok", "", 0, 60),
            LiveGuardService.guardText(DayGuard.NIGHT, false, 300, "TikTok", "", 0, 60, false, 0));
    }

    @Test
    public void theNightCostsTheDay() {
        assertEquals(0, DayGuard.debtMin(0, 0, 60));
        assertEquals(8, DayGuard.debtMin(4, 0, 60)); // 2 per social minute after midnight
        assertEquals(20, DayGuard.debtMin(0, 2, 60)); // 10 per urgent pass
        assertEquals(28, DayGuard.debtMin(4, 2, 60));
        assertEquals(45, DayGuard.debtMin(100, 5, 60)); // at least 15 min stay
        assertEquals(0, DayGuard.debtMin(30, 1, 15));
        assertEquals(0, DayGuard.debtMin(-3, -1, 60));
    }

    @Test
    public void stepsAutoTakesTheBestSource() {
        assertEquals(5200L, StepsPick.auto(4100L, Arrays.asList(5200L, 3000L)));
        assertEquals(7000L, StepsPick.auto(7000L, Arrays.asList(5200L, 3000L)));
        assertEquals(0L, StepsPick.auto(-1L, Collections.<Long>emptyList()));
        assertEquals(10L, StepsPick.auto(10L, null));
        assertEquals("auto", StepsPick.normalize(null));
        assertEquals("auto", StepsPick.normalize("  "));
        assertEquals("com.xiaomi.wearable", StepsPick.normalize("com.xiaomi.wearable"));
    }
}
