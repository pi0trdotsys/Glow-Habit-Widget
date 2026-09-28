package app.lovable.glow_habit_widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.RemoteViews;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * "Ustawienia widżetu": opened by the launcher when a widget is placed
 * (android:configure) and, on Android 12+, from the widget's long-press
 * "reconfigure". Picks the background transparency for any of the four widgets
 * and, for "Następne zadanie", which lines the rotating ticker cycles through.
 * A live preview (the widget's real RemoteViews applied in-process) sits on the
 * actual wallpaper (Theme.Szpila.Config shows it through the preview strip).
 * Texts follow the app language from the snapshot (WidgetShared.en), not the
 * system locale. Settings live in WidgetPrefs, keyed by appWidgetId.
 */
public class WidgetConfigActivity extends Activity {
    private static final int BG = 0xFF0B0D11;
    private static final int CARD = 0xFF1B1D26;
    private static final int STROKE = 0xFF262A35;
    private static final int TEXT = 0xFFF4F5F9;
    private static final int MUTED = 0xFF9398A5;
    private static final int RED = 0xFFFF4D5E;
    private static final int MINT = 0xFF60E7B4;

    private enum Kind { LIST, ICONS, NEXT, SZPILA }

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private Kind kind;
    private Resources res;
    /** Background opacity 0..100 (the slider shows transparency = 100 - opacity). */
    private int opacity;
    private final Set<String> lines = new LinkedHashSet<>();
    private boolean reverting;

    private LinearLayout previewRow;
    private TextView valueLabel;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Backing out = cancel (on first placement the launcher then drops the widget).
        setResult(RESULT_CANCELED);

        Intent intent = getIntent();
        if (intent != null) {
            widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        AppWidgetProviderInfo info = null;
        if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            try {
                info = AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId);
            } catch (Exception ignored) {
                // no such widget
            }
        }
        // Exported for the launcher: only our own widgets can be configured here.
        if (info == null || info.provider == null || !getPackageName().equals(info.provider.getPackageName())) {
            finish();
            return;
        }
        kind = kindOf(info.provider.getClassName());
        if (kind == null) {
            finish();
            return;
        }

        WidgetShared.normalizeIfStale(this);
        res = localized(WidgetShared.en(this));
        opacity = WidgetPrefs.opacity(this, widgetId);
        lines.addAll(WidgetPrefs.lines(this, widgetId));

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(buildUi());
        renderPreview();
    }

    private static Kind kindOf(String cls) {
        if (HabitWidgetProvider.class.getName().equals(cls)) return Kind.LIST;
        if (HabitWidget2Provider.class.getName().equals(cls)) return Kind.ICONS;
        if (NextTaskWidgetProvider.class.getName().equals(cls)) return Kind.NEXT;
        if (SzpilaWidgetProvider.class.getName().equals(cls)) return Kind.SZPILA;
        return null;
    }

    /** Resources in the app language ("pl" = the default values, "en" = values-en). */
    private Resources localized(boolean en) {
        Configuration conf = new Configuration(getResources().getConfiguration());
        conf.setLocale(en ? Locale.ENGLISH : Locale.forLanguageTag("pl"));
        return createConfigurationContext(conf).getResources();
    }

    private String s(int id) {
        return res.getString(id);
    }

    // ------------------------------------------------------------------ UI

    private View buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        // header
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setBackgroundColor(BG);
        TextView title = text(s(R.string.widget_config_title), 22, TEXT, true);
        header.addView(title);
        TextView sub = text(s(widgetLabel()), 13, MUTED, false);
        sub.setPadding(0, dp(2), 0, 0);
        header.addView(sub);
        root.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));

        // preview strip: transparent, so the wallpaper shows through
        LinearLayout strip = new LinearLayout(this);
        strip.setOrientation(LinearLayout.VERTICAL);
        strip.setGravity(Gravity.CENTER_HORIZONTAL);
        strip.setPadding(dp(16), dp(14), dp(16), dp(18));
        TextView caption = text(s(R.string.widget_config_preview), 11, TEXT, true);
        caption.setPadding(dp(10), dp(4), dp(10), dp(4));
        caption.setBackground(rounded(0x99000000, dp(12), 0));
        strip.addView(caption, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout host = new FrameLayout(this);
        host.setContentDescription(s(R.string.widget_config_preview));
        previewRow = new LinearLayout(this);
        previewRow.setOrientation(LinearLayout.HORIZONTAL);
        previewRow.setGravity(Gravity.CENTER);
        host.addView(previewRow, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));
        // A shield over the preview: its taps would fire the widget's real intents.
        View shield = new View(this);
        shield.setClickable(true);
        shield.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        host.addView(shield, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout.LayoutParams hostLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT);
        hostLp.topMargin = dp(12);
        strip.addView(host, hostLp);
        root.addView(strip, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));

        // settings
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.setFillViewport(true);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(16), dp(16), dp(16), dp(8));
        body.addView(opacityCard());
        if (kind == Kind.NEXT) {
            View ticker = tickerCard();
            LinearLayout.LayoutParams lp = cardLp();
            lp.topMargin = dp(12);
            body.addView(ticker, lp);
        }
        scroll.addView(body, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // buttons
        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setBackgroundColor(BG);
        Button cancel = button(s(R.string.widget_config_cancel), CARD, TEXT, STROKE);
        cancel.setOnClickListener(v -> finish());
        Button save = button(s(R.string.widget_config_save), RED, 0xFF14060A, 0);
        save.setOnClickListener(v -> save());
        LinearLayout.LayoutParams cLp = new LinearLayout.LayoutParams(0, dp(50), 1f);
        LinearLayout.LayoutParams sLp = new LinearLayout.LayoutParams(0, dp(50), 1f);
        sLp.setMarginStart(dp(12));
        buttons.addView(cancel, cLp);
        buttons.addView(save, sLp);
        root.addView(buttons, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));

        // edge-to-edge: the dark sections extend under the system bars
        final int pad = dp(20);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                | WindowInsetsCompat.Type.displayCutout());
            header.setPadding(pad + bars.left, dp(18) + bars.top, pad + bars.right, dp(10));
            strip.setPadding(dp(16) + bars.left, dp(14), dp(16) + bars.right, dp(18));
            scroll.setPadding(bars.left, 0, bars.right, 0);
            buttons.setPadding(dp(16) + bars.left, dp(12), dp(16) + bars.right, dp(16) + bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        header.setPadding(pad, dp(18), pad, dp(10));
        buttons.setPadding(dp(16), dp(12), dp(16), dp(16));
        return root;
    }

    private int widgetLabel() {
        switch (kind) {
            case LIST: return R.string.widget_list_label;
            case ICONS: return R.string.widget_icons_label;
            case NEXT: return R.string.widget_next_label;
            default: return R.string.widget_szpila_label;
        }
    }

    private View opacityCard() {
        LinearLayout card = card();
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView label = text(s(R.string.widget_config_transparency), 15, TEXT, true);
        row.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        valueLabel = text("", 15, MINT, true);
        row.addView(valueLabel);
        card.addView(row);

        SeekBar bar = new SeekBar(this);
        bar.setMax(100 / WidgetPrefs.STEP);
        bar.setProgress((100 - opacity) / WidgetPrefs.STEP);
        bar.setContentDescription(s(R.string.widget_config_transparency));
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                int o = WidgetPrefs.clampOpacity(100 - progress * WidgetPrefs.STEP);
                if (o == opacity) return;
                opacity = o;
                updateValue();
                renderPreview();
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {}

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
            dp(40));
        barLp.topMargin = dp(6);
        card.addView(bar, barLp);

        TextView hint = text(s(R.string.widget_config_transparency_hint), 12, MUTED, false);
        card.addView(hint);
        updateValue();
        return card;
    }

    private void updateValue() {
        if (valueLabel != null) valueLabel.setText(String.format(Locale.ROOT, "%d %%", 100 - opacity));
    }

    private View tickerCard() {
        LinearLayout card = card();
        card.addView(text(s(R.string.widget_config_lines), 15, TEXT, true));
        TextView hint = text(s(R.string.widget_config_lines_hint), 12, MUTED, false);
        hint.setPadding(0, dp(4), 0, dp(6));
        card.addView(hint);
        int[][] rows = {
            {R.string.widget_config_line_jab, R.string.widget_config_line_jab_ex},
            {R.string.widget_config_line_forma, R.string.widget_config_line_forma_ex},
            {R.string.widget_config_line_progress, R.string.widget_config_line_progress_ex},
            {R.string.widget_config_line_time, R.string.widget_config_line_time_ex},
            {R.string.widget_config_line_social, R.string.widget_config_line_social_ex},
            {R.string.widget_config_line_next, R.string.widget_config_line_next_ex},
        };
        for (int i = 0; i < WidgetPrefs.LINES.size(); i++) {
            card.addView(lineRow(WidgetPrefs.LINES.get(i), rows[i][0], rows[i][1]));
        }
        return card;
    }

    private View lineRow(String id, int labelRes, int exampleRes) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(8), 0, dp(8));
        row.setMinimumHeight(dp(48));

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.addView(text(s(labelRes), 14, TEXT, false));
        texts.addView(text(s(exampleRes), 12, MUTED, false));
        row.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Switch sw = new Switch(this);
        sw.setChecked(lines.contains(id));
        sw.setContentDescription(s(labelRes));
        sw.setOnCheckedChangeListener((b, checked) -> {
            if (reverting) return;
            if (checked) {
                lines.add(id);
            } else if (lines.size() <= 1) {
                // at least one line has to stay on
                reverting = true;
                b.setChecked(true);
                reverting = false;
                Toast.makeText(this, s(R.string.widget_config_min_one), Toast.LENGTH_SHORT).show();
                return;
            } else {
                lines.remove(id);
            }
            renderPreview();
        });
        row.addView(sw);
        row.setOnClickListener(v -> sw.toggle());
        return row;
    }

    // ------------------------------------------------------------------ preview

    /** Re-applies the widget's real RemoteViews with the current (unsaved) settings. */
    private void renderPreview() {
        if (previewRow == null) return;
        previewRow.removeAllViews();
        int wide = Math.min(dp(360), getResources().getDisplayMetrics().widthPixels - dp(48));
        try {
            switch (kind) {
                case LIST:
                    addPreview(HabitWidgetProvider.build(this, widgetId, opacity, true), wide, dp(170), 0);
                    break;
                case ICONS:
                    addPreview(HabitWidget2Provider.build(this, widgetId, opacity), wide, dp(196), 0);
                    break;
                case SZPILA:
                    addPreview(SzpilaWidgetProvider.build(this, opacity), wide, dp(84), 0);
                    break;
                default:
                    NextWidgetContent.Content c = NextTaskWidgetProvider.content(this, lines);
                    int cell = dp(80);
                    addPreview(NextTaskWidgetProvider.render(this, c, widgetId, false, opacity), cell, cell, 0);
                    addPreview(NextTaskWidgetProvider.render(this, c, widgetId, true, opacity),
                        Math.min(dp(210), wide - cell - dp(14)), cell, dp(14));
            }
        } catch (Exception e) {
            previewRow.removeAllViews();
            TextView t = text(s(R.string.widget_config_unavailable), 13, TEXT, false);
            t.setPadding(dp(12), dp(24), dp(12), dp(24));
            previewRow.addView(t);
        }
    }

    private void addPreview(RemoteViews rv, int w, int h, int marginStart) {
        View v = rv.apply(this, previewRow);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(w, h);
        lp.setMarginStart(marginStart);
        previewRow.addView(v, lp);
    }

    // ------------------------------------------------------------------ save

    private void save() {
        WidgetPrefs.save(this, widgetId, opacity, kind == Kind.NEXT ? lines : null);
        AppWidgetManager mgr = AppWidgetManager.getInstance(this);
        try {
            switch (kind) {
                case LIST: HabitWidgetProvider.updateWidget(this, mgr, widgetId); break;
                case ICONS: HabitWidget2Provider.updateWidget(this, mgr, widgetId); break;
                case NEXT:
                    NextTaskWidgetProvider.updateWidget(this, mgr, widgetId);
                    HabitNotifier.scheduleNext(this); // what onUpdate does for a new widget
                    break;
                default: SzpilaWidgetProvider.updateWidget(this, mgr, widgetId);
            }
        } catch (Exception ignored) {
            // the next regular update paints it
        }
        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    // ------------------------------------------------------------------ view helpers

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private GradientDrawable rounded(int color, int radius, int stroke) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        if (stroke != 0) d.setStroke(dp(1), stroke);
        return d;
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(rounded(CARD, dp(18), STROKE));
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        card.setLayoutParams(cardLp());
        return card;
    }

    private LinearLayout.LayoutParams cardLp() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private Button button(String label, int bg, int fg, int stroke) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(fg);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable shape = rounded(bg, dp(16), stroke);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), shape, null));
        b.setStateListAnimator(null);
        return b;
    }
}
