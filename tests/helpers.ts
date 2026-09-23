import { addDays, format } from "date-fns";
import type { Completion, Habit } from "@/lib/habits/types";

export const key = (d: Date) => format(d, "yyyy-MM-dd");

let n = 0;
export function habit(p: Partial<Habit> & { name: string }, createdDaysAgo = 60, now = new Date()): Habit {
  return {
    id: `h${++n}`,
    icon: "Sparkles",
    color: "mint",
    schedule: { type: "daily" },
    createdAt: addDays(now, -createdDaysAgo).toISOString(),
    ...p,
  };
}

export const entry = (h: Habit, d: Date, extra: Partial<Completion> = {}): Completion => ({
  habitId: h.id,
  date: key(d),
  ...extra,
});

/** A fixed local date-time: Wednesday 2026-09-23 15:40. */
export const WED_1540 = new Date(2026, 8, 23, 15, 40);
