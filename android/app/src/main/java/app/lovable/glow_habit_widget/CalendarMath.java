package app.lovable.glow_habit_widget;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Pure calendar math (no Android): busy intervals from calendar instances,
 * free windows and the "no jabs during meetings" slot decision. Minutes are
 * counted from today's local midnight and may be negative or past 1440.
 * Intervals are {start, end} with end = the first free minute.
 * Mirrors src/lib/calendar.ts - both sides are checked against
 * tests/calendar-vectors.json.
 */
final class CalendarMath {
    /** CalendarContract.Events availability values. */
    static final int AVAIL_BUSY = 0, AVAIL_FREE = 1, AVAIL_TENTATIVE = 2;

    private CalendarMath() {}

    /** One instance in minutes from today's midnight. */
    static final class Event {
        final int start, end, availability;
        final boolean allDay, declined;

        Event(int start, int end, boolean allDay, int availability, boolean declined) {
            this.start = start;
            this.end = end;
            this.allDay = allDay;
            this.availability = availability;
            this.declined = declined;
        }
    }

    /** Sort and join overlapping or touching intervals; empty ones are dropped. */
    static int[][] merge(int[][] list) {
        List<int[]> in = new ArrayList<>();
        for (int[] iv : list) if (iv != null && iv.length >= 2 && iv[1] > iv[0]) in.add(new int[]{iv[0], iv[1]});
        in.sort((a, b) -> a[0] != b[0] ? Integer.compare(a[0], b[0]) : Integer.compare(a[1], b[1]));
        List<int[]> out = new ArrayList<>();
        for (int[] iv : in) {
            int[] last = out.isEmpty() ? null : out.get(out.size() - 1);
            if (last != null && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
            else out.add(iv);
        }
        return out.toArray(new int[0][]);
    }

    /** Events that really block time: no FREE, no declined, all-day only when asked. */
    static int[][] busy(List<Event> events, boolean allDay, boolean tentative) {
        List<int[]> in = new ArrayList<>();
        for (Event e : events) {
            if (e.declined || e.availability == AVAIL_FREE) continue;
            if (!tentative && e.availability == AVAIL_TENTATIVE) continue;
            if (!allDay && e.allDay) continue;
            in.add(new int[]{e.start, e.end});
        }
        return merge(in.toArray(new int[0][]));
    }

    static boolean busyAt(int[][] busy, int minute) {
        for (int[] iv : busy) if (iv[0] <= minute && minute < iv[1]) return true;
        return false;
    }

    /** The first free minute at or after `minute` (intervals merged). */
    static int freeAfter(int[][] busy, int minute) {
        int m = minute;
        for (int[] iv : busy) if (iv[0] <= m && m < iv[1]) m = iv[1];
        return m;
    }

    /** Free gaps inside [from, until) at least minLen minutes long. */
    static int[][] freeWindows(int[][] busy, int from, int until, int minLen) {
        List<int[]> out = new ArrayList<>();
        int cur = from;
        for (int[] iv : busy) {
            if (iv[1] <= cur) continue;
            if (iv[0] >= until) break;
            if (iv[0] > cur && iv[0] - cur >= minLen) out.add(new int[]{cur, Math.min(iv[0], until)});
            cur = Math.max(cur, iv[1]);
            if (cur >= until) break;
        }
        if (cur < until && until - cur >= minLen) out.add(new int[]{cur, until});
        List<int[]> ok = new ArrayList<>();
        for (int[] w : out) if (w[1] - w[0] >= minLen) ok.add(w);
        return ok.toArray(new int[0][]);
    }

    /**
     * When a jab slot fires: the slot itself when free; inside a meeting the
     * first free minute after it, unless that reaches `limit` (next slot or
     * bedtime) = -1 (skipped). When `now` is inside a meeting the jab waits for
     * its end. Missed by more than `grace` = -1. Mirrors jabAt() in calendar.ts.
     */
    static int jabAt(int slot, int limit, int[][] busy, int now, int grace) {
        int at = freeAfter(busy, slot);
        if (at >= limit) return -1;
        if (now < at) return at;
        if (busyAt(busy, now)) {
            int after = freeAfter(busy, now);
            return after < limit ? after : -1;
        }
        return now - at <= grace ? at : -1;
    }

    /**
     * The minute each of today's slots (HabitNotifier.tauntSlots) fires at, or
     * -1. Slots after midnight (bedtime past 24:00) are ordered after the
     * evening ones; the limit of a slot is the next slot, the last one's is bedtime.
     */
    static int[] jabTimes(int[] slots, int wake, int bedtime, int[][] busy, int now, int grace) {
        int ub = bedtime > wake ? bedtime : bedtime + 24 * 60;
        int[] out = new int[slots.length];
        for (int i = 0; i < slots.length; i++) {
            int u = unwrap(slots[i], wake);
            int nextU = i + 1 < slots.length ? unwrap(slots[i + 1], wake) : ub;
            int gap = Math.min(nextU, ub) - u;
            if (gap <= 0) gap = 1;
            out[i] = jabAt(slots[i], slots[i] + gap, busy, now, grace);
        }
        return out;
    }

    /**
     * The slot whose jab fires now: the latest one with a fire time (jabTimes)
     * already reached, or -1. Without meetings this is exactly the old rule
     * "the latest slot that passed less than the grace ago".
     */
    static int firingSlot(int[] slots, int[] at, int now) {
        int slot = -1;
        for (int i = 0; i < slots.length && i < at.length; i++) {
            if (at[i] >= 0 && at[i] <= now) slot = slots[i];
        }
        return slot;
    }

    private static int unwrap(int m, int wake) {
        return m < wake ? m + 24 * 60 : m;
    }

    /**
     * The earliest free window in [now, until) that fits one of `needs`
     * (minutes, priority order), only when the calendar has something in that
     * range. {index, start, end} or null. Mirrors fitWindow() in calendar.ts.
     */
    static int[] fit(int[][] busy, int now, int until, int[] needs) {
        if (needs.length == 0 || until <= now) return null;
        boolean any = false;
        for (int[] iv : busy) if (iv[1] > now && iv[0] < until) any = true;
        if (!any) return null;
        int smallest = Integer.MAX_VALUE;
        for (int n : needs) if (n > 0) smallest = Math.min(smallest, n);
        if (smallest == Integer.MAX_VALUE) return null;
        for (int[] w : freeWindows(busy, now, until, smallest)) {
            for (int i = 0; i < needs.length; i++) {
                if (needs[i] > 0 && needs[i] <= w[1] - w[0]) return new int[]{i, w[0], w[1]};
            }
        }
        return null;
    }

    /** Bedtime as a minute after wake-up (quiet hours may end after midnight). */
    static int until(int quietFrom, int quietTo) {
        return quietFrom > quietTo ? quietFrom : quietFrom + 24 * 60;
    }

    /** "18:10" for any minute (wraps past midnight). */
    static String hhmm(int minute) {
        int m = ((minute % 1440) + 1440) % 1440;
        return String.format(java.util.Locale.US, "%02d:%02d", m / 60, m % 60);
    }

    static String toString(int[][] list) {
        return Arrays.deepToString(list);
    }
}
