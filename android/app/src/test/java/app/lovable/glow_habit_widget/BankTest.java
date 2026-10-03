package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.BeforeClass;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * "Bank minut": the daily social media limit is earned. The native side
 * (DayGuard) must agree with src/lib/bank.ts - both check tests/bank-vectors.json.
 */
public class BankTest {
    private static JSONObject vectors;

    @BeforeClass
    public static void load() throws Exception {
        // Gradle runs unit tests with the module (android/app) as working dir.
        Path p = Paths.get("..", "..", "tests", "bank-vectors.json");
        vectors = new JSONObject(new String(Files.readAllBytes(p), StandardCharsets.UTF_8));
    }

    // ------------------------------------------------------------------ parity with TS

    @Test
    public void earnedAndLimitMatchTheSharedVectors() throws Exception {
        JSONArray a = vectors.getJSONArray("earned");
        assertTrue(a.length() >= 10);
        for (int i = 0; i < a.length(); i++) {
            JSONObject v = a.getJSONObject(i);
            JSONArray r = v.getJSONArray("rules");
            int earned = DayGuard.bankEarned(r.getInt(0), r.getInt(1), r.getInt(2), r.getInt(3), v.getInt("done"), v.getInt("steps"));
            assertEquals(v.toString(), v.getInt("earned"), earned);
            assertEquals(v.toString(), v.getInt("limit"), DayGuard.bankLimit(earned, v.getInt("debt")));
        }
    }

    @Test
    public void limitStateMatchesTheSharedVectors() throws Exception {
        JSONArray a = vectors.getJSONArray("state");
        for (int i = 0; i < a.length(); i++) {
            JSONObject v = a.getJSONObject(i);
            assertEquals(v.toString(), v.getInt("expected"),
                DayGuard.limitState(v.getInt("used"), v.getInt("limit"), v.getBoolean("bank")));
        }
    }

    // ------------------------------------------------------------------ from snapshot rows

    private static JSONObject build(String id, int amount, int target) throws Exception {
        return new JSONObject().put("id", id).put("kind", "build").put("amount", amount).put("target", target);
    }

    private static JSONObject steps(int amount) throws Exception {
        return build("s", amount, 8000).put("source", "steps");
    }

    private static JSONObject avoid(String status) throws Exception {
        return new JSONObject().put("id", "a").put("kind", "avoid").put("target", 1).put("status", status);
    }

    @Test
    public void earnedFromRows() throws Exception {
        JSONArray rows = new JSONArray(Arrays.asList(
            build("teeth", 2, 2), // done
            build("water", 5, 8), // not yet
            build("read", 20, 20), // done
            steps(6400), // 6 x 1000 steps, not the goal yet
            avoid("clean"))); // forbidden habits never earn
        assertEquals(2, DayGuard.doneBuilds(rows));
        assertEquals(6400, DayGuard.stepsToday(rows));
        // defaults: 5 + 2 x 10 + 6 x 5
        assertEquals(55, DayGuard.bankEarned(rows, null));
        assertEquals(55, DayGuard.bankEarned(rows, new JSONObject()));
        // custom rules from live.day.bank
        JSONObject rules = new JSONObject().put("base", 0).put("perHabit", 15).put("perKSteps", 0).put("cap", 25);
        assertEquals(25, DayGuard.bankEarned(rows, rules)); // 30 capped at 25
    }

    @Test
    public void tickingAHabitOnTheWidgetRaisesTheBankAtOnce() throws Exception {
        JSONObject water = build("water", 7, 8);
        JSONArray rows = new JSONArray(Arrays.asList(water));
        int before = DayGuard.bankLimit(DayGuard.bankEarned(rows, null), 0);
        assertEquals(5, before);
        water.put("amount", 8); // the last glass, ticked on the widget
        assertEquals(15, DayGuard.bankLimit(DayGuard.bankEarned(rows, null), 0));
        // steps habit done: counts as a habit and per 1000 steps
        rows.put(steps(8000));
        assertEquals(5 + 2 * 10 + 8 * 5, DayGuard.bankEarned(rows, null));
    }

    @Test
    public void legacyAndEmptyRows() throws Exception {
        assertEquals(0, DayGuard.doneBuilds(null));
        assertEquals(0, DayGuard.stepsToday(new JSONArray()));
        assertEquals(DayGuard.BANK_BASE, DayGuard.bankEarned(null, null));
        // v1 rows only had "done"
        JSONArray v1 = new JSONArray().put(new JSONObject().put("id", "x").put("done", true));
        assertEquals(1, DayGuard.doneBuilds(v1));
    }

    @Test
    public void lastNightsDebtEmptiesTheBank() {
        int earned = DayGuard.bankEarned(5, 10, 5, 120, 1, 0); // 15
        assertEquals(0, DayGuard.bankLimit(earned, 44)); // no floor in bank mode
        assertEquals(DayGuard.LIMIT_OVER, DayGuard.limitState(0, 0, true)); // empty = blocked until earned
        // the fixed limit keeps its old behaviour: 0 = off
        assertEquals(DayGuard.LIMIT_OK, DayGuard.limitState(0, 0));
    }

    // ------------------------------------------------------------------ texts

    @Test
    public void bankLinesFallBackToTheDayPools() throws Exception {
        JSONObject lines = new JSONObject()
            .put("dayOver", new JSONArray().put("limit"))
            .put("bankOver", new JSONArray().put("bank"))
            .put("dayBlock", new JSONArray().put("block"))
            .put("bankBlock", new JSONArray());
        assertEquals("bank", LiveGuardService.dayPool(lines, "dayOver", true).getString(0));
        assertEquals("limit", LiveGuardService.dayPool(lines, "dayOver", false).getString(0));
        // an empty bank pool (old snapshot) -> the day pool
        assertEquals("block", LiveGuardService.dayPool(lines, "dayBlock", true).getString(0));
        assertNull(LiveGuardService.dayPool(null, "dayOver", true));
        assertNull(LiveGuardService.dayPool(lines, "dayWarn", true));
    }

    @Test
    public void placeholders() {
        assertEquals("Bank 0, wydane 40 z 35, ponad 5, +10",
            LiveGuardService.fillDay("Bank {bank}, wydane {used} z {limit}, ponad {over}, +{earn}", 40, 35, 10));
        assertEquals("12 left", LiveGuardService.fillDay("{left} left", 23, 35, 10));
    }

    @Test
    public void ongoingNotificationAndBlockTexts() {
        assertArrayEquals(new String[]{"💰 Bank: 23 min social mediów", "Wydane 12 z 35 min. +10 min za każde zadanie."},
            LiveGuardService.bankGuardText(false, 12, 35, 10));
        assertArrayEquals(new String[]{"💰 Bank: 0 min of social media", "The bank's empty - Szpila is jabbing. Do a habit: +10 min."},
            LiveGuardService.bankGuardText(true, 5, 5, 10));
        assertEquals("Bank: 0 min · wydane 40 z 35 · +10 min za każde zadanie", LiveGuardService.bankSub(false, 40, 35, 10));
        assertEquals("Bank: 3 min · spent 2 of 5 · +15 min per habit", LiveGuardService.bankSub(true, 2, 5, 15));
    }

    // ------------------------------------------------------------------ the 2x1 widget

    private static NextWidgetContent.Inputs day() throws Exception {
        NextWidgetContent.Inputs in = new NextWidgetContent.Inputs();
        in.now = 12 * 60;
        in.plan = new ArrayList<>(Arrays.asList(build("w", 3, 8).put("name", "Picie wody").put("start", 740).put("end", 740)));
        in.total = 3;
        in.counted = 3;
        in.done = 1;
        return in;
    }

    private static NextWidgetContent.Line kind(List<NextWidgetContent.Line> t, String kind) {
        for (NextWidgetContent.Line l : t) if (kind.equals(l.kind)) return l;
        return null;
    }

    @Test
    public void widgetTickerShowsTheBank() throws Exception {
        NextWidgetContent.Inputs in = day();
        in.bank = true;
        NextWidgetContent.guard(in, DayGuard.DAY, 0, true, 12, 35, false, false, 0, 0, 300);
        assertFalse(in.overLimit);
        NextWidgetContent.Line social = kind(NextWidgetContent.normalTicker(in, in.plan.get(0)), "social");
        assertEquals("💰 23 min w banku", social.text);
        assertEquals(NextWidgetContent.C_NIGHT, social.color);
        in.en = true;
        assertEquals("💰 23 min in the bank", kind(NextWidgetContent.normalTicker(in, in.plan.get(0)), "social").text);
        // almost empty -> amber
        NextWidgetContent.guard(in, DayGuard.DAY, 0, true, 32, 35, false, false, 0, 0, 300);
        assertEquals(NextWidgetContent.C_AMBER, kind(NextWidgetContent.normalTicker(in, in.plan.get(0)), "social").color);
    }

    @Test
    public void emptyBankOnTheWidget() throws Exception {
        NextWidgetContent.Inputs in = day();
        in.bank = true;
        // last night took everything: 0 in the bank, nothing spent yet - still "earn it first"
        NextWidgetContent.guard(in, DayGuard.DAY, 0, true, 0, 0, false, false, 0, 0, 300);
        assertTrue(in.overLimit);
        NextWidgetContent.Content c = NextWidgetContent.build(in);
        assertEquals(NextWidgetContent.Mode.OVER_LIMIT, c.mode);
        assertEquals("💰 Bank pusty · +10 min za zadanie", c.line.text);
        assertEquals("w", c.main.optString("id")); // the next habit = the way to earn
        in.en = true;
        in.bankPerHabit = 15;
        assertEquals("💰 Bank empty · +15 min per habit", NextWidgetContent.build(in).line.text);
        // fixed mode keeps "limit 0 = off"
        in.bank = false;
        NextWidgetContent.guard(in, DayGuard.DAY, 0, true, 0, 0, false, false, 0, 0, 300);
        assertFalse(in.overLimit);
        assertNull(kind(NextWidgetContent.normalTicker(in, in.plan.get(0)), "social"));
    }
}
