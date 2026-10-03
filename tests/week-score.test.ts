import { describe, expect, test } from "bun:test";
import { addDays, startOfWeek } from "date-fns";
import {
  AVOID_SLIP_PENALTY,
  AVOID_WEIGHT,
  AVOID_WITHIN_CREDIT,
  dayWindow,
  indexEntries,
  weeklyReport,
} from "@/lib/habits/utils";
import type { Completion } from "@/lib/habits/types";
import { entry, habit } from "./helpers";

// Thursday 2026-10-01 20:00: this week Mon..Thu vs last week Mon..Thu 20:00
const now = new Date(2026, 9, 1, 20, 0);
const mon = startOfWeek(now, { weekStartsOn: 1 });
const lastMon = addDays(mon, -7);
const read = habit({ name: "Czytanie", goal: { type: "minutes", target: 20, step: 10 } }, 60, now);
const porn = habit({ name: "Porno", kind: "avoid" }, 60, now); // total ban
const food = habit(
  { name: "Fast food", kind: "avoid", limit: { times: 1, period: "week" } },
  60,
  now,
);

describe("forbidden habits in week vs week", () => {
  test("a clean day adds at half weight, a slip over the limit subtracts, an open day is out", () => {
    const d = addDays(mon, 1);
    const at = (cs: Completion[], h = porn, day = d) => dayWindow(h, indexEntries(cs), day, now);
    expect(at([entry(porn, d)])).toEqual({ score: AVOID_WEIGHT, due: AVOID_WEIGHT });
    expect(at([entry(porn, d, { slipped: true })])).toEqual({
      score: AVOID_WEIGHT * AVOID_SLIP_PENALTY,
      due: AVOID_WEIGHT,
    });
    // within the weekly allowance (the other past days confirmed clean): half credit, not a penalty
    const foodWeek = [
      entry(food, mon),
      entry(food, d, { slipped: true }),
      entry(food, addDays(mon, 2)),
    ];
    expect(at(foodWeek, food)).toEqual({
      score: AVOID_WEIGHT * AVOID_WITHIN_CREDIT,
      due: AVOID_WEIGHT,
    });
    // today, not answered yet: doesn't count either way
    expect(at([], porn, now)).toEqual({ score: 0, due: 0 });
  });

  test("a week of reading with slips scores below the same reading without them", () => {
    const reading: Completion[] = [];
    for (let i = 0; i < 4; i++) {
      reading.push(entry(read, addDays(mon, i), { amount: 20 }));
      reading.push(entry(read, addDays(lastMon, i), { amount: 20 }));
    }
    const clean = [0, 1, 2, 3].flatMap((i) => [
      entry(porn, addDays(mon, i)),
      entry(porn, addDays(lastMon, i)),
    ]);
    const slips = [0, 1, 2].map((i) => entry(porn, addDays(mon, i), { slipped: true }));
    const base = weeklyReport([read, porn], [...reading, ...clean], now);
    expect(base.thisWeek.rate).toBe(100);
    expect(base.delta).toBe(0);
    const slipDays = new Set(slips.map((c) => c.date));
    const bad = weeklyReport(
      [read, porn],
      [...reading, ...clean.filter((c) => !slipDays.has(c.date)), ...slips],
      now,
    );
    expect(bad.slips).toEqual({ this: 3, last: 0 });
    expect(bad.thisWeek.rate).toBeLessThan(base.thisWeek.rate);
    expect(bad.delta).toBeLessThan(0);
    // reading fully done but 3 total-ban slips: (4 + 0.5 - 1.5) / (4 + 2) = 50%
    expect(bad.thisWeek.rate).toBe(50);
  });

  test("slips can't push the score below 0 and forgotten build habits still count as 0", () => {
    const cs = [0, 1, 2, 3].map((i) => entry(porn, addDays(mon, i), { slipped: true }));
    const r = weeklyReport([read, porn], cs, now);
    expect(r.thisWeek.rate).toBe(0);
    expect(r.days.every((d) => d.now == null || d.now >= 0)).toBe(true);
  });

  test("a habit list of mostly forbidden ones doesn't inflate the score", () => {
    const many = [1, 2, 3, 4].map((i) => habit({ name: `Zakaz ${i}`, kind: "avoid" }, 60, now));
    const cs: Completion[] = [];
    for (let i = 0; i < 4; i++) for (const h of many) cs.push(entry(h, addDays(mon, i)));
    // nothing read, every forbidden habit clean: 4×4×0.5 = 8 of (4 + 8) = 67%, not 80%
    const r = weeklyReport([read, ...many], cs, now);
    expect(r.thisWeek.rate).toBe(67);
  });
});
