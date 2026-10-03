package app.lovable.glow_habit_widget;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * The phone's calendars (READ_CALENDAR): every account synced to the Android
 * calendar provider shows up here - Google, Google Workspace, Exchange via
 * Outlook's "Sync calendars", Samsung, local calendars... The user picks some
 * in Settings (snapshot "calendar": { ids, quiet, windows }); their busy
 * instances keep Szpila quiet during meetings and feed the "free window" hint.
 * The math is in CalendarMath (pure, JVM-tested).
 */
final class CalendarBusy {
    private CalendarBusy() {}

    /** One calendar for the Settings list. */
    static final class Cal {
        String id, name, accountName, accountType, color;
        boolean visible;
    }

    /** One instance (epoch ms) for the app. */
    static final class Instance {
        long begin, end;
        boolean allDay, declined;
        int availability;
        String calendarId, title;
    }

    static boolean granted(Context c) {
        return c.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    /** All calendars on the phone (any account), or an empty list without the permission. */
    static List<Cal> calendars(Context c) {
        List<Cal> out = new ArrayList<>();
        if (!granted(c)) return out;
        String[] proj = {
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.ACCOUNT_TYPE,
            CalendarContract.Calendars.CALENDAR_COLOR,
            CalendarContract.Calendars.VISIBLE,
        };
        try (Cursor cur = c.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, proj, null, null,
            CalendarContract.Calendars.ACCOUNT_NAME + " ASC, " + CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC")) {
            if (cur == null) return out;
            while (cur.moveToNext()) {
                Cal k = new Cal();
                k.id = String.valueOf(cur.getLong(0));
                k.name = str(cur, 1);
                k.accountName = str(cur, 2);
                k.accountType = str(cur, 3);
                k.color = String.format(Locale.US, "#%06x", cur.getInt(4) & 0xFFFFFF);
                k.visible = cur.getInt(5) != 0;
                out.add(k);
            }
        } catch (Exception ignored) {
            // SecurityException (permission revoked) or a broken provider
        }
        return out;
    }

    /** Instances of the given calendars overlapping [fromMs, toMs); cancelled ones left out. */
    static List<Instance> instances(Context c, List<String> ids, long fromMs, long toMs) {
        List<Instance> out = new ArrayList<>();
        if (ids.isEmpty() || !granted(c)) return out;
        Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, fromMs);
        ContentUris.appendId(b, toMs);
        String[] proj = {
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.AVAILABILITY,
            CalendarContract.Instances.CALENDAR_ID,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.SELF_ATTENDEE_STATUS,
            CalendarContract.Instances.STATUS,
        };
        StringBuilder sel = new StringBuilder(CalendarContract.Instances.CALENDAR_ID + " IN (");
        String[] args = new String[ids.size()];
        for (int i = 0; i < ids.size(); i++) {
            sel.append(i == 0 ? "?" : ",?");
            args[i] = ids.get(i);
        }
        sel.append(")");
        ContentResolver cr = c.getContentResolver();
        try (Cursor cur = cr.query(b.build(), proj, sel.toString(), args, CalendarContract.Instances.BEGIN + " ASC")) {
            if (cur == null) return out;
            while (cur.moveToNext()) {
                if (!cur.isNull(7) && cur.getInt(7) == CalendarContract.Events.STATUS_CANCELED) continue;
                Instance in = new Instance();
                in.begin = cur.getLong(0);
                in.end = cur.getLong(1);
                in.allDay = cur.getInt(2) != 0;
                in.availability = cur.isNull(3) ? CalendarMath.AVAIL_BUSY : cur.getInt(3);
                in.calendarId = String.valueOf(cur.getLong(4));
                in.title = str(cur, 5);
                in.declined = !cur.isNull(6)
                    && cur.getInt(6) == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED;
                out.add(in);
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private static String str(Cursor cur, int i) {
        String s = cur.isNull(i) ? null : cur.getString(i);
        return s != null ? s : "";
    }

    // ------------------------------------------------------------------
    // Snapshot settings + today's busy intervals for the notifier
    // ------------------------------------------------------------------

    static JSONObject settings(Context c) {
        JSONObject s = WidgetShared.state(c).optJSONObject("calendar");
        return s != null ? s : new JSONObject();
    }

    static List<String> ids(JSONObject cal) {
        List<String> out = new ArrayList<>();
        JSONArray a = cal.optJSONArray("ids");
        if (a != null) for (int i = 0; i < a.length(); i++) {
            String id = a.optString(i, "");
            if (!id.isEmpty()) out.add(id);
        }
        return out;
    }

    /** "Nie szpiluj w trakcie spotkań" is on and calendars are picked. */
    static boolean quietOn(Context c) {
        JSONObject s = settings(c);
        return s.optBoolean("quiet", true) && !ids(s).isEmpty();
    }

    /** "Podpowiadaj wolne okna" is on and calendars are picked. */
    static boolean windowsOn(Context c) {
        JSONObject s = settings(c);
        return s.optBoolean("windows", true) && !ids(s).isEmpty();
    }

    private static final int[][] NONE = new int[0][];
    private static final long CACHE_MS = 60_000;
    private static int[][] cached = NONE;
    private static String cachedKey = "";
    private static long cachedAt = 0;

    /**
     * Merged busy intervals of the picked calendars from yesterday 00:00 to
     * tomorrow 24:00, in minutes from today's midnight (cached for a minute -
     * scheduleNext runs on every widget refresh).
     */
    static synchronized int[][] busyToday(Context c) {
        JSONObject s = settings(c);
        List<String> ids = ids(s);
        if (ids.isEmpty() || !granted(c)) return NONE;
        Calendar mid = Calendar.getInstance();
        mid.set(Calendar.HOUR_OF_DAY, 0);
        mid.set(Calendar.MINUTE, 0);
        mid.set(Calendar.SECOND, 0);
        mid.set(Calendar.MILLISECOND, 0);
        long midnight = mid.getTimeInMillis();
        String key = midnight + "|" + ids + "|" + s.optBoolean("allDay", false);
        long now = System.currentTimeMillis();
        if (key.equals(cachedKey) && now - cachedAt < CACHE_MS) return cached;
        List<CalendarMath.Event> events = new ArrayList<>();
        for (Instance in : instances(c, ids, midnight - 86_400_000L, midnight + 2 * 86_400_000L)) {
            events.add(new CalendarMath.Event(
                (int) Math.floorDiv(in.begin - midnight, 60_000L),
                (int) -Math.floorDiv(-(in.end - midnight), 60_000L),
                in.allDay, in.availability, in.declined));
        }
        cached = CalendarMath.busy(events, s.optBoolean("allDay", false), true);
        cachedKey = key;
        cachedAt = now;
        return cached;
    }

    /** Busy intervals for the jab decision: none when the toggle is off. */
    static int[][] quietBusy(Context c) {
        try {
            return quietOn(c) ? busyToday(c) : NONE;
        } catch (Exception e) {
            return NONE;
        }
    }

    /**
     * "Okno" hint for a jab about a minutes habit: "Masz 18:10–18:50 wolne -
     * idealne na 30 min." when a free window fits what's left today, or null.
     */
    static String windowHint(Context c, JSONObject row, int now, int until) {
        if (row == null || !"minutes".equals(row.optString("goal")) || WidgetShared.isAvoid(row)) return null;
        if (!windowsOn(c)) return null;
        int need = WidgetShared.target(row) - WidgetShared.amount(row);
        if (need <= 0) return null;
        int[] hit;
        try {
            hit = CalendarMath.fit(busyToday(c), now, until, new int[]{need});
        } catch (Exception e) {
            return null;
        }
        if (hit == null) return null;
        return hintText(hit[1], hit[2], need, now, WidgetShared.en(c));
    }

    /** Pure: the hint sentence. */
    static String hintText(int start, int end, int need, int now, boolean en) {
        String b = CalendarMath.hhmm(end);
        if (start <= now) {
            return en ? "You're free until " + b + " - perfect for " + need + " min."
                : "Teraz masz wolne do " + b + " - idealne na " + need + " min.";
        }
        String a = CalendarMath.hhmm(start);
        return en ? "You're free " + a + "–" + b + " - perfect for " + need + " min."
            : "Masz " + a + "–" + b + " wolne - idealne na " + need + " min.";
    }
}
