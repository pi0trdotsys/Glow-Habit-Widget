package app.lovable.glow_habit_widget;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Backup / export files the user can actually reach, sorted into folders:
 *
 *   Download/Szpila/Kopie/                 backups you saved ("szpila-kopia-2026-11-15-2136.json")
 *   Download/Szpila/Kopie/Automatyczne/    the daily copy ("szpila-auto-2026-11-15.json"), last 14 kept
 *   Download/Szpila/Eksport/               CSV exports
 *
 * Android 10+ writes through MediaStore (no permission; this install can see, overwrite and
 * delete only its own files). Older versions use the app's external files dir with the same
 * sub-folders. The web app keeps the latest full backup in SharedPreferences ("loop_backup",
 * src/lib/backup.ts), so the daily copy is written even when the app isn't opened.
 *
 * Name / folder rules are pure (BackupStoreTest); MediaStore / file access is not.
 */
final class BackupStore {
    static final String BACKUP_KEY = "loop_backup";
    private static final String PREFS = "loop_notifier";
    private static final String KEY_LAST_AUTO = "last_auto_backup";
    private static final String KEY_MIGRATED = "backup_folders_v2";

    static final String ROOT = "Szpila";
    /** = Environment.DIRECTORY_DOWNLOADS (a constant here so the folder rules are JVM-testable). */
    static final String DOWNLOADS = "Download";
    /** Sub-folders under Download/Szpila. */
    enum Dir {
        MANUAL("Kopie"), AUTO("Kopie/Automatyczne"), EXPORT("Eksport");

        final String path;

        Dir(String path) {
            this.path = path;
        }
    }

    /** How many daily copies to keep. Saved-by-you copies are never deleted automatically. */
    static final int AUTO_KEEP = 14;

    private static final String[] WEEKDAY_FILES = {"nd", "pon", "wt", "sr", "czw", "pt", "sob"};
    private static final Pattern AUTO_NAME = Pattern.compile("^szpila-auto-(\\d{4}-\\d{2}-\\d{2})\\.json$");

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

    /** A backup file listed in the app (Settings -> Dane). */
    static final class Entry {
        final String id;
        final String name;
        final boolean auto;
        final long size;
        final long modified;

        Entry(String id, String name, boolean auto, long size, long modified) {
            this.id = id;
            this.name = name;
            this.auto = auto;
            this.size = size;
            this.modified = modified;
        }
    }

    // ------------------------------------------------------------------ pure rules

    /** "Download/Szpila/Kopie/" - MediaStore RELATIVE_PATH of a folder (always ends with "/"). */
    static String relPath(Dir d) {
        return DOWNLOADS + "/" + ROOT + "/" + d.path + "/";
    }

    static String autoName(String date) {
        return "szpila-auto-" + date + ".json";
    }

    /** Where an old flat-folder file (Download/Szpila/<name>) belongs, or null to leave it. */
    static Dir migrationTarget(String name) {
        if (name == null) return null;
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".csv")) return Dir.EXPORT;
        if (!n.endsWith(".json")) return null;
        return isWeekdayCopy(n) ? Dir.AUTO : Dir.MANUAL;
    }

    /** The old rotating daily copies: szpila-kopia-pon.json, loop-kopia-sr.json... */
    static boolean isWeekdayCopy(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        for (String d : WEEKDAY_FILES) {
            if (n.equals("szpila-kopia-" + d + ".json") || n.equals("loop-kopia-" + d + ".json")) return true;
        }
        return false;
    }

    /**
     * Daily copies to delete so the newest `keep` stay. Only names of the dated form count
     * (anything else in the folder is left alone); dates sort as text.
     */
    static List<String> autoToPrune(List<String> names, int keep) {
        List<String> dated = new ArrayList<>();
        for (String n : names) if (AUTO_NAME.matcher(n).matches()) dated.add(n);
        java.util.Collections.sort(dated);
        java.util.Collections.reverse(dated);
        return dated.size() <= keep ? new ArrayList<>() : new ArrayList<>(dated.subList(keep, dated.size()));
    }

    static String dateOf(long millis) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(millis));
    }

    // ------------------------------------------------------------------ writing

    /** Writes (or overwrites, if this install created it) a backup in Download/Szpila/Kopie. */
    static Saved write(Context c, String name, String json) throws Exception {
        return write(c, Dir.MANUAL, name, json, "application/json");
    }

    /** Same, for any text file into a given folder (e.g. CSV exports into Eksport). */
    static Saved write(Context c, Dir dir, String name, String text, String mime) throws Exception {
        migrateOnce(c);
        byte[] data = text.getBytes(StandardCharsets.UTF_8);
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = c.getContentResolver();
            Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            String rel = relPath(dir);
            Uri uri = findOwn(cr, collection, name, rel);
            if (uri == null) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, rel);
                uri = cr.insert(collection, v);
                if (uri == null) throw new IllegalStateException("MediaStore insert failed");
            }
            try (OutputStream out = cr.openOutputStream(uri, "wt")) {
                if (out == null) throw new IllegalStateException("No output stream");
                out.write(data);
            }
            return new Saved(uri, WidgetShared.tr(c, "Pobrane/", "Download/") + ROOT + "/" + dir.path + "/" + name);
        }
        File folder = legacyDir(c, dir);
        File f = new File(folder, name);
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(data);
        }
        Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", f);
        return new Saved(uri, f.getAbsolutePath());
    }

    private static File legacyDir(Context c, Dir dir) {
        File f = new File(new File(c.getExternalFilesDir(null), ROOT), dir.path);
        if (!f.exists() && !f.mkdirs()) throw new IllegalStateException("Cannot create " + f);
        return f;
    }

    /** A file with this name that this install created (other installs' files aren't visible/writable). */
    private static Uri findOwn(ContentResolver cr, Uri collection, String name, String rel) {
        String sel = MediaStore.Downloads.DISPLAY_NAME + "=? AND " + MediaStore.Downloads.RELATIVE_PATH + "=?";
        try (Cursor cur = cr.query(collection, new String[]{MediaStore.Downloads._ID}, sel,
                new String[]{name, rel}, null)) {
            if (cur != null && cur.moveToFirst()) {
                return ContentUris.withAppendedId(collection, cur.getLong(0));
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    // ------------------------------------------------------------------ daily copy

    static String lastAuto(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAST_AUTO, "");
    }

    /** Once a day (on any alarm tick): szpila-auto-<date>.json, then prune to the last 14. */
    static void autoBackupIfDue(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String today = WidgetShared.today();
        if (today.equals(p.getString(KEY_LAST_AUTO, ""))) return;
        org.json.JSONObject s = WidgetShared.state(c).optJSONObject("settings");
        if (s != null && !s.optBoolean("autoBackup", true)) return;
        String json = WidgetShared.prefs(c).getString(BACKUP_KEY, null);
        if (json == null || json.isEmpty()) return;
        try {
            write(c, Dir.AUTO, autoName(today), json, "application/json");
            p.edit().putString(KEY_LAST_AUTO, today).apply();
            pruneAuto(c);
        } catch (Exception ignored) {
        }
    }

    private static void pruneAuto(Context c) {
        List<String> names = new ArrayList<>();
        for (Entry e : list(c)) if (e.auto) names.add(e.name);
        List<String> drop = autoToPrune(names, AUTO_KEEP);
        if (drop.isEmpty()) return;
        for (Entry e : list(c)) if (e.auto && drop.contains(e.name)) delete(c, e.id);
    }

    // ------------------------------------------------------------------ list / read / delete

    /** Own backups, newest first: Kopie (saved by you) and Kopie/Automatyczne (daily). */
    static List<Entry> list(Context c) {
        migrateOnce(c);
        List<Entry> out = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = c.getContentResolver();
            Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            String[] cols = {MediaStore.Downloads._ID, MediaStore.Downloads.DISPLAY_NAME,
                MediaStore.Downloads.RELATIVE_PATH, MediaStore.Downloads.SIZE, MediaStore.Downloads.DATE_MODIFIED};
            String sel = MediaStore.Downloads.RELATIVE_PATH + " IN (?, ?)";
            try (Cursor cur = cr.query(collection, cols, sel,
                    new String[]{relPath(Dir.MANUAL), relPath(Dir.AUTO)}, null)) {
                while (cur != null && cur.moveToNext()) {
                    String name = cur.getString(1);
                    if (name == null || !name.toLowerCase(Locale.ROOT).endsWith(".json")) continue;
                    Uri uri = ContentUris.withAppendedId(collection, cur.getLong(0));
                    out.add(new Entry(uri.toString(), name, relPath(Dir.AUTO).equals(cur.getString(2)),
                        cur.getLong(3), cur.getLong(4) * 1000L));
                }
            } catch (Exception ignored) {
            }
        } else {
            for (Dir d : new Dir[]{Dir.MANUAL, Dir.AUTO}) {
                File[] files = legacyDir(c, d).listFiles();
                if (files == null) continue;
                for (File f : files) {
                    if (!f.isFile() || !f.getName().toLowerCase(Locale.ROOT).endsWith(".json")) continue;
                    out.add(new Entry(Uri.fromFile(f).toString(), f.getName(), d == Dir.AUTO, f.length(), f.lastModified()));
                }
            }
        }
        out.sort((a, b) -> Long.compare(b.modified, a.modified));
        return out;
    }

    /** Only ids we listed ourselves are accepted (content:// in Downloads or our own files). */
    private static boolean ownId(Context c, String id) {
        for (Entry e : list(c)) if (e.id.equals(id)) return true;
        return false;
    }

    static String read(Context c, String id) throws Exception {
        if (!ownId(c, id)) throw new IllegalArgumentException("Unknown backup");
        Uri uri = Uri.parse(id);
        try (InputStream in = "file".equals(uri.getScheme())
                ? new FileInputStream(new File(uri.getPath()))
                : c.getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("No input stream");
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) buf.write(b, 0, n);
            return buf.toString("UTF-8");
        }
    }

    static boolean delete(Context c, String id) {
        try {
            Uri uri = Uri.parse(id);
            if ("file".equals(uri.getScheme())) return new File(uri.getPath()).delete();
            return c.getContentResolver().delete(uri, null, null) > 0;
        } catch (Exception e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ one-time sorting

    /**
     * Sorts the old flat Download/Szpila (and Download/Loop) files into the new folders, once:
     * CSVs into Eksport, the weekday copies into Kopie/Automatyczne renamed by their date
     * (szpila-kopia-pon.json -> szpila-auto-2026-11-09.json), every other JSON into Kopie.
     * Only files this install created are visible to it; the rest stay where they are.
     */
    static synchronized void migrateOnce(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (p.getBoolean(KEY_MIGRATED, false)) return;
        try {
            if (Build.VERSION.SDK_INT >= 29) migrateMediaStore(c);
            else migrateLegacy(c);
        } catch (Exception ignored) {
        }
        p.edit().putBoolean(KEY_MIGRATED, true).apply();
    }

    private static void migrateMediaStore(Context c) {
        ContentResolver cr = c.getContentResolver();
        Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String[] cols = {MediaStore.Downloads._ID, MediaStore.Downloads.DISPLAY_NAME, MediaStore.Downloads.DATE_MODIFIED};
        String sel = MediaStore.Downloads.RELATIVE_PATH + " IN (?, ?)";
        String[] args = {DOWNLOADS + "/" + ROOT + "/", DOWNLOADS + "/Loop/"};
        List<String> taken = new ArrayList<>();
        try (Cursor cur = cr.query(collection, cols, sel, args, null)) {
            while (cur != null && cur.moveToNext()) {
                String name = cur.getString(1);
                Dir target = migrationTarget(name);
                if (target == null) continue;
                String newName = name;
                if (target == Dir.AUTO) {
                    newName = autoName(dateOf(cur.getLong(2) * 1000L));
                    if (taken.contains(newName)) newName = name; // two copies of one day: keep the old name
                    taken.add(newName);
                }
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.RELATIVE_PATH, relPath(target));
                v.put(MediaStore.Downloads.DISPLAY_NAME, newName);
                try {
                    cr.update(ContentUris.withAppendedId(collection, cur.getLong(0)), v, null, null);
                } catch (Exception ignored) {
                }
            }
        }
    }

    private static void migrateLegacy(Context c) {
        File root = new File(c.getExternalFilesDir(null), ROOT);
        File[] files = root.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (!f.isFile()) continue;
            Dir target = migrationTarget(f.getName());
            if (target == null) continue;
            String name = target == Dir.AUTO ? autoName(dateOf(f.lastModified())) : f.getName();
            File dest = new File(legacyDir(c, target), name);
            if (!dest.exists()) //noinspection ResultOfMethodCallIgnored
                f.renameTo(dest);
        }
    }
}
