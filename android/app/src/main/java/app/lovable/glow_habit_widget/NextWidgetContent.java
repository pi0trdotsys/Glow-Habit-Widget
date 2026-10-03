package app.lovable.glow_habit_widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/**
 * What the "Następne zadanie" widget shows - pure logic, no Android (NextWidgetTest).
 * NextTaskWidgetProvider gathers the inputs (snapshot, planner, guard state)
 * and paints the result into the 1x1 or the wide (2x1+) layout.
 *
 * Special states win over the normal one, in this order: morning lock >
 * over the daily social limit > bedtime countdown / night guard > all done >
 * normal. In the normal and the all-done state the wide layout's third line
 * is a "ticker" that rotates through the lines that apply right now (a jab
 * for the habit, forma streak, today's progress, time left, social minutes,
 * the habit after next); a tap on the cat advances it. Only the lines chosen
 * for this widget in WidgetConfigActivity (Inputs.lines, WidgetPrefs) take part;
 * the special states' banners are never filtered.
 */
final class NextWidgetContent {
    enum Mode { EMPTY, NORMAL, ALL_DONE, NIGHT, BEDTIME, OVER_LIMIT, MORNING_LOCK }

    /** Cat moods (SzpilaWidgetProvider.catDrawable). */
    static final int SMUG = 0, ANGRY = 1, IMPRESSED = 2;

    static final int C_ACCENT = WidgetShared.ACCENT;
    static final int C_RED = WidgetShared.AVOID;
    static final int C_TEXT = WidgetShared.TEXT;
    static final int C_AMBER = 0xFFFFB547;
    static final int C_LOCK = 0xFFB69CFF;
    static final int C_NIGHT = 0xFF8EA2FF;
    static final int C_MUTED = 0xFFA9AFBF;
    static final int C_JAB = 0xFFD5D8E2;

    /** Ticker slots change every this many minutes (plus one per tap on the cat). */
    static final int SLOT_MIN = 15;

    private NextWidgetContent() {}

    /** Everything the widget depends on, as plain values. */
    static final class Inputs {
        boolean en;
        int now;
        /** Pending rows in plan order (WidgetShared.plan). */
        List<JSONObject> plan = new ArrayList<>();
        /** All of today's rows (snapshot "habits"). */
        int total;
        /** Rows counting toward today's totals and done ones (WidgetShared.countedTotal / doneCount). */
        int counted;
        int done;
        /** Morning lock active and the habits it still waits for (in settings order). */
        boolean morningLock;
        List<JSONObject> morningPending = new ArrayList<>();
        /** Daily social media limit on (DayGuard.config().day), today's minutes, the limit. */
        boolean dayLimitOn;
        int usedMin;
        int limitMin;
        boolean overLimit;
        /** "Bank minut": the limit is earned (limitMin = the bank today); minutes per habit. */
        boolean bank;
        int bankPerHabit = DayGuard.BANK_PER_HABIT;
        /** Minutes to the deadline while the bedtime countdown runs, else -1. */
        int bedtimeLeft = -1;
        int deadline;
        /** Night guard running after the deadline (DayGuard NIGHT, not the countdown). */
        boolean night;
        int nightEnd = ScreenTime.NIGHT_END;
        int formaCurrent;
        int formaBest;
        /** "groomed" | "normal" | "neglected". */
        String cond = "normal";
        /** Snapshot "allDone" lines. */
        JSONArray allDoneLines;
        /** Ticker taps (the cat) - shifts the rotation. */
        int taps;
        /** Ticker lines this widget shows (WidgetPrefs, chosen in WidgetConfigActivity); null = all. */
        Set<String> lines;
    }

    /** One ticker / banner line. */
    static final class Line {
        final String kind;
        final String text;
        final int color;

        Line(String kind, String text, int color) {
            this.kind = kind;
            this.text = text;
            this.color = color;
        }

        @Override
        public String toString() {
            return kind + ":" + text;
        }
    }

    /** The result the provider paints. */
    static final class Content {
        Mode mode;
        /** The habit behind the ring (hold-to-complete), null = the ring just opens the app. */
        JSONObject main;
        /** Icon name for the ring when there's no main habit ("Trophy", "Sparkles", "Moon"). */
        String icon;
        int ringColor;
        float ringFraction;
        boolean ringDashed;
        String name;
        /** 1x1 name when it differs from `name` (the old "Komplet!"), else null. */
        String smallName;
        /** Wide status line ("3/8 szklanek · za 20 min") and its colour. */
        String status;
        int statusColor;
        /** 1x1 sub line - same as the widget always had. */
        String smallSub;
        int smallSubColor;
        /** Third line (wide): the special banner or the current ticker line. */
        Line line;
        /** Every line the ticker cycles through (empty in special states). */
        List<Line> ticker = Collections.emptyList();
        /** Cat mood after the condition rule (SzpilaWidgetProvider.condMood). */
        int mood;
    }

    // ------------------------------------------------------------------ guard flags

    /**
     * Which guard states apply (sets morningLock / overLimit / bedtimeLeft / night on `in`).
     * `phase` is DayGuard's; `nightStart` = LiveGuard.start, `deadline` = LiveGuard.from.
     */
    static void guard(Inputs in, int phase, int morningPendingCount, boolean dayOn, int used, int limit,
                      boolean nightOn, boolean bedtimeOn, int nightStart, int deadline, int nightEnd) {
        in.dayLimitOn = dayOn;
        in.usedMin = used;
        in.limitMin = limit;
        in.deadline = deadline;
        in.nightEnd = nightEnd;
        in.morningLock = phase == DayGuard.MORNING && morningPendingCount > 0;
        // Bank mode: an empty bank counts too (social media has to be earned first).
        in.overLimit = phase == DayGuard.DAY && dayOn && (limit > 0 || in.bank) && used >= limit;
        boolean countdown = nightOn && bedtimeOn && LiveGuard.prePhase(in.now, nightStart, deadline);
        in.bedtimeLeft = countdown ? LiveGuard.minutesTo(in.now, deadline) : -1;
        in.night = phase == DayGuard.NIGHT && !countdown;
    }

    static Mode mode(Inputs in) {
        if (in.morningLock && !in.morningPending.isEmpty()) return Mode.MORNING_LOCK;
        if (in.overLimit) return Mode.OVER_LIMIT;
        if (in.bedtimeLeft >= 0) return Mode.BEDTIME;
        if (in.night) return Mode.NIGHT;
        if (in.total == 0) return Mode.EMPTY;
        if (in.plan.isEmpty()) return Mode.ALL_DONE;
        return Mode.NORMAL;
    }

    // ------------------------------------------------------------------ build

    static Content build(Inputs in) {
        Content c = new Content();
        c.mode = mode(in);
        boolean en = in.en;
        JSONObject next = in.plan.isEmpty() ? null : in.plan.get(0);
        int mood = SMUG;

        switch (c.mode) {
            case MORNING_LOCK:
                habit(c, in.morningPending.get(0), in);
                c.line = new Line("lock", (en ? "🔒 First: " : "🔒 Najpierw: ") + DayGuard.names(in.morningPending), C_LOCK);
                mood = ANGRY;
                break;
            case OVER_LIMIT:
                if (next != null) habit(c, next, in); else done(c, in);
                c.line = in.bank
                    ? new Line("limit", en ? "💰 Bank empty · +" + in.bankPerHabit + " min per habit"
                        : "💰 Bank pusty · +" + in.bankPerHabit + " min za zadanie", C_RED)
                    : new Line("limit", "📱 " + in.usedMin + "/" + in.limitMin + " min · "
                        + (en ? "limit exceeded" : "limit przekroczony"), C_RED);
                mood = ANGRY;
                break;
            case BEDTIME:
                if (next != null) habit(c, next, in);
                else {
                    done(c, in);
                    c.icon = "Moon";
                    c.ringColor = C_NIGHT;
                }
                c.line = new Line("bedtime", en
                    ? "🌙 " + WidgetShared.fmtMinute(in.deadline) + " in " + span(in.bedtimeLeft) + " · phone down"
                    : "🌙 Za " + span(in.bedtimeLeft) + " " + WidgetShared.fmtMinute(in.deadline) + " · odkładaj telefon",
                    C_NIGHT);
                break;
            case NIGHT:
                c.icon = "Moon";
                c.ringColor = C_NIGHT;
                c.ringFraction = 0f;
                c.name = en ? "Good night" : "Dobranoc";
                c.status = (en ? "no phone until " : "bez telefonu do ") + WidgetShared.fmtMinute(in.nightEnd);
                c.statusColor = C_NIGHT;
                c.smallSub = c.status;
                c.smallSubColor = C_NIGHT;
                c.line = new Line("night", en ? "🌙 Szpila's on guard · sleep" : "🌙 Szpila czuwa · śpij", C_NIGHT);
                break;
            case ALL_DONE:
                done(c, in);
                c.ticker = allDoneTicker(in);
                mood = IMPRESSED;
                break;
            case EMPTY:
                c.icon = "Sparkles";
                c.ringColor = C_ACCENT;
                c.ringFraction = 0f;
                c.name = "Szpila";
                c.status = en ? "add habits" : "dodaj zadania";
                c.statusColor = C_ACCENT;
                c.smallSub = c.status;
                c.smallSubColor = C_ACCENT;
                c.line = new Line("empty", en ? "😼 Add habits and I'll start picking on you."
                    : "😼 Dodaj zadania, a zacznę się czepiać.", C_JAB);
                break;
            default:
                habit(c, next, in);
                c.ticker = normalTicker(in, next);
                int late = in.now - dueAt(next, in.now);
                int pct = percent(in.done, in.counted);
                mood = late >= 60 && !WidgetShared.isAvoid(next) ? ANGRY : pct >= 75 ? IMPRESSED : SMUG;
        }
        if (c.line == null && !c.ticker.isEmpty()) {
            c.line = c.ticker.get(tickerIndex(in.now, in.taps, c.ticker.size()));
        }
        c.mood = SzpilaWidgetProvider.condMood(in.cond, mood);
        return c;
    }

    /** Ring, name and status lines for a habit. */
    private static void habit(Content c, JSONObject h, Inputs in) {
        c.main = h;
        boolean avoid = WidgetShared.isAvoid(h);
        c.ringColor = colorOf(h);
        c.ringFraction = WidgetShared.fraction(h);
        c.ringDashed = avoid;
        c.name = h.optString("name", "");
        int at = dueAt(h, in.now);
        c.smallSub = smallSub(h, at, in.now, in.en);
        c.smallSubColor = avoid || at - in.now <= 0 ? C_RED : C_ACCENT;
        c.status = wideStatus(h, at, in.now, in.en);
        c.statusColor = statusColor(h, at, in.now);
    }

    /** All done: full ring + trophy, the streak in the status line. */
    private static void done(Content c, Inputs in) {
        boolean en = in.en;
        c.icon = in.total > 0 ? "Trophy" : "Sparkles";
        c.ringColor = C_ACCENT;
        c.ringFraction = in.total > 0 ? 1f : 0f;
        c.name = en ? "All done 🎉" : "Komplet 🎉";
        c.smallName = en ? "All done!" : "Komplet!";
        c.status = in.formaCurrent > 0 ? forma(in.formaCurrent, 0, en)
            : in.counted + "/" + in.counted + (en ? " today" : " na dziś");
        c.statusColor = in.formaCurrent > 0 ? C_AMBER : C_ACCENT;
        c.smallSub = en ? "everything's done" : "wszystko zrobione";
        c.smallSubColor = C_ACCENT;
    }

    /**
     * Colour of a row without android.graphics.Color (so this class stays pure):
     * "#rrggbb" / "#aarrggbb" (default mint like WidgetShared.color), falls back to the accent.
     */
    static int colorOf(JSONObject h) {
        String s = h.optString("colorHex", "#59e0ad");
        try {
            if (s.startsWith("#") && s.length() == 7) return 0xFF000000 | Integer.parseInt(s.substring(1), 16);
            if (s.startsWith("#") && s.length() == 9) return (int) Long.parseLong(s.substring(1), 16);
        } catch (NumberFormatException ignored) {
        }
        return C_ACCENT;
    }

    // ------------------------------------------------------------------ texts

    /** WidgetShared.nextMinute(h) with an explicit `now`. */
    static int dueAt(JSONObject h, int now) {
        int start = h.optInt("start", 12 * 60);
        if (WidgetShared.isAvoid(h)) return start;
        return WidgetShared.nextMinute(start, h.optInt("end", start), Math.max(1, h.optInt("units", 1)),
            WidgetShared.amount(h) / WidgetShared.step(h), now);
    }

    /** The 1x1 sub line, exactly as before: "potwierdź · o 21:00", the amount, or when. */
    static String smallSub(JSONObject h, int at, int now, boolean en) {
        String when = WidgetShared.whenLabel(at, now, en);
        if (WidgetShared.isAvoid(h)) return (en ? "confirm · " : "potwierdź · ") + when;
        String amount = WidgetShared.amountText(h);
        return amount.isEmpty() ? when : amount;
    }

    /** "za 20 min", "o 17:30", "teraz", "spóźnione 40 min" (and English). */
    static String when(int at, int now, boolean en) {
        int d = at - now;
        if (d <= -30) return en ? span(-d) + " late" : "spóźnione " + span(-d);
        return WidgetShared.whenLabel(at, now, en);
    }

    /**
     * Compact "when" for the 2x1 status (the red colour already says "late"):
     * "⏰ 40 min", "⏰ 3 h"; otherwise the usual "za 20 min" / "o 17:30" / "teraz".
     */
    static String whenShort(int at, int now, boolean en) {
        int d = at - now;
        if (d <= -30) {
            int late = -d;
            return "⏰ " + (late < 60 ? late + " min" : (late + 30) / 60 + " h");
        }
        return WidgetShared.whenLabel(at, now, en);
    }

    /** Wide status: the amount and when; urgent first so the ellipsis never eats the delay. */
    static String wideStatus(JSONObject h, int at, int now, boolean en) {
        String when = whenShort(at, now, en);
        if (WidgetShared.isAvoid(h)) return (en ? "confirm · " : "potwierdź · ") + when;
        String amount = WidgetShared.amountText(h);
        if (amount.isEmpty()) return when;
        return at - now <= 0 ? when + " · " + amount : amount + " · " + when;
    }

    /** Red when overdue (or a forbidden habit to confirm), amber when due now, else the accent. */
    static int statusColor(JSONObject h, int at, int now) {
        int d = at - now;
        if (WidgetShared.isAvoid(h) || d <= -30) return C_RED;
        if (d <= 0) return C_AMBER;
        return C_ACCENT;
    }

    /** "25 min", "1 h", "1 h 5 min". */
    static String span(int min) {
        min = Math.max(0, min);
        int h = min / 60, m = min % 60;
        if (h == 0) return m + " min";
        return m == 0 ? h + " h" : h + " h " + m + " min";
    }

    static int percent(int done, int total) {
        return total <= 0 ? 0 : Math.round(done * 100f / total);
    }

    /** "🔥 Forma: 5 dni (rekord 9)" / "🔥 5-day streak (best 9)". */
    static String forma(int current, int best, boolean en) {
        String rec = best > current ? (en ? " (best " + best + ")" : " (rekord " + best + ")") : "";
        if (en) return "🔥 " + current + "-day streak" + rec;
        return "🔥 Forma: " + current + (current == 1 ? " dzień" : " dni") + rec;
    }

    /** "⏳ 6 h do końca dnia" (whole hours; minutes in the last hour). */
    static String timeLeft(int now, boolean en) {
        int left = Math.max(0, 24 * 60 - now);
        String s = left >= 60 ? (left / 60) + " h" : left + " min";
        return "⏳ " + s + (en ? " left today" : " do końca dnia");
    }

    static String social(int used, int limit, boolean en) {
        return "📱 " + used + "/" + limit + " min " + (en ? "social media" : "social mediów");
    }

    /** The ticker's social line in bank mode: what's left in the minute bank. */
    static String bankLine(int used, int limit, boolean en) {
        return "💰 " + Math.max(0, limit - used) + " min " + (en ? "in the bank" : "w banku");
    }

    /** The "social" ticker line (null = none: the limit is off). */
    static Line socialLine(Inputs in) {
        if (!in.dayLimitOn || (in.limitMin <= 0 && !in.bank)) return null;
        int ls = DayGuard.limitState(in.usedMin, in.limitMin, in.bank);
        return new Line("social", in.bank ? bankLine(in.usedMin, in.limitMin, in.en) : social(in.usedMin, in.limitMin, in.en),
            ls == DayGuard.LIMIT_OK ? C_NIGHT : C_AMBER);
    }

    // ------------------------------------------------------------------ ticker

    /** The rotation counter: a new slot every SLOT_MIN minutes, one step per tap. */
    static long slot(int now, int taps) {
        return (long) Math.max(0, now) / SLOT_MIN + Math.max(0, taps);
    }

    /** Deterministic rotation over `n` lines. */
    static int tickerIndex(int now, int taps, int n) {
        if (n <= 0) return 0;
        return (int) (slot(now, taps) % n);
    }

    /** How many full ticker cycles passed - picks a fresh jab each time the jab slot comes round. */
    static int round(int now, int taps, int n) {
        return n <= 0 ? 0 : (int) (slot(now, taps) / n);
    }

    static List<Line> normalTicker(Inputs in, JSONObject h) {
        List<Line> out = new ArrayList<>();
        boolean en = in.en;
        if (in.formaCurrent > 0) out.add(new Line("forma", forma(in.formaCurrent, in.formaBest, en), C_AMBER));
        if (in.counted > 0) {
            out.add(new Line("progress", (en ? "Today " : "Dziś ") + in.done + "/" + in.counted
                + " · " + percent(in.done, in.counted) + "%", C_ACCENT));
        }
        out.add(new Line("time", timeLeft(in.now, en), C_MUTED));
        Line social = socialLine(in);
        if (social != null) out.add(social);
        if (in.plan.size() > 1) {
            JSONObject after = in.plan.get(1);
            int at = dueAt(after, in.now);
            String t = at - in.now <= 0 ? (en ? "now" : "teraz") : WidgetShared.fmtMinute(at);
            out.add(new Line("next", (en ? "Next: " : "Potem: ") + after.optString("name") + " " + t, C_MUTED));
        }
        // Only the lines chosen for this widget (the jab below too).
        List<Line> kept = WidgetPrefs.filter(out, in.lines);
        // The jab leads; a different one every time its slot comes round.
        if (WidgetPrefs.lineOn(in.lines, "jab") && !jab(h, in.now, 0).isEmpty()) {
            int n = kept.size() + 1;
            kept.add(0, new Line("jab", jab(h, in.now, round(in.now, in.taps, n)), C_JAB));
        }
        return WidgetPrefs.atLeastOne(kept, out);
    }

    static List<Line> allDoneTicker(Inputs in) {
        List<Line> out = new ArrayList<>();
        boolean en = in.en;
        if (in.formaCurrent > 0) out.add(new Line("forma", forma(in.formaCurrent, in.formaBest, en), C_AMBER));
        out.add(new Line("time", timeLeft(in.now, en), C_MUTED));
        Line social = socialLine(in);
        if (social != null) out.add(in.bank ? social : new Line("social", social.text, C_NIGHT));
        List<Line> kept = WidgetPrefs.filter(out, in.lines);
        JSONArray lines = in.allDoneLines;
        if (WidgetPrefs.lineOn(in.lines, "jab") && lines != null && lines.length() > 0) {
            int r = round(in.now, in.taps, kept.size() + 1);
            String s = lines.optString(r % lines.length(), "");
            // no cat emoji in front: the cat itself sits on the ring right next to it
            if (!s.isEmpty()) kept.add(0, new Line("jab", s, C_JAB));
        }
        return WidgetPrefs.atLeastOne(kept, out);
    }

    /**
     * A Szpila jab for a habit to DO (never a forbidden one - the home screen is
     * public): rage lines once it's 3 h late, nag lines otherwise; `round` picks
     * which one. "" if there's none.
     */
    static String jab(JSONObject h, int now, int round) {
        if (h == null || WidgetShared.isAvoid(h)) return "";
        int late = now - dueAt(h, now);
        boolean rage = HabitNotifier.tier(late, 0) == 1;
        JSONArray pool = rage ? h.optJSONArray("rage") : null;
        if (pool == null || pool.length() == 0) {
            pool = h.optJSONArray("nag");
            rage = false;
        }
        if (pool == null || pool.length() == 0) return "";
        String line = pool.optString(Math.max(0, round) % pool.length(), "");
        if (line.isEmpty()) return "";
        // The cat drawn on the widget already shows the mood - no emoji prefix eating the space.
        return WidgetShared.fill(line, h);
    }
}
