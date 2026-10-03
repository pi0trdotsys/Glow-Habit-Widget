// "Prognoza na dziś": a morning risk forecast. For every habit due today we
// estimate P(miss today) - for avoid habits P(slip) - with a small, explainable
// naive Bayes over the habit's own history:
//   prior     the habit's base miss rate (Laplace-smoothed),
//   night     last night was bad (social media after midnight > 0, or 30+ min of
//             screen after midnight) - from the night report filed under yesterday,
//   sleep     short sleep (< 6 h) from the band, only when sleep data exists,
//   weekday   the specific weekday, or weekend vs workday when that is the stronger
//             (or the only well-sampled) signal,
//   rescue    the previous due day was missed ("nigdy dwa razy z rzędu").
// Each feature value gets a log likelihood ratio ln P(v|miss)/P(v|kept) with
// Laplace smoothing, and only when both sides of the feature have enough samples.
// A warning needs ≥ 21 days of history, P ≥ 60% and P ≥ base + 15 pts, and the
// text names the single strongest reason (night + sleep together when both push).
//
// The native morning notification (HabitNotifier.billPost -> Forecast.java) runs
// the same posterior from the compact per-habit model exported in the widget
// snapshot (forecastSnapshot), with last night's NightStats report - so it works
// even when the app wasn't opened since the evening. Shared vectors:
// tests/forecast-vectors.json (bun tests/gen-forecast-vectors.ts).
import { addDays } from "date-fns";
import type { Completion, Habit } from "./types";
import type { TauntLevel } from "./store";
import type { NightReport } from "@/lib/sensors";
import {
  avoidStatus,
  countsOn,
  dayScore,
  indexEntries,
  isDueOn,
  kindOf,
  todayKey,
  type EntryIndex,
} from "./utils";
import { keptOn, minimumLabel, previousDueDay } from "./rescue";
import { fmtSleep, SHORT_SLEEP_MIN } from "@/lib/night";
import { L, pick } from "@/lib/i18n";

/** Finished, judged days of history a habit needs before it gets a forecast. */
export const MIN_DAYS = 21;
/** How far back the model looks. */
export const LOOKBACK = 120;
/** Samples needed on each side of a binary feature (and with the feature known at all). */
export const MIN_SIDE = 5;
export const MIN_KNOWN = 10;
/** Samples needed on a specific weekday for its own likelihood. */
export const MIN_WEEKDAY = 4;
/** Warn only from this probability, and this far above the base rate. */
export const WARN_P = 0.6;
export const WARN_LIFT = 0.15;
/** A feature has to push at least this much (log odds) to be named as the reason. */
export const REASON_MIN = 0.1;
/** Screen minutes after midnight that make a night bad even without social media. */
export const BAD_SCREEN_MIN = 30;
/** Shown percentages are capped - nobody is a 100% certainty. */
export const MAX_PCT = 97;

/** One feature's log likelihood ratios per value (missing = not enough data for that value). */
export interface BinaryLLR {
  /** Value "yes" (bad night / short sleep / previous day missed). */
  y?: number;
  /** Value "no". */
  n?: number;
}

/** Weekday likelihood: `l` = log LR, `g` = 1 when it's the weekend/workday group, 0 = that weekday. */
export interface WeekdayLLR {
  l: number;
  g: 0 | 1;
}

/** The compact, exportable model of one habit (all numbers rounded to 4 decimals). */
export interface HabitModel {
  id: string;
  name: string;
  kind: "build" | "avoid";
  /** minimumLabel ("5 min"), "" = none. */
  min: string;
  /** Days of history used. */
  n: number;
  /** Smoothed base miss rate. */
  base: number;
  /** Weekdays (0 = Sunday) the habit is due on. */
  days: number[];
  night?: BinaryLLR;
  sleep?: BinaryLLR;
  rescue?: BinaryLLR;
  /** Index = weekday (0 = Sunday). */
  wd: (WeekdayLLR | null)[];
}

/** Today's feature values; null = unknown (left out of the product). */
export interface Features {
  bad: boolean | null;
  short: boolean | null;
  wd: number;
  rescue: boolean | null;
}

export type ReasonKey = "night" | "sleep" | "nightSleep" | "rescue" | "wd";

export interface Posterior {
  p: number;
  base: number;
  pct: number;
  reason: ReasonKey | null;
  warn: boolean;
}

const r4 = (x: number) => Math.round(x * 10000) / 10000;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** The night that precedes day `d` (filed under the evening before). */
const nightBefore = (reports: Record<string, NightReport>, d: Date) =>
  reports[todayKey(addDays(d, -1))] ?? null;

/** A bad night: any social media after midnight, or 30+ min of screen. */
export const isBadNight = (r: Pick<NightReport, "social" | "screen">) =>
  (r.social ?? 0) > 0 || (r.screen ?? 0) >= BAD_SCREEN_MIN;

const sleepOf = (r: NightReport | null): number | null =>
  r?.sleep && r.sleep.minutes >= 0 ? r.sleep.minutes : null;

/** Was the habit missed that day? Build: goal not reached. Avoid: a slip. null = not judged. */
export function missOn(h: Habit, idx: EntryIndex, d: Date, now: Date): boolean | null {
  if (!countsOn(h, idx, d, now)) return null;
  if (kindOf(h) === "avoid") {
    const st = avoidStatus(h, idx, d, now);
    return st === "pending" ? null : st === "slip";
  }
  return dayScore(h, idx, d, now) < 1;
}

/** The previous due day broke the chain (below the minimum / a slip); null = unknown. */
export function prevMissed(h: Habit, idx: EntryIndex, d: Date, now: Date): boolean | null {
  const prev = previousDueDay(h, d);
  if (!prev || !countsOn(h, idx, prev, now)) return null;
  if (kindOf(h) === "avoid") {
    const st = avoidStatus(h, idx, prev, now);
    return st === "pending" ? null : st === "slip";
  }
  return !keptOn(h, idx, prev, now);
}

/** Features of day `d` (night before it, its weekday, the previous due day). */
export function featuresOn(
  h: Habit,
  idx: EntryIndex,
  reports: Record<string, NightReport>,
  d: Date,
  now: Date,
): Features {
  const r = nightBefore(reports, d);
  const sleep = sleepOf(r);
  return {
    bad: r ? isBadNight(r) : null,
    short: sleep != null ? sleep < SHORT_SLEEP_MIN : null,
    wd: d.getDay(),
    rescue: prevMissed(h, idx, d, now),
  };
}

/** ln P(v|miss)/P(v|kept) with Laplace smoothing over `k` values. */
function llr(vMiss: number, nMiss: number, vKept: number, nKept: number, k: number): number {
  return Math.log((vMiss + 1) / (nMiss + k) / ((vKept + 1) / (nKept + k)));
}

interface Sample {
  miss: boolean;
  f: Features;
}

function binary(samples: Sample[], get: (f: Features) => boolean | null): BinaryLLR | undefined {
  const known = samples.filter((s) => get(s.f) != null);
  if (known.length < MIN_KNOWN) return undefined;
  const yes = known.filter((s) => get(s.f)).length;
  if (yes < MIN_SIDE || known.length - yes < MIN_SIDE) return undefined;
  const nMiss = known.filter((s) => s.miss).length;
  const nKept = known.length - nMiss;
  const yMiss = known.filter((s) => s.miss && get(s.f)).length;
  const yKept = yes - yMiss;
  return {
    y: r4(llr(yMiss, nMiss, yKept, nKept, 2)),
    n: r4(llr(nMiss - yMiss, nMiss, nKept - yKept, nKept, 2)),
  };
}

function weekdays(samples: Sample[]): (WeekdayLLR | null)[] {
  const nMiss = samples.filter((s) => s.miss).length;
  const nKept = samples.length - nMiss;
  const weekend = (d: number) => d === 0 || d === 6;
  const endN = samples.filter((s) => weekend(s.f.wd)).length;
  const groupOk = endN >= MIN_SIDE && samples.length - endN >= MIN_SIDE;
  const out: (WeekdayLLR | null)[] = [];
  for (let d = 0; d < 7; d++) {
    const on = samples.filter((s) => s.f.wd === d);
    let day: number | null = null;
    if (on.length >= MIN_WEEKDAY) {
      const m = on.filter((s) => s.miss).length;
      day = llr(m, nMiss, on.length - m, nKept, 7);
    }
    let group: number | null = null;
    if (groupOk) {
      const g = samples.filter((s) => weekend(s.f.wd) === weekend(d));
      const m = g.filter((s) => s.miss).length;
      group = llr(m, nMiss, g.length - m, nKept, 2);
    }
    if (day == null && group == null) out.push(null);
    else if (group == null || (day != null && Math.abs(day) >= Math.abs(group)))
      out.push({ l: r4(day!), g: 0 });
    else out.push({ l: r4(group), g: 1 });
  }
  return out;
}

/** Weekdays a habit is due on (0 = Sunday). */
export function dueDays(h: Habit): number[] {
  if (h.schedule.type === "weekdays") return [...(h.schedule.days ?? [1, 2, 3, 4, 5])].sort();
  return [0, 1, 2, 3, 4, 5, 6];
}

/** Train one habit's model on the days before `now`; null without enough history. */
export function trainModel(
  h: Habit,
  idx: EntryIndex,
  reports: Record<string, NightReport>,
  now: Date = new Date(),
): HabitModel | null {
  if (h.schedule.type === "timesPerWeek") return null;
  const samples: Sample[] = [];
  for (let i = 1; i <= LOOKBACK; i++) {
    const d = addDays(now, -i);
    if (h.createdAt && todayKey(d) < todayKey(new Date(h.createdAt))) break;
    const miss = missOn(h, idx, d, now);
    if (miss == null) continue;
    samples.push({ miss, f: featuresOn(h, idx, reports, d, now) });
  }
  if (samples.length < MIN_DAYS) return null;
  const misses = samples.filter((s) => s.miss).length;
  const m: HabitModel = {
    id: h.id,
    name: h.name,
    kind: kindOf(h),
    min: minimumLabel(h),
    n: samples.length,
    base: r4((misses + 1) / (samples.length + 2)),
    days: dueDays(h),
    wd: weekdays(samples),
  };
  const night = binary(samples, (f) => f.bad);
  const sleep = binary(samples, (f) => f.short);
  const rescue = binary(samples, (f) => f.rescue);
  if (night) m.night = night;
  if (sleep) m.sleep = sleep;
  if (rescue) m.rescue = rescue;
  return m;
}

const valueOf = (b: BinaryLLR | undefined, v: boolean | null): number | null => {
  if (!b || v == null) return null;
  return (v ? b.y : b.n) ?? null;
};

/**
 * P(miss) from a model and today's features (mirrored in Forecast.posterior).
 * The reason is the strongest positive "bad side" feature (bad night, short
 * sleep, missed yesterday, the weekday); night + sleep are named together
 * when the strongest is one of them and the other pushes too.
 */
export function posterior(m: HabitModel, f: Features): Posterior {
  let logit = Math.log(m.base / (1 - m.base));
  const night = valueOf(m.night, f.bad);
  const sleep = valueOf(m.sleep, f.short);
  const rescue = valueOf(m.rescue, f.rescue);
  const wd = m.wd[f.wd]?.l ?? null;
  for (const v of [night, sleep, rescue, wd]) if (v != null) logit += v;
  const p = sigmoid(logit);
  // Explainable candidates: only the "bad" side of a feature can be a reason.
  const cands: [ReasonKey, number | null][] = [
    ["night", f.bad ? night : null],
    ["sleep", f.short ? sleep : null],
    ["rescue", f.rescue ? rescue : null],
    ["wd", wd],
  ];
  let reason: ReasonKey | null = null;
  let best = REASON_MIN;
  for (const [k, v] of cands) {
    if (v != null && v >= best && (reason == null || v > best)) {
      reason = k;
      best = v;
    }
  }
  if (reason === "night" || reason === "sleep") {
    const other = reason === "night" ? (f.short ? sleep : null) : f.bad ? night : null;
    if (other != null && other >= REASON_MIN) reason = "nightSleep";
  }
  const pct = Math.min(MAX_PCT, Math.round(p * 100));
  const warn = reason != null && p >= WARN_P && p >= m.base + WARN_LIFT;
  return { p, base: m.base, pct, reason, warn };
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export type ForecastPool = "build" | "buildMin" | "avoid";
export type ForecastLines = Record<ForecastPool, string[]>;

/** Reason phrases (lowercase - the line capitalises). Placeholders {social} {screen} {sleep}. */
export interface ReasonPhrases {
  night: string;
  nightSocial: string;
  sleep: string;
  nightSleep: string;
  nightSocialSleep: string;
  rescue: string;
  rescueAvoid: string;
  /** Index = weekday (0 = Sunday). */
  wd: string[];
  weekend: string;
  workday: string;
}

// Placeholders: {reason} {habit} {pct} {min} {until}. {habit} sits in quotes.
const LINES: Record<TauntLevel, ForecastLines> = {
  hard: {
    buildMin: [
      "{reason} zwykle odpuszczasz „{habit}” ({pct}%). Zrób minimum ({min}) przed {until}, zanim dzień cię wydyma.",
      "Prognoza na dziś: „{habit}” leży na {pct}%, bo {reason} zwykle się sypiesz. {min} przed {until} i nie pierdol.",
      "{pct}% szans, że „{habit}” dziś pójdzie się jebać - {reason} tak masz. {min} przed {until}, kurwa, i po sprawie.",
      "Statystyka nie kłamie: {reason} „{habit}” wypada w {pct}% przypadków. Minimum to {min}. Przed {until}. Bez dyskusji.",
      "Znam cię: {reason} „{habit}” ląduje w koszu ({pct}%). Zrób {min} przed {until}, zanim wymyślisz wymówkę.",
      "Kot przewiduje: {reason} „{habit}” idzie w pizdu w {pct}% przypadków. {min} przed {until} i udowodnij, że kot się myli.",
    ],
    build: [
      "{reason} zwykle odpuszczasz „{habit}” ({pct}%). Ogarnij to przed {until}, zanim dzień cię wydyma.",
      "Prognoza na dziś: „{habit}” leży na {pct}%, bo {reason} zwykle się sypiesz. Przed {until} i nie pierdol.",
      "{pct}% szans, że „{habit}” dziś pójdzie się jebać - {reason} tak masz. Zrób to przed {until}, kurwa.",
      "Znam cię: {reason} „{habit}” ląduje w koszu ({pct}%). Odhacz to przed {until}, zanim wymyślisz wymówkę.",
      "Kot przewiduje: {reason} „{habit}” idzie w pizdu w {pct}% przypadków. Przed {until} udowodnij, że kot się myli.",
    ],
    avoid: [
      "{reason} zwykle wpadasz z „{habit}” ({pct}%). Dziś trzymasz łapy przy sobie, kurwa.",
      "Prognoza wpadki: „{habit}” na {pct}%, bo {reason} zwykle pękasz. Nie dziś.",
      "{pct}% szans, że „{habit}” dziś cię dorwie - {reason} tak masz. Pokaż, że statystyka może się pierdolić.",
      "Znam cię: {reason} „{habit}” kusi najbardziej ({pct}%). Zaplanuj, co robisz zamiast tego, zanim przyjdzie ochota.",
      "Kot przewiduje wpadkę z „{habit}” ({pct}%), bo {reason} zwykle dajesz dupy. Zrób kotu na złość.",
    ],
  },
  soft: {
    buildMin: [
      "{reason} „{habit}” często wypada ({pct}%). Może zrobisz minimum ({min}) przed {until}?",
      "Mała prognoza: {reason} „{habit}” bywa trudniejsze ({pct}%). {min} przed {until} wystarczy.",
      "Uwaga na „{habit}”: {reason} wypada w {pct}% przypadków. Wersja minimum ({min}) przed {until} i spokój.",
    ],
    build: [
      "{reason} „{habit}” często wypada ({pct}%). Może zrobisz to przed {until}?",
      "Mała prognoza: {reason} „{habit}” bywa trudniejsze ({pct}%). Spróbuj przed {until}.",
      "Uwaga na „{habit}”: {reason} wypada w {pct}% przypadków. Zrób to przed {until} i spokój.",
    ],
    avoid: [
      "{reason} łatwiej o wpadkę z „{habit}” ({pct}%). Dziś zaplanuj coś w zamian.",
      "Mała prognoza: {reason} „{habit}” kusi mocniej ({pct}%). Uważaj na siebie dziś.",
      "Uwaga na „{habit}”: {reason} wpadka zdarza się w {pct}% przypadków. Dasz radę!",
    ],
  },
};

const LINES_EN: Record<TauntLevel, ForecastLines> = {
  hard: {
    buildMin: [
      "{reason}, you usually bail on “{habit}” ({pct}%). Do the minimum ({min}) before {until}, before the day screws you.",
      "Today's forecast: “{habit}” is {pct}% likely to flop, because {reason}, you usually fall apart. {min} before {until}, no bullshit.",
      "{pct}% chance “{habit}” goes to shit today - {reason}, that's how you roll. {min} before {until}, damn it, and done.",
      "Stats don't lie: {reason}, “{habit}” falls through {pct}% of the time. The minimum is {min}. Before {until}. No discussion.",
      "I know you: {reason}, “{habit}” lands in the trash ({pct}%). Do {min} before {until}, before you invent an excuse.",
      "The cat predicts: {reason}, “{habit}” goes to hell {pct}% of the time. {min} before {until} and prove the cat wrong.",
    ],
    build: [
      "{reason}, you usually bail on “{habit}” ({pct}%). Get it done before {until}, before the day screws you.",
      "Today's forecast: “{habit}” is {pct}% likely to flop, because {reason}, you usually fall apart. Before {until}, no bullshit.",
      "{pct}% chance “{habit}” goes to shit today - {reason}, that's how you roll. Do it before {until}, damn it.",
      "I know you: {reason}, “{habit}” lands in the trash ({pct}%). Tick it off before {until}, before you invent an excuse.",
      "The cat predicts: {reason}, “{habit}” goes to hell {pct}% of the time. Before {until}, prove the cat wrong.",
    ],
    avoid: [
      "{reason}, you usually slip with “{habit}” ({pct}%). Today you keep your damn paws to yourself.",
      "Slip forecast: “{habit}” at {pct}%, because {reason}, you usually crack. Not today.",
      "{pct}% chance “{habit}” gets you today - {reason}, that's how you roll. Show the stats they can fuck off.",
      "I know you: {reason}, “{habit}” tempts you the most ({pct}%). Plan what you'll do instead before the urge hits.",
      "The cat predicts a slip with “{habit}” ({pct}%), because {reason}, you usually screw it up. Spite the cat.",
    ],
  },
  soft: {
    buildMin: [
      "{reason}, “{habit}” often slips ({pct}%). How about the minimum ({min}) before {until}?",
      "A small forecast: {reason}, “{habit}” tends to be harder ({pct}%). {min} before {until} is enough.",
      "Heads up on “{habit}”: {reason}, it falls through {pct}% of the time. The minimum ({min}) before {until} and you're set.",
    ],
    build: [
      "{reason}, “{habit}” often slips ({pct}%). How about doing it before {until}?",
      "A small forecast: {reason}, “{habit}” tends to be harder ({pct}%). Try it before {until}.",
      "Heads up on “{habit}”: {reason}, it falls through {pct}% of the time. Do it before {until} and you're set.",
    ],
    avoid: [
      "{reason}, a slip with “{habit}” is more likely ({pct}%). Plan something else for today.",
      "A small forecast: {reason}, “{habit}” tempts more ({pct}%). Take care of yourself today.",
      "Heads up on “{habit}”: {reason}, a slip happens {pct}% of the time. You've got this!",
    ],
  },
};

/** The forecast line pools for a level, in the current language. */
export function forecastLines(level: TauntLevel): ForecastLines {
  const l = pick(LINES, LINES_EN)[level];
  return { build: [...l.build], buildMin: [...l.buildMin], avoid: [...l.avoid] };
}

/** Reason phrases in the current language. */
export function reasonPhrases(): ReasonPhrases {
  return pick<ReasonPhrases>(
    {
      night: "po nocy z {screen} min ekranu po północy",
      nightSocial: "po nocy z {social} min scrollowania",
      sleep: "po {sleep} snu",
      nightSleep: "po nocy z {screen} min ekranu i {sleep} snu",
      nightSocialSleep: "po nocy z {social} min scrollowania i {sleep} snu",
      rescue: "dzień po odpuszczeniu",
      rescueAvoid: "dzień po wpadce",
      wd: [
        "w niedziele",
        "w poniedziałki",
        "we wtorki",
        "w środy",
        "w czwartki",
        "w piątki",
        "w soboty",
      ],
      weekend: "w weekendy",
      workday: "w dni robocze",
    },
    {
      night: "after a night with {screen} min of screen past midnight",
      nightSocial: "after a night with {social} min of scrolling",
      sleep: "after {sleep} of sleep",
      nightSleep: "after a night with {screen} min of screen and {sleep} of sleep",
      nightSocialSleep: "after a night with {social} min of scrolling and {sleep} of sleep",
      rescue: "the day after a skip",
      rescueAvoid: "the day after a slip",
      wd: [
        "on Sundays",
        "on Mondays",
        "on Tuesdays",
        "on Wednesdays",
        "on Thursdays",
        "on Fridays",
        "on Saturdays",
      ],
      weekend: "on weekends",
      workday: "on workdays",
    },
  );
}

/** Last night's numbers a reason phrase can mention. */
export interface NightNums {
  social: number;
  screen: number;
  /** Minutes asleep, -1 = unknown. */
  sleep: number;
}

/** The reason as text (mirrored in Forecast.reasonText). */
export function reasonText(
  key: ReasonKey,
  m: HabitModel,
  f: Features,
  night: NightNums,
  ph: ReasonPhrases,
): string {
  const social = night.social > 0;
  let t: string;
  if (key === "night") t = social ? ph.nightSocial : ph.night;
  else if (key === "sleep") t = ph.sleep;
  else if (key === "nightSleep") t = social ? ph.nightSocialSleep : ph.nightSleep;
  else if (key === "rescue") t = m.kind === "avoid" ? ph.rescueAvoid : ph.rescue;
  else {
    const w = m.wd[f.wd];
    t = w?.g ? (f.wd === 0 || f.wd === 6 ? ph.weekend : ph.workday) : ph.wd[f.wd];
  }
  return t
    .replaceAll("{social}", String(night.social))
    .replaceAll("{screen}", String(night.screen))
    .replaceAll("{sleep}", night.sleep >= 0 ? fmtSleep(night.sleep) : "?");
}

/** The pool for a habit: avoid / build with a minimum version / plain build. */
export const poolOf = (m: HabitModel): ForecastPool =>
  m.kind === "avoid" ? "avoid" : m.min ? "buildMin" : "build";

/** "12:00" before 10:00, "14:00" later in the morning (mirrored in Forecast.until). */
export const untilMinute = (nowMin: number) => (nowMin < 10 * 60 ? 12 * 60 : 14 * 60);

/** Deterministic line index per day and habit (mirrored in Forecast.hash). */
export function lineHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Fill a forecast line and capitalise it (mirrored in Forecast.fill). */
export function fillForecast(
  line: string,
  v: { habit: string; pct: number; reason: string; min: string; until: string },
): string {
  const out = line
    .replaceAll("{reason}", v.reason)
    .replaceAll("{habit}", v.habit)
    .replaceAll("{pct}", String(v.pct))
    .replaceAll("{min}", v.min)
    .replaceAll("{until}", v.until);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

export interface ForecastItem {
  habitId: string;
  name: string;
  kind: "build" | "avoid";
  p: number;
  pct: number;
  base: number;
  reason: ReasonKey;
  text: string;
}

/** Most habits warned about at once. */
export const MAX_ITEMS = 2;

/** Is today already safe for this habit (kept / avoid answered)? */
function settledToday(h: Habit, idx: EntryIndex, now: Date): boolean {
  if (kindOf(h) === "avoid") return avoidStatus(h, idx, now, now) !== "pending";
  return keptOn(h, idx, now, now);
}

/**
 * Today's forecast: up to two habits that are meaningfully more likely than
 * usual to be missed today, riskiest first. [] when nothing stands out.
 * `includeSettled` = also habits already done today (for the backtest).
 */
export function dayForecast(
  habits: Habit[],
  completions: Completion[] | EntryIndex,
  reports: Record<string, NightReport>,
  level: TauntLevel,
  now: Date = new Date(),
  includeSettled = false,
): ForecastItem[] {
  const idx = completions instanceof Map ? completions : indexEntries(completions);
  const r = nightBefore(reports, now);
  const night: NightNums = {
    social: r?.social ?? 0,
    screen: r?.screen ?? 0,
    sleep: sleepOf(r) ?? -1,
  };
  const lines = forecastLines(level);
  const ph = reasonPhrases();
  const until = untilLabel(now);
  const out: ForecastItem[] = [];
  for (const h of habits) {
    // Due today (a screen-judged habit stays undecided all day, but is still at risk).
    if (!isDueOn(h, now) || h.schedule.type === "timesPerWeek") continue;
    if (!includeSettled && settledToday(h, idx, now)) continue;
    const m = trainModel(h, idx, reports, now);
    if (!m) continue;
    const f = featuresOn(h, idx, reports, now, now);
    const post = posterior(m, f);
    if (!post.warn || !post.reason) continue;
    const pool = lines[poolOf(m)];
    const line = pool[lineHash(`${todayKey(now)}|${h.id}`) % pool.length];
    out.push({
      habitId: h.id,
      name: h.name,
      kind: m.kind,
      p: post.p,
      pct: post.pct,
      base: m.base,
      reason: post.reason,
      text: fillForecast(line, {
        habit: h.name,
        pct: post.pct,
        reason: reasonText(post.reason, m, f, night, ph),
        min: m.min,
        until,
      }),
    });
  }
  return out.sort((a, b) => b.p - a.p).slice(0, MAX_ITEMS);
}

function untilLabel(now: Date): string {
  const m = untilMinute(now.getHours() * 60 + now.getMinutes());
  return `${String(m / 60).padStart(2, "0")}:00`;
}

/** The Today slide's window: 05:00-12:00. */
export const showForecastAt = (now: Date) => now.getHours() >= 5 && now.getHours() < 12;

// ---------------------------------------------------------------------------
// Native snapshot
// ---------------------------------------------------------------------------

/**
 * Everything the native morning notification needs to forecast on its own
 * (Forecast.java): each habit's compact model, the line pools and the reason
 * phrases. Models are trained on the days before `now`, so a snapshot written
 * last evening still forecasts this morning with last night's NightStats report.
 */
export function forecastSnapshot(
  habits: Habit[],
  completions: Completion[] | EntryIndex,
  reports: Record<string, NightReport>,
  level: TauntLevel,
  now: Date = new Date(),
) {
  const idx = completions instanceof Map ? completions : indexEntries(completions);
  const models = habits
    .map((h) => trainModel(h, idx, reports, now))
    .filter((m): m is HabitModel => m != null);
  return { models, lines: forecastLines(level), reasons: reasonPhrases() };
}

// ---------------------------------------------------------------------------
// "Prognoza się sprawdza" - how often past warnings came true
// ---------------------------------------------------------------------------

/**
 * Replays the morning forecast for each of the last `days` finished days
 * (trained only on what was known that morning) and checks the outcome.
 */
export function forecastHitRate(
  habits: Habit[],
  completions: Completion[],
  reports: Record<string, NightReport>,
  days = 30,
  now: Date = new Date(),
): { warned: number; hit: number } {
  const idx = indexEntries(completions);
  let warned = 0;
  let hit = 0;
  for (let i = days; i >= 1; i--) {
    const d = addDays(now, -i);
    const morning = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0);
    for (const item of dayForecast(habits, idx, reports, "soft", morning, true)) {
      const h = habits.find((x) => x.id === item.habitId);
      const miss = h ? missOn(h, idx, d, now) : null;
      if (miss == null) continue;
      warned++;
      if (miss) hit++;
    }
  }
  return { warned, hit };
}

/** "7 z 9 ostrzeżeń się sprawdziło (78%)"; null below 5 warnings. */
export function hitRateText(r: { warned: number; hit: number }): string | null {
  if (r.warned < 5) return null;
  const pct = Math.round((r.hit / r.warned) * 100);
  return L(
    `Prognoza się sprawdza: ${r.hit} z ${r.warned} ostrzeżeń z 30 dni (${pct}%).`,
    `The forecast holds up: ${r.hit} of ${r.warned} warnings in 30 days came true (${pct}%).`,
  );
}
