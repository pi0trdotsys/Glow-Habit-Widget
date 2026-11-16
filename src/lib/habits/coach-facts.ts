// What the optional coach server (szpila-coach) gets for the week and for the morning forecast:
// names and percentages only, never discreet habits (the callers pass habits without them).
import type { Completion, Habit } from "./types";
import { isDueOn, kindOf, weeklyReport } from "./utils";
import type { ForecastItem } from "./forecast";
import type { TauntLevel } from "./store";
import { isDiscreet } from "./discreet";
import { getLang } from "@/lib/i18n";

export interface WeekFacts {
  /** This week so far (the same window as the report), 0-100. */
  pct: number;
  /** Last week up to the same point, or null in the first week. */
  prev: number | null;
  /** Build habits that went best / worst this week (up to 2 each). */
  best: string[];
  worst: string[];
  /** Forbidden-habit slips over the allowance. */
  slips: number;
}

/** The week for Sunday's comment (snapshot "week", HabitNotifier.postWeek). Pure. */
export function weekFacts(habits: Habit[], completions: Completion[], now: Date): WeekFacts {
  const r = weeklyReport(habits, completions, now);
  const rated = r.perHabit
    .filter((p) => kindOf(p.habit) === "build" && p.dueThis > 0 && !isDiscreet(p.habit))
    .map((p) => ({ name: p.habit.name, rate: p.this / p.dueThis }));
  const byRate = [...rated].sort((a, b) => b.rate - a.rate);
  const best = byRate.filter((h) => h.rate >= 0.6).slice(0, 2);
  const worst = [...byRate]
    .reverse()
    .filter((h) => h.rate < 0.8 && !best.includes(h))
    .slice(0, 2);
  return {
    pct: r.thisWeek.rate,
    prev: r.noBaseline ? null : r.lastWeek.rate,
    best: best.map((h) => h.name),
    worst: worst.map((h) => h.name),
    slips: r.slips.this,
  };
}

export interface ForecastFacts {
  kind: "forecast";
  lang: "pl" | "en";
  /** 0 = Sunday, like getDay(). */
  wd: number;
  name: string;
  level: TauntLevel;
  /** The rule-based forecast's habits and why (reason keys, worded by the server). */
  risks: { name: string; reason: string; kind: "build" | "avoid" }[];
  /** Today's habits still to do. */
  plan: string[];
}

/** The morning forecast for the coach: the risky habits and today's plan. Pure. */
export function forecastFacts(
  items: ForecastItem[],
  habits: Habit[],
  now: Date,
  level: TauntLevel,
  userName: string | null,
): ForecastFacts {
  return {
    kind: "forecast",
    lang: getLang() === "en" ? "en" : "pl",
    wd: now.getDay(),
    name: userName ?? "",
    level,
    risks: items
      .filter((i) => {
        const h = habits.find((x) => x.id === i.habitId);
        return !h || !isDiscreet(h);
      })
      .slice(0, 3)
      .map((i) => ({ name: i.name, reason: i.reason, kind: i.kind })),
    plan: habits
      .filter((h) => !isDiscreet(h) && isDueOn(h, now) && kindOf(h) === "build")
      .map((h) => h.name)
      .slice(0, 8),
  };
}
