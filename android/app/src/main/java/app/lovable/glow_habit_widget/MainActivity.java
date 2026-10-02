package app.lovable.glow_habit_widget;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HabitWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                onBack(this);
            }
        });
        // An icon switch that never got applied (e.g. the app was killed while in front).
        if (savedInstanceState == null) applyAppIcon();
    }

    /**
     * The launcher icon follows the theme (AppIcon): the web app only stores the wanted icon,
     * it is switched here once the app has left the screen - launchers may kill or refresh
     * the app when launcher components change.
     */
    @Override
    public void onStop() {
        super.onStop();
        applyAppIcon();
    }

    private void applyAppIcon() {
        android.content.Context app = getApplicationContext();
        new Thread(() -> {
            try {
                AppIcon.applyPending(app);
            } catch (Exception ignored) {
            }
        }, "app-icon").start();
    }

    /**
     * System back: first let the web app close whatever is open (edit form,
     * expanded panel - see src/lib/back.ts), then go back through the screens
     * (WebView history), and only on the first screen leave the app.
     */
    private void onBack(OnBackPressedCallback callback) {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) {
            exit(callback);
            return;
        }
        web.evaluateJavascript("(window.__loopBack && window.__loopBack()) ? 'handled' : ''", value -> {
            if (value != null && value.contains("handled")) return;
            if (web.canGoBack()) web.goBack();
            else exit(callback);
        });
    }

    private void exit(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        callback.setEnabled(true);
    }
}
