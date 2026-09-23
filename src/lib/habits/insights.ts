// Cross-habit insights ("W dni po wpadce z „Telefon do późna” robisz średnio
// o 3100 kroków mniej"). For every ordered pair of habits we compare the second
// habit's result on days after / the same day as a good vs a bad day of the
// first one, over the last ~2 months. Only differences that are both large and
// backed by enough days on each side are reported.
import { addDays } from "date-fns";
import type { Completion, Habit } from "./types";
import {
  amountOn,
  avoidStatus,
  dayScore,
  fmtNum,
  goalOf,
  indexEntries,
  isDueOn,
  kindOf,
  todayKey,
  unitLabel,
} from "./utils";

export interface Insight {
  text: string;
  /** Higher = more notable (effect size x sample size). */
  strength: number;
  /** True when the "bad" side of the cause goes with a worse result. */
  negative: boolean;
  causeId: string;
  effectId: string;
}

const MIN_DAYS_PER_SIDE = 5;
const MIN_RELATIVE = 0.2;
const MIN_RATE_POINTS = 15;

type Idx = ReturnType<typeof indexEntries>;

/** Numeric result of a habit on a day: amount for counts/minutes, 0-100 rate otherwise. */
function effectValue(h: Habit, idx: Idx, d: Date, now: Date): number {
  if (kindOf(h) === "build" && goalOf(h).type !== "check") return amountOn(h, idx, d);
  return Math.round(dayScore(h, idx, d, now) * 100);
}

function isBad(h: Habit, idx: Idx, d: Date, now: Date): boolean {
  if (kindOf(h) === "avoid") return avoidStatus(h, idx, d, now) === "slip";
  return dayScore(h, idx, d, now) < 1;
}

function badPhrase(h: Habit, lag: number): string {
  if (kindOf(h) === "avoid") return lag ? `Dzień po wpadce z „${h.name}”` : `W dni z wpadką „${h.name}”`;
  return lag ? `Dzień po niezaliczonym „${h.name}”` : `W dni bez „${h.name}”`;
}

function effectPhrase(h: Habit, bad: number, good: number): string {
  const diff = Math.round(Math.abs(bad - good));
  const b = Math.round(bad);
  const g = Math.round(good);
  if (kindOf(h) === "build" && goalOf(h).type !== "check") {
    const unit = unitLabel(h, g);
    return `„${h.name}” średnio ${fmtNum(b)} zamiast ${fmtNum(g)} ${unit} (o ${fmtNum(diff)} ${unitLabel(h, diff)} ${bad < good ? "mniej" : "więcej"})`;
  }
  const what = kindOf(h) === "avoid" ? `czyste dni z „${h.name}”` : `„${h.name}” zaliczone`;
  return `${what} w ${b}% dni zamiast ${g}% (o ${diff} pkt ${bad < good ? "rzadziej" : "częściej"})`;
}

export function habitInsights(habits: Habit[], completions: Completion[], days = 60, now = new Date()): Insight[] {
  const idx = indexEntries(completions);
  const out: Insight[] = [];
  const todayK = todayKey(now);

  for (const cause of habits) {
    for (const effect of habits) {
      if (cause.id === effect.id) continue;
      let best: Insight | null = null;
      for (const lag of [0, 1]) {
        const badVals: number[] = [];
        const goodVals: number[] = [];
        for (let i = days; i >= 1; i--) {
          const d = addDays(now, -i);
          const e = addDays(d, lag);
          if (todayKey(e) >= todayK) continue; // only finished days
          if (!isDueOn(cause, d) || !isDueOn(effect, e)) continue;
          if (cause.schedule.type === "timesPerWeek" || effect.schedule.type === "timesPerWeek") continue;
          (isBad(cause, idx, d, now) ? badVals : goodVals).push(effectValue(effect, idx, e, now));
        }
        if (badVals.length < MIN_DAYS_PER_SIDE || goodVals.length < MIN_DAYS_PER_SIDE) continue;
        const bad = badVals.reduce((a, b) => a + b, 0) / badVals.length;
        const good = goodVals.reduce((a, b) => a + b, 0) / goodVals.length;
        const isRate = !(kindOf(effect) === "build" && goalOf(effect).type !== "check");
        const relative = Math.abs(bad - good) / Math.max(Math.abs(good), Math.abs(bad), 1);
        if (relative < MIN_RELATIVE || (isRate && Math.abs(bad - good) < MIN_RATE_POINTS)) continue;
        const strength = relative * Math.sqrt(Math.min(badVals.length, goodVals.length));
        if (!best || strength > best.strength) {
          best = {
            text: `${badPhrase(cause, lag)}: ${effectPhrase(effect, bad, good)}.`,
            strength,
            negative: bad < good,
            causeId: cause.id,
            effectId: effect.id,
          };
        }
      }
      if (best) out.push(best);
    }
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 4);
}

/** Days with any history - used to tell the user how long until insights appear. */
export function trackedDays(completions: Completion[]): number {
  return new Set(completions.map((c) => c.date)).size;
}

/** Median minute of the first log entry over the last 30 days ("zwykle o 21:10"), or null. */
export function usualMinute(h: Habit, completions: Completion[], now = new Date()): number | null {
  const since = todayKey(addDays(now, -30));
  const mins = completions
    .filter((c) => c.habitId === h.id && c.date >= since && c.log?.length && !c.auto)
    .map((c) => c.log![0][0])
    .sort((a, b) => a - b);
  if (mins.length < 3) return null;
  return mins[Math.floor(mins.length / 2)];
}

export interface MonthDay {
  date: Date;
  key: string;
  inMonth: boolean;
  future: boolean;
  /** 0-100, null when nothing was due. */
  rate: number | null;
}

/** Mon-first calendar grid (6 weeks) for the month containing `month`, with the overall daily rate. */
export function monthGrid(habits: Habit[], completions: Completion[], month: Date, now = new Date()): MonthDay[] {
  const idx = indexEntries(completions);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = addDays(first, -offset);
  const todayK = todayKey(now);
  const out: MonthDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const key = todayKey(d);
    let due = 0;
    let sum = 0;
    if (key <= todayK) {
      for (const h of habits) {
        if (!isDueOn(h, d) || h.schedule.type === "timesPerWeek") continue;
        due++;
        sum += dayScore(h, idx, d, now);
      }
    }
    out.push({
      date: d,
      key,
      inMonth: d.getMonth() === month.getMonth(),
      future: key > todayK,
      rate: due ? Math.round((sum / due) * 100) : null,
    });
  }
  return out;
}
