// The phone's calendars instead of guessing (pure parts, no Capacitor).
// Busy intervals come from the calendars the user picked in Settings (any
// account synced to the Android calendar provider: Google, Google Workspace,
// Exchange / Outlook "sync calendars", Samsung...). Minutes are counted from
// local midnight of "today" and may go below 0 or past 1440 (yesterday's late
// meeting, tomorrow morning).
// Mirrored in CalendarMath.java - both are checked against tests/calendar-vectors.json.
import type { Habit } from "@/lib/habits/types";
import { formatMinute, goalOf, type PlanItem } from "@/lib/habits/utils";
import { L } from "@/lib/i18n";

export type Availability = "busy" | "free" | "tentative";

/** One calendar instance in minutes from today's midnight. */
export interface CalEvent {
  start: number;
  end: number;
  allDay?: boolean;
  availability?: Availability;
  /** The user declined the invitation - not a meeting for them. */
  declined?: boolean;
  calendarId?: string;
  title?: string;
}

/** [start, end) in minutes; end is the first free minute. */
export type Interval = [number, number];

export interface BusyOptions {
  /** All-day events (holidays, birthdays, "home office") block the day. Default false. */
  allDay?: boolean;
  /** "Maybe" meetings count as busy. Default true. */
  tentative?: boolean;
}

/** Sort and join overlapping or touching intervals; empty ones are dropped. */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** The events that really block time: no FREE, no declined, no all-day (by default). */
export function busyIntervals(events: readonly CalEvent[], opts: BusyOptions = {}): Interval[] {
  const allDay = opts.allDay ?? false;
  const tentative = opts.tentative ?? true;
  return mergeIntervals(
    events
      .filter((e) => !e.declined)
      .filter((e) => (e.availability ?? "busy") !== "free")
      .filter((e) => tentative || e.availability !== "tentative")
      .filter((e) => allDay || !e.allDay)
      .map((e) => [e.start, e.end] as Interval),
  );
}

/** The (merged) interval covering this minute, or null. */
export function busyAt(busy: readonly Interval[], minute: number): Interval | null {
  for (const iv of busy) if (iv[0] <= minute && minute < iv[1]) return iv;
  return null;
}

/** The first free minute at or after `minute` (merged intervals never touch). */
export function freeAfter(busy: readonly Interval[], minute: number): number {
  let m = minute;
  for (const [s, e] of busy) if (s <= m && m < e) m = e;
  return m;
}

/** Free gaps inside [from, until) at least minLen minutes long. */
export function freeWindows(
  busy: readonly Interval[],
  from: number,
  until: number,
  minLen = 1,
): Interval[] {
  const out: Interval[] = [];
  let cur = from;
  for (const [s, e] of busy) {
    if (e <= cur) continue;
    if (s >= until) break;
    if (s > cur && s - cur >= minLen) out.push([cur, Math.min(s, until)]);
    cur = Math.max(cur, e);
    if (cur >= until) break;
  }
  if (until - cur >= minLen && cur < until) out.push([cur, until]);
  return out.filter(([s, e]) => e - s >= minLen);
}

/** A jab fires if its slot passed less than this many minutes ago (HabitNotifier.SLOT_GRACE). */
export const JAB_GRACE = 60;

/**
 * "Nie szpiluj w trakcie spotkań": when a jab slot should fire. Not busy = the
 * slot itself (unchanged behaviour); inside a meeting = the first free minute
 * after it, unless that is at/after `limit` (the next slot or bedtime) - then
 * -1, the slot is skipped. If `now` falls into a meeting the jab waits for its
 * end too. A slot missed by more than the grace returns -1.
 * Mirrors CalendarMath.jabAt (Java).
 */
export function jabAt(
  slot: number,
  limit: number,
  busy: readonly Interval[],
  now: number,
  grace = JAB_GRACE,
): number {
  const at = freeAfter(busy, slot);
  if (at >= limit) return -1;
  if (now < at) return at; // not yet (or waiting for the meeting to end)
  if (busyAt(busy, now)) {
    const after = freeAfter(busy, now);
    return after < limit ? after : -1;
  }
  return now - at <= grace ? at : -1;
}

/**
 * The minute each of today's jab slots (tauntSlots) fires at, or -1. Slots
 * after midnight come after the evening ones; a slot's limit is the next slot,
 * the last one's is bedtime. Mirrors CalendarMath.jabTimes.
 */
export function jabTimes(
  slots: readonly number[],
  wake: number,
  bedtime: number,
  busy: readonly Interval[],
  now: number,
  grace = JAB_GRACE,
): number[] {
  const ub = bedtime > wake ? bedtime : bedtime + 1440;
  const unwrap = (m: number) => (m < wake ? m + 1440 : m);
  return slots.map((m, i) => {
    const u = unwrap(m);
    const next = i + 1 < slots.length ? unwrap(slots[i + 1]) : ub;
    let gap = Math.min(next, ub) - u;
    if (gap <= 0) gap = 1;
    return jabAt(m, m + gap, busy, now, grace);
  });
}

/**
 * The earliest free window in [now, until) that fits one of `needs` (minutes,
 * in priority order); within a window the first need that fits wins. Only when
 * the calendar has something in that range - a day without meetings has no
 * "windows". Returns [index, start, end] or null. Mirrors CalendarMath.fit.
 */
export function fitWindow(
  busy: readonly Interval[],
  now: number,
  until: number,
  needs: readonly number[],
): [number, number, number] | null {
  if (needs.length === 0 || until <= now) return null;
  if (!busy.some(([s, e]) => e > now && s < until)) return null;
  const smallest = Math.min(...needs.filter((n) => n > 0));
  if (!Number.isFinite(smallest)) return null;
  for (const [s, e] of freeWindows(busy, now, until, smallest)) {
    const i = needs.findIndex((n) => n > 0 && n <= e - s);
    if (i >= 0) return [i, s, e];
  }
  return null;
}

/** A pending minutes habit matched to a free window. */
export interface WindowMatch {
  habit: Habit;
  /** Minutes still to do today. */
  need: number;
  start: number;
  end: number;
}

/** Pending minutes habits (plan order) -> the next free window that fits one of them. */
export function matchWindow(
  plan: readonly PlanItem[],
  busy: readonly Interval[],
  now: number,
  until: number,
): WindowMatch | null {
  const items = plan.filter((p) => !p.avoid && goalOf(p.habit).type === "minutes" && p.left > 0);
  const hit = fitWindow(
    busy,
    now,
    until,
    items.map((p) => p.left),
  );
  if (!hit) return null;
  const p = items[hit[0]];
  return { habit: p.habit, need: p.left, start: hit[1], end: hit[2] };
}

/** "Masz 18:10–18:50 wolne — idealne na 30 min: Programuj". */
export function windowText(m: WindowMatch, now: number): string {
  const a = formatMinute(((m.start % 1440) + 1440) % 1440);
  const b = formatMinute(((m.end % 1440) + 1440) % 1440);
  if (m.start <= now)
    return L(
      `Teraz masz wolne do ${b} — idealne na ${m.need} min: ${m.habit.name}`,
      `You're free until ${b} — perfect for ${m.need} min of ${m.habit.name}`,
    );
  return L(
    `Masz ${a}–${b} wolne — idealne na ${m.need} min: ${m.habit.name}`,
    `You're free ${a}–${b} — perfect for ${m.need} min of ${m.habit.name}`,
  );
}

/**
 * Planner post-step (Today screen only - the native planner keeps
 * WidgetShared.nextMinute parity): a suggested time that falls into a meeting
 * moves to the meeting's end. Overdue items and the order stay as they are.
 */
export function avoidBusy(
  plan: readonly PlanItem[],
  busy: readonly Interval[],
  now: number,
): PlanItem[] {
  if (busy.length === 0) return [...plan];
  return plan.map((p) => {
    if (p.at < now) return p;
    const at = freeAfter(busy, p.at);
    return at === p.at ? p : { ...p, at, overdue: false };
  });
}

/** Bedtime as a minute after wake-up (quiet hours may end after midnight). */
export function untilMinute(quietFrom: number, quietTo: number): number {
  return quietFrom > quietTo ? quietFrom : quietFrom + 1440;
}

/** Busy minutes and meetings left in [from, until). */
export function busySummary(
  busy: readonly Interval[],
  from: number,
  until: number,
): { count: number; minutes: number } {
  let count = 0;
  let minutes = 0;
  for (const [s, e] of busy) {
    const a = Math.max(s, from);
    const b = Math.min(e, until);
    if (b > a) {
      count++;
      minutes += b - a;
    }
  }
  return { count, minutes };
}

// ------------------------------------------------------------------
// Device data (shapes returned by HabitWidgetPlugin.calendarList / calendarEvents)
// ------------------------------------------------------------------

export interface DeviceCalendar {
  id: string;
  name: string;
  accountName: string;
  accountType: string;
  /** "#rrggbb" */
  color: string;
  visible: boolean;
}

/** One instance as the native side sends it (epoch ms). */
export interface RawEvent {
  begin: number;
  end: number;
  allDay: boolean;
  /** CalendarContract availability: 0 busy, 1 free, 2 tentative. */
  availability: number;
  declined?: boolean;
  calendarId: string;
  title?: string;
}

/** Epoch ms instances -> minutes from `midnight` (local midnight of today, ms). */
export function toEvents(raw: readonly RawEvent[], midnight: number): CalEvent[] {
  return raw.map((r) => ({
    start: Math.floor((r.begin - midnight) / 60_000),
    end: Math.ceil((r.end - midnight) / 60_000),
    allDay: !!r.allDay,
    availability: r.availability === 1 ? "free" : r.availability === 2 ? "tentative" : "busy",
    declined: !!r.declined,
    calendarId: r.calendarId,
    ...(r.title ? { title: r.title } : {}),
  }));
}

/** A human name for the account type a calendar syncs through. */
export function accountKind(type: string): string {
  const t = type.toLowerCase();
  if (t === "com.google") return "Google";
  if (t.includes("outlook")) return "Outlook";
  if (t.includes("exchange")) return "Exchange";
  if (t.includes("local")) return L("Na telefonie", "On this phone");
  if (t.includes("samsung")) return "Samsung";
  if (t.includes("caldav") || t.includes("davx")) return "CalDAV";
  if (t.includes("ical") || t.includes("icloud")) return "iCloud";
  return type;
}

/** Calendars grouped by account ("jan@firma.pl · Outlook"), accounts in name order. */
export function groupByAccount(
  cals: readonly DeviceCalendar[],
): { key: string; title: string; kind: string; calendars: DeviceCalendar[] }[] {
  const map = new Map<
    string,
    { key: string; title: string; kind: string; calendars: DeviceCalendar[] }
  >();
  for (const c of cals) {
    const key = `${c.accountType}|${c.accountName}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        title: c.accountName || accountKind(c.accountType),
        kind: accountKind(c.accountType),
        calendars: [],
      };
      map.set(key, g);
    }
    g.calendars.push(c);
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** Store helper: a valid, de-duplicated list of calendar ids. */
export function normalizeCalendarIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === "string" && x !== ""))].slice(0, 50);
}
