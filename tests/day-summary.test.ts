import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import {
  DEFAULT_AT,
  EARLIEST,
  LATEST,
  generalTips,
  habitTips,
  summaryLines,
  summaryMinute,
  summarySnapshot,
  tierOf,
} from "@/lib/habits/day-summary";
import { indexEntries } from "@/lib/habits/utils";
import { setLang } from "@/lib/i18n";
import type { Completion } from "@/lib/habits/types";
import { entry, habit } from "./helpers";

// A fixed Tuesday evening: 2026-11-17 21:00 (tomorrow = Wednesday).
const NOW = new Date(2026, 10, 17, 21, 0);
const at = (h: number, m = 0) => h * 60 + m;

beforeEach(() => setLang("pl"));
afterAll(() => setLang("pl"));

describe("podsumowanie dnia: when", () => {
  test("too little history: the default, a bit after the evening review", () => {
    expect(summaryMinute([], null, NOW)).toEqual({ at: DEFAULT_AT, learned: false });
  });

  test("learned from when the evenings usually end (75th percentile + 20 min)", () => {
    const h = habit({ name: "Mycie zębów" }, 60, NOW);
    const ends = [at(22, 10), at(22, 30), at(22, 40), at(22, 50), at(23, 0), at(22, 20)];
    const c: Completion[] = ends.map((m, i) =>
      entry(h, addDays(NOW, -(i + 1)), {
        amount: 1,
        log: [
          [at(8), 1],
          [m, 2],
        ],
      }),
    );
    const r = summaryMinute(c, null, NOW);
    expect(r.learned).toBe(true);
    expect(r.at).toBe(at(23, 10)); // p75 = 22:50, + 20
  });

  test("clamped to the evening, moved off the review, today and automatic entries ignored", () => {
    const h = habit({ name: "Czytanie" }, 60, NOW);
    const early = [1, 2, 3, 4, 5].map((i) =>
      entry(h, addDays(NOW, -i), { amount: 1, log: [[at(13), 1]] }),
    );
    expect(summaryMinute(early, null, NOW).at).toBe(EARLIEST);
    const late = [1, 2, 3, 4, 5].map((i) =>
      entry(h, addDays(NOW, -i), { amount: 1, log: [[at(23, 59), 1]] }),
    );
    expect(summaryMinute(late, null, NOW).at).toBe(LATEST);
    const ignored = [
      entry(h, NOW, { amount: 1, log: [[at(23), 1]] }),
      ...[1, 2, 3, 4, 5].map((i) => entry(h, addDays(NOW, -i), { auto: true, log: [[at(23), 1]] })),
    ];
    expect(summaryMinute(ignored, null, NOW).learned).toBe(false);
    expect(summaryMinute([], at(21, 40), NOW).at).toBe(at(21, 55)); // not on top of the review
  });
});

describe("podsumowanie dnia: advice from the history", () => {
  test("tomorrow's weak weekday is named, with the numbers", () => {
    const h = habit({ name: "Siłownia" }, 70, NOW);
    const c: Completion[] = [];
    for (let i = 1; i <= 56; i++) {
      const d = addDays(NOW, -i);
      if (d.getDay() !== 3) c.push(entry(h, d, { amount: 1 })); // every day but Wednesdays
    }
    const tips = habitTips(h, c, indexEntries(c), NOW);
    expect(tips[0]).toContain("w środę");
    expect(tips[0]).toContain("0%");
    expect(tips[0]).toContain("Jutro środa");
  });

  test("a goal reached on few days but usually started gets a lower target", () => {
    const h = habit(
      { name: "Kroki", goal: { type: "count", target: 10000, step: 1000, unit: "kroków" } },
      70,
      NOW,
    );
    const c = Array.from({ length: 30 }, (_, i) =>
      entry(h, addDays(NOW, -(i + 1)), { amount: 6000 }),
    );
    const tip = habitTips(h, c, indexEntries(c), NOW).find((t) => t.includes("Zejdź na"));
    expect(tip).toContain("7000");
  });

  test("the usual time and the minimum version", () => {
    const h = habit({ name: "Czytanie", goal: { type: "minutes", target: 20, step: 10 } }, 40, NOW);
    const c = [1, 2, 3, 4].map((i) =>
      entry(h, addDays(NOW, -i), { amount: 20, log: [[at(21, 15), 20]] }),
    );
    const tips = habitTips(h, c, indexEntries(c), NOW);
    expect(tips.some((t) => t.includes("21:15"))).toBe(true);
    expect(tips.some((t) => t.includes("5 min"))).toBe(true);
  });

  test("early starts vs late days, only when the gap is real", () => {
    const a = habit({ name: "Woda" }, 60, NOW);
    const b = habit({ name: "Czytanie" }, 60, NOW);
    const c: Completion[] = [];
    for (let i = 1; i <= 20; i++) {
      const d = addDays(NOW, -i);
      if (i % 2) {
        c.push(entry(a, d, { amount: 1, log: [[at(8), 1]] }), entry(b, d, { amount: 1 }));
      } else {
        c.push(entry(a, d, { amount: 1, log: [[at(15), 1]] }));
      }
    }
    const tips = generalTips([a, b], c, indexEntries(c), NOW);
    expect(tips[0]).toContain("przed 10:00");
    expect(tips[0]).toContain("100%");
    expect(tips[0]).toContain("50%");
    expect(generalTips([a, b], [], indexEntries([]), NOW)).toEqual([]);
  });

  test("discreet habits get no advice in the snapshot", () => {
    const porn = habit({ name: "Pornografia", kind: "avoid" }, 60, NOW);
    const read = habit(
      { name: "Czytanie", goal: { type: "minutes", target: 20, step: 10 } },
      60,
      NOW,
    );
    const s = summarySnapshot([porn, read], [], "hard", "Ola", null, NOW);
    expect(Object.keys(s.tips)).toEqual([read.id]);
    expect(JSON.stringify(s)).not.toContain("Porn");
  });
});

describe("podsumowanie dnia: tone", () => {
  test("tiers", () => {
    expect([100, 80, 50, 10, 0].map(tierOf)).toEqual(["full", "great", "ok", "weak", "zero"]);
  });

  test("openers: name up front, placeholders left for the phone, no long dashes", () => {
    const l = summaryLines("hard", "Ola");
    for (const pool of Object.values(l)) {
      expect(pool.length).toBeGreaterThan(1);
      for (const line of pool) {
        expect(line.startsWith("Ola, ")).toBe(true);
        expect(line).not.toMatch(/[—–]/);
      }
    }
    expect(summaryLines("soft", null).full[0]).toContain("{pct}");
    setLang("en");
    expect(summaryLines("hard", null).zero[0]).toMatch(/^Zero/);
  });
});
