package app.lovable.glow_habit_widget;

import android.content.Context;
import android.graphics.PixelFormat;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;

/**
 * "Nocny filtr": while an urgent pass through the curfew runs, the screen gets
 * a dark red veil that thickens towards the end of the pass (LiveGuard.dimAlpha),
 * so the scrolling is as unpleasant as it is pointless. Touches go through
 * (FLAG_NOT_TOUCHABLE, opacity below the 0.8 Android blocks touches at).
 * Main thread only.
 */
final class LiveDim {
    private static View view;
    private static WindowManager.LayoutParams params;

    private LiveDim() {}

    static void set(Context c, float alpha) {
        if (alpha <= 0f) {
            hide(c);
            return;
        }
        WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        if (wm == null || !android.provider.Settings.canDrawOverlays(c)) return;
        float a = Math.min(alpha, 0.75f);
        try {
            if (view == null) {
                View v = new View(c);
                v.setBackgroundColor(0xFF1A0008);
                int type = Build.VERSION.SDK_INT >= 26
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;
                WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    type,
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                    PixelFormat.TRANSLUCENT);
                lp.gravity = Gravity.CENTER;
                lp.alpha = a;
                wm.addView(v, lp);
                view = v;
                params = lp;
            } else if (Math.abs(params.alpha - a) > 0.02f) {
                params.alpha = a;
                wm.updateViewLayout(view, params);
            }
        } catch (Exception ignored) {
            view = null;
        }
    }

    static boolean isShown() {
        return view != null;
    }

    static void hide(Context c) {
        if (view == null) return;
        WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        try {
            if (wm != null) wm.removeView(view);
        } catch (Exception ignored) {
        }
        view = null;
        params = null;
    }
}
