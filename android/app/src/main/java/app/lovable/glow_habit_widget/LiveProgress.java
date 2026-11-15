package app.lovable.glow_habit_widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The "Postęp dnia" notification as an Android 16+ Live Update (promoted, on the lock screen
 * and as a status bar chip, like Duolingo's): pure data, no Android types, so JVM-testable
 * (LiveProgressTest). HabitNotifier turns it into a NotificationCompat.ProgressStyle.
 *
 * The bar has one segment per habit that counts today, ordered most complete first, and the
 * fill is the sum of fractions - so the filled part lines up with the habits actually done
 * (6000/8000 steps fills three quarters of its segment), not just a total.
 */
final class LiveProgress {
    /** Bar units per habit (ProgressStyle's max = units * habits). */
    static final int UNITS = 100;

    private LiveProgress() {}

    /** One bar segment: a habit's colour (ARGB) and how far it got (0..1). */
    static final class Seg {
        final String id;
        final int color;
        final float fraction;

        Seg(String id, int color, float fraction) {
            this.id = id;
            this.color = color;
            this.fraction = fraction;
        }
    }

    /** Counted rows as segments, most complete first (stable for equal fractions). */
    static List<Seg> segments(JSONArray rows) {
        List<Seg> out = new ArrayList<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject h = rows.optJSONObject(i);
            if (h == null || !WidgetShared.counts(h)) continue;
            int color = WidgetShared.isAvoid(h) ? WidgetShared.AVOID : WidgetShared.color(h);
            out.add(new Seg(h.optString("id"), color, WidgetShared.fraction(h)));
        }
        // insertion sort keeps the snapshot (plan) order among equals
        for (int i = 1; i < out.size(); i++) {
            Seg s = out.get(i);
            int j = i - 1;
            while (j >= 0 && out.get(j).fraction < s.fraction) {
                out.set(j + 1, out.get(j));
                j--;
            }
            out.set(j + 1, s);
        }
        return out;
    }

    /** Bar maximum for these segments. */
    static int max(List<Seg> segs) {
        return Math.max(1, segs.size()) * UNITS;
    }

    /** Bar position: the sum of fractions, in units. */
    static int progress(List<Seg> segs) {
        float sum = 0f;
        for (Seg s : segs) sum += Math.max(0f, Math.min(1f, s.fraction));
        return Math.round(sum * UNITS);
    }

    /** Today's percent from the same sum (matches the app and the widgets). */
    static int percent(List<Seg> segs) {
        return segs.isEmpty() ? 0 : Math.round(100f * progress(segs) / max(segs));
    }

    /** Status bar chip: short, the system shows at most ~7 characters. */
    static String chip(int percent) {
        return Math.max(0, Math.min(100, percent)) + "%";
    }

    /** Title: the next task, with how far it got, e.g. "Teraz: Ruch 30 min (10/30 min)". */
    static String title(JSONObject next, String amount, boolean en) {
        String name = next.optString("name");
        return (en ? "Now: " : "Teraz: ") + name + (amount == null || amount.isEmpty() ? "" : " (" + amount + ")");
    }

    /** Text under it: "Dziś 1/8 · 17% · potem: Czytanie · ⏳ 2 h 52 min do końca dnia". */
    static String text(int done, int total, int percent, String then, String timeLeft, boolean en) {
        StringBuilder sb = new StringBuilder((en ? "Today " : "Dziś ") + done + "/" + total + " · " + percent + "%");
        if (then != null && !then.isEmpty()) sb.append(en ? " · then: " : " · potem: ").append(then);
        if (timeLeft != null && !timeLeft.isEmpty()) sb.append(" · ").append(timeLeft);
        return sb.toString();
    }
}
