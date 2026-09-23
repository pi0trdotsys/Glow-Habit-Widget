import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import { habitInsights, monthGrid, usualMinute } from "@/lib/habits/insights";
import type { Completion } from "@/lib/habits/types";
import { entry, habit } from "./helpers";

describe("habitInsights", () => {
  const now = new Date(2026, 8, 23, 12, 0);
  const phone = habit({ name: "Telefon do późna", kind: "avoid" }, 50, now);
  const steps = habit({ name: "8000 kroków", goal: { type: "count", target: 8000, step: 1000, unit: "kroków" } }, 50, now);
  const read = habit({ name: "Czytanie" }, 60, now);

  test("finds 'after a late phone night you walk less'", () => {
    const c: Completion[] = [];
    for (let i = 50; i >= 1; i--) {
      const d = addDays(now, -i);
      const slipped = i % 3 === 0; // every third night is a late one
      if (!slipped) c.push(entry(phone, d)); // confirmed clean
      const afterSlip = (i + 1) % 3 === 0;
      c.push(entry(steps, d, { amount: afterSlip ? 4000 : 9000 }));
      if (i % 2 === 0) c.push(entry(read, d)); // unrelated noise
    }
    const found = habitInsights([phone, steps, read], c, 60, now);
    const hit = found.find((f) => f.causeId === phone.id && f.effectId === steps.id);
    expect(hit).toBeDefined();
    expect(hit!.negative).toBe(true);
    expect(hit!.text).toContain("Dzień po wpadce z „Telefon do późna”");
    expect(hit!.text).toBe(
      "Dzień po wpadce z „Telefon do późna”: „8000 kroków” średnio 4000 zamiast 9000 kroków (o 5000 kroków mniej).",
    );
    // reading every other day is unrelated to steps -> no insight about it
    expect(found.some((f) => f.causeId === read.id && f.effectId === steps.id)).toBe(false);
  });

  test("stays quiet without enough data", () => {
    expect(habitInsights([phone, steps], [], 60, now)).toEqual([]);
  });
});

describe("usualMinute / monthGrid", () => {
  const now = new Date(2026, 8, 23, 12, 0);
  const read = habit({ name: "Czytanie" }, 60, now);

  test("median first-log minute, needs 3+ days", () => {
    const logs = [1260, 1275, 1300].map((m, i) => entry(read, addDays(now, -i - 1), { amount: 1, log: [[m, 1]] }));
    expect(usualMinute(read, logs.slice(0, 2), now)).toBeNull();
    expect(usualMinute(read, logs, now)).toBe(1275);
  });

  test("Mon-first grid of 42 days with overall rates", () => {
    const grid = monthGrid([read], [entry(read, now, { amount: 1 })], now, now);
    expect(grid).toHaveLength(42);
    expect(grid[0].date.getDay()).toBe(1); // Monday
    const today = grid.find((d) => d.key === "2026-09-23")!;
    expect(today.rate).toBe(100);
    expect(grid.find((d) => d.key === "2026-09-24")!.future).toBe(true);
  });
});
