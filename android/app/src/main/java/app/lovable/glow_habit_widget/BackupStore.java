package app.lovable.glow_habit_widget;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;

/**
 * Writes backup JSON files the user can actually reach: Download/Loop on
 * Android 10+ (MediaStore, no permission needed), the app's external files
 * dir on older versions. The web app keeps the latest full backup in
 * SharedPreferences ("loop_backup", see src/lib/backup.ts); a daily automatic
 * copy rotates through one file per weekday so the last 7 days survive.
 */
final class BackupStore {
    static final String BACKUP_KEY = "loop_backup";
    private static final String PREFS = "loop_notifier";
    private static final String KEY_LAST_AUTO = "last_auto_backup";
    private static final String FOLDER = "Loop";
    private static final String[] DAY_FILE = {"nd", "pon", "wt", "sr", "czw", "pt", "sob"};

    private BackupStore() {}

    /** Result of a write: a shareable content Uri and a human-readable location. */
    static final class Saved {
        final Uri uri;
        final String location;

        Saved(Uri uri, String location) {
            this.uri = uri;
            this.location = location;
        }
    }

    /** Writes (or overwrites, if this install created it) Download/Loop/<name>. */
    static Saved write(Context c, String name, String json) throws Exception {
        byte[] data = json.getBytes(StandardCharsets.UTF_8);
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = c.getContentResolver();
            Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            String rel = Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER + "/";
            Uri uri = findOwn(cr, collection, name, rel);
            if (uri == null) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                v.put(MediaStore.Downloads.RELATIVE_PATH, rel);
                uri = cr.insert(collection, v);
                if (uri == null) throw new IllegalStateException("MediaStore insert failed");
            }
            try (OutputStream out = cr.openOutputStream(uri, "wt")) {
                if (out == null) throw new IllegalStateException("No output stream");
                out.write(data);
            }
            return new Saved(uri, "Pobrane/" + FOLDER + "/" + name);
        }
        File dir = new File(c.getExternalFilesDir(null), FOLDER);
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Cannot create " + dir);
        File f = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(data);
        }
        Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", f);
        return new Saved(uri, f.getAbsolutePath());
    }

    /** A file with this name that this install created (other installs' files aren't visible/writable). */
    private static Uri findOwn(ContentResolver cr, Uri collection, String name, String rel) {
        String sel = MediaStore.Downloads.DISPLAY_NAME + "=? AND " + MediaStore.Downloads.RELATIVE_PATH + "=?";
        try (Cursor cur = cr.query(collection, new String[]{MediaStore.Downloads._ID}, sel,
                new String[]{name, rel}, null)) {
            if (cur != null && cur.moveToFirst()) {
                return Uri.withAppendedPath(collection, String.valueOf(cur.getLong(0)));
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    static String lastAuto(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAST_AUTO, "");
    }

    /** Once a day (on any alarm tick): copy the latest backup to loop-kopia-<weekday>.json. */
    static void autoBackupIfDue(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String today = WidgetShared.today();
        if (today.equals(p.getString(KEY_LAST_AUTO, ""))) return;
        org.json.JSONObject s = WidgetShared.state(c).optJSONObject("settings");
        if (s != null && !s.optBoolean("autoBackup", true)) return;
        String json = WidgetShared.prefs(c).getString(BACKUP_KEY, null);
        if (json == null || json.isEmpty()) return;
        try {
            String day = DAY_FILE[Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1];
            write(c, "loop-kopia-" + day + ".json", json);
            p.edit().putString(KEY_LAST_AUTO, today).apply();
        } catch (Exception ignored) {
        }
    }
}
