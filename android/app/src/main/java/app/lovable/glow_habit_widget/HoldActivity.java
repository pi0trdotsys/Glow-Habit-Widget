package app.lovable.glow_habit_widget;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * Hold-to-complete sheet opened by a widget tap. Home-screen widgets can't
 * receive long presses (the launcher takes them to move the widget), so a tap
 * only opens this small overlay; the task counts only after holding the ring
 * for {@link #HOLD_MS}, like the tiles in the app. A stray tap does nothing.
 */
public class HoldActivity extends Activity {
    static final String EXTRA_FORWARD_ONLY = "forwardOnly";
    private static final long HOLD_MS = 600;

    private String habitId;
    private boolean forwardOnly;
    private TextView status;
    private boolean finishing;

    /** Intent for a widget PendingIntent. `uniq` keeps PendingIntents per cell distinct. */
    static Intent intent(Context c, String habitId, boolean forwardOnly, String uniq) {
        Intent i = new Intent(c, HoldActivity.class);
        if (habitId != null) i.putExtra(WidgetShared.EXTRA_HABIT_ID, habitId);
        i.putExtra(EXTRA_FORWARD_ONLY, forwardOnly);
        if (uniq != null) i.setData(android.net.Uri.parse("loop://hold/" + uniq));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK
            | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        return i;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        getWindow().setDimAmount(0.6f);
        habitId = getIntent().getStringExtra(WidgetShared.EXTRA_HABIT_ID);
        forwardOnly = getIntent().getBooleanExtra(EXTRA_FORWARD_ONLY, false);
        JSONObject row = habitId == null ? null : WidgetShared.row(this, habitId);
        if (row == null) {
            finish();
            return;
        }
        setContentView(build(row));
    }

    private int dp(float v) {
        return WidgetShared.dp(this, v);
    }

    private View build(JSONObject h) {
        boolean avoid = WidgetShared.isAvoid(h);
        boolean done = WidgetShared.isDone(h);
        int color = WidgetShared.color(h);

        FrameLayout root = new FrameLayout(this);
        root.setOnClickListener(v -> finish()); // tap outside = cancel

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(24), dp(22), dp(24), dp(20));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF15181F);
        bg.setCornerRadius(dp(28));
        bg.setStroke(dp(1), 0xFF23262F);
        card.setBackground(bg);
        card.setClickable(true); // don't let taps on the card fall through to "cancel"
        FrameLayout.LayoutParams cardLp = new FrameLayout.LayoutParams(dp(300), FrameLayout.LayoutParams.WRAP_CONTENT);
        cardLp.gravity = Gravity.CENTER;
        root.addView(card, cardLp);

        TextView name = text(h.optString("name"), 19, 0xFFF4F5F9, true);
        card.addView(name);

        String amount = WidgetShared.amountText(h);
        String sub = avoid
            ? (done ? "Dziś czysto ✓" : "Zakazane · potwierdź, że dziś bez")
            : done ? "Zrobione ✓" : amount.isEmpty() ? WidgetShared.whenLabel(h) : amount;
        TextView subView = text(sub, 13, avoid ? WidgetShared.AVOID : 0xFF9398A5, false);
        subView.setPadding(0, dp(4), 0, dp(14));
        card.addView(subView);

        boolean undo = done && !forwardOnly;
        String label;
        if (done && forwardOnly) label = "Już zrobione";
        else if (undo) label = "Przytrzymaj, by cofnąć";
        else if (avoid) label = "Przytrzymaj: dziś czysto";
        else if ("steps".equals(h.optString("source"))) label = "Przytrzymaj: odśwież kroki";
        else if ("check".equals(h.optString("goal", "check"))) label = "Przytrzymaj, by zaliczyć";
        else {
            int step = Math.min(WidgetShared.step(h), Math.max(1, WidgetShared.target(h) - WidgetShared.amount(h)));
            label = ("Przytrzymaj: +" + step + " " + WidgetShared.unit(h, step)).trim();
        }

        Drawable icon = getDrawable(WidgetShared.iconRes(this, h.optString("icon", "")));
        HoldRing ring = new HoldRing(this, color, WidgetShared.fraction(h), icon, !(done && forwardOnly));
        ring.onComplete = this::complete;
        card.addView(ring, new LinearLayout.LayoutParams(dp(150), dp(150)));

        status = text(label, 14, 0xFFF4F5F9, true);
        status.setPadding(0, dp(14), 0, 0);
        card.addView(status);

        if (avoid && WidgetShared.isPending(h)) {
            TextView slip = text("Była wpadka", 13, 0xFF9398A5, false);
            slip.setPadding(dp(16), dp(12), dp(16), dp(4));
            slip.setOnClickListener(v -> act(true));
            card.addView(slip);
        }

        TextView hint = text("Dotknij poza okienkiem, by anulować", 11, 0xFF5C6170, false);
        hint.setPadding(0, dp(10), 0, 0);
        card.addView(hint);
        return root;
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        return t;
    }

    private void complete() {
        act(false);
    }

    /** Apply off the main thread (a Health Connect sync is IPC), then show the result and close. */
    private void act(boolean slip) {
        if (finishing) return;
        finishing = true;
        final Context app = getApplicationContext();
        new Thread(() -> {
            if (slip) WidgetShared.applySlip(app, habitId);
            else WidgetShared.applyTap(app, habitId, forwardOnly);
            WidgetShared.updateAll(app);
            JSONObject after = WidgetShared.row(app, habitId);
            String msg;
            if (slip) msg = "Wpadka zapisana. Szpila już ostrzy język.";
            else if (after != null && WidgetShared.isDone(after)) {
                String praise = after.optString("praise", "");
                msg = praise.isEmpty() ? "Zaliczone ✓" : "😈 " + praise;
            } else if (after != null && !WidgetShared.amountText(after).isEmpty()) {
                msg = "Zapisane · " + WidgetShared.amountText(after);
            } else {
                msg = "Cofnięte";
            }
            new Handler(Looper.getMainLooper()).post(() -> {
                status.setText(msg);
                status.setTextSize(13);
                status.postDelayed(this::finish, msg.length() > 40 ? 2200 : 1100);
            });
        }, "loop-hold").start();
    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(0, android.R.anim.fade_out);
    }

    /** Ring that fills while held; releasing early springs back. */
    static final class HoldRing extends View {
        Runnable onComplete;
        private final int color;
        private final float base;
        private final Drawable icon;
        private final boolean enabled;
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint prog = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint disc = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF oval = new RectF();
        private float hold; // 0..1
        private ValueAnimator anim;
        private boolean fired;

        HoldRing(Context c, int color, float base, Drawable icon, boolean enabled) {
            super(c);
            this.color = color;
            this.base = base;
            this.icon = icon;
            this.enabled = enabled;
            float stroke = WidgetShared.dp(c, 10);
            track.setStyle(Paint.Style.STROKE);
            track.setStrokeWidth(stroke);
            track.setColor(0xFF2A2E3A);
            prog.setStyle(Paint.Style.STROKE);
            prog.setStrokeWidth(stroke);
            prog.setStrokeCap(Paint.Cap.ROUND);
            prog.setColor(color);
            disc.setColor(Color.argb(40, Color.red(color), Color.green(color), Color.blue(color)));
            if (icon != null) icon.setTint(color);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float s = Math.min(getWidth(), getHeight());
            float pad = prog.getStrokeWidth() / 2f + WidgetShared.dp(getContext(), 2);
            oval.set(pad, pad, s - pad, s - pad);
            canvas.drawArc(oval, 0, 360, false, track);
            float frac = Math.min(1f, base + (1f - base) * hold);
            if (fired) frac = 1f;
            if (frac > 0) canvas.drawArc(oval, -90, 360f * frac, false, prog);
            float r = s / 2f - prog.getStrokeWidth() - WidgetShared.dp(getContext(), 6);
            canvas.drawCircle(s / 2f, s / 2f, r * (0.92f + 0.08f * hold), disc);
            if (icon != null) {
                int is = WidgetShared.dp(getContext(), 44);
                int l = (int) (s / 2f - is / 2f), t = (int) (s / 2f - is / 2f);
                icon.setBounds(l, t, l + is, t + is);
                icon.draw(canvas);
            }
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            if (!enabled || fired) return true;
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    animateTo(1f, (long) (HOLD_MS * (1f - hold)), true);
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (!fired) animateTo(0f, 220, false);
                    return true;
                default:
                    return true;
            }
        }

        private void animateTo(float target, long ms, boolean completes) {
            if (anim != null) anim.cancel();
            anim = ValueAnimator.ofFloat(hold, target);
            anim.setDuration(Math.max(1, ms));
            anim.setInterpolator(completes ? null : new DecelerateInterpolator());
            anim.addUpdateListener(a -> {
                hold = (float) a.getAnimatedValue();
                invalidate();
                if (completes && hold >= 1f && !fired) {
                    fired = true;
                    performHapticFeedback(android.os.Build.VERSION.SDK_INT >= 30
                        ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.LONG_PRESS);
                    if (onComplete != null) onComplete.run();
                }
            });
            anim.start();
        }
    }
}
