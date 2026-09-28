package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** The "Następne zadanie" widget's decisions (NextWidgetContent): states, texts, ticker. */
public class NextWidgetTest {
    private static final int NOON = 12 * 60;

    private static JSONObject water(int amount, int start) throws Exception {
        return new JSONObject().put("id", "w").put("name", "Picie wody").put("icon", "GlassWater")
            .put("colorHex", "#4cc3ff").put("kind", "build").put("goal", "count")
            .put("amount", amount).put("target", 8).put("step", 1).put("unit", "szklanek")
            .put("unitForms", new JSONArray(Arrays.asList("szklanka", "szklanki", "szklanek")))
            .put("units", 1).put("start", start).put("end", start)
            .put("nag", new JSONArray(Arrays.asList("Wypite {done} z {target}.", "Zostało {left}.")))
            .put("rage", new JSONArray(Arrays.asList("WODA. TERAZ.")));
    }

    private static JSONObject check(String id, String name, int start) throws Exception {
        return new JSONObject().put("id", id).put("name", name).put("kind", "build").put("goal", "check")
            .put("amount", 0).put("target", 1).put("step", 1).put("units", 1).put("start", start).put("end", start);
    }

    private static JSONObject avoid(int start) throws Exception {
        return new JSONObject().put("id", "a").put("name", "Bez alkoholu").put("kind", "avoid").put("goal", "check")
            .put("target", 1).put("status", "pending").put("start", start)
            .put("nag", new JSONArray(Arrays.asList("Sekret!")));
    }

    /** A normal day at noon: water due in 20 min, reading after it. */
    private static NextWidgetContent.Inputs day() throws Exception {
        NextWidgetContent.Inputs in = new NextWidgetContent.Inputs();
        in.now = NOON;
        in.plan = new ArrayList<>(Arrays.asList(water(3, NOON + 20), check("r", "Czytanie", 18 * 60)));
        in.total = 11;
        in.counted = 11;
        in.done = 5;
        in.formaCurrent = 5;
        in.formaBest = 9;
        return in;
    }

    private static List<String> kinds(List<NextWidgetContent.Line> lines) {
        List<String> out = new ArrayList<>();
        for (NextWidgetContent.Line l : lines) out.add(l.kind);
        return out;
    }

    // ------------------------------------------------------------------ states

    @Test
    public void normalState() throws Exception {
        NextWidgetContent.Content c = NextWidgetContent.build(day());
        assertEquals(NextWidgetContent.Mode.NORMAL, c.mode);
        assertEquals("w", c.main.optString("id"));
        assertEquals("Picie wody", c.name);
        assertEquals("3/8 szklanek · za 20 min", c.status);
        assertEquals(NextWidgetContent.C_ACCENT, c.statusColor);
        assertEquals(0xFF4CC3FF, c.ringColor);
        assertEquals(3f / 8f, c.ringFraction, 1e-6);
        assertNotNull(c.line);
        assertEquals(NextWidgetContent.SMUG, c.mood);
    }

    @Test
    public void overdueIsRedAndUrgentFirst() throws Exception {
        NextWidgetContent.Inputs in = day();
        in.plan.set(0, water(3, NOON - 40));
        NextWidgetContent.Content c = NextWidgetContent.build(in);
        assertEquals("⏰ 40 min · 3/8 szklanek", c.status);
        assertEquals(NextWidgetContent.C_RED, c.statusColor);
        // due within the last half hour: "teraz", amber
        in.plan.set(0, water(3, NOON - 10));
        c = NextWidgetContent.build(in);
        assertEquals("teraz · 3/8 szklanek", c.status);
        assertEquals(NextWidgetContent.C_AMBER, c.statusColor);
        // an hour late: the cat gets angry
        in.plan.set(0, water(3, NOON - 80));
        c = NextWidgetContent.build(in);
        assertEquals("⏰ 1 h · 3/8 szklanek", c.status);
        assertEquals(NextWidgetContent.ANGRY, c.mood);
        // single check without an amount
        assertEquals("⏰ 2 h", NextWidgetContent.wideStatus(check("t", "Zęby", 600), 600, NOON, false));
        assertEquals("⏰ 2 h", NextWidgetContent.wideStatus(check("t", "Teeth", 600), 600, NOON, true));
        // 1 h 40 min rounds to 2 h; under an hour stays in minutes
        assertEquals("⏰ 2 h", NextWidgetContent.whenShort(NOON - 100, NOON, false));
        assertEquals("⏰ 59 min", NextWidgetContent.whenShort(NOON - 59, NOON, false));
        assertEquals("teraz", NextWidgetContent.whenShort(NOON, NOON, false));
    }

    @Test
    public void priorityOrder() throws Exception {
        NextWidgetContent.Inputs in = day();
        in.plan.clear(); // would be "all done"
        in.morningLock = true;
        in.morningPending = new ArrayList<>(Arrays.asList(check("t", "Mycie zębów", 420), water(0, 450)));
        in.overLimit = true;
        in.usedMin = 70;
        in.limitMin = 60;
        in.bedtimeLeft = 25;
        in.night = true;
        assertEquals(NextWidgetContent.Mode.MORNING_LOCK, NextWidgetContent.mode(in));
        in.morningLock = false;
        assertEquals(NextWidgetContent.Mode.OVER_LIMIT, NextWidgetContent.mode(in));
        in.overLimit = false;
        assertEquals(NextWidgetContent.Mode.BEDTIME, NextWidgetContent.mode(in));
        in.bedtimeLeft = -1;
        assertEquals(NextWidgetContent.Mode.NIGHT, NextWidgetContent.mode(in));
        in.night = false;
        assertEquals(NextWidgetContent.Mode.ALL_DONE, NextWidgetContent.mode(in));
        in.plan.add(water(3, NOON));
        assertEquals(NextWidgetContent.Mode.NORMAL, NextWidgetContent.mode(in));
        in.plan.clear();
        in.total = 0;
        assertEquals(NextWidgetContent.Mode.EMPTY, NextWidgetContent.mode(in));
    }

    @Test
    public void morningLock() throws Exception {
        NextWidgetContent.Inputs in = day();
        in.now = 7 * 60;
        in.morningPending = new ArrayList<>(Arrays.asList(check("t", "Mycie zębów", 420), water(0, 450)));
        NextWidgetContent.guard(in, DayGuard.MORNING, 2, true, 80, 60, true, true, 23 * 60, 0, 300);
        assertTrue(in.morningLock);
        assertFalse(in.overLimit); // the limit only counts in the DAY phase
        NextWidgetContent.Content c = NextWidgetContent.build(in);
        assertEquals(NextWidgetContent.Mode.MORNING_LOCK, c.mode);
        assertEquals("t", c.main.optString("id")); // the first pending morning habit, not the planner's pick
        assertEquals("Mycie zębów", c.name);
        assertEquals("🔒 Najpierw: Mycie zębów, Picie wody", c.line.text);
        assertEquals(NextWidgetContent.C_LOCK, c.line.color);
        assertTrue(c.ticker.isEmpty());
        assertEquals(NextWidgetContent.ANGRY, c.mood);
        in.en = true;
        assertEquals("🔒 First: Mycie zębów, Picie wody", NextWidgetContent.build(in).line.text);
    }

    @Test
    public void overLimit() throws Exception {
        NextWidgetContent.Inputs in = day();
        NextWidgetContent.guard(in, DayGuard.DAY, 0, true, 70, 60, true, true, 23 * 60, 0, 300);
        assertTrue(in.overLimit);
        NextWidgetContent.Content c = NextWidgetContent.build(in);
        assertEquals(NextWidgetContent.Mode.OVER_LIMIT, c.mode);
        assertEquals("📱 70/60 min · limit przekroczony", c.line.text);
        assertEquals(NextWidgetContent.C_RED, c.line.color);
        assertEquals("w", c.main.optString("id"));
        in.en = true;
        assertEquals("📱 70/60 min · limit exceeded", NextWidgetContent.build(in).line.text);
        // under the limit, or limit off: normal
        NextWidgetContent.guard(in, DayGuard.DAY, 0, true, 42, 60, false, false, 0, 0, 300);
        assertFalse(in.overLimit);
        NextWidgetContent.guard(in, DayGuard.DAY, 0, false, 99, 60, false, false, 0, 0, 300);
        assertFalse(in.overLimit);
    }

    @Test
    public void bedtimeAndNight() throws Exception {
        NextWidgetContent.Inputs in = day();
        in.now = 23 * 60 + 35;
        NextWidgetContent.guard(in, DayGuard.NIGHT, 0, false, 0, 60, true, true, 23 * 60 + 30, 0, 300);
        assertEquals(25, in.bedtimeLeft);
        assertFalse(in.night);
        NextWidgetContent.Content c = NextWidgetContent.build(in);
        assertEquals(NextWidgetContent.Mode.BEDTIME, c.mode);
        assertEquals("🌙 Za 25 min 00:00 · odkładaj telefon", c.line.text);
        in.en = true;
        assertEquals("🌙 00:00 in 25 min · phone down", NextWidgetContent.build(in).line.text);

        // after the deadline: the night guard
        in.en = false;
        in.now = 30;
        NextWidgetContent.guard(in, DayGuard.NIGHT, 0, false, 0, 60, true, true, 23 * 60 + 30, 0, 300);
        assertEquals(-1, in.bedtimeLeft);
        assertTrue(in.night);
        c = NextWidgetContent.build(in);
        assertEquals(NextWidgetContent.Mode.NIGHT, c.mode);
        assertNull(c.main); // no hold at night, the ring opens the app
        assertEquals("Moon", c.icon);
        assertEquals("🌙 Szpila czuwa · śpij", c.line.text);
        assertEquals("bez telefonu do 05:00", c.status);
        in.en = true;
        assertEquals("🌙 Szpila's on guard · sleep", NextWidgetContent.build(in).line.text);

        // bedtime off -> no countdown even inside the window
        in.now = 23 * 60 + 35;
        NextWidgetContent.guard(in, DayGuard.OFF, 0, false, 0, 60, true, false, 0, 0, 300);
        assertEquals(-1, in.bedtimeLeft);
        assertFalse(in.night);
    }

    @Test
    public void allDone() throws Exception {
        NextWidgetContent.Inputs in = day();
        in.plan.clear();
        in.done = 11;
        in.allDoneLines = new JSONArray(Arrays.asList("Nudzę się.", "No dobra."));
        NextWidgetContent.Content c = NextWidgetContent.build(in);
        assertEquals(NextWidgetContent.Mode.ALL_DONE, c.mode);
        assertNull(c.main);
        assertEquals("Trophy", c.icon);
        assertEquals(1f, c.ringFraction, 1e-6);
        assertEquals("Komplet 🎉", c.name);
        assertEquals("🔥 Forma: 5 dni", c.status);
        assertEquals(NextWidgetContent.IMPRESSED, c.mood);
        assertEquals("Komplet!", c.smallName); // 1x1 keeps its text
        assertEquals("wszystko zrobione", c.smallSub);
        assertEquals(Arrays.asList("jab", "forma", "time"), kinds(c.ticker));
        in.formaCurrent = 0;
        assertEquals("11/11 na dziś", NextWidgetContent.build(in).status);
        in.en = true;
        in.formaCurrent = 1;
        assertEquals("🔥 1-day streak", NextWidgetContent.build(in).status);
        assertEquals("All done 🎉", NextWidgetContent.build(in).name);
    }

    @Test
    public void neglectedCatStaysAngry() throws Exception {
        NextWidgetContent.Inputs in = day();
        in.plan.clear();
        in.cond = "neglected";
        assertEquals(NextWidgetContent.ANGRY, NextWidgetContent.build(in).mood);
        in.cond = "groomed";
        in.plan.add(water(3, NOON + 20));
        in.done = 1;
        assertEquals(NextWidgetContent.IMPRESSED, NextWidgetContent.build(in).mood); // smug -> pleased
    }

    // ------------------------------------------------------------------ ticker

    @Test
    public void tickerHasOnlyApplicableLines() throws Exception {
        NextWidgetContent.Inputs in = day();
        List<NextWidgetContent.Line> t = NextWidgetContent.normalTicker(in, in.plan.get(0));
        assertEquals(Arrays.asList("jab", "forma", "progress", "time", "next"), kinds(t));
        assertEquals("🔥 Forma: 5 dni (rekord 9)", t.get(1).text);
        assertEquals("Dziś 5/11 · 45%", t.get(2).text);
        assertEquals("⏳ 12 h do końca dnia", t.get(3).text);
        assertEquals("Potem: Czytanie 18:00", t.get(4).text);

        // daily limit on -> the social line; one habit left -> no "Potem"; no streak -> no forma
        in.dayLimitOn = true;
        in.usedMin = 42;
        in.limitMin = 60;
        in.plan.remove(1);
        in.formaCurrent = 0;
        t = NextWidgetContent.normalTicker(in, in.plan.get(0));
        assertEquals(Arrays.asList("jab", "progress", "time", "social"), kinds(t));
        assertEquals("📱 42/60 min social mediów", t.get(3).text);

        // forbidden habit: never a jab on the home screen
        in.plan.set(0, avoid(NOON + 10));
        t = NextWidgetContent.normalTicker(in, in.plan.get(0));
        assertFalse(kinds(t).contains("jab"));
        for (NextWidgetContent.Line l : t) assertFalse(l.text.contains("Sekret"));
    }

    @Test
    public void tickerRotatesThroughEveryLine() throws Exception {
        NextWidgetContent.Inputs in = day();
        int n = NextWidgetContent.normalTicker(in, in.plan.get(0)).size();
        Set<String> seen = new HashSet<>();
        for (int taps = 0; taps < n; taps++) {
            in.taps = taps;
            seen.add(NextWidgetContent.build(in).line.kind);
        }
        assertEquals(new HashSet<>(Arrays.asList("jab", "forma", "progress", "time", "next")), seen);
        // a tap always moves on
        in.taps = 0;
        String a = NextWidgetContent.build(in).line.kind;
        in.taps = 1;
        assertFalse(a.equals(NextWidgetContent.build(in).line.kind));
        // and so does time (a new slot every SLOT_MIN minutes)
        assertEquals((NextWidgetContent.tickerIndex(NOON, 1, 5) + 1) % 5,
            NextWidgetContent.tickerIndex(NOON + NextWidgetContent.SLOT_MIN, 1, 5));
        assertEquals(NextWidgetContent.tickerIndex(NOON, 1, 5), NextWidgetContent.tickerIndex(NOON + 1, 1, 5));
        assertEquals(0, NextWidgetContent.tickerIndex(NOON, 0, 0));
    }

    @Test
    public void jabChangesEachRoundAndFillsPlaceholders() throws Exception {
        JSONObject w = water(3, NOON + 20);
        assertEquals("Wypite 3 z 8.", NextWidgetContent.jab(w, NOON, 0));
        assertEquals("Zostało 5 szklanek.", NextWidgetContent.jab(w, NOON, 1));
        // 3 h late: rage
        assertEquals("WODA. TERAZ.", NextWidgetContent.jab(water(3, NOON - 200), NOON, 0));
        assertEquals("", NextWidgetContent.jab(check("r", "Czytanie", NOON), NOON, 0));
        assertEquals("", NextWidgetContent.jab(null, NOON, 0));
        // the jab slot shows different lines on consecutive rounds
        NextWidgetContent.Inputs in = day();
        int n = NextWidgetContent.normalTicker(in, in.plan.get(0)).size();
        Set<String> jabs = new HashSet<>();
        for (int round = 0; round < 2; round++) {
            for (int taps = 0; taps < n; taps++) {
                in.taps = round * n + taps;
                NextWidgetContent.Line l = NextWidgetContent.build(in).line;
                if ("jab".equals(l.kind)) jabs.add(l.text);
            }
        }
        assertEquals(2, jabs.size());
    }

    // ------------------------------------------------------------------ English + texts

    @Test
    public void englishTexts() throws Exception {
        NextWidgetContent.Inputs in = day();
        in.en = true;
        in.dayLimitOn = true;
        in.usedMin = 42;
        in.limitMin = 60;
        NextWidgetContent.Content c = NextWidgetContent.build(in);
        assertEquals("3/8 szklanek · in 20 min", c.status);
        List<NextWidgetContent.Line> t = c.ticker;
        assertEquals("🔥 5-day streak (best 9)", t.get(1).text);
        assertEquals("Today 5/11 · 45%", t.get(2).text);
        assertEquals("⏳ 12 h left today", t.get(3).text);
        assertEquals("📱 42/60 min social media", t.get(4).text);
        assertEquals("Next: Czytanie 18:00", t.get(5).text);
        assertEquals("40 min late", NextWidgetContent.when(NOON - 40, NOON, true));
        assertEquals("at 17:30", NextWidgetContent.when(17 * 60 + 30, NOON, true));
    }

    @Test
    public void smallTexts() {
        assertEquals("25 min", NextWidgetContent.span(25));
        assertEquals("1 h", NextWidgetContent.span(60));
        assertEquals("1 h 5 min", NextWidgetContent.span(65));
        assertEquals("⏳ 42 min do końca dnia", NextWidgetContent.timeLeft(24 * 60 - 42, false));
        assertEquals("🔥 Forma: 1 dzień", NextWidgetContent.forma(1, 1, false));
        assertEquals("🔥 Forma: 3 dni (rekord 4)", NextWidgetContent.forma(3, 4, false));
        assertEquals(45, NextWidgetContent.percent(5, 11));
        assertEquals(0, NextWidgetContent.percent(0, 0));
    }

    // ------------------------------------------------------------------ 1x1

    @Test
    public void smallLayoutKeepsOldTexts() throws Exception {
        NextWidgetContent.Inputs in = day();
        NextWidgetContent.Content c = NextWidgetContent.build(in);
        assertNull(c.smallName);
        assertEquals("Picie wody", c.name);
        assertEquals("3/8 szklanek", c.smallSub); // the amount, as before
        assertEquals(NextWidgetContent.C_ACCENT, c.smallSubColor);

        in.plan.set(0, check("t", "Mycie zębów", NOON + 20));
        c = NextWidgetContent.build(in);
        assertEquals("za 20 min", c.smallSub);
        in.plan.set(0, check("t", "Mycie zębów", NOON - 60));
        c = NextWidgetContent.build(in);
        assertEquals("zaległe od 11:00", c.smallSub);
        assertEquals(NextWidgetContent.C_RED, c.smallSubColor);

        in.plan.set(0, avoid(21 * 60));
        c = NextWidgetContent.build(in);
        assertEquals("potwierdź · o 21:00", c.smallSub);
        assertEquals(NextWidgetContent.C_RED, c.smallSubColor);
        assertTrue(c.ringDashed);
        in.en = true;
        assertEquals("confirm · at 21:00", NextWidgetContent.build(in).smallSub);

        // no habits at all
        in.plan.clear();
        in.total = 0;
        c = NextWidgetContent.build(in);
        assertEquals(NextWidgetContent.Mode.EMPTY, c.mode);
        assertEquals("add habits", c.smallSub);
        assertEquals("Sparkles", c.icon);
    }

    @Test
    public void colorParsing() throws Exception {
        assertEquals(0xFF4CC3FF, NextWidgetContent.colorOf(new JSONObject().put("colorHex", "#4cc3ff")));
        assertEquals(0xFF59E0AD, NextWidgetContent.colorOf(new JSONObject()));
        assertEquals(NextWidgetContent.C_ACCENT, NextWidgetContent.colorOf(new JSONObject().put("colorHex", "mint")));
    }
}
