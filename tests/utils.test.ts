import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import {
  amountOn,
  amountText,
  completionRate,
  createdKey,
  currentStreak,
  daysLabel,
  fmtNum,
  formatMinute,
  goalLabel,
  goalOf,
  greetingFor,
  heatmapData,
  isDueOn,
  limitLabel,
  longestStreak,
  minuteOfDay,
  plural,
  scheduleLabel,
  thisWeekCount,
  timesLabel,
  todayKey,
  todayProgress,
  unitForms,
  unitLabel,
} from "@/lib/habits/utils";
import { WED_1540, entry, habit } from "./helpers";

describe("Polish plurals and units", () => {
  test("plural covers 1 / 2-4 / 5+ including 12-14 and 22-24", () => {
    const f = (n: number) => plural(n, "zadanie", "zadania", "zadań");
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 24, 25, 112, 122].map(f)).toEqual([
      "zadanie",
      "zadania",
      "zadania",
      "zadań",
      "zadań",
      "zadań",
      "zadań",
      "zadań",
      "zadania",
      "zadania",
      "zadań",
      "zadań",
      "zadania",
    ]);
    expect(daysLabel(1)).toBe("1 dzień");
    expect(daysLabel(3)).toBe("3 dni");
    expect(timesLabel(2)).toBe("2 razy");
  });

  test("known units decline, unknown ones stay as typed", () => {
    expect(unitForms("szklanek")).toEqual(["szklanka", "szklanki", "szklanek"]);
    expect(unitForms("kroki")).toEqual(["krok", "kroki", "kroków"]);
    expect(unitForms(undefined)).toEqual(["raz", "razy", "razy"]);
    expect(unitForms("okrążeń")).toEqual(["okrążeń", "okrążeń", "okrążeń"]);
    const water = habit({
      name: "Woda",
      goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
    });
    expect([1, 3, 5, 22].map((n) => unitLabel(water, n))).toEqual([
      "szklanka",
      "szklanki",
      "szklanek",
      "szklanki",
    ]);
    const read = habit({ name: "Czytanie", goal: { type: "minutes", target: 20, step: 10 } });
    expect(unitLabel(read, 1)).toBe("min");
    expect(unitLabel(habit({ name: "Raz" }), 1)).toBe("");
  });

  test("amount text and number formatting", () => {
    const steps = habit({
      name: "Kroki",
      goal: { type: "count", target: 8000, step: 1000, unit: "kroków" },
    });
    expect(amountText(steps, 4210)).toBe("4210/8000 kroków");
    expect(amountText(habit({ name: "Raz" }), 1)).toBe("");
    expect(fmtNum(9999)).toBe("9999");
    expect(fmtNum(12000)).toMatch(/^12\s000$/);
    expect(formatMinute(0)).toBe("00:00");
    expect(formatMinute(21 * 60 + 5)).toBe("21:05");
    expect(minuteOfDay(new Date(2026, 0, 1, 7, 30))).toBe(450);
  });
});

describe("habit shape and labels", () => {
  test("goalOf fills defaults and clamps step", () => {
    expect(goalOf(habit({ name: "X" }))).toEqual({ type: "check", target: 1, step: 1 });
    expect(goalOf(habit({ name: "X", goal: { type: "minutes", target: 30 } })).step).toBe(10);
    expect(goalOf(habit({ name: "X", goal: { type: "count", target: 0, step: 0 } }))).toMatchObject(
      { target: 1, step: 1 },
    );
  });

  test("schedule / limit / goal labels read naturally", () => {
    expect(scheduleLabel(habit({ name: "X" }))).toBe("Codziennie");
    expect(
      scheduleLabel(habit({ name: "X", schedule: { type: "weekdays", days: [1, 2, 3] } })),
    ).toBe("3 dni w tygodniu");
    expect(scheduleLabel(habit({ name: "X", schedule: { type: "timesPerWeek", target: 3 } }))).toBe(
      "3 razy w tygodniu",
    );
    expect(limitLabel({ times: 0, period: "week" })).toBe("Całkowity zakaz");
    expect(limitLabel({ times: 1, period: "month" })).toBe("Max 1 raz w miesiącu");
    expect(
      goalLabel(
        habit({ name: "X", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } }),
      ),
    ).toBe("8 szklanek dziennie");
  });

  test("greetings follow the time of day", () => {
    expect(greetingFor(new Date(2026, 0, 1, 3))).toBe("Jeszcze nie śpisz");
    expect(greetingFor(new Date(2026, 0, 1, 9))).toBe("Dzień dobry");
    expect(greetingFor(new Date(2026, 0, 1, 15))).toBe("Cześć");
    expect(greetingFor(new Date(2026, 0, 1, 20))).toBe("Dobry wieczór");
    expect(greetingFor(new Date(2026, 0, 1, 23))).toBe("Dobranoc");
  });
});

describe("schedule", () => {
  test("weekdays schedule and creation day", () => {
    const h = habit({ name: "X", schedule: { type: "weekdays", days: [1, 3] } }, 30, WED_1540);
    expect(isDueOn(h, WED_1540)).toBe(true); // Wednesday
    expect(isDueOn(h, addDays(WED_1540, 1))).toBe(false); // Thursday
    expect(createdKey(h)).toBe(todayKey(addDays(WED_1540, -30)));
    expect(isDueOn(h, addDays(WED_1540, -35))).toBe(false); // before it existed
  });

  test("amountOn rewinds to a cutoff using the day log", () => {
    const water = habit({ name: "Woda", goal: { type: "count", target: 8, step: 1 } });
    const c = [
      entry(water, WED_1540, {
        amount: 8,
        log: [
          [600, 3],
          [900, 6],
          [1200, 8],
        ],
      }),
    ];
    expect(amountOn(water, c, WED_1540)).toBe(8);
    expect(amountOn(water, c, WED_1540, 899)).toBe(3);
    expect(amountOn(water, c, WED_1540, 100)).toBe(0);
    // legacy entries without a log count in full at any cutoff
    expect(amountOn(water, [entry(water, WED_1540, { amount: 5 })], WED_1540, 100)).toBe(5);
  });
});

describe("streaks, rates and progress (relative to today)", () => {
  const today = new Date();
  const h = habit({ name: "Czytanie" }, 20, today);
  const days = (offsets: number[]) =>
    offsets.map((o) => entry(h, addDays(today, -o), { amount: 1 }));

  test("current streak survives an unfinished today, breaks on a gap", () => {
    expect(currentStreak(h, days([1, 2, 3]))).toBe(3);
    expect(currentStreak(h, days([0, 1, 2, 3]))).toBe(4);
    expect(currentStreak(h, days([1, 3, 4]))).toBe(1);
    expect(currentStreak(h, [])).toBe(0);
  });

  test("longest streak finds the best run", () => {
    expect(longestStreak(h, days([1, 2, 5, 6, 7, 8]))).toBe(4);
  });

  test("30-day rate ignores an unfinished today", () => {
    const young = habit({ name: "Nowe" }, 3, today); // due today + 3 past days
    const c = [1, 2].map((o) => entry(young, addDays(today, -o), { amount: 1 }));
    expect(completionRate(young, c, 30)).toBe(67); // 2 of 3 past days, today not counted yet
  });

  test("heatmap levels follow partial progress", () => {
    const water = habit({ name: "Woda", goal: { type: "count", target: 4, step: 1 } }, 20, today);
    const cells = heatmapData(water, [entry(water, today, { amount: 2 })], 7);
    expect(cells).toHaveLength(7);
    expect(cells.at(-1)).toMatchObject({ level: 0.5, done: false, due: true });
  });

  test("this week count and today's progress with partial goals", () => {
    expect(thisWeekCount(h, days([0]))).toBe(1);
    const water = habit({ name: "Woda", goal: { type: "count", target: 4, step: 1 } }, 20, today);
    const p = todayProgress(
      [h, water],
      [entry(h, today, { amount: 1 }), entry(water, today, { amount: 2 })],
      today,
    );
    expect(p).toEqual({ done: 1, total: 2, fraction: 0.75 });
  });
});
