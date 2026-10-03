// "Bank minut": in bank mode the daily social media limit isn't fixed - you
// earn it. Today's limit = base + per finished habit to do + per 1000 steps
// (capped), minus last night's debt, never below 0. What's left = that minus
// today's social media minutes. The native guard computes the same thing from
// the snapshot rows (DayGuard.bankEarned / bankLimit / limitState), so a habit
// ticked on a widget raises the limit at once. Shared vectors:
// tests/bank-vectors.json (BankParityTest.java checks the same file).
import type { Completion, Habit } from "@/lib/habits/types";
import type { NotificationSettings } from "@/lib/habits/store";
import type { NightReport } from "@/lib/sensors";
import { DEBT_PER_PASS, DEBT_PER_SOCIAL_MIN } from "@/lib/curfew";
import { amountOn, goalOf, indexEntries, isDueOn, kindOf, todayKey } from "@/lib/habits/utils";
import { addDays } from "date-fns";
import { L } from "@/lib/i18n";

export type LimitMode = "fixed" | "bank";

export interface BankRules {
  /** Minutes you start the day with. */
  base: number;
  /** Minutes per habit to do finished today (full goal). */
  perHabit: number;
  /** Minutes per full 1000 steps today (steps habits / Health Connect). */
  perKSteps: number;
  /** The most the bank can hold in a day (before last night's debt). 0 = no cap. */
  cap: number;
}

/** Mirrors DayGuard.BANK_* defaults. */
export const BANK_DEFAULTS: BankRules = { base: 5, perHabit: 10, perKSteps: 5, cap: 120 };

/** Mirrors DayGuard.BANK_WARN_MIN: one heads-up when this little is left. */
export const BANK_WARN_MIN = 5;

/** Mirrors DayGuard.LIMIT_OK / LIMIT_WARN / LIMIT_OVER. */
export const LIMIT_OK = 0;
export const LIMIT_WARN = 1;
export const LIMIT_OVER = 2;
const WARN_BEFORE_MIN = 10;

export function isBank(n: Pick<NotificationSettings, "limitMode">): boolean {
  return (n.limitMode ?? "bank") === "bank";
}

export function bankRules(n: Partial<NotificationSettings>): BankRules {
  const num = (v: unknown, d: number) => (typeof v === "number" && v >= 0 ? Math.round(v) : d);
  return {
    base: num(n.bankBase, BANK_DEFAULTS.base),
    perHabit: num(n.bankPerHabit, BANK_DEFAULTS.perHabit),
    perKSteps: num(n.bankPerKSteps, BANK_DEFAULTS.perKSteps),
    cap: num(n.bankCap, BANK_DEFAULTS.cap),
  };
}

/** Minutes earned today (base included), capped. Mirrors DayGuard.bankEarned(int...). */
export function bankEarned(r: BankRules, doneBuilds: number, steps: number): number {
  const gross =
    Math.max(0, r.base) +
    Math.max(0, r.perHabit) * Math.max(0, doneBuilds) +
    Math.max(0, r.perKSteps) * Math.floor(Math.max(0, steps) / 1000);
  return r.cap > 0 ? Math.min(r.cap, gross) : gross;
}

/** Today's limit in bank mode: earned minus last night's raw debt, never below 0. */
export function bankLimit(earned: number, rawDebt: number): number {
  return Math.max(0, earned - Math.max(0, rawDebt));
}

/** What the limit asks for (mirrors DayGuard.limitState(used, limit, bank)). */
export function limitState(used: number, limit: number, bank = false): number {
  if (bank) {
    if (limit <= 0 || used >= limit) return LIMIT_OVER;
    if (limit > BANK_WARN_MIN && limit - used <= BANK_WARN_MIN) return LIMIT_WARN;
    return LIMIT_OK;
  }
  if (limit <= 0) return LIMIT_OK;
  if (used >= limit) return LIMIT_OVER;
  if (limit > WARN_BEFORE_MIN * 2 && used >= limit - WARN_BEFORE_MIN) return LIMIT_WARN;
  return LIMIT_OK;
}

/** Last night's debt before any floor: 2 per social minute after midnight, 10 per curfew pass. */
export function rawNightDebt(r: Pick<NightReport, "social" | "curfewPasses"> | null): number {
  if (!r) return 0;
  return (
    DEBT_PER_SOCIAL_MIN * Math.max(0, r.social ?? 0) +
    DEBT_PER_PASS * Math.max(0, r.curfewPasses ?? 0)
  );
}

/**
 * Today's earning inputs, like the native side reads them from the snapshot
 * rows: habits to do due today with the full goal in, and today's steps (the
 * highest amount among steps habits).
 */
export function bankInputs(
  habits: Habit[],
  completions: Completion[],
  day: Date = new Date(),
): { done: number; steps: number } {
  const idx = indexEntries(completions);
  let done = 0;
  let steps = 0;
  for (const h of habits) {
    if (kindOf(h) !== "build" || !isDueOn(h, day)) continue;
    const a = amountOn(h, idx, day);
    if (a >= goalOf(h).target) done++;
    if (h.source === "steps") steps = Math.max(steps, a);
  }
  return { done, steps };
}

export interface BankToday {
  rules: BankRules;
  done: number;
  steps: number;
  /** Earned today, base included, capped. */
  earned: number;
  /** What last night took off it (at most `earned`). */
  debt: number;
  /** Today's limit: earned - debt. */
  limit: number;
  used: number;
  /** In the bank right now (never below 0). */
  left: number;
}

/** The bank right now, from the store (mirrors DayGuard.limit(c) in bank mode). */
export function bankToday(
  n: NotificationSettings,
  habits: Habit[],
  completions: Completion[],
  reports: Record<string, NightReport>,
  used: number,
  now: Date = new Date(),
): BankToday {
  const rules = bankRules(n);
  const { done, steps } = bankInputs(habits, completions, now);
  const earned = bankEarned(rules, done, steps);
  // The night is over at 5:00 (DayGuard.rawDebt).
  const raw =
    (n.nightDebt ?? true) && now.getHours() >= 5
      ? rawNightDebt(reports[todayKey(addDays(now, -1))] ?? null)
      : 0;
  const limit = bankLimit(earned, raw);
  return {
    rules,
    done,
    steps,
    earned,
    debt: earned - limit,
    limit,
    used,
    left: Math.max(0, limit - used),
  };
}

/** Minutes the last finished habit added (0 when the cap was already reached). */
export function bankGain(r: BankRules, doneBuilds: number, steps: number): number {
  if (doneBuilds <= 0) return 0;
  return bankEarned(r, doneBuilds, steps) - bankEarned(r, doneBuilds - 1, steps);
}

/**
 * The toast line after a habit to do is finished in bank mode ("+10 min do
 * banku · masz 23 min"), or null when the bank doesn't apply.
 */
export function bankToastLine(
  n: NotificationSettings,
  habit: Habit,
  habits: Habit[],
  completions: Completion[],
  reports: Record<string, NightReport>,
  used: number,
  now: Date = new Date(),
): string | null {
  if (!n.dailyLimit || !isBank(n) || kindOf(habit) !== "build") return null;
  const b = bankToday(n, habits, completions, reports, used, now);
  const gain = bankGain(b.rules, b.done, b.steps);
  if (gain <= 0)
    return L(
      `💰 Bank pełny: ${b.limit} min na dziś · masz ${b.left} min`,
      `💰 The bank is full: ${b.limit} min today · ${b.left} min left`,
    );
  return L(
    `💰 +${gain} min do banku · masz ${b.left} min`,
    `💰 +${gain} min in the bank · ${b.left} min left`,
  );
}

/** "+10 za każde zadanie, +5 za 1000 kroków" - how to earn more. */
export function bankHowTo(r: BankRules): string {
  const parts: string[] = [];
  if (r.perHabit > 0) parts.push(L(`+${r.perHabit} za każde zadanie`, `+${r.perHabit} per habit`));
  if (r.perKSteps > 0)
    parts.push(L(`+${r.perKSteps} za 1000 kroków`, `+${r.perKSteps} per 1000 steps`));
  return parts.join(", ");
}

/** The `bank` part of the snapshot's `live.day` (DayGuard.bankRules). */
export function bankState(n: NotificationSettings) {
  return { mode: isBank(n) ? "bank" : "fixed", bank: bankRules(n) };
}
