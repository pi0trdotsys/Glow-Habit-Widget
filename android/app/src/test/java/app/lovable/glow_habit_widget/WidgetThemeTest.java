package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Widget palettes (WidgetTheme): lookup, "like the app" resolution, stored choices, contrast. */
public class WidgetThemeTest {
    /** The habit colours the web app sends (COLOR_HEX in src/lib/widget/bridge.ts) + AVOID_HEX. */
    private static final int[] HABIT_HEX = {
        0xFF59E0AD, 0xFFFF756F, 0xFFFDBA2F, 0xFFB180FC, 0xFF55C4FE, 0xFFFF7D9C, 0xFFA9E85E, 0xFFD2B285,
    };

    private static String read(String... path) throws Exception {
        Path p = Paths.get("", path);
        return new String(Files.readAllBytes(p), StandardCharsets.UTF_8);
    }

    private static void atLeast(String what, WidgetTheme t, int fg, int bg, double min) {
        double r = WidgetTheme.contrast(fg, bg);
        assertTrue(String.format(Locale.ROOT, "%s / %s: %.2f < %.1f", t.id, what, r, min), r >= min);
    }

    // ------------------------------------------------------------------ lookup

    @Test
    public void everyIdHasItsPaletteAndUnknownOnesGetTheOriginalLook() {
        for (String id : WidgetTheme.IDS) assertEquals(id, WidgetTheme.of(id).id);
        assertSame(WidgetTheme.DARK, WidgetTheme.of("neon"));
        assertSame(WidgetTheme.DARK, WidgetTheme.of(null));
        assertEquals(WidgetTheme.APP, WidgetTheme.CHOICES.get(0));
        assertEquals(WidgetTheme.IDS, WidgetTheme.CHOICES.subList(1, WidgetTheme.CHOICES.size()));
    }

    @Test
    public void theDarkPaletteIsExactlyTheOriginalWidgetLook() {
        WidgetTheme d = WidgetTheme.DARK;
        assertEquals(WidgetShared.ACCENT, d.accent);
        assertEquals(WidgetShared.AVOID, d.avoid);
        assertEquals(WidgetShared.TRACK, d.track);
        assertEquals(WidgetShared.TEXT, d.text);
        assertEquals(0, WidgetTheme.backgroundRes("dark")); // keeps the layout's drawable
        // NextWidgetContent / habit colours pass through untouched
        for (int c : new int[]{NextWidgetContent.C_ACCENT, NextWidgetContent.C_AMBER, NextWidgetContent.C_JAB,
            NextWidgetContent.C_LOCK, NextWidgetContent.C_MUTED, NextWidgetContent.C_NIGHT, 0xFF59E0AD}) {
            assertEquals(c, d.map(c));
            assertEquals(c, d.habit(c));
        }
    }

    @Test
    public void sameIdsAsTheAppThemes() throws Exception {
        String ts = read("..", "..", "src", "lib", "theme.ts");
        Matcher block = Pattern.compile("export const THEMES = \\[([^\\]]*)\\]").matcher(ts);
        assertTrue("THEMES not found in theme.ts", block.find());
        List<String> ids = new ArrayList<>();
        Matcher m = Pattern.compile("\"([a-z]+)\"").matcher(block.group(1));
        while (m.find()) ids.add(m.group(1));
        assertEquals(ids, WidgetTheme.IDS);
        // and the light flags agree
        for (String id : ids) {
            Matcher meta = Pattern.compile("\\n\\s*" + id + ": \\{ light: (true|false)").matcher(ts);
            assertTrue("no THEME_META for " + id, meta.find());
            assertEquals(id, Boolean.parseBoolean(meta.group(1)), WidgetTheme.of(id).light);
        }
    }

    // ------------------------------------------------------------------ stored choice + resolution

    @Test
    public void storedChoicesDecodeToAPaletteOrLikeTheApp() {
        assertEquals("app", WidgetTheme.decode(null));
        assertEquals("app", WidgetTheme.decode(""));
        assertEquals("app", WidgetTheme.decode("neon"));
        assertEquals("app", WidgetTheme.decode("app"));
        for (String id : WidgetTheme.IDS) assertEquals(id, WidgetTheme.decode(id));
    }

    @Test
    public void ownChoiceWinsOverTheApp() {
        assertEquals("glitch", WidgetTheme.resolve("glitch", "light", "light", false));
        assertEquals("sakura", WidgetTheme.resolve("sakura", "dark", "system", true));
        assertEquals("dark", WidgetTheme.resolve("dark", "terminal", "terminal", false));
    }

    @Test
    public void likeTheAppFollowsTheSnapshot() {
        assertEquals("terminal", WidgetTheme.resolve("app", "terminal", "terminal", false));
        assertEquals("ocean", WidgetTheme.resolve(null, "ocean", "ocean", true));
        assertEquals("amoled", WidgetTheme.resolve("garbage", "amoled", "amoled", true));
        // "system": the phone's night mode, live (also while the app is closed)
        assertEquals("dark", WidgetTheme.resolve("app", "light", "system", true));
        assertEquals("light", WidgetTheme.resolve("app", "dark", "system", false));
        // old snapshot (no theme) or a palette this build doesn't know: the original look
        assertEquals("dark", WidgetTheme.resolve("app", "", "", false));
        assertEquals("dark", WidgetTheme.resolve("app", null, null, false));
        assertEquals("dark", WidgetTheme.resolve("app", "neon", "neon", false));
    }

    @Test
    public void namesInBothLanguages() {
        for (String id : WidgetTheme.CHOICES) {
            String pl = WidgetTheme.name(id, false), en = WidgetTheme.name(id, true);
            assertFalse(id, pl.isEmpty());
            assertFalse(id, en.matches("(?s).*[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ].*"));
        }
        assertEquals("Jak aplikacja", WidgetTheme.name("app", false));
        assertEquals("Like the app", WidgetTheme.name("app", true));
    }

    // ------------------------------------------------------------------ colours

    @Test
    public void contrastMaths() {
        assertEquals(21.0, WidgetTheme.contrast(0xFF000000, 0xFFFFFFFF), 0.01);
        assertEquals(1.0, WidgetTheme.contrast(0xFF777777, 0xFF777777), 0.001);
        assertEquals(0xFF000000, WidgetTheme.mix(0xFFFFFFFF, true, 1));
        assertEquals(0xFF808080, WidgetTheme.mix(0xFFFFFFFF, true, 0.498));
    }

    @Test
    public void everyPaletteIsReadable() {
        for (String id : WidgetTheme.IDS) {
            WidgetTheme t = WidgetTheme.of(id);
            assertEquals(id + " light flag", t.light, WidgetTheme.luminance(t.card) > 0.5);
            atLeast("text on card", t, t.text, t.card, 7);
            atLeast("text on bg", t, t.text, t.bg, 7);
            atLeast("muted on card", t, t.muted, t.card, 4.5);
            atLeast("muted on bg", t, t.muted, t.bg, 4.5);
            atLeast("ticker", t, t.ticker, t.card, 4.5);
            atLeast("jab", t, t.jab, t.card, 4.5);
            // these are text colours too (status line, time left, banners, the SZPILA label)
            atLeast("accent", t, t.accent, t.card, 4.5);
            atLeast("avoid", t, t.avoid, t.card, 4.5);
            atLeast("amber", t, t.amber, t.card, 4.5);
            atLeast("lock", t, t.lock, t.card, 4.5);
            atLeast("night", t, t.night, t.card, 4.5);
            atLeast("title", t, t.title, t.card, 4.5);
            // the ring track is visible but quiet
            assertNotEquals(id, t.track, t.card);
            assertTrue(id + " track", WidgetTheme.contrast(t.track, t.card) < 3);
        }
    }

    @Test
    public void habitColoursStayVisibleOnEveryPalette() {
        for (String id : WidgetTheme.IDS) {
            WidgetTheme t = WidgetTheme.of(id);
            for (int hex : HABIT_HEX) {
                int c = t.habit(hex);
                atLeast("habit " + Integer.toHexString(hex), t, c, t.card, 3);
                // the icon on a done (filled) chip
                atLeast("icon on " + Integer.toHexString(c), t, t.onFill, c, 3);
                // as text (NextWidgetContent status line)
                atLeast("habit text " + Integer.toHexString(hex), t, t.map(hex), t.card, 4.5);
            }
            assertEquals(id, t.avoid, t.habit(WidgetShared.AVOID));
        }
        // terminal is monochrome phosphor, the rest keep their hue
        WidgetTheme term = WidgetTheme.of("terminal");
        assertEquals(term.accent, term.habit(0xFFB180FC));
        assertNotEquals(WidgetTheme.of("ocean").habit(0xFFB180FC), WidgetTheme.of("ocean").habit(0xFFFDBA2F));
        // light palettes darken the (dark-theme) habit colours
        WidgetTheme light = WidgetTheme.of("light");
        assertTrue(WidgetTheme.luminance(light.habit(0xFF59E0AD)) < WidgetTheme.luminance(0xFF59E0AD));
    }

    @Test
    public void semanticColoursMapToThePalette() {
        WidgetTheme g = WidgetTheme.of("glitch");
        assertEquals(0xFF14F0FF, g.map(NextWidgetContent.C_ACCENT));
        assertEquals(0xFFFF2BD6, g.map(NextWidgetContent.C_RED));
        assertEquals(g.text, g.map(NextWidgetContent.C_TEXT));
        assertEquals(g.ticker, g.map(NextWidgetContent.C_MUTED));
        assertEquals(g.jab, g.map(NextWidgetContent.C_JAB));
        WidgetTheme s = WidgetTheme.of("sakura");
        assertEquals(s.amber, s.map(NextWidgetContent.C_AMBER));
        assertEquals(s.night, s.map(NextWidgetContent.C_NIGHT));
        assertEquals(s.lock, s.map(NextWidgetContent.C_LOCK));
    }

    // ------------------------------------------------------------------ drawables

    @Test
    public void everyPaletteHasABackgroundDrawableItsTextsAreReadableOn() throws Exception {
        Pattern color = Pattern.compile("android:(?:startColor|endColor)=\"#([0-9A-Fa-f]{6})\"");
        for (String id : WidgetTheme.IDS) {
            if ("dark".equals(id)) continue;
            String xml = read("src", "main", "res", "drawable", "widget_bg_" + id + ".xml");
            WidgetTheme t = WidgetTheme.of(id);
            if (t.glitch()) {
                assertTrue(xml.contains("#FF2BD6") && xml.contains("#14F0FF") && xml.contains("#000000"));
                continue;
            }
            Matcher m = color.matcher(xml);
            int n = 0;
            while (m.find()) {
                int bg = 0xFF000000 | Integer.parseInt(m.group(1), 16);
                atLeast("text on drawable " + m.group(1), t, t.text, bg, 7);
                atLeast("muted on drawable " + m.group(1), t, t.muted, bg, 4.5);
                n++;
            }
            assertEquals(id + ": gradient start + end", 2, n);
        }
    }
}
