package app.lovable.glow_habit_widget;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * In-app updates from the GitHub release (src/lib/update.ts finds the release): download the
 * APK into the cache, check it, then hand it to the system installer. Checks before installing:
 * the SHA-256 GitHub publishes for the asset, the package name, a newer versionCode and the
 * same signing certificate as this install (Android would refuse a different one anyway, but
 * this way the user gets a clear message instead of a failed install).
 */
final class UpdateManager {
    /** Only release assets of this repository are downloaded. */
    static final String ALLOWED_PREFIX = "https://github.com/pi0trdotsys/glow-habit-widget/releases/download/";

    /** The update channel: the latest (non-draft, non-pre-release) GitHub release. Mirrors update.ts. */
    static final String RELEASES_API = "https://api.github.com/repos/pi0trdotsys/glow-habit-widget/releases/latest";
    /** The background check asks GitHub at most this often (any alarm tick may trigger it). */
    static final long CHECK_EVERY_MS = 6L * 60 * 60 * 1000;
    private static final String PREFS = "loop_update";
    private static final String KEY_CHECKED = "checked_at";
    private static final String KEY_FOUND = "found";
    private static final String KEY_NOTIFIED = "notified";

    interface Progress {
        void on(long received, long total);
    }

    private UpdateManager() {}

    static boolean allowedUrl(String url) {
        return url != null && url.toLowerCase(Locale.ROOT).startsWith(ALLOWED_PREFIX.toLowerCase(Locale.ROOT))
            && url.toLowerCase(Locale.ROOT).endsWith(".apk") && !url.contains("..");
    }

    /** "sha256:abc..." or "abc..." -> lower-case hex, or "" when missing / not SHA-256. */
    static String normalizeSha(String digest) {
        if (digest == null) return "";
        String d = digest.trim().toLowerCase(Locale.ROOT);
        if (d.startsWith("sha256:")) d = d.substring(7);
        return d.matches("[0-9a-f]{64}") ? d : "";
    }

    /** Numeric dotted compare, -1 / 0 / 1 ("2.10.0" > "2.9.3"); mirrors compareVersions() in update.ts. */
    static int compare(String a, String b) {
        String[] pa = a.replaceFirst("^[vV]", "").split("\\.");
        String[] pb = b.replaceFirst("^[vV]", "").split("\\.");
        for (int i = 0; i < Math.max(pa.length, pb.length); i++) {
            int x = i < pa.length ? num(pa[i]) : 0;
            int y = i < pb.length ? num(pb[i]) : 0;
            if (x != y) return x > y ? 1 : -1;
        }
        return 0;
    }

    private static int num(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return 0;
        }
    }

    /** The release as an update version ("2.15.0"), or "" (draft, pre-release, odd tag, no allowed APK). Pure. */
    static String usableVersion(JSONObject r) {
        if (r == null || r.optBoolean("draft") || r.optBoolean("prerelease")) return "";
        String v = r.optString("tag_name", "").replaceFirst("^[vV]", "");
        if (!v.matches("\\d+(\\.\\d+)*")) return "";
        JSONArray assets = r.optJSONArray("assets");
        for (int i = 0; assets != null && i < assets.length(); i++) {
            JSONObject a = assets.optJSONObject(i);
            if (a != null && allowedUrl(a.optString("browser_download_url"))) return v;
        }
        return "";
    }

    /** Asks GitHub for the latest release (blocking - background threads only). */
    static String fetchLatest() throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(RELEASES_API).openConnection();
        con.setConnectTimeout(10_000);
        con.setReadTimeout(10_000);
        con.setRequestProperty("Accept", "application/vnd.github+json");
        try (InputStream in = con.getInputStream()) {
            if (con.getResponseCode() != 200) return "";
            java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0 && buf.size() < 512 * 1024) buf.write(b, 0, n);
            return usableVersion(new JSONObject(buf.toString("UTF-8")));
        } finally {
            con.disconnect();
        }
    }

    /** A newer version the background check found and the app hasn't installed yet, or "". */
    static String hint(Context c) {
        String found = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_FOUND, "");
        return !found.isEmpty() && compare(found, installedVersionName(c)) > 0 ? found : "";
    }

    /**
     * Background check (alarm ticks, at most every 6 h): remembers a newer release for the app
     * (hint) and returns its version the first time it's seen, so the caller notifies once per
     * version. null = nothing new (or offline / throttled).
     */
    static String backgroundCheck(Context c) {
        android.content.SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long last = p.getLong(KEY_CHECKED, 0);
        if (last > 0 && now >= last && now - last < CHECK_EVERY_MS) return null;
        p.edit().putLong(KEY_CHECKED, now).apply();
        try {
            String latest = fetchLatest();
            if (latest.isEmpty() || compare(latest, installedVersionName(c)) <= 0) return null;
            p.edit().putString(KEY_FOUND, latest).apply();
            if (latest.equals(p.getString(KEY_NOTIFIED, ""))) return null;
            p.edit().putString(KEY_NOTIFIED, latest).apply();
            return latest;
        } catch (Exception e) {
            return null;
        }
    }

    static long installedVersionCode(Context c) throws Exception {
        PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
    }

    static String installedVersionName(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    private static File dir(Context c) {
        File d = new File(c.getCacheDir(), "updates");
        if (!d.exists()) //noinspection ResultOfMethodCallIgnored
            d.mkdirs();
        return d;
    }

    /** Downloads into cache/updates/szpila-update.apk (older downloads are removed first). */
    static File download(Context c, String url, Progress progress) throws Exception {
        if (!allowedUrl(url)) throw new IllegalArgumentException("Not a Szpila release APK");
        File[] old = dir(c).listFiles();
        if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
            f.delete();
        File out = new File(dir(c), "szpila-update.apk");
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true); // GitHub redirects to its file storage (https -> https)
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestProperty("Accept", "application/octet-stream");
        try {
            int code = conn.getResponseCode();
            if (code != 200) throw new IllegalStateException("HTTP " + code);
            long total = conn.getContentLengthLong();
            try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[64 * 1024];
                long received = 0;
                long lastReport = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    os.write(buf, 0, n);
                    received += n;
                    if (progress != null && received - lastReport >= 256 * 1024) {
                        lastReport = received;
                        progress.on(received, total);
                    }
                }
                if (progress != null) progress.on(received, total);
            }
        } finally {
            conn.disconnect();
        }
        return out;
    }

    static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format(Locale.US, "%02x", b));
        return sb.toString();
    }

    /** null when the APK may be installed, else a short reason (Polish / English). */
    static String verify(Context c, File apk, String expectedSha) {
        boolean en = WidgetShared.en(c);
        try {
            String want = normalizeSha(expectedSha);
            if (!want.isEmpty() && !want.equals(sha256(apk))) {
                return en ? "The download is damaged (checksum mismatch)." : "Pobrany plik jest uszkodzony (zła suma kontrolna).";
            }
            PackageManager pm = c.getPackageManager();
            int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
            if (archive == null) return en ? "The file is not an app." : "Plik nie jest aplikacją.";
            if (!c.getPackageName().equals(archive.packageName)) {
                return en ? "That's a different app." : "To inna aplikacja.";
            }
            long newCode = Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode;
            if (newCode <= installedVersionCode(c)) {
                return en ? "You already have this version." : "Masz już tę wersję.";
            }
            PackageInfo installed = pm.getPackageInfo(c.getPackageName(), flags);
            if (!signers(installed).equals(signers(archive)) || signers(archive).isEmpty()) {
                return en ? "The update is signed with a different key." : "Aktualizacja jest podpisana innym kluczem.";
            }
            return null;
        } catch (Exception e) {
            return (en ? "Can't check the update: " : "Nie da się sprawdzić aktualizacji: ") + e.getMessage();
        }
    }

    private static Set<String> signers(PackageInfo pi) {
        Signature[] sigs;
        if (Build.VERSION.SDK_INT >= 28) {
            sigs = pi.signingInfo == null ? null
                : pi.signingInfo.hasMultipleSigners() ? pi.signingInfo.getApkContentsSigners()
                : pi.signingInfo.getSigningCertificateHistory();
        } else {
            sigs = pi.signatures;
        }
        Set<String> out = new HashSet<>();
        if (sigs != null) for (Signature s : sigs) out.add(Arrays.toString(s.toByteArray()));
        return out;
    }

    /** Android 8+: has the user allowed this app to install apps? */
    static boolean canInstall(Context c) {
        return Build.VERSION.SDK_INT < 26 || c.getPackageManager().canRequestPackageInstalls();
    }

    /** The system screen "Install unknown apps" for this app. */
    static void openInstallPermission(Context c) {
        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(i);
    }

    /** Hands the downloaded APK to the system installer (it asks the user to confirm). */
    static void install(Context c, File apk) {
        Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", apk);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(i);
    }

    static File downloaded(Context c) {
        File f = new File(dir(c), "szpila-update.apk");
        return f.exists() ? f : null;
    }
}
