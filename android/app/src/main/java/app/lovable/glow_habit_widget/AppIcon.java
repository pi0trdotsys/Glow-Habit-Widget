package app.lovable.glow_habit_widget;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The launcher icon follows the app theme. Every theme has an {@code <activity-alias>}
 * (".IconDark", ".IconLight", ... -> MainActivity, AndroidManifest.xml) with its own icon
 * (the ic_launcher_&lt;theme&gt; mipmaps from scripts/gen-launcher-icons.ts); exactly one is
 * enabled. ".IconDark" (the original ic_launcher icon) is the manifest default.
 *
 * Launchers (and MIUI / HyperOS) may kill or refresh the app when launcher components
 * change, so the web app only stores a pending theme ({@link #setPending}, plugin
 * setAppIcon) and MainActivity applies it once the app is no longer in front (onStop) or on
 * the next start.
 *
 * The decisions are pure Java (AppIconTest); only {@link #apply} and the prefs touch Android.
 */
final class AppIcon {
    /** Theme ids = WidgetTheme.IDS = THEMES in src/lib/theme.ts. */
    static final List<String> THEMES = WidgetTheme.IDS;
    static final String DEFAULT = "dark";

    private static final String PREFS = "app_icon";
    private static final String KEY_PENDING = "pending";
    /** Where the alias classes live (the manifest namespace, not the applicationId). */
    private static final String NS = AppIcon.class.getPackage() != null
        ? AppIcon.class.getPackage().getName() : "app.lovable.glow_habit_widget";

    private AppIcon() {
    }

    // ------------------------------------------------------------------ pure logic

    /** A theme id this build has an icon for; anything else (null, "system", newer ids) = dark. */
    static String normalize(String theme) {
        return theme != null && THEMES.contains(theme) ? theme : DEFAULT;
    }

    /** "glitch" -> "IconGlitch" (unknown -> "IconDark"). */
    static String aliasSimpleName(String theme) {
        String t = normalize(theme);
        return "Icon" + t.substring(0, 1).toUpperCase(Locale.ROOT) + t.substring(1);
    }

    /** Fully qualified alias class, e.g. "app.lovable.glow_habit_widget.IconGlitch". */
    static String aliasClass(String theme) {
        return NS + "." + aliasSimpleName(theme);
    }

    /** Whether the manifest enables the alias (only the dark one). */
    static boolean enabledByDefault(String theme) {
        return DEFAULT.equals(theme);
    }

    /** PackageManager's component setting -> enabled, with DEFAULT meaning the manifest value. */
    static boolean isEnabled(int setting, boolean manifestDefault) {
        if (setting == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return true;
        if (setting == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return manifestDefault;
        return false; // DISABLED, DISABLED_USER, DISABLED_UNTIL_USED
    }

    /** The theme whose alias is on (the first one, in THEMES order); none on = dark. */
    static String active(Map<String, Boolean> enabled) {
        for (String t : THEMES) if (Boolean.TRUE.equals(enabled.get(t))) return t;
        return DEFAULT;
    }

    /** One component change: the alias of {@code theme} goes on or off. */
    static final class Change {
        final String theme;
        final boolean enable;

        Change(String theme, boolean enable) {
            this.theme = theme;
            this.enable = enable;
        }

        @Override
        public String toString() {
            return (enable ? "+" : "-") + theme;
        }
    }

    /**
     * What to change so only {@code target}'s alias is on, given which are on now: the new
     * alias is enabled FIRST (so the app never has zero launcher entries), then every other
     * enabled one is disabled. Empty when it is already the only active one.
     */
    static List<Change> plan(String target, Map<String, Boolean> enabled) {
        String t = normalize(target);
        List<Change> out = new ArrayList<>();
        if (!Boolean.TRUE.equals(enabled.get(t))) out.add(new Change(t, true));
        for (String other : THEMES) {
            if (!other.equals(t) && Boolean.TRUE.equals(enabled.get(other))) out.add(new Change(other, false));
        }
        return Collections.unmodifiableList(out);
    }

    /** The pending theme that still has to be applied (null = nothing to do). */
    static String needed(String pending, Map<String, Boolean> enabled) {
        if (pending == null) return null;
        return plan(pending, enabled).isEmpty() ? null : normalize(pending);
    }

    // ------------------------------------------------------------------ Android

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Remember the icon to switch to once the app leaves the screen (plugin setAppIcon). */
    static void setPending(Context c, String theme) {
        prefs(c).edit().putString(KEY_PENDING, normalize(theme)).apply();
    }

    static String pending(Context c) {
        return prefs(c).getString(KEY_PENDING, null);
    }

    /** Which alias is on now, per theme. */
    static Map<String, Boolean> enabledNow(Context c) {
        PackageManager pm = c.getPackageManager();
        Map<String, Boolean> out = new LinkedHashMap<>();
        for (String t : THEMES) {
            int s;
            try {
                s = pm.getComponentEnabledSetting(new ComponentName(c.getPackageName(), aliasClass(t)));
            } catch (Exception e) {
                s = PackageManager.COMPONENT_ENABLED_STATE_DEFAULT;
            }
            out.put(t, isEnabled(s, enabledByDefault(t)));
        }
        return out;
    }

    static String active(Context c) {
        return active(enabledNow(c));
    }

    /**
     * Switch the launcher icon to {@code theme} (no-op when it already is). Returns whether
     * anything changed. Widgets / notifications are rebuilt afterwards, because their "open
     * the app" PendingIntents point at the launcher alias that was on when they were made.
     */
    static boolean apply(Context c, String theme) {
        List<Change> changes = plan(theme, enabledNow(c));
        if (changes.isEmpty()) return false;
        PackageManager pm = c.getPackageManager();
        try {
            for (Change ch : changes) {
                pm.setComponentEnabledSetting(
                    new ComponentName(c.getPackageName(), aliasClass(ch.theme)),
                    ch.enable ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                        : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP);
            }
        } catch (Exception e) {
            return false;
        }
        try {
            WidgetShared.updateAll(c);
        } catch (Exception ignored) {
        }
        return true;
    }

    /** Apply the stored pending icon if it differs from the active one (MainActivity). */
    static synchronized void applyPending(Context c) {
        String want = needed(pending(c), enabledNow(c));
        if (want != null) apply(c, want);
    }
}
