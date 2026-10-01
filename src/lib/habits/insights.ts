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
  countsOn,
  kindOf,
  todayKey,
  unitLabel,
} from "./utils";
import { isEn } from "@/lib/i18n";
import type { NightReport } from "@/lib/sensors";
import { fmtSleep } from "@/lib/night";

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
  if (isEn()) {
    if (kindOf(h) === "avoid")
      return lag ? `The day after a slip with “${h.name}”` : `On days with a “${h.name}” slip`;
    return lag ? `The day after missing “${h.name}”` : `On days without “${h.name}”`;
  }
  if (kindOf(h) === "avoid")
    return lag ? `Dzień po wpadce z „${h.name}”` : `W dni z wpadką „${h.name}”`;
  return lag ? `Dzień po niezaliczonym „${h.name}”` : `W dni bez „${h.name}”`;
}

function effectPhrase(h: Habit, bad: number, good: number): string {
  const diff = Math.round(Math.abs(bad - good));
  const b = Math.round(bad);
  const g = Math.round(good);
  const less = bad < good;
  if (kindOf(h) === "build" && goalOf(h).type !== "check") {
    const unit = unitLabel(h, g);
    if (isEn())
      return `“${h.name}” averages ${fmtNum(b)} instead of ${fmtNum(g)} ${unit} (${fmtNum(diff)} ${unitLabel(h, diff)} ${less ? "fewer" : "more"})`;
    return `„${h.name}” średnio ${fmtNum(b)} zamiast ${fmtNum(g)} ${unit} (o ${fmtNum(diff)} ${unitLabel(h, diff)} ${less ? "mniej" : "więcej"})`;
  }
  if (isEn()) {
    const what = kindOf(h) === "avoid" ? `clean from “${h.name}”` : `“${h.name}” done`;
    return `${what} on ${b}% of days instead of ${g}% (${diff} pts ${less ? "less often" : "more often"})`;
  }
  const what = kindOf(h) === "avoid" ? `czyste dni z „${h.name}”` : `„${h.name}” zaliczone`;
  return `${what} w ${b}% dni zamiast ${g}% (o ${diff} pkt ${less ? "rzadziej" : "częściej"})`;
}

export function habitInsights(
  habits: Habit[],
  completions: Completion[],
  days = 60,
  now = new Date(),
): Insight[] {
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
          if (!countsOn(cause, idx, d, now) || !countsOn(effect, idx, e, now)) continue;
          if (cause.schedule.type === "timesPerWeek" || effect.schedule.type === "timesPerWeek")
            continue;
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
export function monthGrid(
  habits: Habit[],
  completions: Completion[],
  month: Date,
  now = new Date(),
): MonthDay[] {
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
        if (!countsOn(h, idx, d, now) || h.schedule.type === "timesPerWeek") continue;
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

// ---------------------------------------------------------------------------
// Sleep from the band (night reports) - "Po nocy z social mediami po północy
// śpisz średnio 52 min krócej", "Po nocy krótszej niż 6 h: „Kroki” średnio ...".
// ---------------------------------------------------------------------------

/** Nights per side needed before a sleep insight shows up. */
const MIN_NIGHTS_PER_SIDE = 4;
/** Sleep differences smaller than this aren't worth a line. */
const MIN_SLEEP_DIFF = 20;

/** A night filed under day key `k` (evening of k → morning of k+1) with sleep minutes from the band. */
interface SleepNight {
  key: string;
  minutes: number;
  social: number;
}

function sleepNights(reports: Record<string, NightReport>, days: number, now: Date): SleepNight[] {
  const since = todayKey(addDays(now, -days));
  const todayK = todayKey(now);
  return Object.values(reports)
    .filter((r) => r.date >= since && r.date < todayK && r.sleep && r.sleep.minutes >= 0)
    .map((r) => ({ key: r.date, minutes: r.sleep!.minutes, social: r.social ?? 0 }));
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/**
 * Insights from the band's sleep: social media after midnight vs sleep length,
 * and short nights (< 6 h) vs the next day's habits. Same shape as habitInsights.
 */
export function sleepInsights(
  habits: Habit[],
  completions: Completion[],
  reports: Record<string, NightReport>,
  days = 60,
  now = new Date(),
): Insight[] {
  const nights = sleepNights(reports, days, now);
  const out: Insight[] = [];

  // 1) Scrolling after midnight vs how long you sleep.
  const scrolled = nights.filter((n) => n.social > 0).map((n) => n.minutes);
  const clean = nights.filter((n) => n.social === 0).map((n) => n.minutes);
  if (scrolled.length >= MIN_NIGHTS_PER_SIDE && clean.length >= MIN_NIGHTS_PER_SIDE) {
    const bad = mean(scrolled);
    const good = mean(clean);
    const diff = Math.round(Math.abs(bad - good));
    if (diff >= MIN_SLEEP_DIFF) {
      const less = bad < good;
      out.push({
        text: isEn()
          ? `After a night with social media past midnight you sleep ${diff} min ${less ? "less" : "more"} on average (${fmtSleep(bad)} instead of ${fmtSleep(good)}).`
          : `Po nocy z social mediami po północy śpisz średnio ${diff} min ${less ? "krócej" : "dłużej"} (${fmtSleep(bad)} zamiast ${fmtSleep(good)}).`,
        strength: (diff / 120) * Math.sqrt(Math.min(scrolled.length, clean.length)),
        negative: less,
        causeId: "night-social",
        effectId: "sleep",
      });
    }
  }

  // 2) Short nights vs the next day's habits (night filed under D -> day D+1).
  const idx = indexEntries(completions);
  const todayK = todayKey(now);
  for (const effect of habits) {
    if (effect.schedule.type === "timesPerWeek") continue;
    const shortVals: number[] = [];
    const okVals: number[] = [];
    for (const n of nights) {
      const [y, m, d] = n.key.split("-").map(Number);
      const e = addDays(new Date(y, m - 1, d), 1);
      if (todayKey(e) >= todayK || !countsOn(effect, idx, e, now)) continue;
      (n.minutes < 6 * 60 ? shortVals : okVals).push(effectValue(effect, idx, e, now));
    }
    if (shortVals.length < MIN_NIGHTS_PER_SIDE || okVals.length < MIN_NIGHTS_PER_SIDE) continue;
    const bad = mean(shortVals);
    const good = mean(okVals);
    const isRate = !(kindOf(effect) === "build" && goalOf(effect).type !== "check");
    const relative = Math.abs(bad - good) / Math.max(Math.abs(good), Math.abs(bad), 1);
    if (relative < MIN_RELATIVE || (isRate && Math.abs(bad - good) < MIN_RATE_POINTS)) continue;
    const lead = isEn() ? "After a night under 6 h of sleep" : "Po nocy krótszej niż 6 h snu";
    out.push({
      text: `${lead}: ${effectPhrase(effect, bad, good)}.`,
      strength: relative * Math.sqrt(Math.min(shortVals.length, okVals.length)),
      negative: bad < good,
      causeId: "sleep-short",
      effectId: effect.id,
    });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 3);
}
