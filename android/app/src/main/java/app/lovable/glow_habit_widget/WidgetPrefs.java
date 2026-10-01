package app.lovable.glow_habit_widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Per-widget settings chosen in WidgetConfigActivity (when a widget is placed or
 * reconfigured), keyed by appWidgetId in SharedPreferences "loop_widget_prefs":
 *
 *  - "op_<id>"    background opacity 0..100 in steps of 10 (default 100 = the
 *                 original look; the config screen shows it as transparency = 100 - opacity)
 *  - "lines_<id>" the ticker lines of the "Następne zadanie" widget, comma separated
 *                 NextWidgetContent.Line kinds (missing = all of them)
 *  - "theme_<id>" the widget palette (WidgetTheme ids) or "app" = like the app (the default)
 *
 * The pure helpers (clamping, alpha, encode / decode, filtering) have no Android
 * dependency - see WidgetPrefsTest.
 */
final class WidgetPrefs {
    static final String FILE = "loop_widget_prefs";
    static final int DEFAULT_OPACITY = 100;
    static final int STEP = 10;
    /** Below this opacity the texts lean on their shadow (the layouts carry a subtle one). */
    static final int LOW_OPACITY = 40;

    /** Ticker line kinds (NextWidgetContent.Line.kind) in the order the config screen lists them. */
    static final String JAB = "jab", FORMA = "forma", PROGRESS = "progress", TIME = "time",
        SOCIAL = "social", NEXT = "next";
    static final List<String> LINES = Collections.unmodifiableList(
        Arrays.asList(JAB, FORMA, PROGRESS, TIME, SOCIAL, NEXT));

    private WidgetPrefs() {}

    // ------------------------------------------------------------------ pure helpers

    /** 0..100, snapped to the nearest step of 10. */
    static int clampOpacity(int v) {
        int c = Math.max(0, Math.min(100, v));
        return Math.round(c / (float) STEP) * STEP;
    }

    /** ImageView alpha 0..255 for an opacity 0..100. */
    static int alpha(int opacity) {
        return Math.round(clampOpacity(opacity) * 255f / 100f);
    }

    static boolean known(String kind) {
        return LINES.contains(kind);
    }

    /** All ticker lines on. */
    static Set<String> allLines() {
        return new LinkedHashSet<>(LINES);
    }

    /** Known ids only, in LINES order; an empty or unknown-only set means "all" (never zero lines). */
    static Set<String> normalize(Set<String> lines) {
        Set<String> out = new LinkedHashSet<>();
        if (lines != null) {
            for (String k : LINES) if (lines.contains(k)) out.add(k);
        }
        return out.isEmpty() ? allLines() : out;
    }

    static String encodeLines(Set<String> lines) {
        StringBuilder sb = new StringBuilder();
        for (String k : normalize(lines)) {
            if (sb.length() > 0) sb.append(',');
            sb.append(k);
        }
        return sb.toString();
    }

    /** null / "" / garbage = all lines on; unknown ids are ignored. */
    static Set<String> decodeLines(String s) {
        Set<String> raw = new LinkedHashSet<>();
        if (s != null) {
            for (String part : s.split(",")) raw.add(part.trim());
        }
        return normalize(raw);
    }

    /** Is a ticker line of this kind shown? null = every line; kinds the settings don't know stay on. */
    static boolean lineOn(Set<String> enabled, String kind) {
        return enabled == null || !known(kind) || enabled.contains(kind);
    }

    /** The lines whose kind is enabled (order kept). */
    static List<NextWidgetContent.Line> filter(List<NextWidgetContent.Line> lines, Set<String> enabled) {
        List<NextWidgetContent.Line> out = new ArrayList<>();
        for (NextWidgetContent.Line l : lines) if (lineOn(enabled, l.kind)) out.add(l);
        return out;
    }

    /**
     * The ticker never goes blank: when the enabled lines don't apply right now
     * (e.g. only "next" on and nothing after this habit), fall back to the
     * time-left line of `all` (always there), else its first line.
     */
    static List<NextWidgetContent.Line> atLeastOne(List<NextWidgetContent.Line> kept,
                                                   List<NextWidgetContent.Line> all) {
        if (!kept.isEmpty() || all.isEmpty()) return kept;
        List<NextWidgetContent.Line> out = new ArrayList<>();
        for (NextWidgetContent.Line l : all) {
            if (TIME.equals(l.kind)) {
                out.add(l);
                return out;
            }
        }
        out.add(all.get(0));
        return out;
    }

    // ------------------------------------------------------------------ storage

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static int opacity(Context c, int widgetId) {
        return clampOpacity(prefs(c).getInt("op_" + widgetId, DEFAULT_OPACITY));
    }

    /** The widget palette choice: a WidgetTheme id or WidgetTheme.APP (default). */
    static String theme(Context c, int widgetId) {
        return WidgetTheme.decode(prefs(c).getString("theme_" + widgetId, null));
    }

    static Set<String> lines(Context c, int widgetId) {
        return decodeLines(prefs(c).getString("lines_" + widgetId, null));
    }

    static void save(Context c, int widgetId, int opacity, Set<String> lines) {
        save(c, widgetId, opacity, lines, null);
    }

    /** `theme` null = leave the palette choice as it is. */
    static void save(Context c, int widgetId, int opacity, Set<String> lines, String theme) {
        SharedPreferences.Editor e = prefs(c).edit().putInt("op_" + widgetId, clampOpacity(opacity));
        if (lines != null) e.putString("lines_" + widgetId, encodeLines(lines));
        if (theme != null) e.putString("theme_" + widgetId, WidgetTheme.decode(theme));
        e.apply();
    }

    /** A widget was removed: forget its settings. */
    static void delete(Context c, int[] widgetIds) {
        if (widgetIds == null) return;
        SharedPreferences.Editor e = prefs(c).edit();
        for (int id : widgetIds) e.remove("op_" + id).remove("lines_" + id).remove("theme_" + id);
        e.apply();
    }

    // ------------------------------------------------------------------ RemoteViews

    /**
     * Every widget layout draws its background in an ImageView (R.id.widget_bg_image)
     * behind the content, so the opacity is just that image's alpha.
     */
    static void applyOpacity(RemoteViews rv, int opacity) {
        rv.setInt(R.id.widget_bg_image, "setImageAlpha", alpha(opacity));
    }
}
