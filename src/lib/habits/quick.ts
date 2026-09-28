// Quick amount entry (hold a tile longer): +1 / +2 / +5 steps, a slider to set
// the exact amount, and what a sideways swipe undoes. Pure helpers - the sheet
// (QuickAmountSheet.tsx) and the tile use them.
import type { Habit } from "./types";
import { goalOf, kindOf } from "./utils";

/** Can this habit take quick amounts? Only habits to do with a count / minutes goal. */
export function hasQuickAmounts(h: Habit): boolean {
  return kindOf(h) === "build" && goalOf(h).type !== "check";
}

/** The three quick buttons: 1, 2 and 5 steps (e.g. +1/+2/+5 glasses, +10/+20/+50 min). */
export function quickSteps(h: Habit): number[] {
  const step = Math.max(1, goalOf(h).step ?? 1);
  return [step, step * 2, step * 5];
}

/** Slider range: up to twice the goal (or the current amount + 5 steps if that's more). */
export function sliderMax(h: Habit, amount: number): number {
  const g = goalOf(h);
  const step = Math.max(1, g.step ?? 1);
  const raw = Math.max(g.target * 2, amount + step * 5);
  return Math.ceil(raw / step) * step;
}

/** Snap a slider value to the habit's step. */
export function snapToStep(h: Habit, v: number): number {
  const step = Math.max(1, goalOf(h).step ?? 1);
  return Math.max(0, Math.round(v / step) * step);
}
