package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Per-widget settings (WidgetPrefs) and the ticker filtering they drive in NextWidgetContent. */
public class WidgetPrefsTest {
    private static final int NOON = 12 * 60;

    private static Set<String> set(String... ids) {
        return new LinkedHashSet<>(Arrays.asList(ids));
    }

    private static List<String> kinds(List<NextWidgetContent.Line> lines) {
        List<String> out = new ArrayList<>();
        for (NextWidgetContent.Line l : lines) out.add(l.kind);
        return out;
    }

    private static NextWidgetContent.Line line(String kind) {
        return new NextWidgetContent.Line(kind, kind + " text", 0);
    }

    // ------------------------------------------------------------------ opacity

    @Test
    public void opacityDefaultsToTheOriginalLook() {
        assertEquals(100, WidgetPrefs.DEFAULT_OPACITY);
        assertEquals(255, WidgetPrefs.alpha(WidgetPrefs.DEFAULT_OPACITY));
    }

    @Test
    public void opacityIsClampedAndSnappedToSteps() {
        assertEquals(0, WidgetPrefs.clampOpacity(-20));
        assertEquals(100, WidgetPrefs.clampOpacity(250));
        assertEquals(40, WidgetPrefs.clampOpacity(40));
        assertEquals(40, WidgetPrefs.clampOpacity(43));
        assertEquals(50, WidgetPrefs.clampOpacity(47));
    }

    @Test
    public void alphaCoversZeroTo255() {
        assertEquals(0, WidgetPrefs.alpha(0));
        assertEquals(128, WidgetPrefs.alpha(50));
        assertEquals(255, WidgetPrefs.alpha(100));
        assertEquals(0, WidgetPrefs.alpha(-5));
        assertEquals(255, WidgetPrefs.alpha(300));
        int prev = -1;
        for (int o = 0; o <= 100; o += WidgetPrefs.STEP) {
            int a = WidgetPrefs.alpha(o);
            assertTrue(a > prev);
            prev = a;
        }
    }

    // ------------------------------------------------------------------ lines encode / decode

    @Test
    public void linesDefaultToAll() {
        assertEquals(WidgetPrefs.allLines(), WidgetPrefs.decodeLines(null));
        assertEquals(WidgetPrefs.allLines(), WidgetPrefs.decodeLines(""));
        assertEquals(Arrays.asList("jab", "forma", "progress", "time", "social", "next"),
            new ArrayList<>(WidgetPrefs.allLines()));
    }

    @Test
    public void linesRoundTrip() {
        Set<String> s = set("next", "jab", "time");
        String enc = WidgetPrefs.encodeLines(s);
        assertEquals("jab,time,next", enc); // canonical order
        assertEquals(set("jab", "time", "next"), WidgetPrefs.decodeLines(enc));
        assertEquals(WidgetPrefs.allLines(), WidgetPrefs.decodeLines(WidgetPrefs.encodeLines(WidgetPrefs.allLines())));
        assertEquals(set("forma"), WidgetPrefs.decodeLines(WidgetPrefs.encodeLines(set("forma"))));
    }

    @Test
    public void unknownIdsAreIgnored() {
        assertEquals(set("forma", "social"), WidgetPrefs.decodeLines("forma, weather ,social,,x"));
        assertEquals(set("jab"), WidgetPrefs.normalize(set("jab", "horoscope")));
        // only unknown ids = nothing valid chosen -> back to all (never zero lines)
        assertEquals(WidgetPrefs.allLines(), WidgetPrefs.decodeLines("weather,horoscope"));
        assertEquals("jab", WidgetPrefs.encodeLines(set("horoscope", "jab")));
    }

    @Test
    public void emptySelectionMeansAll() {
        assertEquals(WidgetPrefs.allLines(), WidgetPrefs.normalize(new HashSet<>()));
        assertEquals(WidgetPrefs.allLines(), WidgetPrefs.normalize(null));
        assertEquals(WidgetPrefs.encodeLines(WidgetPrefs.allLines()), WidgetPrefs.encodeLines(Collections.emptySet()));
    }

    // ------------------------------------------------------------------ filtering

    @Test
    public void lineOnRespectsTheSelection() {
        assertTrue(WidgetPrefs.lineOn(null, "jab"));
        assertTrue(WidgetPrefs.lineOn(set("jab"), "jab"));
        assertFalse(WidgetPrefs.lineOn(set("jab"), "forma"));
        // kinds the settings don't know (e.g. the guard banners) are never filtered
        assertTrue(WidgetPrefs.lineOn(set("jab"), "lock"));
    }

    @Test
    public void filterKeepsOrderAndOnlyEnabledKinds() {
        List<NextWidgetContent.Line> all = Arrays.asList(line("jab"), line("forma"), line("progress"),
            line("time"), line("social"), line("next"));
        assertEquals(kinds(all), kinds(WidgetPrefs.filter(all, null)));
        assertEquals(Arrays.asList("forma", "next"), kinds(WidgetPrefs.filter(all, set("next", "forma"))));
    }

    @Test
    public void atLeastOneLineStays() {
        List<NextWidgetContent.Line> all = Arrays.asList(line("forma"), line("time"), line("social"));
        List<NextWidgetContent.Line> none = WidgetPrefs.filter(all, set("next"));
        assertTrue(none.isEmpty());
        assertEquals(Collections.singletonList("time"), kinds(WidgetPrefs.atLeastOne(none, all)));
        // no time line available -> the first one
        List<NextWidgetContent.Line> noTime = Arrays.asList(line("forma"), line("social"));
        assertEquals(Collections.singletonList("forma"),
            kinds(WidgetPrefs.atLeastOne(new ArrayList<>(), noTime)));
        // a non-empty selection is left alone
        List<NextWidgetContent.Line> kept = WidgetPrefs.filter(all, set("social"));
        assertEquals(Collections.singletonList("social"), kinds(WidgetPrefs.atLeastOne(kept, all)));
        assertTrue(WidgetPrefs.atLeastOne(new ArrayList<>(), new ArrayList<>()).isEmpty());
    }

    // ------------------------------------------------------------------ NextWidgetContent with a selection

    private static JSONObject water() throws Exception {
        return new JSONObject().put("id", "w").put("name", "Woda").put("kind", "build").put("goal", "count")
            .put("amount", 2).put("target", 8).put("step", 1).put("start", 8 * 60).put("end", 22 * 60)
            .put("units", 8).put("nag", new JSONArray(Arrays.asList("Pij.", "Dalej pij.")));
    }

    private static JSONObject read() throws Exception {
        return new JSONObject().put("id", "r").put("name", "Czytanie").put("kind", "build").put("goal", "check")
            .put("target", 1).put("start", 18 * 60).put("end", 18 * 60);
    }

    private static NextWidgetContent.Inputs normal() throws Exception {
        NextWidgetContent.Inputs in = new NextWidgetContent.Inputs();
        in.now = NOON;
        in.plan = new ArrayList<>(Arrays.asList(water(), read()));
        in.total = 2;
        in.counted = 2;
        in.done = 0;
        in.formaCurrent = 3;
        in.formaBest = 5;
        in.dayLimitOn = true;
        in.usedMin = 10;
        in.limitMin = 60;
        return in;
    }

    @Test
    public void normalTickerFollowsTheSelection() throws Exception {
        NextWidgetContent.Inputs in = normal();
        List<String> all = kinds(NextWidgetContent.normalTicker(in, in.plan.get(0)));
        assertEquals(Arrays.asList("jab", "forma", "progress", "time", "social", "next"), all);

        in.lines = set("forma", "next");
        assertEquals(Arrays.asList("forma", "next"), kinds(NextWidgetContent.normalTicker(in, in.plan.get(0))));

        in.lines = set("jab");
        assertEquals(Collections.singletonList("jab"), kinds(NextWidgetContent.normalTicker(in, in.plan.get(0))));

        // the chosen line doesn't apply right now (no habit after this one) -> time left instead of a blank line
        in.plan = new ArrayList<>(Collections.singletonList(water()));
        in.lines = set("next");
        assertEquals(Collections.singletonList("time"), kinds(NextWidgetContent.normalTicker(in, in.plan.get(0))));
    }

    @Test
    public void allDoneTickerFollowsTheSelection() throws Exception {
        NextWidgetContent.Inputs in = normal();
        in.plan = new ArrayList<>();
        in.done = 2;
        in.allDoneLines = new JSONArray(Arrays.asList("Nudzę się."));
        in.lines = set("forma", "social");
        assertEquals(Arrays.asList("forma", "social"), kinds(NextWidgetContent.allDoneTicker(in)));
        in.lines = set("jab");
        assertEquals(Collections.singletonList("jab"), kinds(NextWidgetContent.allDoneTicker(in)));
    }

    @Test
    public void buildShowsOnlyEnabledLinesButGuardBannersStay() throws Exception {
        NextWidgetContent.Inputs in = normal();
        in.lines = set("progress");
        NextWidgetContent.Content c = NextWidgetContent.build(in);
        assertEquals(NextWidgetContent.Mode.NORMAL, c.mode);
        assertEquals("progress", c.line.kind);
        for (int taps = 0; taps < 6; taps++) {
            in.taps = taps;
            assertEquals("progress", NextWidgetContent.build(in).line.kind);
        }

        // over the social limit: the banner shows whatever lines are chosen
        in.overLimit = true;
        c = NextWidgetContent.build(in);
        assertEquals(NextWidgetContent.Mode.OVER_LIMIT, c.mode);
        assertEquals("limit", c.line.kind);
    }
}
