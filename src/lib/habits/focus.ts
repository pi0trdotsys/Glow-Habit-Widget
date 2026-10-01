// "Cel tygodnia": one habit that gets the most attention this week. Picked on
// Today (a status slide until it's set); then it gets a badge, goes to the top
// of the plan when due, Szpila nags about it first, and Sunday's roast and a
// weekly challenge judge it. One focus beats eight half-hearted ones.
import { addDays, startOfWeek } from "date-fns";
import type { Completion, Habit } from "./types";
import { countsOn, dayScore, indexEntries, isAutoScreen, isDueOn, todayKey } from "./utils";
import { L } from "@/lib/i18n";

export interface WeeklyFocus {
  /** Monday of the week, "yyyy-MM-dd". */
  week: string;
  habitId: string;
  /** Day it was picked ("yyyy-MM-dd"): the week is judged from then on. */
  since?: string;
}

/** Monday of the week (the key the focus is stored under). */
export const weekKey = (d: Date = new Date()): string =>
  todayKey(startOfWeek(d, { weekStartsOn: 1 }));

/** This week's focus habit, or null (not set, from another week, or deleted). */
export function focusHabit(
  habits: Habit[],
  focus: WeeklyFocus | null | undefined,
  now: Date = new Date(),
): Habit | null {
  if (!focus || focus.week !== weekKey(now)) return null;
  return habits.find((h) => h.id === focus.habitId) ?? null;
}

export interface FocusProgress {
  /** Days fully done (build: goal reached, avoid: clean) this week so far. */
  done: number;
  /** Days that counted so far (today only once it's done). */
  due: number;
  /** Due days in the whole week. */
  week: number;
}

export function focusProgress(
  h: Habit,
  completions: Completion[],
  now: Date = new Date(),
  /** Only days from this one on (the day the focus was picked). */
  since?: string,
): FocusProgress {
  const idx = indexEntries(completions);
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const today = todayKey(now);
  const from = since && since > todayKey(monday) ? since : todayKey(monday);
  let done = 0;
  let due = 0;
  let week = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const k = todayKey(d);
    if (k < from) continue;
    if (h.schedule.type === "timesPerWeek" ? false : isDueOn(h, d)) week++;
    if (k > today) continue;
    if (!countsOn(h, idx, d, now)) continue;
    const ok = dayScore(h, idx, d, now) >= 1;
    if (k === today && !ok) continue;
    due++;
    if (ok) done++;
  }
  if (h.schedule.type === "timesPerWeek") week = h.schedule.target ?? 1;
  return { done, due, week };
}

/**
 * Suggestions for the focus: the weakest habits of the last 7 days first
 * (that's where one week of attention pays off most). Screen-judged ones are
 * left out - they judge themselves.
 */
export function focusSuggestions(
  habits: Habit[],
  completions: Completion[],
  now: Date = new Date(),
  max = 4,
): Habit[] {
  const idx = indexEntries(completions);
  const scored = habits
    .filter((h) => !isAutoScreen(h))
    .map((h) => {
      let sum = 0;
      let n = 0;
      for (let i = 1; i <= 7; i++) {
        const d = addDays(now, -i);
        if (!countsOn(h, idx, d, now)) continue;
        n++;
        sum += dayScore(h, idx, d, now);
      }
      return { h, rate: n ? sum / n : 0.5 };
    })
    .sort((a, b) => a.rate - b.rate);
  return scored.slice(0, max).map((s) => s.h);
}

/**
 * The bonus challenge on the Szpila tab: the focus habit done on all its due
 * days of the week but one (never twice in a row is the spirit, not perfection).
 */
export function focusChallenge(
  h: Habit,
  completions: Completion[],
  now: Date = new Date(),
  since?: string,
): {
  id: "focus";
  title: string;
  detail: string;
  progress: number;
  goal: number;
  status: "active" | "done" | "failed";
} {
  const p = focusProgress(h, completions, now, since);
  const goal = Math.max(1, p.week >= 5 ? p.week - 1 : p.week);
  const left = Math.max(0, p.week - p.due); // due days still ahead (today too, until it's done)
  const status = p.done >= goal ? "done" : p.done + left < goal ? "failed" : "active";
  return {
    id: "focus",
    title: L(`🎯 Cel tygodnia: ${h.name}`, `🎯 Weekly focus: ${h.name}`),
    detail: L(
      `${goal} z ${p.week} dni. Jedna dziura wolno, dwie z rzędu - nigdy.`,
      `${goal} of ${p.week} days. One gap is fine, two in a row - never.`,
    ),
    progress: Math.min(p.done, goal),
    goal,
    status,
  };
}

/** One sentence for Sunday's roast about the week's focus ("" when none). */
export function focusRoast(
  habits: Habit[],
  completions: Completion[],
  focus: WeeklyFocus | null | undefined,
  hard: boolean,
  now: Date = new Date(),
): string {
  const h = focusHabit(habits, focus, now);
  if (!h) return "";
  const c = focusChallenge(h, completions, now, focus?.since);
  if (c.status === "done")
    return hard
      ? L(
          `Cel tygodnia „${h.name}” dowieziony. Kurwa, szacun.`,
          `Weekly focus “${h.name}” delivered. Damn, respect.`,
        )
      : L(
          `Cel tygodnia „${h.name}” zrealizowany. Brawo!`,
          `Weekly focus “${h.name}” achieved. Well done!`,
        );
  if (c.status === "active")
    return hard
      ? L(
          `Cel tygodnia „${h.name}”: ${c.progress}/${c.goal}. Jeszcze da się dowieźć, więc ruszaj dupę.`,
          `Weekly focus “${h.name}”: ${c.progress}/${c.goal}. Still doable, so move your ass.`,
        )
      : L(
          `Cel tygodnia „${h.name}”: ${c.progress}/${c.goal}. Jeszcze się uda!`,
          `Weekly focus “${h.name}”: ${c.progress}/${c.goal}. You can still make it!`,
        );
  return hard
    ? L(
        `Cel tygodnia „${h.name}”: ${c.progress}/${c.goal}. Jeden cel, i nawet to nie wyszło. Wybierz nowy na poniedziałek.`,
        `Weekly focus “${h.name}”: ${c.progress}/${c.goal}. One goal, and even that didn't work out. Pick a new one for Monday.`,
      )
    : L(
        `Cel tygodnia „${h.name}”: ${c.progress}/${c.goal}. Wybierz cel na nowy tydzień.`,
        `Weekly focus “${h.name}”: ${c.progress}/${c.goal}. Pick a focus for the new week.`,
      );
}
