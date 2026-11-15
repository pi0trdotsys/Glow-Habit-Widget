package app.lovable.glow_habit_widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * The optional "coach" server (your own box running a small local model, see szpila-coach): it
 * turns the day's facts into a mate-style comment. Address + token live only here, in the app's
 * private preferences - not in the web state, the widget snapshot or any backup file.
 */
final class CoachClient {
    private static final String PREFS = "loop_coach";
    private static final String KEY_URL = "url";
    private static final String KEY_TOKEN = "token";
    /** CPU-only box: a comment takes ~15-60 s, a retry included. */
    static final int READ_TIMEOUT_MS = 150_000;

    private CoachClient() {}

    /** "https://host[:port][/path]" without a trailing slash, or "" when not acceptable. Pure. */
    static String normalizeUrl(String url) {
        if (url == null) return "";
        String u = url.trim();
        while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
        if (!u.toLowerCase(Locale.ROOT).matches("https://[a-z0-9.-]+(:[0-9]{1,5})?(/[a-z0-9._~/-]*)?")) return "";
        return u;
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String url(Context c) {
        return prefs(c).getString(KEY_URL, "");
    }

    static boolean configured(Context c) {
        return !url(c).isEmpty() && !prefs(c).getString(KEY_TOKEN, "").isEmpty();
    }

    /** Saves (or with an empty url clears) the server. False = the url isn't https. */
    static boolean save(Context c, String url, String token) {
        if (url == null || url.trim().isEmpty()) {
            prefs(c).edit().clear().apply();
            return true;
        }
        String u = normalizeUrl(url);
        if (u.isEmpty()) return false;
        SharedPreferences.Editor e = prefs(c).edit().putString(KEY_URL, u);
        if (token != null && !token.trim().isEmpty()) e.putString(KEY_TOKEN, token.trim());
        e.apply();
        return true;
    }

    /** GET /v1/health -> the model name. Throws with a short reason (blocking). */
    static String health(Context c) throws Exception {
        JSONObject r = call(c, "GET", "/v1/health", null, 15_000);
        if (!r.optBoolean("ok")) throw new IllegalStateException("not ok");
        return r.optString("model", "");
    }

    /** POST /v1/comment -> the comment, or null when the server had nothing good (blocking). */
    static String comment(Context c, JSONObject facts) throws Exception {
        JSONObject r = call(c, "POST", "/v1/comment", facts, READ_TIMEOUT_MS);
        String t = r.optString("text", "");
        return t.isEmpty() || "null".equals(t) ? null : t;
    }

    private static JSONObject call(Context c, String method, String path, JSONObject body, int readTimeout)
            throws Exception {
        if (!configured(c)) throw new IllegalStateException("not configured");
        HttpURLConnection con = (HttpURLConnection) new URL(url(c) + path).openConnection();
        try {
            con.setRequestMethod(method);
            con.setConnectTimeout(15_000);
            con.setReadTimeout(readTimeout);
            con.setRequestProperty("Authorization", "Bearer " + prefs(c).getString(KEY_TOKEN, ""));
            con.setRequestProperty("Accept", "application/json");
            if (body != null) {
                byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
                con.setDoOutput(true);
                con.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = con.getOutputStream()) {
                    out.write(data);
                }
            }
            int code = con.getResponseCode();
            if (code == 401) throw new SecurityException("HTTP 401");
            if (code != 200) throw new IllegalStateException("HTTP " + code);
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] b = new byte[4096];
                int n;
                while ((n = in.read(b)) > 0 && buf.size() < 64 * 1024) buf.write(b, 0, n);
                return new JSONObject(buf.toString("UTF-8"));
            }
        } finally {
            con.disconnect();
        }
    }
}
