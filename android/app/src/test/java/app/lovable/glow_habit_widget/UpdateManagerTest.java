package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** The background update check (UpdateManager): which releases count and how versions compare. */
public class UpdateManagerTest {
    private static JSONObject release(String tag, String url) throws Exception {
        return new JSONObject().put("tag_name", tag).put("draft", false).put("prerelease", false)
            .put("assets", new JSONArray().put(new JSONObject().put("browser_download_url", url)));
    }

    private static final String APK =
        "https://github.com/pi0trdotsys/Glow-Habit-Widget/releases/download/v2.15.0/szpila-2.15.0.apk";

    @Test
    public void versionsCompareNumericallyLikeTheApp() {
        assertEquals(1, UpdateManager.compare("2.10.0", "2.9.3"));
        assertEquals(0, UpdateManager.compare("v2.14.0", "2.14"));
        assertEquals(-1, UpdateManager.compare("2.13.9", "2.14.0"));
        assertEquals(1, UpdateManager.compare("2.15.0", "2.14.0"));
    }

    @Test
    public void onlyRealReleasesWithOurApkAreUpdates() throws Exception {
        assertEquals("2.15.0", UpdateManager.usableVersion(release("v2.15.0", APK)));
        assertEquals("", UpdateManager.usableVersion(release("v2.15.0", APK).put("draft", true)));
        assertEquals("", UpdateManager.usableVersion(release("v2.15.0", APK).put("prerelease", true)));
        assertEquals("", UpdateManager.usableVersion(release("nightly", APK)));
        assertEquals("", UpdateManager.usableVersion(release("v2.15.0", "https://evil.example/szpila.apk")));
        assertEquals("", UpdateManager.usableVersion(null));
    }
}
