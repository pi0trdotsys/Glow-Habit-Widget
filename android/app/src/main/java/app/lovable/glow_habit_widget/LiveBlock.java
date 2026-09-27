package app.lovable.glow_habit_widget;

import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * The night guard's full-screen block: after the 3rd jab of a session Szpila
 * covers the social media app (draw over other apps). Two ways out:
 * "Idę spać" (home screen) or holding a button for 10 s (lets you through for
 * a few minutes, then the next escalation blocks again). Back does nothing.
 * Main thread only (called from LiveGuardService's handler).
 */
final class LiveBlock {
    interface Listener {
        void onSleep();

        void onHoldThrough();
    }

    private static View shown;

    private LiveBlock() {}

    static boolean isShown() {
        return shown != null;
    }

    @SuppressLint({"ClickableViewAccessibility", "InflateParams"})
    static boolean show(Context c, String title, String text, String sub, int catRes, Listener listener) {
        if (shown != null) return true;
        WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        if (wm == null || !android.provider.Settings.canDrawOverlays(c)) return false;

        // Swallow Back so the block can't be dismissed without choosing.
        FrameLayout root = new FrameLayout(c) {
            @Override
            public boolean dispatchKeyEvent(KeyEvent event) {
                if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) return true;
                return super.dispatchKeyEvent(event);
            }
        };
        LayoutInflater.from(c).inflate(R.layout.live_block, root, true);
        ((TextView) root.findViewById(R.id.block_title)).setText(title);
        ((TextView) root.findViewById(R.id.block_text)).setText(text);
        ((TextView) root.findViewById(R.id.block_sub)).setText(sub);
        ((ImageView) root.findViewById(R.id.block_cat)).setImageResource(catRes);

        root.findViewById(R.id.block_sleep).setOnClickListener(v -> {
            listener.onSleep(); // before hide: starting the home screen needs our window visible
            hide(c);
        });

        // Static texts follow the app language (the layout defaults follow the system one).
        boolean en = WidgetShared.en(c);
        ((TextView) root.findViewById(R.id.block_sleep)).setText(en ? "😴  Going to bed" : "😴  Idę spać");
        ProgressBar bar = root.findViewById(R.id.block_hold_progress);
        TextView holdText = root.findViewById(R.id.block_hold_text);
        String idle = en ? "Hold for 10 s if you really must" : "Przytrzymaj 10 s, jeśli naprawdę musisz";
        holdText.setText(idle);
        ValueAnimator anim = ValueAnimator.ofInt(0, 1000);
        anim.setDuration(LiveGuard.HOLD_THROUGH_MS);
        anim.setInterpolator(new LinearInterpolator());
        anim.addUpdateListener(a -> {
            int p = (int) a.getAnimatedValue();
            bar.setProgress(p);
            long left = (long) Math.ceil(LiveGuard.HOLD_THROUGH_MS * (1000 - p) / 1000.0 / 1000.0);
            holdText.setText(p >= 1000 ? (en ? "Fine…" : "No dobra…")
                : en ? "Keep holding, " + left + " s more… seriously?" : "Trzymaj jeszcze " + left + " s… serio?");
            if (p >= 1000 && shown != null) {
                hide(c);
                listener.onHoldThrough();
            }
        });
        root.findViewById(R.id.block_hold).setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    anim.start();
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    anim.cancel();
                    bar.setProgress(0);
                    holdText.setText(idle);
                    return true;
                default:
                    return true;
            }
        });

        int type = Build.VERSION.SDK_INT >= 26
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.CENTER;
        try {
            wm.addView(root, lp);
            shown = root;
            root.setAlpha(0f);
            root.animate().alpha(1f).setDuration(180).start();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static void hide(Context c) {
        if (shown == null) return;
        WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        try {
            if (wm != null) wm.removeView(shown);
        } catch (Exception ignored) {
        }
        shown = null;
    }

    /** Home screen (allowed from the background while our overlay is visible). */
    static void goHome(Context c) {
        try {
            c.startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) {
        }
    }
}
