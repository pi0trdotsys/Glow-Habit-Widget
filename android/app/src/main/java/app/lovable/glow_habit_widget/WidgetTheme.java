package app.lovable.glow_habit_widget;

import android.content.Context;
import android.content.res.Configuration;
import android.widget.RemoteViews;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Widget palettes - the native twin of the app themes (src/lib/theme.ts + styles.css).
 * Each widget has its own choice (WidgetPrefs "theme_<id>", picked in WidgetConfigActivity);
 * the default {@link #APP} follows the app: the snapshot carries the app's resolved theme
 * ("theme"), its preference ("themePref") and light flag - "system" is resolved here from the
 * phone's night mode, so the widget follows the phone even while the app is closed.
 *
 * The palette data and every decision are pure Java (WidgetThemeTest); only
 * {@link #background} / {@link #forWidget} touch Android.
 */
final class WidgetTheme {
    /** "Like the app" - the default for every widget. */
    static final String APP = "app";
    /** Palette ids in the config screen's order (the same ids as the app themes). */
    static final List<String> IDS = Collections.unmodifiableList(Arrays.asList(
        "dark", "light", "amoled", "glitch", "terminal", "ocean", "sunset", "sakura"));
    /** What the config screen offers: like the app, then every palette. */
    static final List<String> CHOICES = Collections.unmodifiableList(Arrays.asList(
        APP, "dark", "light", "amoled", "glitch", "terminal", "ocean", "sunset", "sakura"));

    final String id;
    final boolean light;
    /** Widget fill (what texts sit on) and the darker / lighter end of its gradient. */
    final int card, bg;
    final int text, muted, ticker, jab;
    final int accent, avoid, amber, lock, night;
    /** Ring track and the icon colour on a filled (done) chip. */
    final int track, onFill;
    /** "SZPILA" label of the 4x1 widget. */
    final int title;
    /** Terminal: habit colours turn into the phosphor accent (avoid stays red). */
    final boolean mono;

    private WidgetTheme(String id, boolean light, int card, int bg, int text, int muted, int ticker, int jab,
                        int accent, int avoid, int amber, int lock, int night, int track, int onFill,
                        int title, boolean mono) {
        this.id = id;
        this.light = light;
        this.card = card;
        this.bg = bg;
        this.text = text;
        this.muted = muted;
        this.ticker = ticker;
        this.jab = jab;
        this.accent = accent;
        this.avoid = avoid;
        this.amber = amber;
        this.lock = lock;
        this.night = night;
        this.track = track;
        this.onFill = onFill;
        this.title = title;
        this.mono = mono;
    }

    /** The original widget look: exactly the colours the layouts / NextWidgetContent always had. */
    static final WidgetTheme DARK = new WidgetTheme("dark", false,
        0xFF16181F, 0xFF0E1015, WidgetShared.TEXT, 0xFF9398A5, 0xFFA9AFBF, 0xFFD5D8E2,
        WidgetShared.ACCENT, WidgetShared.AVOID, 0xFFFFB547, 0xFFB69CFF, 0xFF8EA2FF,
        WidgetShared.TRACK, 0xFF0F1116, WidgetShared.AVOID, false);

    private static final WidgetTheme[] ALL = {
        DARK,
        new WidgetTheme("light", true,
            0xFFFFFFFF, 0xFFF1F2F6, 0xFF171A24, 0xFF4E525E, 0xFF4E525E, 0xFF2A2E3A,
            0xFF007E57, 0xFFD70E3A, 0xFF9A5800, 0xFF6A4BC4, 0xFF3F51B5,
            0xFFE3E5EA, 0xFFFFFFFF, 0xFFD70E3A, false),
        new WidgetTheme("amoled", false,
            0xFF000000, 0xFF000000, 0xFFF4F5F9, 0xFF9EA3AF, 0xFFB3B7C1, 0xFFD5D8E2,
            WidgetShared.ACCENT, 0xFFFF4A63, 0xFFFFB547, 0xFFB69CFF, 0xFF8EA2FF,
            0xFF1E2026, 0xFF000000, 0xFFFF4A63, false),
        new WidgetTheme("glitch", false,
            0xFF000000, 0xFF000000, 0xFFFFFFFF, 0xFFC8C8D2, 0xFFC8C8D2, 0xFFEDEDF2,
            0xFF14F0FF, 0xFFFF2BD6, 0xFFFFE14D, 0xFFC27DFF, 0xFF8AF8FF,
            0xFF1E1E28, 0xFF000000, 0xFFFF2BD6, false),
        new WidgetTheme("terminal", false,
            0xFF051609, 0xFF020A03, 0xFF7CFF85, 0xFF74C878, 0xFF74C878, 0xFF9DFFA3,
            0xFF62F870, 0xFFFF7350, 0xFFFFBD34, 0xFFC4A4FE, 0xFF54E2E9,
            0xFF123A1A, 0xFF051609, 0xFF62F870, true),
        new WidgetTheme("ocean", false,
            0xFF092334, 0xFF021624, 0xFFEEF7FA, 0xFFA7C3CF, 0xFFA7C3CF, 0xFFD3E4EA,
            0xFF51DFDF, 0xFFFF6972, 0xFFFAC547, 0xFFB296FF, 0xFF8EB4FF,
            0xFF1A3A4F, 0xFF06202F, 0xFFFF6972, false),
        new WidgetTheme("sunset", false,
            0xFF2E172C, 0xFF1F0B1D, 0xFFFCF3ED, 0xFFD1B9C8, 0xFFD1B9C8, 0xFFEBDDE5,
            0xFFFFAD5F, 0xFFFF687E, 0xFFFFBB49, 0xFFC28EFB, 0xFF9DB0FF,
            0xFF47293F, 0xFF1F0B1D, 0xFFFF687E, false),
        new WidgetTheme("sakura", true,
            0xFFFFFCFE, 0xFFFBEAF1, 0xFF301924, 0xFF724A5D, 0xFF724A5D, 0xFF4A2C3A,
            0xFFB52E71, 0xFFC50220, 0xFF975700, 0xFF7A3FB8, 0xFF3B5BB0,
            0xFFF1DDE6, 0xFFFFFFFF, 0xFFC50220, false),
    };

    // ------------------------------------------------------------------ lookup / resolution

    /** A palette by id; unknown ids get the original dark look. */
    static WidgetTheme of(String id) {
        for (WidgetTheme t : ALL) if (t.id.equals(id)) return t;
        return DARK;
    }

    static boolean known(String id) {
        return IDS.contains(id);
    }

    /** Picker name of a choice (the same names as the app's theme picker, ThemeCard.tsx). */
    static String name(String choice, boolean en) {
        switch (choice == null ? "" : choice) {
            case APP: return en ? "Like the app" : "Jak aplikacja";
            case "dark": return en ? "Dark" : "Ciemny";
            case "light": return en ? "Light" : "Jasny";
            case "amoled": return "AMOLED";
            case "glitch": return "Glitch Pixel";
            case "terminal": return "Terminal";
            case "ocean": return "Ocean";
            case "sunset": return en ? "Sunset" : "Zachód";
            case "sakura": return "Sakura";
            default: return choice;
        }
    }

    /** A stored widget choice: a palette id or "app" (null / garbage = "app"). */
    static String decode(String stored) {
        return stored != null && known(stored) ? stored : APP;
    }

    /**
     * The palette a widget shows. `choice` = its own setting (WidgetPrefs); "app" follows the
     * snapshot: "system" preference = the phone's night mode, else the app's resolved theme;
     * an old snapshot without a theme keeps the original dark look.
     */
    static String resolve(String choice, String appTheme, String appPref, boolean systemNight) {
        String c = decode(choice);
        if (!APP.equals(c)) return c;
        if ("system".equals(appPref)) return systemNight ? "dark" : "light";
        return appTheme != null && known(appTheme) ? appTheme : "dark";
    }

    // ------------------------------------------------------------------ colours

    /** sRGB relative luminance (WCAG) of an ARGB colour (alpha ignored). */
    static double luminance(int argb) {
        double r = channel((argb >> 16) & 0xFF), g = channel((argb >> 8) & 0xFF), b = channel(argb & 0xFF);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    private static double channel(int v) {
        double s = v / 255.0;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }

    /** WCAG contrast ratio, 1..21. */
    static double contrast(int a, int b) {
        double la = luminance(a), lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    /** `color` mixed toward black (`toBlack`) or white by `f` (0..1), opaque. */
    static int mix(int color, boolean toBlack, double f) {
        int t = toBlack ? 0 : 255;
        int r = (int) Math.round(((color >> 16) & 0xFF) * (1 - f) + t * f);
        int g = (int) Math.round(((color >> 8) & 0xFF) * (1 - f) + t * f);
        int b = (int) Math.round((color & 0xFF) * (1 - f) + t * f);
        return 0xFF000000 | (r << 16) | (g << 8) | b;
    }

    /** `color` darkened (light theme) or lightened (dark theme) just enough for `min`:1 on the card. */
    int readable(int color, double min) {
        int c = 0xFF000000 | color;
        for (int i = 0; i < 20 && contrast(c, card) < min; i++) c = mix(c, light, 0.08);
        return c;
    }

    /**
     * A habit's own colour (snapshot colorHex, made for the dark theme) on this palette:
     * forbidden red becomes the palette's avoid colour, terminal turns the rest phosphor,
     * and everything gets at least 3:1 against the widget (rings, icons, dots).
     */
    int habit(int color) {
        int c = 0xFF000000 | color;
        if (this == DARK) return c;
        if (c == (0xFF000000 | WidgetShared.AVOID)) return avoid;
        if (mono) return accent;
        return readable(c, 3.0);
    }

    /** NextWidgetContent's semantic colours (C_*) -> this palette; anything else is a habit colour. */
    int map(int color) {
        if (this == DARK) return color;
        if (color == NextWidgetContent.C_ACCENT) return accent;
        if (color == NextWidgetContent.C_RED) return avoid;
        if (color == NextWidgetContent.C_TEXT) return text;
        if (color == NextWidgetContent.C_AMBER) return amber;
        if (color == NextWidgetContent.C_LOCK) return lock;
        if (color == NextWidgetContent.C_NIGHT) return night;
        if (color == NextWidgetContent.C_MUTED) return ticker;
        if (color == NextWidgetContent.C_JAB) return jab;
        return readable(habit(color), 4.5);
    }

    /** The "draw a frame" look of Glitch Pixel (white outline, magenta / cyan fringe). */
    boolean glitch() {
        return "glitch".equals(id);
    }

    // ------------------------------------------------------------------ Android

    /** The phone is in night mode right now. */
    static boolean systemNight(Context c) {
        int mode = c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode != Configuration.UI_MODE_NIGHT_NO;
    }

    /** The palette of a widget for a (possibly unsaved) choice. */
    static WidgetTheme forChoice(Context c, String choice) {
        org.json.JSONObject s = WidgetShared.state(c);
        return of(resolve(choice, s.optString("theme", ""), s.optString("themePref", ""), systemNight(c)));
    }

    static WidgetTheme forWidget(Context c, int widgetId) {
        return forChoice(c, WidgetPrefs.theme(c, widgetId));
    }

    /** Background drawable of a palette; 0 = keep the layout's own (the original dark look). */
    static int backgroundRes(String id) {
        switch (id) {
            case "light": return R.drawable.widget_bg_light;
            case "amoled": return R.drawable.widget_bg_amoled;
            case "glitch": return R.drawable.widget_bg_glitch;
            case "terminal": return R.drawable.widget_bg_terminal;
            case "ocean": return R.drawable.widget_bg_ocean;
            case "sunset": return R.drawable.widget_bg_sunset;
            case "sakura": return R.drawable.widget_bg_sakura;
            default: return 0;
        }
    }

    /** Every layout's widget_bg_image: this palette's drawable, with the widget's opacity. */
    void background(RemoteViews rv, int opacity) {
        int res = backgroundRes(id);
        if (res != 0) rv.setImageViewResource(R.id.widget_bg_image, res);
        WidgetPrefs.applyOpacity(rv, opacity);
    }
}
