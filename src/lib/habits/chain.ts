// Glue for "never twice" + the weekly focus: which habits get pushed (plan
// order, Szpila's lines) today. Used by Today, Szpila and the native snapshot.
import type { Completion, Habit } from "./types";
import type { TauntLevel } from "./store";
import { focusHabit, type WeeklyFocus } from "./focus";
import { minimumLabel, rescueOn } from "./rescue";
import { fillRescue, rescueLines } from "./szpila-rescue";
import { indexEntries, kindOf, type EntryIndex } from "./utils";

/** Habit ids that go first in the plan once due: rescue days + this week's focus. */
export function boostSet(
  habits: Habit[],
  completions: Completion[],
  focus: WeeklyFocus | null | undefined,
  now: Date = new Date(),
): Set<string> {
  const idx = indexEntries(completions);
  const out = new Set<string>();
  for (const h of habits) if (rescueOn(h, idx, now)) out.add(h.id);
  const f = focusHabit(habits, focus, now);
  if (f) out.add(f.id);
  return out;
}

/** Rescue-day lines for a habit ({name}/{min} filled), or [] when it's not a rescue day. */
export function rescuePool(
  h: Habit,
  idx: EntryIndex | Completion[],
  level: TauntLevel,
  now: Date = new Date(),
): string[] {
  if (!rescueOn(h, idx, now)) return [];
  const l = rescueLines(level);
  return fillRescue(kindOf(h) === "avoid" ? l.rescueAvoid : l.rescue, h.name, minimumLabel(h));
}

/** The rescue-day pool of a habit whatever today is (for the native side, which decides itself). */
export function chainLines(h: Habit, level: TauntLevel): string[] {
  const l = rescueLines(level);
  return fillRescue(kindOf(h) === "avoid" ? l.rescueAvoid : l.rescue, h.name, minimumLabel(h));
}

/** Weekly-focus nags for the focus habit, [] for the others. */
export function focusPool(
  h: Habit,
  focusId: string | null | undefined,
  level: TauntLevel,
): string[] {
  if (!focusId || h.id !== focusId) return [];
  return fillRescue(rescueLines(level).focus, h.name, minimumLabel(h));
}

/** Szpila's praise when the minimum is reached below the goal (rescue day or not). */
export function minimumPraise(h: Habit, level: TauntLevel): string {
  const pool = fillRescue(rescueLines(level).rescuePraise, h.name, minimumLabel(h));
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Praise for the weekly focus habit done today. */
export function focusPraise(h: Habit, level: TauntLevel): string {
  const pool = fillRescue(rescueLines(level).focusPraise, h.name, minimumLabel(h));
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Chance (percent) a jab about a pushed habit uses its rescue / focus line. Mirrored in HabitNotifier. */
export const CHAIN_CHANCE = { rescue: 60, focus: 45 } as const;
