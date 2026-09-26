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
