// "Nigdy dwa razy z rzędu" + "wersja minimum".
// A bad day happens; two in a row start a new (bad) habit. So:
//  - every build habit has a minimum version for a bad day (5 min of reading,
//    1 glass, 2000 steps) that keeps the chain alive even below the goal;
//  - the day after a miss is a rescue day: Szpila pushes the minimum, the
//    habit goes to the top of the plan, and reaching it gets its own praise.
// Missing a day below the minimum twice in a row is what breaks the chain.
import { addDays } from "date-fns";
import type { Completion, Habit } from "./types";
import {
  amountOn,
  countsOn,
  createdKey,
  dayScore,
  goalOf,
  indexEntries,
  isDueOn,
  kindOf,
  todayKey,
  unitLabel,
  fmtNum,
  type EntryIndex,
} from "./utils";

/** Minimum version of a build habit (0 = none: avoid habits, single checks, target 1). */
export function minimumOf(h: Habit): number {
  if (kindOf(h) === "avoid") return 0;
  const g = goalOf(h);
  if (g.type === "check" || g.target <= 1) return 0;
  if (h.minimum != null) return h.minimum > 0 ? Math.min(Math.round(h.minimum), g.target) : 0;
  return autoMinimum(g.type, g.target, g.step);
}

/** A quarter of the goal: minutes rounded up to 5, counts up to whole steps. */
export function autoMinimum(type: "count" | "minutes", target: number, step: number): number {
  if (target <= 1) return 0;
  const quarter = target / 4;
  let m =
    type === "minutes"
      ? Math.max(5, Math.ceil(quarter / 5) * 5)
      : step > 1 && step < target
        ? Math.max(step, Math.ceil(quarter / step) * step)
        : Math.max(1, Math.ceil(quarter));
  if (m >= target) m = type === "minutes" ? Math.max(1, Math.floor(target / 2)) : 0;
  return m;
}

/** "5 min", "1 szklanka", "2000 kroków". */
export function minimumLabel(h: Habit): string {
  const m = minimumOf(h);
  return m > 0 ? `${fmtNum(m)} ${unitLabel(h, m)}`.trim() : "";
}

/** The day kept the chain alive: the minimum (or the goal) for build habits, clean for avoid ones. */
export function keptOn(
  h: Habit,
  idx: EntryIndex | Completion[],
  date: Date,
  now: Date = new Date(),
): boolean {
  if (kindOf(h) === "avoid") return dayScore(h, idx, date, now) >= 1;
  const min = minimumOf(h);
  const amount = amountOn(h, idx, date);
  return amount >= (min > 0 ? min : goalOf(h).target);
}

/** The last due day before `date` (within a week), or null. Not for "N times a week" habits. */
export function previousDueDay(h: Habit, date: Date): Date | null {
  if (h.schedule.type === "timesPerWeek") return null;
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, -i);
    if (h.createdAt && todayKey(d) < createdKey(h)) return null;
    if (isDueOn(h, d)) return d;
  }
  return null;
}

/**
 * Rescue day: the last due day was missed (below the minimum / a slip), and
 * today isn't kept yet. Avoid habits stay in rescue until today is confirmed clean.
 */
export function rescueOn(
  h: Habit,
  completions: Completion[] | EntryIndex,
  now: Date = new Date(),
): boolean {
  const idx = Array.isArray(completions) ? indexEntries(completions) : completions;
  if (!countsOn(h, idx, now, now)) return false;
  const prev = previousDueDay(h, now);
  if (!prev || !countsOn(h, idx, prev, now)) return false;
  if (keptOn(h, idx, prev, now)) return false;
  return !keptOn(h, idx, now, now);
}

/** Two misses in a row ended the chain: due days since the last double miss (yesterday backwards). */
export function neverTwiceStreak(
  h: Habit,
  completions: Completion[],
  now: Date = new Date(),
): number {
  const idx = indexEntries(completions);
  let run = 0;
  let missedNext = false; // the later due day (closer to today) was a miss
  // Today only counts once it's kept (it's still in play).
  if (countsOn(h, idx, now, now) && keptOn(h, idx, now, now)) run++;
  for (let i = 1; i < 400; i++) {
    const d = addDays(now, -i);
    if (h.createdAt && todayKey(d) < createdKey(h)) break;
    if (!countsOn(h, idx, d, now)) continue;
    const kept = keptOn(h, idx, d, now);
    if (!kept && missedNext) {
      run = Math.max(0, run - 1); // the later miss was the second one: it broke the chain
      break;
    }
    run++;
    missedNext = !kept;
  }
  return run;
}

/** Times a habit was missed two due days in a row in the last `days` days. */
export function doubleMisses(
  h: Habit,
  completions: Completion[],
  days = 30,
  now: Date = new Date(),
): number {
  const idx = indexEntries(completions);
  let n = 0;
  let prevMiss = false;
  for (let i = days; i >= 1; i--) {
    const d = addDays(now, -i);
    if (h.createdAt && todayKey(d) < createdKey(h)) continue;
    if (!countsOn(h, idx, d, now)) continue;
    const miss = !keptOn(h, idx, d, now);
    if (miss && prevMiss) n++;
    prevMiss = miss;
  }
  return n;
}
