import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import {
  dailySeries,
  monthCompare,
  monthStats,
  toCsv,
  trendSummary,
  csvFileName,
} from "@/lib/habits/stats";
import type { Completion } from "@/lib/habits/types";
import { WED_1540, entry, habit, key } from "./helpers";

const now = WED_1540; // Wed 2026-09-23
const water = habit(
  { name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } },
  120,
  now,
);
const food = habit(
  { name: 'Fast food; "XL"', kind: "avoid", limit: { times: 1, period: "week" } },
  120,
  now,
);
const habits = [water, food];

function days(n: number, amount: (i: number) => number, clean = true): Completion[] {
  const out: Completion[] = [];
  for (let i = 1; i <= n; i++) {
    const d = addDays(now, -i);
    out.push(entry(water, d, { amount: amount(i) }));
    if (clean) out.push(entry(food, d));
  }
  return out;
}

describe("90-day trend", () => {
  test("one point per day, oldest first, today last; moving average over 7 days", () => {
    const c = days(89, (i) => (i % 2 ? 8 : 0));
    const s = dailySeries(habits, c, 90, now);
    expect(s).toHaveLength(90);
    expect(s[89].key).toBe(key(now));
    expect(s[0].key).toBe(key(addDays(now, -89)));
    // odd days ago: water 100% + clean 100% = 100; even: 0% + 100% = 50
    expect(s[88].pct).toBe(100); // yesterday (1 day ago)
    expect(s[87].pct).toBe(50);
    expect(s[80].avg).toBeGreaterThanOrEqual(50);
    expect(s[80].avg).toBeLessThanOrEqual(100);
  });

  test("days before the first habit have no data", () => {
    const young = habit({ name: "Nowy" }, 5, now);
    const s = dailySeries([young], [], 90, now);
    expect(s.filter((p) => p.pct != null)).toHaveLength(6); // 5 days ago .. today
  });

  test("summary: average, last 30 vs previous 30, best day", () => {
    const c = days(60, (i) => (i <= 30 ? 8 : 0)); // recent month perfect, month before half
    const sum = trendSummary(dailySeries(habits, c, 90, now));
    expect(sum.change).toBeGreaterThan(40);
    expect(sum.best?.pct).toBe(100);
    expect(sum.tracked).toBe(90);
  });
});

describe("months", () => {
  test("six months, oldest first, current month flagged", () => {
    const m = monthStats(
      habits,
      days(100, () => 8),
      6,
      now,
    );
    expect(m.map((x) => x.key)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(m[5].current).toBe(true);
    expect(m[5].label).toBe("wrz");
    expect(m[4].pct).toBe(100);
    expect(m[4].forma).toBe(31);
  });

  test("this month vs last month only up to the same day", () => {
    // August: perfect days 1-23 only; rest of August empty -> still 100% in the window
    const c: Completion[] = [];
    for (let d = 1; d <= 31; d++) {
      const date = new Date(2026, 7, d);
      c.push(entry(water, date, { amount: d <= 23 ? 8 : 0 }), entry(food, date));
    }
    for (let d = 1; d <= 22; d++)
      c.push(entry(water, new Date(2026, 8, d), { amount: 4 }), entry(food, new Date(2026, 8, d)));
    const cmp = monthCompare(habits, c, now);
    expect(cmp.upTo).toBe(23);
    expect(cmp.lastMonth.pct).toBe(100);
    expect(cmp.thisMonth.pct).toBeLessThan(100);
    expect(cmp.delta).toBeLessThan(0);
    expect(cmp.thisMonth.label).toBe("wrzesień");
  });
});

describe("CSV export", () => {
  test("header, one row per habit-day, escaped fields, statuses", () => {
    const c = [
      entry(water, addDays(now, -1), { amount: 8 }),
      entry(water, addDays(now, -2), { amount: 3 }),
      entry(food, addDays(now, -1)),
      entry(food, addDays(now, -2), { slipped: true }),
    ];
    const csv = toCsv(habits, c, {}, now);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "data;zadanie;rodzaj;cel;jednostka;wynik;status;procent;social_w_nocy;social_dzien_min",
    );
    expect(lines).toHaveLength(1 + 121 * 2);
    const y = lines.filter((l) => l.startsWith(key(addDays(now, -1))));
    expect(y).toContain(
      `${key(addDays(now, -1))};Picie wody;do zrobienia;8;szklanek;8;zrobione;100;;`,
    );
    expect(y).toContain(`${key(addDays(now, -1))};"Fast food; ""XL""";zakazane;0;;0;czysto;100;;`);
    const d2 = lines.filter((l) => l.startsWith(key(addDays(now, -2))));
    expect(d2.some((l) => l.includes(";3;częściowo;38;"))).toBe(true);
    expect(d2.some((l) => l.includes(";1;wpadka;"))).toBe(true);
  });

  test("screen-judged habits get the night's social media visits", () => {
    const bed = habit({ name: "Scrollowanie w łóżku", kind: "avoid", source: "screen" }, 3, now);
    const d = addDays(now, -1);
    const csv = toCsv([bed], [entry(bed, d, { slipped: true, auto: true })], { [key(d)]: 4 }, now);
    expect(csv).toContain(`${key(d)};Scrollowanie w łóżku;zakazane;0;;1;wpadka;0;4`);
    // undecided nights are left out
    expect(csv).not.toContain(key(now));
  });

  test("file name uses the local date", () => {
    expect(csvFileName(now)).toBe("szpila-historia-2026-09-23.csv");
  });
});
