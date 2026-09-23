import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import type {
  Completion,
  Habit,
  HabitGoal,
  HabitKind,
  HabitLimit,
  LimitPeriod,
  TimeOfDay,
} from "./types";

export function todayKey(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

/** Minutes since local midnight. */
export function minuteOfDay(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function formatMinute(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = Math.round(m % 60);
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Polish plural: plural(5, "dzień", "dni", "dni"). */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n);
  if (a === 1) return one;
  const d = a % 10;
  const dd = a % 100;
  if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return few;
  return many;
}

export const daysLabel = (n: number) => `${n} ${plural(n, "dzień", "dni", "dni")}`;
export const timesLabel = (n: number) => `${n} ${plural(n, "raz", "razy", "razy")}`;

// ---------------------------------------------------------------------------
// Habit shape helpers (older saves lack kind/goal/limit)
// ---------------------------------------------------------------------------

export function kindOf(h: Habit): HabitKind {
  return h.kind ?? "build";
}

export function goalOf(h: Habit): Required<Omit<HabitGoal, "unit">> & { unit?: string } {
  const g = h.goal;
  if (!g || g.type === "check") return { type: "check", target: 1, step: 1 };
  const target = Math.max(1, Math.round(g.target || 1));
  const step = Math.max(1, Math.round(g.step || (g.type === "minutes" ? Math.min(10, target) : 1)));
  return { type: g.type, target, step, unit: g.unit };
}

/** Avoid habit judged automatically from late-night screen time (see src/lib/sensors.ts). */
export function isAutoScreen(h: Habit): boolean {
  return kindOf(h) === "avoid" && h.source === "screen";
}

export function limitOf(h: Habit): HabitLimit {
  return h.limit ?? { times: 0, period: "week" };
}

/** Polish forms [1, 2-4, 5+] of common units, found by any of their forms. */
const UNIT_FORMS: [string, string, string][] = [
  ["raz", "razy", "razy"],
  ["szklanka", "szklanki", "szklanek"],
  ["krok", "kroki", "kroków"],
  ["strona", "strony", "stron"],
  ["minuta", "minuty", "minut"],
  ["godzina", "godziny", "godzin"],
  ["litr", "litry", "litrów"],
  ["tabletka", "tabletki", "tabletek"],
  ["kapsułka", "kapsułki", "kapsułek"],
  ["pompka", "pompki", "pompek"],
  ["przysiad", "przysiady", "przysiadów"],
  ["powtórzenie", "powtórzenia", "powtórzeń"],
  ["seria", "serie", "serii"],
  ["słowo", "słowa", "słów"],
  ["lekcja", "lekcje", "lekcji"],
  ["kawa", "kawy", "kaw"],
  ["owoc", "owoce", "owoców"],
  ["porcja", "porcje", "porcji"],
];

/** [1, 2-4, 5+] forms of a count unit (unknown units stay as typed). */
export function unitForms(unit: string | undefined): [string, string, string] {
  const u = unit?.trim() ?? "";
  if (!u) return UNIT_FORMS[0];
  return UNIT_FORMS.find((f) => f.includes(u.toLowerCase())) ?? [u, u, u];
}

export function unitLabel(h: Habit, n: number): string {
  const g = goalOf(h);
  if (g.type === "minutes") return "min";
  if (g.type === "count") return plural(n, ...unitForms(g.unit));
  return "";
}

/** "3/8 szklanek", "20/30 min", "" for single checks. */
export function amountText(h: Habit, amount: number): string {
  const g = goalOf(h);
  if (g.type === "check") return "";
  return `${fmtNum(amount)}/${fmtNum(g.target)} ${unitLabel(h, g.target)}`;
}

export function fmtNum(n: number): string {
  return n >= 10000 ? n.toLocaleString("pl-PL") : String(n);
}

export function scheduleLabel(h: Habit): string {
  const s = h.schedule;
  if (s.type === "daily") return "Codziennie";
  if (s.type === "weekdays") {
    const n = s.days?.length ?? 0;
    return n === 7 ? "Codziennie" : `${n} ${plural(n, "dzień", "dni", "dni")} w tygodniu`;
  }
  return `${timesLabel(s.target ?? 1)} w tygodniu`;
}

export function limitLabel(l: HabitLimit): string {
  if (l.times <= 0) return "Całkowity zakaz";
  const per = l.period === "day" ? "dziennie" : l.period === "week" ? "w tygodniu" : "w miesiącu";
  return `Max ${timesLabel(l.times)} ${per}`;
}

export function goalLabel(h: Habit): string {
  if (kindOf(h) === "avoid") return limitLabel(limitOf(h));
  const g = goalOf(h);
  if (g.type === "check") return "Raz dziennie";
  if (g.type === "minutes") return `${g.target} min dziennie`;
  return `${fmtNum(g.target)} ${unitLabel(h, g.target)} dziennie`;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

type EntryIndex = Map<string, Completion>;

/** Index completions by `${habitId}|${date}` for O(1) lookups in hot loops. */
export function indexEntries(completions: Completion[]): EntryIndex {
  const m: EntryIndex = new Map();
  for (const c of completions) m.set(`${c.habitId}|${c.date}`, c);
  return m;
}

function entryOf(idx: EntryIndex | Completion[], habitId: string, key: string): Completion | undefined {
  if (idx instanceof Map) return idx.get(`${habitId}|${key}`);
  return idx.find((c) => c.habitId === habitId && c.date === key);
}

export function isDueOn(habit: Habit, date: Date): boolean {
  // A habit isn't due before the day it was created - otherwise avoid habits
  // would retroactively rack up "slips" and weekly comparisons would be skewed.
  if (habit.createdAt && todayKey(date) < habit.createdAt.slice(0, 10)) return false;
  const s = habit.schedule;
  if (s.type === "daily") return true;
  if (s.type === "weekdays") {
    const days = s.days ?? [1, 2, 3, 4, 5];
    return days.includes(date.getDay());
  }
  // timesPerWeek - always "due" (user picks any day), tile shows weekly target
  return true;
}

/**
 * Amount logged for a build habit at a given point of the day. With `cutoffMin`
 * the amount is rewound to what it was at that minute (using the entry's log),
 * so this week can be compared to "the same moment last week".
 */
export function amountOn(
  h: Habit,
  idx: EntryIndex | Completion[],
  date: Date,
  cutoffMin?: number,
): number {
  const e = entryOf(idx, h.id, todayKey(date));
  if (!e) return 0;
  const full = e.amount ?? 1;
  if (cutoffMin == null || !e.log?.length) return full;
  let v = 0;
  for (const [m, a] of e.log) if (m <= cutoffMin) v = a;
  return v;
}

export type AvoidStatus = "clean" | "slip" | "pending";

/** Avoid habit status for a day. Unconfirmed past days count as slips. */
export function avoidStatus(
  h: Habit,
  idx: EntryIndex | Completion[],
  date: Date,
  now: Date = new Date(),
  cutoffMin?: number,
): AvoidStatus {
  const key = todayKey(date);
  const e = entryOf(idx, h.id, key);
  const isToday = key === todayKey(now);
  let confirmed = !!e;
  if (e && cutoffMin != null && e.log?.length) confirmed = e.log.some(([m]) => m <= cutoffMin);
  if (!confirmed) return isToday || cutoffMin != null ? "pending" : "slip";
  return e!.slipped ? "slip" : "clean";
}

function periodStart(date: Date, period: LimitPeriod): Date {
  if (period === "day") return date;
  if (period === "week") return startOfWeek(date, { weekStartsOn: 1 });
  return startOfMonth(date);
}

/** Slip-days in the avoid habit's limit period, up to and including `date`. */
export function slipsInPeriod(
  h: Habit,
  idx: EntryIndex | Completion[],
  date: Date,
  now: Date = new Date(),
): number {
  const l = limitOf(h);
  let cursor = periodStart(date, l.period);
  let n = 0;
  while (todayKey(cursor) <= todayKey(date)) {
    if (isDueOn(h, cursor) && avoidStatus(h, idx, cursor, now) === "slip") n++;
    cursor = addDays(cursor, 1);
  }
  return n;
}

/** Remaining allowed slips in the current period (0 = none left). */
export function slipsLeft(h: Habit, idx: EntryIndex | Completion[], now: Date = new Date()): number {
  return Math.max(0, limitOf(h).times - slipsInPeriod(h, idx, now, now));
}

/**
 * Score for one habit on one day, 0..1.
 * Build: fraction of the daily goal. Avoid: 1 when clean, or when the slip fits
 * within the allowance; 0 otherwise (and 0 while still pending).
 */
export function dayScore(
  h: Habit,
  idx: EntryIndex | Completion[],
  date: Date,
  now: Date = new Date(),
  cutoffMin?: number,
): number {
  if (kindOf(h) === "avoid") {
    const st = avoidStatus(h, idx, date, now, cutoffMin);
    if (st === "clean") return 1;
    // Screen-judged habits are fine until the night's screen time says otherwise.
    if (st === "pending") return isAutoScreen(h) ? 1 : 0;
    return slipsInPeriod(h, idx, date, now) <= limitOf(h).times ? 1 : 0;
  }
  const g = goalOf(h);
  return Math.min(1, amountOn(h, idx, date, cutoffMin) / g.target);
}

export function isCompletedOn(habit: Habit, completions: Completion[] | EntryIndex, date: Date): boolean {
  return dayScore(habit, completions, date) >= 1;
}

/** Current consecutive-day streak counting today (or yesterday if today not done). */
export function currentStreak(habit: Habit, completions: Completion[]): number {
  const idx = indexEntries(completions);
  const now = new Date();
  let streak = 0;
  let cursor = now;
  // Grace: if today isn't done yet, count from yesterday.
  if (!isDueOn(habit, cursor) || dayScore(habit, idx, cursor, now) < 1) cursor = addDays(cursor, -1);
  for (let guard = 0; guard < 3650; guard++) {
    if (habit.createdAt && todayKey(cursor) < habit.createdAt.slice(0, 10)) break;
    if (!isDueOn(habit, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (dayScore(habit, idx, cursor, now) >= 1) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else break;
  }
  return streak;
}

export function longestStreak(habit: Habit, completions: Completion[]): number {
  const idx = indexEntries(completions);
  const now = new Date();
  const first = completions
    .filter((c) => c.habitId === habit.id)
    .map((c) => c.date)
    .concat(habit.createdAt ? [habit.createdAt.slice(0, 10)] : [])
    .sort()[0];
  if (!first) return 0;
  let cursor = parseISO(first);
  let best = 0;
  let run = 0;
  while (differenceInCalendarDays(now, cursor) >= 0) {
    if (isDueOn(habit, cursor)) {
      const isToday = todayKey(cursor) === todayKey(now);
      if (dayScore(habit, idx, cursor, now) >= 1) run += 1;
      else if (!isToday) run = 0;
      best = Math.max(best, run);
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

/** Successful days this calendar week (Mon-Sun). */
export function thisWeekCount(habit: Habit, completions: Completion[]): number {
  const idx = indexEntries(completions);
  const now = new Date();
  let cursor = startOfWeek(now, { weekStartsOn: 1 });
  let n = 0;
  while (todayKey(cursor) <= todayKey(now)) {
    if (isDueOn(habit, cursor) && dayScore(habit, idx, cursor, now) >= 1) n++;
    cursor = addDays(cursor, 1);
  }
  return n;
}

export interface HeatCell {
  date: string;
  /** 0..1 fill level. */
  level: number;
  done: boolean;
  due: boolean;
  /** Avoid habits only. */
  status?: AvoidStatus;
}

/** Returns last `days` dates with completion levels for the heatmap. */
export function heatmapData(habit: Habit, completions: Completion[], days = 84): HeatCell[] {
  const idx = indexEntries(completions);
  const today = new Date();
  const out: HeatCell[] = [];
  const avoid = kindOf(habit) === "avoid";
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const due = isDueOn(habit, d);
    const level = due || !avoid ? dayScore(habit, idx, d, today) : 0;
    out.push({
      date: todayKey(d),
      level,
      done: level >= 1,
      due,
      status: avoid && due ? avoidStatus(habit, idx, d, today) : undefined,
    });
  }
  return out;
}

/** Completion rate over last N days, considering schedule. Today counts only once it's done. */
export function completionRate(habit: Habit, completions: Completion[], days = 30): number {
  const idx = indexEntries(completions);
  const today = new Date();
  let due = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    if (!isDueOn(habit, d)) continue;
    const s = dayScore(habit, idx, d, today);
    if (i === 0 && s < 1) continue;
    due += 1;
    done += s;
  }
  return due === 0 ? 0 : Math.round((done / due) * 100);
}

// ---------------------------------------------------------------------------
// Week vs week - compared only up to the same point of the week
// ---------------------------------------------------------------------------

export interface WeekTotals {
  /** Sum of day scores (fractional). */
  score: number;
  /** Number of habit-days due in the window. */
  due: number;
  rate: number;
}

export interface WeekDay {
  label: string;
  /** This week's rate for that day (null = future). */
  now: number | null;
  /** Last week's rate for that day (full day, or up to the same minute for today's weekday). */
  prev: number | null;
  isToday: boolean;
}

export interface WeeklyReport {
  thisWeek: WeekTotals & { done: number };
  lastWeek: WeekTotals & { done: number };
  /** Percentage-point difference (this - last). */
  delta: number;
  /** Label for the window, e.g. "pon-śr do 15:40". */
  windowLabel: string;
  days: WeekDay[];
  perHabit: {
    habit: Habit;
    this: number;
    last: number;
    dueThis: number;
    dueLast: number;
  }[];
}

const DAY_SHORT = ["pon", "wt", "śr", "czw", "pt", "sob", "nd"];

function dayWindow(
  h: Habit,
  idx: EntryIndex,
  d: Date,
  now: Date,
  cutoffMin?: number,
): { score: number; due: number } {
  if (!isDueOn(h, d)) return { score: 0, due: 0 };
  if (h.schedule.type === "timesPerWeek") {
    // Weekly quota: every done day earns a point, the quota is spread evenly.
    const target = h.schedule.target ?? 1;
    return { score: dayScore(h, idx, d, now, cutoffMin) >= 1 ? 1 : 0, due: target / 7 };
  }
  return { score: dayScore(h, idx, d, now, cutoffMin), due: 1 };
}

/**
 * Compares this week (Mon -> now) against last week over the SAME window
 * (Mon -> same weekday, same minute). Early in the week you're never compared
 * to last week's finished total.
 */
export function weeklyReport(habits: Habit[], completions: Completion[], now: Date = new Date()): WeeklyReport {
  const idx = indexEntries(completions);
  const startThis = startOfWeek(now, { weekStartsOn: 1 });
  const startLast = addDays(startThis, -7);
  const todayIdx = differenceInCalendarDays(now, startThis); // 0..6
  const cutoff = minuteOfDay(now);
  const lastWeekNow = addDays(now, -7);

  let sT = 0, dT = 0, sL = 0, dL = 0;
  const perHabit: WeeklyReport["perHabit"] = [];
  const days: WeekDay[] = [];

  for (let i = 0; i < 7; i++) {
    let dsT = 0, ddT = 0, dsL = 0, ddL = 0;
    for (const h of habits) {
      const cut = i === todayIdx ? cutoff : undefined;
      if (i <= todayIdx) {
        const t = dayWindow(h, idx, addDays(startThis, i), now, cut);
        dsT += t.score; ddT += t.due;
      }
      const l = dayWindow(h, idx, addDays(startLast, i), lastWeekNow, cut);
      dsL += l.score; ddL += l.due;
    }
    if (i <= todayIdx) {
      sT += dsT; dT += ddT;
      sL += dsL; dL += ddL;
    }
    days.push({
      label: DAY_SHORT[i],
      now: i <= todayIdx && ddT > 0 ? Math.round((Math.min(dsT, ddT) / ddT) * 100) : null,
      prev: ddL > 0 ? Math.round((Math.min(dsL, ddL) / ddL) * 100) : null,
      isToday: i === todayIdx,
    });
  }

  for (const h of habits) {
    let t = 0, l = 0, dueT = 0, dueL = 0;
    for (let i = 0; i <= todayIdx; i++) {
      const cut = i === todayIdx ? cutoff : undefined;
      const a = dayWindow(h, idx, addDays(startThis, i), now, cut);
      const b = dayWindow(h, idx, addDays(startLast, i), lastWeekNow, cut);
      t += a.score; dueT += a.due;
      l += b.score; dueL += b.due;
    }
    perHabit.push({ habit: h, this: round1(t), last: round1(l), dueThis: round1(dueT), dueLast: round1(dueL) });
  }

  const rateT = dT === 0 ? 0 : Math.round((Math.min(sT, dT) / dT) * 100);
  const rateL = dL === 0 ? 0 : Math.round((Math.min(sL, dL) / dL) * 100);
  const windowLabel =
    todayIdx === 0
      ? `poniedziałek do ${formatMinute(cutoff)}`
      : `${DAY_SHORT[0]}–${DAY_SHORT[todayIdx]} do ${formatMinute(cutoff)}`;
  return {
    thisWeek: { score: round1(sT), due: round1(dT), rate: rateT, done: round1(sT) },
    lastWeek: { score: round1(sL), due: round1(dL), rate: rateL, done: round1(sL) },
    delta: rateT - rateL,
    windowLabel,
    days,
    perHabit,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Smart day planner - picks the next thing to do and plans the rest of the day
// ---------------------------------------------------------------------------

interface Window {
  start: number;
  end: number;
}

const TOD_WINDOW: Record<Exclude<TimeOfDay, "anytime">, Window> = {
  morning: { start: 7 * 60 + 30, end: 10 * 60 + 30 },
  midday: { start: 12 * 60, end: 16 * 60 },
  evening: { start: 19 * 60, end: 22 * 60 },
};

/** Keyword guess of a sensible time window when the user didn't pick one. */
function guessWindow(h: Habit): Window | null {
  const n = `${h.name} ${h.icon}`.toLowerCase();
  const g = goalOf(h);
  if (/z[ęe]b|tooth|brush|nitk/.test(n)) {
    return g.target >= 2 ? { start: 7 * 60 + 30, end: 21 * 60 + 30 } : { start: 21 * 60 + 30, end: 21 * 60 + 30 };
  }
  if (/wod|water|droplet|glass|pij|pić/.test(n)) return { start: 8 * 60, end: 20 * 60 };
  if (/krok|step|footprint|spacer|walk/.test(n)) return { start: 9 * 60, end: 20 * 60 };
  if (/czyt|ksi[ąa]ż|read|book/.test(n)) return { start: 21 * 60, end: 21 * 60 };
  if (/medyt|meditat|oddech/.test(n)) return { start: 7 * 60 + 45, end: 7 * 60 + 45 };
  if (/si[łl]own|gym|trening|dumbbell|bieg|run/.test(n)) return { start: 17 * 60 + 30, end: 17 * 60 + 30 };
  if (/witamin|suplement|pill|lek/.test(n)) return { start: 8 * 60 + 30, end: 8 * 60 + 30 };
  if (kindOf(h) === "avoid") {
    if (/telefon|phone|p[óo][źz]n|scroll|ekran/.test(n)) return { start: 22 * 60 + 30, end: 22 * 60 + 30 };
    return { start: 21 * 60, end: 21 * 60 };
  }
  return null;
}

/** Median first-log minute over the last 3 weeks - learns when you actually do it. */
function learnedMinute(h: Habit, completions: Completion[]): number | null {
  const mins: number[] = [];
  for (const c of completions) {
    if (c.habitId !== h.id || !c.log?.length) continue;
    mins.push(c.log[0][0]);
  }
  if (mins.length < 3) return null;
  const recent = mins.slice(-21).sort((a, b) => a - b);
  return recent[Math.floor(recent.length / 2)];
}

export function habitWindow(h: Habit, completions: Completion[]): Window {
  const g = goalOf(h);
  const multi = kindOf(h) === "build" && g.type === "count" && Math.ceil(g.target / g.step) > 1;
  if (h.reminder) {
    const [hh, mm] = h.reminder.split(":").map(Number);
    const s = hh * 60 + (mm || 0);
    return multi ? { start: s, end: Math.max(s, Math.min(s + 12 * 60, 21 * 60)) } : { start: s, end: s };
  }
  if (h.timeOfDay && h.timeOfDay !== "anytime") {
    const w = TOD_WINDOW[h.timeOfDay];
    return multi ? w : { start: w.start, end: w.start };
  }
  if (!multi) {
    const learned = learnedMinute(h, completions);
    if (learned != null) return { start: learned, end: learned };
  }
  const guess = guessWindow(h);
  if (guess) return multi ? guess : { start: guess.start, end: guess.start };
  return multi ? { start: 9 * 60, end: 21 * 60 } : { start: 12 * 60, end: 12 * 60 };
}

/** Number of "taps" needed to hit the daily goal. */
export function unitsOf(h: Habit): number {
  const g = goalOf(h);
  return Math.max(1, Math.ceil(g.target / g.step));
}

/**
 * When the next unit is due. Counts are spread evenly over the window, e.g.
 * 8 glasses of water 8:00-20:00 -> one roughly every 1h40m.
 * Mirrored in WidgetShared.nextMinute (Java) - keep both in sync.
 */
export function nextUnitMinute(w: Window, units: number, doneUnits: number, nowMin?: number): number {
  if (units <= 1 || w.end <= w.start) return w.start;
  const at = (i: number) => Math.round(w.start + ((w.end - w.start) * i) / (units - 1));
  let i = Math.min(doneUnits, units - 1);
  // When behind, point at the latest slot that already passed (e.g. evening
  // brushing at 21:30), not the first missed one from the morning.
  if (nowMin != null) while (i < units - 1 && at(i + 1) <= nowMin) i++;
  return at(i);
}

/**
 * Ranking key - lower goes first. Overdue items come first (most overdue
 * first); a single-shot item overdue by 4h+ (e.g. missed morning brushing)
 * drops behind anything due within the hour. Multi-unit goals that fall
 * behind (water, steps) stay urgent.
 * Mirrored in WidgetShared.rankKey (Java).
 */
export function rankKey(dueMin: number, nowMin: number, avoid: boolean, multi = false): number {
  const d = dueMin - nowMin;
  if (avoid && d > 30) return 10000 + d; // confirmations only make sense near their time
  if (d < -240 && !multi) return 60 + -d / 1000;
  if (d <= 0) return d / 1000 - 1;
  return d;
}

export interface PlanItem {
  habit: Habit;
  /** Suggested minute of day for the next action. */
  at: number;
  amount: number;
  /** Remaining amount to hit the goal (build) or 0 for avoid. */
  left: number;
  avoid: boolean;
  overdue: boolean;
  key: number;
}

/** Pending items for today, sorted by what to do next. */
export function planDay(habits: Habit[], completions: Completion[], now: Date = new Date()): PlanItem[] {
  const idx = indexEntries(completions);
  const nowMin = minuteOfDay(now);
  const out: PlanItem[] = [];
  for (const h of habits) {
    if (!isDueOn(h, now)) continue;
    const avoid = kindOf(h) === "avoid";
    if (h.schedule.type === "timesPerWeek" && thisWeekCount(h, completions) >= (h.schedule.target ?? 1)) continue;
    if (avoid) {
      if (isAutoScreen(h) || avoidStatus(h, idx, now, now) !== "pending") continue;
      const at = habitWindow(h, completions).start;
      out.push({ habit: h, at, amount: 0, left: 0, avoid, overdue: at <= nowMin, key: rankKey(at, nowMin, true) });
      continue;
    }
    const g = goalOf(h);
    const amount = amountOn(h, idx, now);
    if (amount >= g.target) continue;
    const units = unitsOf(h);
    const at = nextUnitMinute(habitWindow(h, completions), units, Math.floor(amount / g.step), nowMin);
    out.push({
      habit: h,
      at,
      amount,
      left: g.target - amount,
      avoid,
      overdue: at <= nowMin,
      key: rankKey(at, nowMin, false, units > 1),
    });
  }
  return out.sort((a, b) => a.key - b.key);
}

export interface TodayProgress {
  done: number;
  total: number;
  /** 0..1 including partial progress of count/minute goals. */
  fraction: number;
}

export function todayProgress(habits: Habit[], completions: Completion[], now: Date = new Date()): TodayProgress {
  const idx = indexEntries(completions);
  let done = 0;
  let total = 0;
  let sum = 0;
  for (const h of habits) {
    if (!isDueOn(h, now)) continue;
    total++;
    const s = dayScore(h, idx, now, now);
    sum += s;
    if (s >= 1) done++;
  }
  return { done, total, fraction: total ? sum / total : 0 };
}

export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Jeszcze nie śpisz";
  if (h < 12) return "Dzień dobry";
  if (h < 18) return "Cześć";
  if (h < 22) return "Dobry wieczór";
  return "Dobranoc";
}
