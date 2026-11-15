// "Podsumowanie dnia": in the evening Szpila writes how the day went, like a mate would, plus
// one piece of advice for tomorrow that comes from the user's own history. The app can be
// closed by then, so the work is split: here (JS) we work out WHEN (learned from when the
// user is usually done for the day) and WHAT to advise (patterns in the history); the native
// side (DaySummary.java) composes the text at send time from the day's final state.
import { addDays } from "date-fns";
import type { Completion, Habit } from "./types";
import {
  countsOn,
  dayScore,
  fmtNum,
  formatMinute,
  goalOf,
  indexEntries,
  isDueOn,
  kindOf,
  todayKey,
  unitLabel,
  type EntryIndex,
} from "./utils";
import { usualMinute } from "./insights";
import { minimumOf } from "./rescue";
import { isDiscreet } from "./discreet";
import { isEn, L } from "@/lib/i18n";
import type { TauntLevel } from "./store";

/** Without enough history: a bit after the default evening review (21:30). */
export const DEFAULT_AT = 21 * 60 + 45;
/** Never before / after these (the summary is about a finished day, not the next one). */
export const EARLIEST = 19 * 60 + 30;
export const LATEST = 23 * 60 + 45;
/** Days with evening activity needed before the time is learned. */
export const MIN_DAYS = 5;
const LOOKBACK = 21;
/** Minutes after the usual end of activity. */
const AFTER = 20;

/**
 * When the day is usually over for this user: the 75th percentile of the last manual log of
 * each evening (12:00-24:00) over the last 3 weeks, plus 20 minutes. Kept clear of the evening
 * review so the two don't arrive together. `learned` = from data, not the default.
 */
export function summaryMinute(
  completions: Completion[],
  reviewAt: number | null,
  now: Date = new Date(),
): { at: number; learned: boolean } {
  const since = todayKey(addDays(now, -LOOKBACK));
  const today = todayKey(now);
  const last = new Map<string, number>();
  for (const c of completions) {
    if (c.auto || !c.log?.length || c.date < since || c.date >= today) continue;
    for (const [m] of c.log) {
      if (m < 12 * 60 || m >= 24 * 60) continue;
      last.set(c.date, Math.max(last.get(c.date) ?? 0, m));
    }
  }
  const mins = [...last.values()].sort((a, b) => a - b);
  let at = DEFAULT_AT;
  const learned = mins.length >= MIN_DAYS;
  if (learned) at = mins[Math.min(mins.length - 1, Math.floor(mins.length * 0.75))] + AFTER;
  at = Math.max(EARLIEST, Math.min(LATEST, Math.round(at / 5) * 5));
  if (reviewAt != null && Math.abs(at - reviewAt) < 15) at = reviewAt + 15;
  return { at: Math.min(LATEST, at), learned };
}

// ---------------------------------------------------------------------------- analysis

const WEEKDAY_PL = [
  "w niedzielę",
  "w poniedziałek",
  "we wtorek",
  "w środę",
  "w czwartek",
  "w piątek",
  "w sobotę",
];
const WEEKDAY_EN = [
  "on Sundays",
  "on Mondays",
  "on Tuesdays",
  "on Wednesdays",
  "on Thursdays",
  "on Fridays",
  "on Saturdays",
];
const TOMORROW_PL = [
  "niedziela",
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
];
const TOMORROW_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pct = (x: number) => Math.round(x * 100);

/** Finished days (oldest first) of the last `days`, with the habit due and counted. */
function pastDays(h: Habit, idx: EntryIndex, now: Date, days: number): Date[] {
  const out: Date[] = [];
  for (let i = days; i >= 1; i--) {
    const d = addDays(now, -i);
    if (countsOn(h, idx, d, now)) out.push(d);
  }
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Advice for one build habit, best first, for a day it wasn't finished. Every line comes from
 * this user's history: tomorrow's weak weekday, a goal that's clearly too high, the time it
 * usually gets done, the minimum version that keeps the chain alive.
 */
export function habitTips(
  h: Habit,
  completions: Completion[],
  idx: EntryIndex,
  now: Date = new Date(),
): string[] {
  if (kindOf(h) !== "build") return [];
  const out: string[] = [];
  const days = pastDays(h, idx, now, 56);
  const scores = days.map((d) => dayScore(h, idx, d, now));
  const overall = avg(scores);
  const tomorrow = addDays(now, 1);
  const wd = tomorrow.getDay();

  // 1. Tomorrow is the weekday this habit usually falls through.
  if (isDueOn(h, tomorrow)) {
    const same = days.map((d, i) => [d, scores[i]] as const).filter(([d]) => d.getDay() === wd);
    const rest = days.map((d, i) => [d, scores[i]] as const).filter(([d]) => d.getDay() !== wd);
    const s = avg(same.map(([, x]) => x));
    const r = avg(rest.map(([, x]) => x));
    if (same.length >= 4 && rest.length >= 8 && r - s >= 0.25) {
      out.push(
        L(
          `„${h.name}” ${WEEKDAY_PL[wd]} wychodzi ci średnio na ${pct(s)}%, w inne dni na ${pct(r)}%. Jutro ${TOMORROW_PL[wd]}, więc zrób to z samego rana, zanim dzień cię wciągnie.`,
          `“${h.name}” ${WEEKDAY_EN[wd]} averages ${pct(s)}%, other days ${pct(r)}%. Tomorrow is ${TOMORROW_EN[wd]}, so do it first thing, before the day pulls you in.`,
        ),
      );
    }
  }

  // 2. The goal is too high to be a habit (rarely reached, but often started).
  const g = goalOf(h);
  if (g.type !== "check" && days.length >= 14) {
    const full = scores.filter((x) => x >= 1).length / scores.length;
    const started = scores.filter((x) => x > 0);
    const typical = avg(started) * g.target;
    if (full < 0.35 && started.length >= days.length / 2 && typical >= g.step) {
      const lower = Math.max(g.step, Math.round((typical * 1.1) / g.step) * g.step);
      if (lower < g.target) {
        out.push(
          L(
            `„${h.name}”: pełny cel (${fmtNum(g.target)} ${unitLabel(h, g.target)}) wpada tylko w ${pct(full)}% dni, a zwykle robisz ok. ${fmtNum(Math.round(typical))}. Zejdź na ${fmtNum(lower)} na 2 tygodnie: lepiej codziennie mniej niż raz na jakiś czas wszystko.`,
            `“${h.name}”: the full goal (${fmtNum(g.target)} ${unitLabel(h, g.target)}) lands on just ${pct(full)}% of days, you usually do about ${fmtNum(Math.round(typical))}. Drop to ${fmtNum(lower)} for 2 weeks: a bit every day beats everything once in a while.`,
          ),
        );
      }
    }
  }

  // 3. When it usually happens - tomorrow, put it exactly there.
  const usual = usualMinute(h, completions, now);
  if (usual != null) {
    out.push(
      L(
        `„${h.name}” zwykle ogarniasz ok. ${formatMinute(usual)}. Jutro wpisz to sobie na tę godzinę jak spotkanie, nie „jak będzie chwila”.`,
        `You usually get “${h.name}” done around ${formatMinute(usual)}. Tomorrow, book that time like a meeting, not “when I get a minute”.`,
      ),
    );
  }

  // 4. The minimum version keeps the chain alive on a bad day.
  const min = minimumOf(h);
  if (min > 0) {
    out.push(
      L(
        `„${h.name}”: w gorszy dzień nie musisz robić całości. ${fmtNum(min)} ${unitLabel(h, min)} wystarczy, żeby seria żyła.`,
        `“${h.name}”: on a bad day you don't have to do it all. ${fmtNum(min)} ${unitLabel(h, min)} keeps the streak alive.`,
      ),
    );
  }
  if (overall === 0 && out.length === 0) {
    out.push(
      L(
        `„${h.name}” od dawna stoi w miejscu. Jutro zrób z tego 2 minuty: sam start się liczy.`,
        `“${h.name}” hasn't moved in a while. Tomorrow make it 2 minutes: just starting counts.`,
      ),
    );
  }
  return out;
}

/** First manual log minute of a day over the given habits (null = nothing logged by hand). */
function firstLog(completions: Completion[], ids: Set<string>, key: string): number | null {
  let first: number | null = null;
  for (const c of completions) {
    if (c.date !== key || c.auto || !ids.has(c.habitId) || !c.log?.length) continue;
    const m = c.log[0][0];
    if (first == null || m < first) first = m;
  }
  return first;
}

/**
 * Patterns across the whole day: how the day ends depending on when it starts. Days where the
 * first habit was ticked off before 10:00 vs later, over the last 6 weeks.
 */
export function generalTips(
  habits: Habit[],
  completions: Completion[],
  idx: EntryIndex,
  now: Date = new Date(),
): string[] {
  const out: string[] = [];
  const build = habits.filter((h) => kindOf(h) === "build");
  if (build.length === 0) return out;
  const ids = new Set(build.map((h) => h.id));
  const early: number[] = [];
  const late: number[] = [];
  for (let i = 42; i >= 1; i--) {
    const d = addDays(now, -i);
    const counted = habits.filter((h) => countsOn(h, idx, d, now));
    if (counted.length === 0) continue;
    const frac = avg(counted.map((h) => dayScore(h, idx, d, now)));
    // only days that got started at all: an empty day says nothing about when to start
    const first = firstLog(completions, ids, todayKey(d));
    if (first == null) continue;
    (first < 10 * 60 ? early : late).push(frac);
  }
  if (early.length >= 5 && late.length >= 5 && avg(early) - avg(late) >= 0.15) {
    out.push(
      L(
        `Dni, w których pierwsze zadanie odhaczasz przed 10:00, kończysz średnio na ${pct(avg(early))}%, a pozostałe na ${pct(avg(late))}%. Jutro jedna rzecz zaraz po wstaniu i reszta pójdzie łatwiej.`,
        `Days when you tick off the first habit before 10:00 end at ${pct(avg(early))}% on average, the rest at ${pct(avg(late))}%. Tomorrow do one thing right after getting up and the rest gets easier.`,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------- lines

export type Tier = "full" | "great" | "ok" | "weak" | "zero";

/** Mirrors DaySummary.tier(): how the day went. */
export function tierOf(percent: number): Tier {
  if (percent >= 100) return "full";
  if (percent >= 75) return "great";
  if (percent >= 45) return "ok";
  if (percent > 0) return "weak";
  return "zero";
}

type Lines = Record<Tier, string[]>;

// {pct} percent of the day, {done}/{total} habits. Gender-neutral on purpose.
const PL: Record<TauntLevel, Lines> = {
  hard: {
    full: [
      "Komplet, {pct}%. No kurde, szacun. Nie mam się do czego przyczepić, a to mnie boli.",
      "Wszystko odhaczone. Tak się to robi, bez pierdolenia.",
      "{done}/{total}. Dzień zamknięty na cacy. Idź spać jak król życia.",
    ],
    great: [
      "{pct}%. Mocny dzień, zabrakło tyle co nic. Jutro domykamy na sto.",
      "Prawie komplet, {done}/{total}. Prawie robi różnicę, ale i tak szacun.",
      "{pct}% dnia. Dobra robota, choć dało się jeszcze docisnąć.",
    ],
    ok: [
      "{pct}%. Ani wstyd, ani chwała. Jutro trzeba docisnąć.",
      "Połowa z hakiem, {done}/{total}. Da się żyć, ale wiemy, że stać cię na więcej.",
      "Dzień na {pct}%. Jak kawa bez kofeiny: niby jest, ale szału nie ma.",
    ],
    weak: [
      "{pct}%. Dzień się trochę rozjechał. Zdarza się, byle nie dwa razy z rzędu.",
      "Tylko {done}/{total}. Słabo, ale jutro jest nowa runda.",
      "{pct}%. No nie był to twój dzień. Otrząśnij się, jutro gramy dalej.",
    ],
    zero: [
      "Zero. Okrągłe, piękne zero. Jutro zaczynamy od jednej rzeczy, nie od wszystkich.",
      "Dzień na zero. Nie zamęczaj się tym, jutro jeden mały krok i jedziemy.",
    ],
  },
  soft: {
    full: [
      "Komplet, {pct}%! Dzień zamknięty, szacun. Odpoczywaj.",
      "Wszystko odhaczone, {done}/{total}. Dziś masz pełne prawo się pochwalić.",
    ],
    great: [
      "{pct}% dnia. Mocny dzień, brakło naprawdę niewiele.",
      "Prawie komplet: {done}/{total}. Kawał dobrej roboty.",
    ],
    ok: [
      "Dzień na {pct}%. Nie tragedia, nie fajerwerki. Jutro dokręcimy.",
      "{done}/{total}. Połowa z hakiem, solidna baza na jutro.",
    ],
    weak: [
      "{pct}%. Słabszy dzień, zdarza się każdemu. Ważne, żeby jutro nie był drugi z rzędu.",
      "Dziś {done}/{total}. Bez dramatu, jutro wracamy do gry.",
    ],
    zero: [
      "Dziś zero. Bywa. Jutro wystarczy jedno małe zadanie na start.",
      "Pusty dzień. Nie ma co się biczować, jutro zaczynamy od najprostszego.",
    ],
  },
};

const EN: Record<TauntLevel, Lines> = {
  hard: {
    full: [
      "Full house, {pct}%. Damn, respect. Nothing to pick on and it hurts me.",
      "Everything ticked off. That's how it's done, no bullshit.",
      "{done}/{total}. Day closed. Go to bed like you own the place.",
    ],
    great: [
      "{pct}%. Strong day, missed by a hair. Tomorrow we close it out.",
      "Almost all of it, {done}/{total}. Almost counts for a lot here.",
    ],
    ok: [
      "{pct}%. Not a disgrace, not a parade. Tomorrow we push.",
      "Half and a bit, {done}/{total}. You'll live, but we both know you can do more.",
    ],
    weak: [
      "{pct}%. The day got away from you. Happens, just not twice in a row.",
      "Only {done}/{total}. Weak, but tomorrow is a new round.",
    ],
    zero: [
      "Zero. A nice, round zero. Tomorrow we start with one thing, not everything.",
      "A zero day. Don't beat yourself up, one small step tomorrow and we roll.",
    ],
  },
  soft: {
    full: [
      "Full house, {pct}%! Day closed, respect. Rest up.",
      "Everything done, {done}/{total}. You've earned some bragging tonight.",
    ],
    great: [
      "{pct}% of the day. Strong day, so close.",
      "Almost all of it: {done}/{total}. Great work.",
    ],
    ok: [
      "A {pct}% day. No disaster, no fireworks. We'll tighten it up tomorrow.",
      "{done}/{total}. Half and a bit, a solid base for tomorrow.",
    ],
    weak: [
      "{pct}%. A weaker day, happens to everyone. Just don't make it two in a row.",
      "Today {done}/{total}. No drama, back in the game tomorrow.",
    ],
    zero: [
      "Zero today. It happens. Tomorrow one small habit is enough to start.",
      "An empty day. No beating yourself up, tomorrow we start with the easiest one.",
    ],
  },
};

/** "Piotr, komplet…" - the name up front when there is one. */
function withName(line: string, name: string | null): string {
  if (!name) return line;
  return `${name}, ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
}

/** Opening lines per tier, personalised (placeholders {pct}/{done}/{total} left for native). */
export function summaryLines(level: TauntLevel, userName: string | null): Lines {
  const t = (isEn() ? EN : PL)[level];
  const out = {} as Lines;
  for (const k of Object.keys(t) as Tier[]) out[k] = t[k].map((l) => withName(l, userName));
  return out;
}

export interface SummarySnapshot {
  /** Minute of the day to send it (learned or the default). */
  at: number;
  learned: boolean;
  /** Openers by tier (DaySummary.tier). */
  lines: Lines;
  /** Advice per habit id, best first - used when that habit isn't finished. Never discreet ones. */
  tips: Record<string, string[]>;
  /** Day-wide advice, for a finished day or when no habit has its own. */
  general: string[];
}

/** Everything the native summary needs (bridge.ts -> "summary"). */
export function summarySnapshot(
  habits: Habit[],
  completions: Completion[],
  level: TauntLevel,
  userName: string | null,
  reviewAt: number | null,
  now: Date = new Date(),
): SummarySnapshot {
  const idx = indexEntries(completions);
  const open = habits.filter((h) => !isDiscreet(h));
  const tips: Record<string, string[]> = {};
  for (const h of open) {
    if (!isDueOn(h, now)) continue;
    const t = habitTips(h, completions, idx, now);
    if (t.length) tips[h.id] = t.slice(0, 3);
  }
  return {
    ...summaryMinute(completions, reviewAt, now),
    lines: summaryLines(level, userName),
    tips,
    general: generalTips(open, completions, idx, now),
  };
}
