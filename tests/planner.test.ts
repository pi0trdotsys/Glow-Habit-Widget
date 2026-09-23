import { describe, expect, test } from "bun:test";
import vectors from "./planner-vectors.json";
import { nextUnitMinute, planDay, rankKey } from "@/lib/habits/utils";
import { tauntSlots } from "@/lib/notifications";
import { escalationTier } from "@/lib/habits/szpila";
import { WED_1540, entry, habit } from "./helpers";

describe("shared vectors (Java PlannerParityTest checks the same file)", () => {
  test("nextUnitMinute", () => {
    for (const v of vectors.nextUnit) expect(nextUnitMinute(v, v.units, v.done, v.now)).toBe(v.expected);
  });
  test("rankKey", () => {
    for (const v of vectors.rank) expect(rankKey(v.due, v.now, v.avoid, v.multi)).toBe(v.expected);
  });
  test("tauntSlots", () => {
    for (const v of vectors.slots) expect(tauntSlots(v.n, v.wake, v.bedtime)).toEqual(v.expected);
  });
  test("escalationTier", () => {
    for (const v of vectors.tier) expect(escalationTier(v.overdue, v.jabs)).toBe(v.expected);
  });
});

describe("nextUnitMinute", () => {
  const water = { start: 8 * 60, end: 20 * 60 };
  test("spreads 8 glasses evenly over the window", () => {
    expect(nextUnitMinute(water, 8, 0)).toBe(480);
    expect(nextUnitMinute(water, 8, 7)).toBe(1200);
    expect(nextUnitMinute(water, 8, 1)).toBe(583); // ~1h43m later
  });
  test("when behind, points at the latest slot that already passed", () => {
    const teeth = { start: 450, end: 1290 }; // 7:30 and 21:30
    expect(nextUnitMinute(teeth, 2, 0, 21 * 60 + 5)).toBe(450); // evening slot not reached yet
    expect(nextUnitMinute(teeth, 2, 0, 22 * 60)).toBe(1290);
  });
});

describe("rankKey", () => {
  test("overdue beats upcoming, most overdue first", () => {
    expect(rankKey(600, 700, false)).toBeLessThan(rankKey(650, 700, false));
    expect(rankKey(650, 700, false)).toBeLessThan(rankKey(720, 700, false));
  });
  test("a single-shot task missed 4h+ ago drops behind one due within the hour", () => {
    expect(rankKey(450, 1000, false)).toBeGreaterThan(rankKey(1030, 1000, false));
    // ...but a multi-unit goal that is behind stays urgent
    expect(rankKey(450, 1000, false, true)).toBeLessThan(rankKey(1030, 1000, false));
  });
  test("forbidden-habit confirmations wait until ~30 min before their time", () => {
    expect(rankKey(1260, 700, true)).toBeGreaterThan(rankKey(1400, 700, false));
  });
});

describe("planDay", () => {
  test("orders pending tasks and skips finished + screen-judged ones", () => {
    const now = WED_1540;
    const water = habit({ name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } });
    const read = habit({ name: "Czytanie", goal: { type: "minutes", target: 20, step: 10 }, timeOfDay: "evening" });
    const teeth = habit({ name: "Mycie zębów", goal: { type: "count", target: 2, step: 1 } });
    const phone = habit({ name: "Telefon do późna", kind: "avoid", source: "screen" });
    const fastfood = habit({ name: "Fast food", kind: "avoid" });
    const plan = planDay(
      [water, read, teeth, phone, fastfood],
      [entry(water, now, { amount: 3 }), entry(teeth, now, { amount: 2 })],
      now,
    );
    const names = plan.map((p) => p.habit.name);
    expect(names[0]).toBe("Picie wody"); // behind schedule
    expect(names).not.toContain("Mycie zębów"); // done
    expect(names).not.toContain("Telefon do późna"); // judged automatically
    expect(names.at(-1)).toBe("Fast food"); // confirmation comes later in the evening
    expect(plan[0].left).toBe(5);
  });
});
