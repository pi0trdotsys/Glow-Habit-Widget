// Water from "Kropi - Nawodnienie" (com.kropi.hydration, the user's own app,
// same signing key). A water habit linked to Kropi ("source: kropi") counts
// millilitres: today's total and Kropi's goal come from Kropi, past days are
// back-filled from its history, and logging water from Szpila opens Kropi's
// quick add - one place to log. Native side: Kropi.java / KropiReceiver.java.
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Completion, Habit, HabitGoal } from "@/lib/habits/types";
import { amountOn, goalOf, kindOf } from "@/lib/habits/utils";
import { categoryOf } from "@/lib/habits/szpila";

export interface KropiDay {
  /** "yyyy-MM-dd" */
  date: string;
  ml: number;
  goal: number;
}

export interface KropiStatus {
  installed: boolean;
  /** Same signing key -> the read permission is granted. */
  granted: boolean;
}

interface KropiPlugin {
  kropiStatus(): Promise<KropiStatus>;
  kropiDays(): Promise<{ days: KropiDay[] }>;
  kropiAdd(): Promise<void>;
}
const Native = registerPlugin<KropiPlugin>("HabitWidget");
const isNative = () => Capacitor.isNativePlatform();

/** A glass when converting old entries counted in glasses. */
export const GLASS_ML = 250;
/** Days of Kropi history pulled in (and kept in sync). */
export const SYNC_DAYS = 14;

export async function kropiStatus(): Promise<KropiStatus> {
  if (!isNative()) return { installed: false, granted: false };
  try {
    return await Native.kropiStatus();
  } catch {
    return { installed: false, granted: false };
  }
}

export async function kropiDays(): Promise<KropiDay[]> {
  if (!isNative()) return [];
  try {
    return (await Native.kropiDays()).days ?? [];
  } catch {
    return [];
  }
}

/** Log a glass in Kropi (its quick add). False when Kropi isn't there. */
export async function kropiAdd(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await Native.kropiAdd();
    return true;
  } catch {
    return false;
  }
}

export const isKropi = (h: Habit) => h.source === "kropi";

/** Water habits typed in by hand that could come from Kropi. */
export function unlinkedWaterHabits(habits: Habit[]): Habit[] {
  return habits.filter(
    (h) =>
      kindOf(h) === "build" &&
      !isKropi(h) &&
      goalOf(h).type === "count" &&
      categoryOf(h) === "water",
  );
}

/** The goal of a Kropi habit: millilitres, Kropi's goal (or the glasses × 250 ml). */
export function kropiGoal(goal: HabitGoal | undefined, kropiGoalMl: number | null): HabitGoal {
  const glasses = goal?.type === "count" ? goal.target : 8;
  const target = kropiGoalMl && kropiGoalMl > 0 ? kropiGoalMl : glasses * GLASS_ML;
  return { type: "count", target, step: GLASS_ML, unit: "ml" };
}

/**
 * Linking: the goal becomes ml, days Kropi knows take its millilitres, older
 * entries in glasses (< 100) are converted at 250 ml a glass.
 */
export function linkKropiPatch(
  h: Habit,
  completions: Completion[],
  days: KropiDay[],
): { goal: HabitGoal; completions: Completion[] } {
  const known = new Map(days.map((d) => [d.date, d.ml]));
  const out = completions.map((c) => {
    if (c.habitId !== h.id) return c;
    const ml = known.get(c.date);
    if (ml != null) return { ...c, amount: ml, log: undefined, prev: undefined };
    const sc = (v: number) => (v > 0 && v < 100 ? v * GLASS_ML : v);
    return {
      ...c,
      ...(c.amount != null ? { amount: sc(c.amount) } : {}),
      ...(c.log ? { log: c.log.map(([m, v]) => [m, sc(v)] as [number, number]) } : {}),
      ...(c.prev ? { prev: c.prev.map(sc) } : {}),
    };
  });
  // Kropi days with no Szpila entry yet
  const have = new Set(out.filter((c) => c.habitId === h.id).map((c) => c.date));
  for (const d of days) {
    if (!have.has(d.date) && d.ml > 0) out.push({ habitId: h.id, date: d.date, amount: d.ml });
  }
  return { goal: kropiGoal(h.goal, days[0]?.goal ?? null), completions: out };
}

/** What a sync changes for one Kropi habit: amounts per day and the goal. */
export function kropiUpdates(
  h: Habit,
  completions: Completion[],
  days: KropiDay[],
  today: string,
): { amounts: { date: string; ml: number }[]; target: number | null } {
  const amounts: { date: string; ml: number }[] = [];
  for (const d of days.slice(0, SYNC_DAYS)) {
    const cur = amountOn(h, completions, new Date(`${d.date}T12:00:00`));
    if (cur !== d.ml) amounts.push({ date: d.date, ml: d.ml });
  }
  const todayGoal = days.find((d) => d.date === today)?.goal ?? 0;
  const target = todayGoal > 0 && todayGoal !== goalOf(h).target ? todayGoal : null;
  return { amounts, target };
}
