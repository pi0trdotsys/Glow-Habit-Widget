import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import { appsLine, badNight, billComment, billLines, fillBill } from "@/lib/night";
import { lateBasisOf, nightMinutes, screenVerdict, type NightReport } from "@/lib/sensors";
import { catCondition } from "@/lib/habits/gamification";
import { caughtLines } from "@/lib/habits/szpila";
import { liveLines, liveState } from "@/lib/live";
import { useHabits } from "@/lib/habits/store";
import { buildState } from "@/lib/widget/bridge";
import type { Completion } from "@/lib/habits/types";
import { WED_1540, entry, habit, key } from "./helpers";

const bad: NightReport = {
  date: "2026-09-25",
  granted: true,
  apps: [
    { pkg: "com.instagram.android", label: "Instagram", visits: 3, minutes: 22 },
    { pkg: "com.google.android.youtube", label: "YouTube", visits: 1, minutes: 25 },
  ],
  visits: 4,
  social: 47,
  screen: 61,
  asleep: 100,
};
const clean: NightReport = {
  date: "2026-09-24",
  granted: true,
  apps: [],
  visits: 0,
  social: 0,
  screen: 3,
  asleep: -1,
};

describe("rachunek za noc", () => {
  test("apps line and placeholders (mirrors NightStats)", () => {
    expect(appsLine(bad)).toBe("3× Instagram (22 min) · 1× YouTube (25 min)");
    expect(fillBill("{visits}× · {social} min · {screen} min · {asleep} · {apps}", bad)).toBe(
      "4× · 47 min · 61 min · 01:40 · 3× Instagram (22 min) · 1× YouTube (25 min)",
    );
    expect(fillBill("{asleep}", clean)).toBe("?");
  });

  test("bad night = any social media after midnight; comment matches and is stable", () => {
    expect(badNight(bad)).toBe(true);
    expect(badNight(clean)).toBe(false);
    const c1 = billComment(bad, "hard", null);
    expect(c1).toBe(billComment(bad, "hard", null));
    expect(billLines("hard", null).bad.map((l) => fillBill(l, bad))).toContain(c1);
    // unknown sleep time -> never a line that needs {asleep}
    for (let i = 0; i < 20; i++) {
      const c = billComment({ ...clean, date: `2026-09-${10 + i}` }, "hard", null);
      expect(c).not.toContain("?");
    }
  });

  test("hard comments swear, soft ones don't; no leftover placeholders", () => {
    const swear = /kurw|gówn|jeba/i;
    expect(billLines("hard", null).bad.some((l) => swear.test(l))).toBe(true);
    for (const l of [...billLines("soft", null).bad, ...billLines("soft", null).good])
      expect(swear.test(l)).toBe(false);
    for (const l of [...billLines("hard", "Ola").bad, ...billLines("hard", "Ola").good]) {
      expect(fillBill(l, bad)).not.toMatch(/\{\w+\}/);
    }
  });
});

describe("scrolling in bed judged by social media", () => {
  test("social basis is the default and uses the social minutes", () => {
    const h = habit({ name: "Scrollowanie w łóżku", kind: "avoid", source: "screen" });
    expect(lateBasisOf(h)).toBe("social");
    expect(lateBasisOf({ ...h, lateBasis: "screen" })).toBe("screen");
    // 90 min with the screen on (alarm, music), 4 min of Instagram -> clean with a 15 min limit
    const night = { daysAgo: 1, minutes: 90, social: 4, closed: true };
    expect(screenVerdict(nightMinutes(night, "social"), 15, night.closed)).toBe("clean");
    expect(screenVerdict(nightMinutes(night, "screen"), 15, night.closed)).toBe("slip");
    // older native build without `social` falls back to screen minutes
    expect(nightMinutes({ daysAgo: 1, minutes: 30, closed: false }, "social")).toBe(30);
  });

  test("caught lines talk about social media for the social basis", () => {
    expect(caughtLines("hard", "social").every((l) => /social/i.test(l))).toBe(true);
    expect(caughtLines("hard", "screen").some((l) => /social/i.test(l))).toBe(false);
  });
});

describe("full-screen block lines", () => {
  test("every level has block lines and the snapshot carries the switch", () => {
    expect(liveLines("hard", null).block.length).toBeGreaterThan(2);
    expect(liveLines("soft", null).block.length).toBeGreaterThan(0);
    const n = useHabits.getState().notifications;
    expect(liveState({ ...n, liveBlock: false }, "hard", null).block).toBe(false);
    expect(liveState(n, "hard", null).block).toBe(true);
  });
});

describe("kot w domu", () => {
  const now = WED_1540;
  const water = habit(
    { name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } },
    60,
    now,
  );
  const read = habit(
    { name: "Czytanie", goal: { type: "minutes", target: 20, step: 10 } },
    60,
    now,
  );
  const days = (n: number, amount: number): Completion[] =>
    Array.from({ length: n }, (_, i) => addDays(now, -(i + 1))).flatMap((d) => [
      entry(water, d, { amount }),
      entry(read, d, { amount: amount >= 8 ? 20 : 0 }),
    ]);

  test("groomed with a 3-day forma streak - even right after a bad stretch", () => {
    expect(catCondition([water, read], days(3, 8), now)).toBe("groomed");
  });

  test("neglected after 4+ bad days in the last week (a 2-day streak isn't enough)", () => {
    expect(catCondition([water, read], days(7, 1), now)).toBe("neglected");
    const mixed = [...days(7, 1).filter((e) => e.date < key(addDays(now, -2))), ...days(2, 8)];
    expect(catCondition([water, read], mixed, now)).toBe("neglected");
  });

  test("normal otherwise (incl. brand new users)", () => {
    // started 2 days ago, both days in form but no 3-day streak yet
    const w2 = { ...water, createdAt: addDays(now, -2).toISOString() };
    const r2 = { ...read, createdAt: addDays(now, -2).toISOString() };
    expect(
      catCondition(
        [w2, r2],
        days(2, 8).map((e) => ({ ...e, habitId: e.habitId === water.id ? w2.id : r2.id })),
        now,
      ),
    ).toBe("normal");
    expect(catCondition([habit({ name: "Nowe" }, 0, now)], [], now)).toBe("normal");
  });
});

describe("snapshot for the native side", () => {
  test("carries cat condition, bill lines and the judging basis", () => {
    const s = useHabits.getState();
    const bed = habit({ name: "Scrollowanie w łóżku", kind: "avoid", source: "screen" });
    useHabits.setState({ habits: [bed], completions: [] });
    const st = buildState();
    expect(["groomed", "normal", "neglected"]).toContain(st.cat);
    expect(st.bill.bad.length).toBeGreaterThan(0);
    const row = st.habits.find((r) => r.id === bed.id)!;
    expect(row.lateBasis).toBe("social");
    expect(row.caught!.every((l) => /social/i.test(l))).toBe(true);
    useHabits.setState({ habits: s.habits, completions: s.completions });
  });

  test("night reports merge into the store and the backup", () => {
    useHabits.getState().mergeNightReports({ [bad.date]: bad });
    expect(useHabits.getState().nightReports[bad.date].social).toBe(47);
    expect(JSON.parse(useHabits.getState().exportData()).nightReports[bad.date].visits).toBe(4);
  });
});
