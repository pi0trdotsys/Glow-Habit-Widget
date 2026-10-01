// Steps from a band (Mi Fitness -> Health Connect) for "8000 kroków"-style habits.
// Linking a habit switches it to source "steps"; a goal counted in thousands
// ("8" with unit "1000" / "tys.") becomes real steps (8000), and its history
// is scaled with it, so the stats stay right.
import type { Completion, Habit, HabitGoal } from "@/lib/habits/types";
import { goalOf, kindOf } from "@/lib/habits/utils";
import { categoryOf } from "@/lib/habits/szpila";
import { L } from "@/lib/i18n";

const THOUSANDS = /^(1 ?000|tys\.?|tysi[ąa]c\w*|k|thousands?)$/i;

/** Is a count goal kept in thousands of steps (unit "1000", or a target nobody means as steps)? */
export function inThousands(goal: HabitGoal): boolean {
  if (goal.type !== "count") return false;
  return THOUSANDS.test((goal.unit ?? "").trim()) || goal.target < 100;
}

/** The goal of a habit linked to Health Connect: a count of real steps. */
export function stepsGoal(goal: HabitGoal): HabitGoal {
  const k = inThousands(goal) ? 1000 : 1;
  const target = goal.type === "count" ? goal.target * k : 8000;
  const step = goal.type === "count" ? Math.max(1, (goal.step || 1) * k) : 1000;
  return { type: "count", target, step, unit: L("kroków", "steps") };
}

/** Scale a habit's past entries by `k` (values already in steps, >= 1000, stay). */
export function scaleEntries(completions: Completion[], habitId: string, k: number): Completion[] {
  if (k === 1) return completions;
  const sc = (v: number) => (v > 0 && v < 1000 ? v * k : v);
  return completions.map((c) =>
    c.habitId !== habitId
      ? c
      : {
          ...c,
          ...(c.amount != null ? { amount: sc(c.amount) } : {}),
          ...(c.log ? { log: c.log.map(([m, v]) => [m, sc(v)] as [number, number]) } : {}),
          ...(c.prev ? { prev: c.prev.map(sc) } : {}),
        },
  );
}

/** Patch for linking a habit to the band's steps (goal + history). */
export function linkStepsPatch(
  h: Habit,
  completions: Completion[],
): { goal: HabitGoal; completions: Completion[] } {
  const g = goalOf(h);
  const k = inThousands(g) ? 1000 : 1;
  return { goal: stepsGoal(g), completions: scaleEntries(completions, h.id, k) };
}

/** Steps habits typed in by hand, though steps could come from the band. */
export function unlinkedStepHabits(habits: Habit[]): Habit[] {
  return habits.filter(
    (h) =>
      kindOf(h) === "build" &&
      h.source !== "steps" &&
      goalOf(h).type === "count" &&
      categoryOf(h) === "steps",
  );
}

export interface StepsSource {
  pkg: string;
  label: string;
  steps: number;
}

/** A friendlier name for well-known step writers. */
export function sourceName(s: Pick<StepsSource, "pkg" | "label">): string {
  if (s.pkg === "com.xiaomi.wearable") return "Mi Fitness";
  // Health Connect's own step counter on the phone (Android 14+): "com.android.healthconnect.phone.<hash>"
  if (s.pkg.startsWith("com.android.healthconnect.phone")) return L("Ten telefon", "This phone");
  return s.label && s.label !== s.pkg ? s.label : s.pkg.split(".").slice(-2).join(".");
}
