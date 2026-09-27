package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.Arrays;

/** English variants of the pure native text helpers (snapshot "lang": "en"). */
public class NativeI18nTest {

    private static JSONObject water(int amount) throws Exception {
        return new JSONObject().put("id", "w").put("name", "Water").put("kind", "build")
            .put("goal", "count").put("amount", amount).put("target", 8).put("step", 1).put("unit", "glasses")
            .put("unitForms", new JSONArray(Arrays.asList("glass", "glasses", "glasses")));
    }

    @Test
    public void whenLabelEnglish() {
        int now = 14 * 60;
        assertEquals("now", WidgetShared.whenLabel(now - 10, now, true));
        assertEquals("overdue since 13:00", WidgetShared.whenLabel(13 * 60, now, true));
        assertEquals("in 20 min", WidgetShared.whenLabel(now + 20, now, true));
        assertEquals("at 17:30", WidgetShared.whenLabel(17 * 60 + 30, now, true));
        // Polish stays as it was
        assertEquals("teraz", WidgetShared.whenLabel(now, now, false));
        assertEquals("zaległe od 13:00", WidgetShared.whenLabel(13 * 60, now, false));
        assertEquals("za 20 min", WidgetShared.whenLabel(now + 20, now, false));
        assertEquals("o 17:30", WidgetShared.whenLabel(17 * 60 + 30, now, false));
    }

    @Test
    public void timeLeftEnglish() {
        long ms = 5 * 3600_000L + 23 * 60_000L + 5_000L;
        assertEquals("5 h 23 min left today", WidgetShared.timeLeft(ms, true));
        assertEquals("5 h 23 min do końca dnia", WidgetShared.timeLeft(ms, false));
        assertEquals("42 min left today", WidgetShared.timeLeft(42 * 60_000L, true));
        assertEquals("0 min left today", WidgetShared.timeLeft(-1, true));
    }

    @Test
    public void amountAndLeftUseSnapshotUnits() throws Exception {
        assertEquals("3/8 glasses", WidgetShared.amountText(water(3)));
        assertEquals("5 glasses", WidgetShared.leftText(water(3)));
        assertEquals("1 glass", WidgetShared.leftText(water(7)));
    }

    @Test
    public void quickLabelEnglish() throws Exception {
        JSONObject read = new JSONObject().put("id", "r").put("name", "Reading books").put("kind", "build")
            .put("goal", "minutes").put("amount", 20).put("target", 30).put("step", 15);
        JSONObject teeth = new JSONObject().put("id", "t").put("name", "Brushing teeth").put("kind", "build")
            .put("goal", "check").put("target", 1);
        assertEquals("+1 glass", HabitNotifier.quickLabel(water(0), true));
        assertEquals("+10 min Reading", HabitNotifier.quickLabel(read, true));
        assertEquals("✓ Brushing", HabitNotifier.quickLabel(teeth, true));
    }

    @Test
    public void appsLineEnglish() throws Exception {
        JSONArray apps = new JSONArray()
            .put(new JSONObject().put("label", "Instagram").put("visits", 3).put("minutes", 22))
            .put(new JSONObject().put("label", "YouTube").put("visits", 1).put("minutes", 25));
        assertEquals("3× Instagram (22 min) · 1× YouTube (25 min)", NightStats.appsLine(apps, true));
        assertEquals("", NightStats.appsLine(null, true));
    }

    @Test
    public void billTextEnglish() throws Exception {
        JSONObject r = new JSONObject().put("social", 47).put("screen", 61).put("visits", 4).put("asleep", 100)
            .put("apps", new JSONArray().put(new JSONObject().put("label", "Instagram").put("visits", 3).put("minutes", 22)));
        JSONObject lines = new JSONObject().put("bad", new JSONArray().put("Phone down at {asleep}? {social} min."));
        String[] t = HabitNotifier.billText(r, lines, true);
        assertEquals("🧾 Night bill · 4× social media, 47 min", t[0]);
        assertTrue(t[1].startsWith("After midnight: 3× Instagram (22 min)"));
        assertTrue(t[1].contains("\n📱 61 min on the phone after midnight"));
        assertTrue(t[1].contains("\n🌙 Phone down around 01:40"));
        assertTrue(t[1].endsWith("Phone down at 01:40? 47 min."));
        assertFalse(t[1].contains("północy"));

        JSONObject clean = new JSONObject().put("social", 0).put("screen", 3).put("visits", 0).put("asleep", -1)
            .put("apps", new JSONArray());
        JSONObject good = new JSONObject().put("good", new JSONArray().put("Clean night."));
        String[] c = HabitNotifier.billText(clean, good, true);
        assertEquals("🧾 Night bill · clean", c[0]);
        assertTrue(c[1].startsWith("Zero social media after midnight."));
        assertFalse(c[1].contains("Phone down around"));
        assertTrue(c[1].endsWith("Clean night."));

        // The old signature stays Polish.
        assertTrue(HabitNotifier.billText(clean, good)[0].endsWith("czysto"));
    }

    @Test
    public void szpilaTitleEnglish() {
        assertEquals("SZPILA  " + HabitNotifier.EMOJI_ANGRY + "  ·  neglected and offended",
            SzpilaWidgetProvider.title("neglected", 1, true));
        assertEquals("SZPILA  " + HabitNotifier.EMOJI_IMPRESSED + "  ·  well-groomed ✨",
            SzpilaWidgetProvider.title("groomed", 2, true));
        assertEquals("SZPILA  " + HabitNotifier.EMOJI_NORMAL, SzpilaWidgetProvider.title("normal", 0, true));
        assertTrue(SzpilaWidgetProvider.title("neglected", 1, false).contains("obrażony"));
    }
}
