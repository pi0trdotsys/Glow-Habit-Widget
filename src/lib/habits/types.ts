export type HabitScheduleType = "daily" | "weekdays" | "timesPerWeek";

export interface HabitSchedule {
  type: HabitScheduleType;
  /** 0 = Sunday, 1 = Monday, ... 6 = Saturday. Used when type === "weekdays". */
  days?: number[];
  /** Number of completions per week. Used when type === "timesPerWeek". */
  target?: number;
}

export type HabitColor =
  | "mint"
  | "coral"
  | "amber"
  | "violet"
  | "sky"
  | "rose"
  | "lime"
  | "sand";

/**
 * "build" = something to do (read, brush teeth, drink water).
 * "avoid" = something NOT to do (fast food, phone late at night). Avoid habits
 * are pessimistic: a day only counts as clean when the user confirms "nie
 * robiłem". An unconfirmed day is treated as a slip.
 */
export type HabitKind = "build" | "avoid";

/** How a build habit's daily amount is measured. */
export type GoalType = "check" | "count" | "minutes";

export interface HabitGoal {
  type: GoalType;
  /** Daily target: times (count) or minutes. Always 1 for "check". */
  target: number;
  /** How much one tap adds (e.g. 1 glass, 1000 steps, 10 minutes). */
  step?: number;
  /** Unit label for counts, e.g. "szklanek", "kroków". */
  unit?: string;
}

export type LimitPeriod = "day" | "week" | "month";

/** Allowance for an avoid habit: how many slip-days per period are OK. 0 = total ban. */
export interface HabitLimit {
  times: number;
  period: LimitPeriod;
}

export type TimeOfDay = "morning" | "midday" | "evening" | "anytime";

export interface Habit {
  id: string;
  name: string;
  icon: string; // lucide icon name
  color: HabitColor;
  schedule: HabitSchedule;
  createdAt: string; // ISO
  /** Optional per-habit reminder time, "HH:mm" local. Undefined = no reminder. */
  reminder?: string | null;
  /** Defaults to "build" for habits saved before avoid habits existed. */
  kind?: HabitKind;
  /** Daily goal for build habits. Missing = a single check per day. */
  goal?: HabitGoal;
  /** Allowance for avoid habits. Missing = total ban. */
  limit?: HabitLimit;
  /** Preferred part of the day - feeds the "next task" planner. */
  timeOfDay?: TimeOfDay;
  /**
   * Automatic tracking. "steps": build count habit filled from Health Connect.
   * "screen": avoid habit judged from late-night screen time (usage access).
   */
  source?: HabitSource;
  /** source "screen": screen use after this time ("HH:mm") counts as late. */
  lateAfter?: string;
  /** source "screen": minutes of late screen time tolerated before it's a slip. */
  lateLimit?: number;
}

export type HabitSource = "steps" | "screen";

export interface Completion {
  habitId: string;
  /** YYYY-MM-DD in local time */
  date: string;
  /**
   * Build habits: amount done that day (times or minutes). Missing = 1.
   * Avoid habits: ignored.
   */
  amount?: number;
  /** Avoid habits only: true = the user admitted the slip; otherwise the day is confirmed clean. */
  slipped?: boolean;
  /**
   * History of the day as [minuteOfDay, amountAfter] pairs (avoid habits:
   * amountAfter is 1 for clean, -1 for a slip). Lets the weekly report rewind
   * last week to the same minute. Missing on entries saved before this existed.
   */
  log?: [number, number][];
  /** Set when the entry was judged automatically (screen time). Manual entries always win. */
  auto?: boolean;
}
