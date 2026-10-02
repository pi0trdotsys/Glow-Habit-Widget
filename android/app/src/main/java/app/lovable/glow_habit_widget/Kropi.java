package app.lovable.glow_habit_widget;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Water from "Kropi - Nawodnienie" (com.kropi.hydration, the user's own app,
 * same signing key). Kropi exports its days through a read-only provider
 * guarded by a signature permission and broadcasts every change to Szpila
 * (KropiReceiver); habits with source "kropi" count millilitres from it, and
 * logging water from Szpila opens Kropi's quick add instead (kropi://add), so
 * there's one place to log.
 */
final class Kropi {
    static final String PKG = "com.kropi.hydration";
    static final String PERMISSION = "com.kropi.hydration.permission.READ_HYDRATION";
    static final String ACTION_CHANGED = "com.kropi.hydration.action.HYDRATION_CHANGED";
    /** Strings, not Uris: Uri.parse in a static field breaks the JVM unit tests. */
    static final String DAYS = "content://com.kropi.hydration.export/days";
    static final String TODAY = "content://com.kropi.hydration.export/today";
    static final String SOURCE = "kropi";

    private Kropi() {}

    /** One day from Kropi. */
    static final class Day {
        final String date;
        final int ml;
        final int goal;

        Day(String date, int ml, int goal) {
            this.date = date;
            this.ml = ml;
            this.goal = goal;
        }
    }

    static boolean installed(Context c) {
        try {
            c.getPackageManager().getPackageInfo(PKG, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** Installed and the signature permission granted (same signing key). */
    static boolean granted(Context c) {
        return installed(c) && c.checkSelfPermission(PERMISSION) == PackageManager.PERMISSION_GRANTED;
    }

    /** Today first, then earlier days (newest first). Empty when unavailable. */
    static List<Day> days(Context c) {
        List<Day> out = new ArrayList<>();
        if (!granted(c)) return out;
        try (Cursor cur = c.getContentResolver().query(Uri.parse(DAYS), null, null, null, null)) {
            if (cur == null) return out;
            int d = cur.getColumnIndex("date"), m = cur.getColumnIndex("ml"), g = cur.getColumnIndex("goal");
            while (cur.moveToNext()) {
                if (d < 0 || m < 0) break;
                out.add(new Day(cur.getString(d), cur.getInt(m), g >= 0 ? cur.getInt(g) : 0));
            }
        } catch (Exception ignored) {
            // Kropi too old (no provider) or not reachable: nothing
        }
        return out;
    }

    static Day today(Context c) {
        for (Day d : days(c)) if (WidgetShared.today().equals(d.date)) return d;
        return null;
    }

    /** Kropi's quick add (adds the default glass and closes). */
    static Intent addIntent() {
        return new Intent(Intent.ACTION_VIEW, Uri.parse("kropi://add")).setPackage(PKG)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    static boolean quickAdd(Context c) {
        try {
            c.startActivity(addIntent());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static boolean isKropi(JSONObject row) {
        return row != null && SOURCE.equals(row.optString("source"));
    }

    /**
     * Apply Kropi's day to a snapshot row of a "kropi" habit (pure, tested):
     * millilitres become the amount, Kropi's goal the target. False when the
     * row isn't Kropi's, the day isn't the row's, or nothing changed.
     */
    static boolean applyTo(JSONObject row, String rowDate, Day day) {
        if (!isKropi(row) || day == null || !day.date.equals(rowDate)) return false;
        try {
            int target = day.goal > 0 ? day.goal : row.optInt("target", 1);
            int amount = Math.max(0, day.ml);
            if (row.optInt("amount", 0) == amount && row.optInt("target", 0) == target) return false;
            row.put("amount", amount);
            row.put("target", target);
            row.put("done", amount >= target);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
