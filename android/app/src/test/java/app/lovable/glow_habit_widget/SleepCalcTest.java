package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;

/** Sleep from the band: source pick, main sleep, stage sums, phone-down vs asleep, bill text. */
public class SleepCalcTest {
    private static final long M = SleepCalc.MIN;
    private static final String MI = SleepCalc.MI_FITNESS;
    private static final String FIT = "com.google.android.apps.fitness";

    /** Local midnight of 2026-09-25 (the day the night is filed under). */
    private static long day() {
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(2026, Calendar.SEPTEMBER, 25, 0, 0, 0);
        return c.getTimeInMillis();
    }

    /** Minutes after the day's midnight (24*60 = next midnight). */
    private static long at(int min) {
        return day() + min * M;
    }

    private static SleepCalc.Session s(int from, int to, String src, SleepCalc.Stage... st) {
        return new SleepCalc.Session(at(from), at(to), src, Arrays.asList(st));
    }

    private static SleepCalc.Stage st(int from, int to, int type) {
        return new SleepCalc.Stage(at(from), at(to), type);
    }

    private static final int MIDNIGHT = 24 * 60;

    @Test
    public void unionCountsOverlapsOnce() {
        List<long[]> l = new ArrayList<>();
        l.add(new long[]{0, 10});
        l.add(new long[]{5, 20});
        l.add(new long[]{30, 40});
        l.add(new long[]{35, 36});
        assertEquals(30, SleepCalc.unionMs(l));
        assertEquals(0, SleepCalc.unionMs(Collections.<long[]>emptyList()));
    }

    @Test
    public void windowIsEveningToNextAfternoon() {
        long[] w = SleepCalc.window(day());
        assertEquals(at(18 * 60), w[0]);
        assertEquals(at(MIDNIGHT + 14 * 60), w[1]);
        List<SleepCalc.Session> all = Arrays.asList(
            s(-2 * 60, 7 * 60, MI), // the night before (ends the morning of D)
            s(MIDNIGHT + 48, MIDNIGHT + 7 * 60, MI), // this night
            s(MIDNIGHT + 22 * 60, 2 * MIDNIGHT + 6 * 60, MI)); // the next night
        List<SleepCalc.Session> in = SleepCalc.overlapping(all, w[0], w[1]);
        assertEquals(1, in.size());
        assertEquals(at(MIDNIGHT + 48), in.get(0).start);
    }

    @Test
    public void miFitnessWinsInAuto_otherwiseTheLongest() {
        List<SleepCalc.Session> both = Arrays.asList(
            s(MIDNIGHT, MIDNIGHT + 8 * 60, FIT),
            s(MIDNIGHT + 30, MIDNIGHT + 7 * 60, MI));
        assertEquals(MI, SleepCalc.pickSource(both, "auto"));
        assertEquals(MI, SleepCalc.pickSource(both, null));
        assertEquals(FIT, SleepCalc.pickSource(both, FIT));
        // a preferred app that wrote nothing falls back to auto
        assertEquals(MI, SleepCalc.pickSource(both, "com.other"));
        List<SleepCalc.Session> noMi = Arrays.asList(
            s(MIDNIGHT, MIDNIGHT + 5 * 60, "a"),
            s(MIDNIGHT, MIDNIGHT + 7 * 60, "b"));
        assertEquals("b", SleepCalc.pickSource(noMi, "auto"));
        assertNull(SleepCalc.pickSource(Collections.<SleepCalc.Session>emptyList(), "auto"));
    }

    @Test
    public void wakingUpAtThreeIsStillOneNight_anEveningNapIsNot() {
        SleepCalc.Night n = SleepCalc.night(Arrays.asList(
            s(19 * 60, 19 * 60 + 40, MI), // a nap on the sofa
            s(MIDNIGHT + 48, MIDNIGHT + 3 * 60, MI),
            s(MIDNIGHT + 3 * 60 + 30, MIDNIGHT + 7 * 60, MI)), day(), "auto");
        assertEquals(at(MIDNIGHT + 48), n.start);
        assertEquals(at(MIDNIGHT + 7 * 60), n.end);
        assertEquals(132 + 210, n.minutes); // the 30 min awake gap doesn't count
        assertEquals(-1, n.deep); // no stages
        assertEquals(MI, n.source);
    }

    @Test
    public void onlyOneSourceCounts_noDoubleNight() {
        SleepCalc.Night n = SleepCalc.night(Arrays.asList(
            s(MIDNIGHT, MIDNIGHT + 6 * 60, MI),
            s(MIDNIGHT, MIDNIGHT + 6 * 60, FIT)), day(), "auto");
        assertEquals(360, n.minutes);
    }

    @Test
    public void stagesAwakeLeftOut() {
        SleepCalc.Night n = SleepCalc.night(Collections.singletonList(
            s(MIDNIGHT + 48, MIDNIGHT + 7 * 60, MI,
                st(MIDNIGHT + 48, MIDNIGHT + 60, SleepCalc.STAGE_LIGHT),
                st(MIDNIGHT + 60, MIDNIGHT + 150, SleepCalc.STAGE_DEEP),
                st(MIDNIGHT + 150, MIDNIGHT + 170, SleepCalc.STAGE_AWAKE),
                st(MIDNIGHT + 170, MIDNIGHT + 260, SleepCalc.STAGE_REM),
                st(MIDNIGHT + 260, MIDNIGHT + 400, SleepCalc.STAGE_LIGHT),
                st(MIDNIGHT + 400, MIDNIGHT + 410, SleepCalc.STAGE_OUT_OF_BED),
                st(MIDNIGHT + 410, MIDNIGHT + 420, SleepCalc.STAGE_AWAKE_IN_BED))), day(), "auto");
        assertEquals(372 - 40, n.minutes);
        assertEquals(90, n.deep);
        assertEquals(90, n.rem);
        assertEquals(12 + 140, n.light);
        assertEquals(40, n.awake);
    }

    @Test
    public void tooShortIsNoNight() {
        assertNull(SleepCalc.night(Collections.singletonList(s(MIDNIGHT, MIDNIGHT + 40, MI)), day(), "auto"));
        assertNull(SleepCalc.night(Collections.<SleepCalc.Session>emptyList(), day(), "auto"));
    }

    @Test
    public void fellAsleepAfterThePhoneWentDown() {
        assertEquals(18, SleepCalc.fellAfter(30, 48)); // phone 00:30, asleep 00:48
        assertEquals(25, SleepCalc.fellAfter(23 * 60 + 50, 15)); // across midnight
        assertEquals(-40, SleepCalc.fellAfter(100, 60)); // phone down after falling asleep
        assertEquals(SleepCalc.UNKNOWN, SleepCalc.fellAfter(-1, 60));
        assertEquals(SleepCalc.UNKNOWN, SleepCalc.fellAfter(60, -1));
        assertEquals(SleepCalc.UNKNOWN, SleepCalc.fellAfter(21 * 60, 5 * 60)); // 8 h apart: not comparable
    }

    @Test
    public void durationAndJson() throws Exception {
        assertEquals("6 h 12 min", SleepCalc.duration(372));
        assertEquals("7 h", SleepCalc.duration(420));
        assertEquals("45 min", SleepCalc.duration(45));
        SleepCalc.Night n = SleepCalc.night(Collections.singletonList(s(MIDNIGHT + 48, MIDNIGHT + 7 * 60, MI)), day(), "auto");
        JSONObject o = SleepCalc.toJson(n);
        assertEquals(48, o.getInt("start"));
        assertEquals(420, o.getInt("end"));
        assertEquals(372, o.getInt("minutes"));
        assertEquals(MI, o.getString("source"));
        assertFalse(o.has("deep"));
        assertEquals("6 h 12 min (00:48–07:00)", SleepCalc.summary(o));
    }

    @Test
    public void billPoolsMirrorNightTs() {
        assertArrayEquals(new String[]{"bad"}, SleepCalc.billPools(10, -1));
        assertArrayEquals(new String[]{"good"}, SleepCalc.billPools(0, -1));
        assertArrayEquals(new String[]{"bad", "short"}, SleepCalc.billPools(10, 300));
        assertArrayEquals(new String[]{"short"}, SleepCalc.billPools(0, 359));
        assertArrayEquals(new String[]{"good"}, SleepCalc.billPools(0, 400));
        assertArrayEquals(new String[]{"good", "rested"}, SleepCalc.billPools(0, 420));
        assertArrayEquals(new String[]{"bad"}, SleepCalc.billPools(5, 480));
    }

    @Test
    public void billShowsSleepAndUsesSleepLines() throws Exception {
        JSONObject sleep = new JSONObject().put("start", 48).put("end", 420).put("minutes", 300).put("source", MI);
        JSONObject r = new JSONObject().put("social", 0).put("screen", 3).put("visits", 0).put("asleep", 30)
            .put("apps", new JSONArray()).put("sleep", sleep);
        JSONObject lines = new JSONObject()
            .put("good", new JSONArray().put("Czysto."))
            .put("short", new JSONArray().put("Tylko {sleep}, zasypiasz {fell} min po."));
        String[] t = HabitNotifier.billText(r, lines);
        assertTrue(t[1].contains("\n😴 5 h snu (00:48–07:00)"));
        assertTrue(t[1].contains("\n💤 Zasypiasz 18 min po odłożeniu telefonu"));
        assertTrue(t[1].endsWith("Tylko 5 h, zasypiasz 18 min po."));
        String[] en = HabitNotifier.billText(r, lines, true);
        assertTrue(en[1].contains("\n😴 5 h of sleep (00:48–07:00)"));
        assertTrue(en[1].contains("\n💤 Asleep 18 min after the phone went down"));

        // phone down after falling asleep: the jab, and {fell} lines are skipped
        r.put("asleep", 100);
        String[] late = HabitNotifier.billText(r, lines);
        assertTrue(late[1].contains("Telefon odłożony 52 min po zaśnięciu?!"));
        assertTrue(late[1].endsWith("Czysto.")); // no usable "short" line -> falls back to good

        // an old snapshot without sleep pools still gets a comment
        String[] old = HabitNotifier.billText(r, new JSONObject().put("good", new JSONArray().put("Czysta noc.")));
        assertTrue(old[1].endsWith("Czysta noc."));

        // no sleep in the report: nothing about it
        r.remove("sleep");
        assertFalse(HabitNotifier.billText(r, lines)[1].contains("😴"));
        assertEquals("?", NightStats.fill("{sleep}", r));
        assertFalse(NightStats.usable("{sleep}", r));
    }
}
