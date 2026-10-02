package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.pm.PackageManager;

import org.junit.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.xml.parsers.DocumentBuilderFactory;

/** The launcher icon follows the theme (AppIcon): alias names, switch plans, manifest + resources. */
public class AppIconTest {
    private static final String A = "http://schemas.android.com/apk/res/android";
    private static final String RES = "src/main/res/";

    private static String read(String... path) throws Exception {
        return new String(Files.readAllBytes(Paths.get("", path)), StandardCharsets.UTF_8);
    }

    /** Only these themes' aliases are on. */
    private static Map<String, Boolean> on(String... themes) {
        Map<String, Boolean> m = new LinkedHashMap<>();
        for (String t : AppIcon.THEMES) m.put(t, false);
        for (String t : themes) m.put(t, true);
        return m;
    }

    @Test
    public void unknownThemesGetTheOriginalIcon() {
        assertEquals("dark", AppIcon.normalize(null));
        assertEquals("dark", AppIcon.normalize("system"));
        assertEquals("dark", AppIcon.normalize("neon"));
        assertEquals("dark", AppIcon.normalize(""));
        for (String t : AppIcon.THEMES) assertEquals(t, AppIcon.normalize(t));
    }

    @Test
    public void aliasNames() {
        assertEquals("IconDark", AppIcon.aliasSimpleName("dark"));
        assertEquals("IconGlitch", AppIcon.aliasSimpleName("glitch"));
        assertEquals("IconSakura", AppIcon.aliasSimpleName("sakura"));
        assertEquals("IconDark", AppIcon.aliasSimpleName("whatever"));
        assertEquals("app.lovable.glow_habit_widget.IconTerminal", AppIcon.aliasClass("terminal"));
        assertTrue(AppIcon.enabledByDefault("dark"));
        for (String t : AppIcon.THEMES) if (!t.equals("dark")) assertFalse(AppIcon.enabledByDefault(t));
    }

    @Test
    public void componentStates() {
        assertTrue(AppIcon.isEnabled(PackageManager.COMPONENT_ENABLED_STATE_ENABLED, false));
        assertTrue(AppIcon.isEnabled(PackageManager.COMPONENT_ENABLED_STATE_DEFAULT, true));
        assertFalse(AppIcon.isEnabled(PackageManager.COMPONENT_ENABLED_STATE_DEFAULT, false));
        assertFalse(AppIcon.isEnabled(PackageManager.COMPONENT_ENABLED_STATE_DISABLED, true));
        assertFalse(AppIcon.isEnabled(PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER, true));
        assertEquals("glitch", AppIcon.active(on("glitch")));
        assertEquals("dark", AppIcon.active(on()));
        assertEquals("light", AppIcon.active(on("light", "ocean"))); // THEMES order
    }

    @Test
    public void planEnablesTheNewAliasFirstThenDisablesTheRest() {
        assertEquals("[+glitch, -dark]", AppIcon.plan("glitch", on("dark")).toString());
        assertEquals("[+sakura, -light, -terminal]", AppIcon.plan("sakura", on("light", "terminal")).toString());
        // nothing on (should not happen): just turn the wanted one on
        assertEquals("[+ocean]", AppIcon.plan("ocean", on()).toString());
        // the wanted one is on, a leftover too: only the leftover goes
        assertEquals("[-dark]", AppIcon.plan("amoled", on("dark", "amoled")).toString());
        // unknown -> back to dark
        assertEquals("[+dark, -glitch]", AppIcon.plan("neon", on("glitch")).toString());
    }

    @Test
    public void nothingToDoWhenAlreadyActive() {
        for (String t : AppIcon.THEMES) {
            assertTrue(t, AppIcon.plan(t, on(t)).isEmpty());
            assertNull(t, AppIcon.needed(t, on(t)));
        }
        assertNull(AppIcon.needed(null, on("glitch")));
        assertEquals("glitch", AppIcon.needed("glitch", on("dark")));
        assertEquals("dark", AppIcon.needed("system", on("light")));
        assertNull(AppIcon.needed("system", on("dark")));
    }

    @Test
    public void everyAppThemeHasAnAliasAndIcons() throws Exception {
        // THEMES in src/lib/theme.ts
        String ts = read("..", "..", "src", "lib", "theme.ts");
        Matcher block = Pattern.compile("export const THEMES = \\[([^\\]]*)\\]").matcher(ts);
        assertTrue("THEMES not found in theme.ts", block.find());
        List<String> ids = new ArrayList<>();
        Matcher m = Pattern.compile("\"([a-z]+)\"").matcher(block.group(1));
        while (m.find()) ids.add(m.group(1));
        assertEquals(ids, AppIcon.THEMES);

        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(true);
        Document doc = f.newDocumentBuilder().parse(new File("src/main/AndroidManifest.xml"));

        // MainActivity is no launcher entry any more
        NodeList acts = doc.getElementsByTagName("activity");
        for (int i = 0; i < acts.getLength(); i++) {
            Element a = (Element) acts.item(i);
            assertFalse(a.getAttributeNS(A, "name") + " must not be a launcher entry", isLauncher(a));
        }

        Map<String, Element> aliases = new LinkedHashMap<>();
        NodeList list = doc.getElementsByTagName("activity-alias");
        int launchers = 0;
        for (int i = 0; i < list.getLength(); i++) {
            Element a = (Element) list.item(i);
            aliases.put(a.getAttributeNS(A, "name"), a);
            if (isLauncher(a)) launchers++;
        }
        assertEquals("one launcher alias per theme", ids.size(), launchers);

        for (String t : ids) {
            String name = "." + AppIcon.aliasSimpleName(t);
            Element a = aliases.get(name);
            assertNotNull("no alias " + name, a);
            assertEquals(name, ".MainActivity", a.getAttributeNS(A, "targetActivity"));
            assertTrue(name, isLauncher(a));
            assertEquals(name, "true", a.getAttributeNS(A, "exported"));
            assertEquals(name, String.valueOf(AppIcon.enabledByDefault(t)), a.getAttributeNS(A, "enabled"));
            assertEquals(name, "@string/app_name", a.getAttributeNS(A, "label"));
            for (String attr : new String[] {"icon", "roundIcon"}) {
                String icon = a.getAttributeNS(A, attr);
                assertTrue(name + " " + attr + " = " + icon, icon.startsWith("@mipmap/"));
                String res = icon.substring("@mipmap/".length());
                // API 26+: the adaptive icon (and the drawables it uses)
                File adaptive = new File(RES + "mipmap-anydpi-v26/" + res + ".xml");
                assertTrue("missing " + adaptive, adaptive.exists());
                Matcher d = Pattern.compile("@drawable/(\\w+)").matcher(read(adaptive.getPath()));
                int layers = 0;
                while (d.find()) {
                    layers++;
                    assertTrue("missing drawable " + d.group(1),
                        new File(RES + "drawable/" + d.group(1) + ".xml").exists());
                }
                assertEquals(adaptive + " layers", 3, layers);
                // API 24-25: a non-adaptive fallback (vector in mipmap/ or the PNGs)
                assertTrue("no API 24-25 icon for " + res,
                    new File(RES + "mipmap/" + res + ".xml").exists()
                        || new File(RES + "mipmap-mdpi/" + res + ".png").exists());
            }
        }
    }

    private static boolean isLauncher(Element component) {
        NodeList filters = component.getElementsByTagName("intent-filter");
        for (int i = 0; i < filters.getLength(); i++) {
            Element f = (Element) filters.item(i);
            boolean main = false, launcher = false;
            NodeList actions = f.getElementsByTagName("action");
            for (int j = 0; j < actions.getLength(); j++)
                main |= "android.intent.action.MAIN".equals(((Element) actions.item(j)).getAttributeNS(A, "name"));
            NodeList cats = f.getElementsByTagName("category");
            for (int j = 0; j < cats.getLength(); j++)
                launcher |= "android.intent.category.LAUNCHER".equals(((Element) cats.item(j)).getAttributeNS(A, "name"));
            if (main && launcher) return true;
        }
        return false;
    }
}
