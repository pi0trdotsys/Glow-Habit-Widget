// Longer-range stats: a 90-day trend (daily % + 7-day moving average), month
// by month, this month vs last month up to the same day, and a CSV export.
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  getDaysInMonth,
  startOfMonth,
} from "date-fns";
import type { Completion, Habit } from "./types";
import { dayFraction } from "./gamification";
import {
  amountOn,
  avoidStatus,
  countsOn,
  createdKey,
  dayScore,
  goalOf,
  indexEntries,
  kindOf,
  todayKey,
  unitLabel,
} from "./utils";

export interface DayPoint {
  key: string;
  date: Date;
  /** 0..100, null = nothing counted that day (before you started, or undecided). */
  pct: number | null;
  /** 7-day moving average over the days that have data. */
  avg: number | null;
}

/** Daily completion % for the last `days` days (today included, partial). */
export function dailySeries(
  habits: Habit[],
  completions: Completion[],
  days = 90,
  now: Date = new Date(),
): DayPoint[] {
  const idx = indexEntries(completions);
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(now, -i);
    const f = dayFraction(habits, idx, d, now);
    out.push({ key: todayKey(d), date: d, pct: f == null ? null : Math.round(f * 100), avg: null });
  }
  for (let i = 0; i < out.length; i++) {
    const win = out.slice(Math.max(0, i - 6), i + 1).filter((p) => p.pct != null);
    out[i].avg = win.length ? Math.round(win.reduce((s, p) => s + p.pct!, 0) / win.length) : null;
  }
  return out;
}

export interface TrendSummary {
  /** Average % over the days with data. */
  avg: number | null;
  /** Last 30 days vs the 30 before (percentage points), null without data on both sides. */
  change: number | null;
  best: DayPoint | null;
  tracked: number;
}

export function trendSummary(series: DayPoint[]): TrendSummary {
  const mean = (ps: DayPoint[]) => {
    const d = ps.filter((p) => p.pct != null);
    return d.length ? d.reduce((s, p) => s + p.pct!, 0) / d.length : null;
  };
  const withData = series.filter((p) => p.pct != null);
  const last = mean(series.slice(-30));
  const prev = mean(series.slice(-60, -30));
  const best = withData.reduce<DayPoint | null>((b, p) => (!b || p.pct! >= b.pct! ? p : b), null);
  const avg = mean(series);
  return {
    avg: avg == null ? null : Math.round(avg),
    change: last != null && prev != null ? Math.round(last - prev) : null,
    best,
    tracked: withData.length,
  };
}

const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const MONTHS_LONG = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

export interface MonthStat {
  key: string; // "2026-09"
  label: string;
  long: string;
  /** Average daily % (null = no data that month). */
  pct: number | null;
  /** Days with data. */
  days: number;
  /** Days in form (>= 80%). */
  forma: number;
  current: boolean;
}

function monthAvg(
  habits: Habit[],
  idx: ReturnType<typeof indexEntries>,
  from: Date,
  lastDay: number,
  now: Date,
) {
  let sum = 0;
  let n = 0;
  let forma = 0;
  for (let d = 0; d < lastDay; d++) {
    const date = addDays(from, d);
    if (differenceInCalendarDays(date, now) > 0) break;
    const f = dayFraction(habits, idx, date, now);
    if (f == null) continue;
    sum += f;
    n++;
    if (f >= 0.8) forma++;
  }
  return { pct: n ? Math.round((sum / n) * 100) : null, days: n, forma };
}

/** The last `months` calendar months, oldest first (the current one is partial). */
export function monthStats(
  habits: Habit[],
  completions: Completion[],
  months = 6,
  now: Date = new Date(),
): MonthStat[] {
  const idx = indexEntries(completions);
  const out: MonthStat[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = startOfMonth(addMonths(now, -i));
    const a = monthAvg(habits, idx, m, getDaysInMonth(m), now);
    out.push({
      key: todayKey(m).slice(0, 7),
      label: MONTHS[m.getMonth()],
      long: MONTHS_LONG[m.getMonth()],
      ...a,
      current: i === 0,
    });
  }
  return out;
}

export interface MonthCompare {
  thisMonth: { label: string; pct: number | null; days: number };
  lastMonth: { label: string; pct: number | null; days: number };
  /** Percentage points (this - last); null without data on both sides. */
  delta: number | null;
  /** Compared window: day 1 .. `upTo` of both months. */
  upTo: number;
}

/** This month vs last month over the same days (1..today's day of month). */
export function monthCompare(
  habits: Habit[],
  completions: Completion[],
  now: Date = new Date(),
): MonthCompare {
  const idx = indexEntries(completions);
  const thisStart = startOfMonth(now);
  const lastStart = startOfMonth(addMonths(now, -1));
  const upTo = now.getDate();
  const a = monthAvg(habits, idx, thisStart, upTo, now);
  const b = monthAvg(habits, idx, lastStart, Math.min(upTo, getDaysInMonth(lastStart)), now);
  return {
    thisMonth: { label: MONTHS_LONG[thisStart.getMonth()], pct: a.pct, days: a.days },
    lastMonth: { label: MONTHS_LONG[lastStart.getMonth()], pct: b.pct, days: b.days },
    delta: a.pct != null && b.pct != null ? a.pct - b.pct : null,
    upTo,
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CSV_HEADER = [
  "data",
  "zadanie",
  "rodzaj",
  "cel",
  "jednostka",
  "wynik",
  "status",
  "procent",
  "social_w_nocy",
];

function cell(v: string | number): string {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * Every habit-day since the first habit was created, one row each
 * (semicolon-separated, Excel/Sheets friendly in Polish locale; decimal comma).
 */
export function toCsv(
  habits: Habit[],
  completions: Completion[],
  nightHits: Record<string, number> = {},
  now: Date = new Date(),
): string {
  const idx = indexEntries(completions);
  const first =
    habits
      .map(createdKey)
      .filter((k) => k !== "0000-00-00")
      .sort()[0] ?? todayKey(now);
  const [y, m, d] = first.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const total = Math.min(3650, differenceInCalendarDays(now, start));
  const rows = [CSV_HEADER.join(";")];
  for (let i = 0; i <= total; i++) {
    const date = addDays(start, i);
    const key = todayKey(date);
    for (const h of habits) {
      if (!countsOn(h, idx, date, now)) continue;
      const avoid = kindOf(h) === "avoid";
      const g = goalOf(h);
      const score = dayScore(h, idx, date, now);
      const status = avoid
        ? { clean: "czysto", slip: "wpadka", pending: "do potwierdzenia" }[
            avoidStatus(h, idx, date, now)
          ]
        : score >= 1
          ? "zrobione"
          : score > 0
            ? "częściowo"
            : "nie";
      rows.push(
        [
          key,
          h.name,
          avoid ? "zakazane" : "do zrobienia",
          avoid ? 0 : g.target,
          avoid ? "" : g.type === "minutes" ? "min" : g.type === "check" ? "" : unitLabel(h, 5),
          avoid ? (status === "wpadka" ? 1 : 0) : amountOn(h, idx, date),
          status,
          String(Math.round(score * 100)),
          h.source === "screen" ? (nightHits[key] ?? 0) : "",
        ]
          .map(cell)
          .join(";"),
      );
    }
  }
  return rows.join("\r\n") + "\r\n";
}

export const csvFileName = (now: Date = new Date()) => `szpila-historia-${todayKey(now)}.csv`;
