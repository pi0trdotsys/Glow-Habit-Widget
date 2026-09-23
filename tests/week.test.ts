import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import { weeklyReport } from "@/lib/habits/utils";
import { WED_1540, entry, habit } from "./helpers";

describe("weeklyReport compares only up to the same point of the week", () => {
  const now = WED_1540; // Wednesday 15:40
  const water = habit({ name: "Woda", goal: { type: "count", target: 8, step: 1 } }, 30, now);
  const lastWed = addDays(now, -7);

  test("last week's Thu-Sun don't count, last Wednesday is rewound to 15:40", () => {
    const completions = [
      entry(water, addDays(now, -9), { amount: 8 }), // last Mon
      entry(water, addDays(now, -8), { amount: 8 }), // last Tue
      entry(water, lastWed, { amount: 8, log: [[600, 3], [900, 6], [1200, 8]] }), // 6 by 15:40
      entry(water, addDays(now, -6), { amount: 8 }), // last Thu - outside the window
      entry(water, addDays(now, -5), { amount: 8 }), // last Fri - outside the window
    ];
    const r = weeklyReport([water], completions, now);
    expect(r.lastWeek.due).toBe(3);
    expect(r.lastWeek.score).toBe(2.8); // 1 + 1 + 6/8, rounded to 0.1
    expect(r.windowLabel).toBe("pon–śr do 15:40");
  });

  test("delta is in percentage points, future days are empty", () => {
    const completions = [
      entry(water, addDays(now, -2), { amount: 8 }),
      entry(water, addDays(now, -1), { amount: 4 }),
      entry(water, addDays(now, -9), { amount: 8 }),
      entry(water, addDays(now, -8), { amount: 8 }),
      entry(water, lastWed, { amount: 8 }), // legacy entry without a log counts in full
    ];
    const r = weeklyReport([water], completions, now);
    expect(r.thisWeek.rate).toBe(50); // (1 + 0.5 + 0) / 3
    expect(r.lastWeek.rate).toBe(100);
    expect(r.delta).toBe(-50);
    expect(r.days[3].now).toBeNull(); // Thursday is still ahead
  });
});
