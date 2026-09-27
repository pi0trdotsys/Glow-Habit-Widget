import { beforeEach, describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import { applyPendingOps, buildState, AVOID_HEX } from "@/lib/widget/bridge";
import { useHabits } from "@/lib/habits/store";
import { todayKey } from "@/lib/habits/utils";
import { entry, habit } from "./helpers";

const today = new Date();
const water = habit(
  {
    name: "Picie wody",
    icon: "GlassWater",
    color: "sky",
    goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
  },
  10,
  today,
);
const food = habit(
  { name: "Fast food", icon: "Hamburger", kind: "avoid", limit: { times: 1, period: "week" } },
  10,
  today,
);
const bed = habit(
  {
    name: "Scrollowanie w łóżku",
    icon: "Smartphone",
    kind: "avoid",
    source: "screen",
    lateAfter: "00:00",
  },
  10,
  today,
);

beforeEach(() => {
  useHabits.setState({
    habits: [water, food, bed],
    completions: [entry(water, today, { amount: 3 })],
    seeded: true,
    userName: "Ola",
  });
});

describe("widget snapshot (read by widgets + notifications)", () => {
  test("rows carry everything the native side needs", () => {
    const s = buildState();
    expect(s.v).toBe(2);
    expect(s.date).toBe(todayKey(today));
    const w = s.habits.find((r) => r.id === water.id)!;
    expect(w).toMatchObject({
      kind: "build",
      goal: "count",
      amount: 3,
      target: 8,
      step: 1,
      done: false,
      units: 8,
    });
    expect(w.unitForms).toEqual(["szklanka", "szklanki", "szklanek"]);
    expect(w.nag.length).toBeGreaterThan(5);
    expect(w.nag.join(" ")).not.toContain("{name}"); // resolved; amounts stay as {done}/{left}
    const f = s.habits.find((r) => r.id === food.id)!;
    // 10 unconfirmed days = slips: allowance used up, and Szpila remembers it
    expect(f).toMatchObject({
      kind: "avoid",
      colorHex: AVOID_HEX,
      status: "pending",
      slipsLeft: 0,
    });
    expect(f.memory.join(" ")).toMatch(/wpadek z „Fast food”/);
    const b = s.habits.find((r) => r.id === bed.id)!;
    expect(b).toMatchObject({ source: "screen", lateAfter: 0, lateLimit: 15 });
  });

  test("settings are passed in minutes", () => {
    const s = buildState();
    expect(s.settings).toMatchObject({
      quietFrom: 22 * 60,
      quietTo: 9 * 60,
      reviewAt: 21 * 60 + 30,
      taunts: true,
    });
  });

  test("yesterday's open forbidden habits (morning review) exclude screen-judged ones", () => {
    const s = buildState();
    expect(s.yesterday.date).toBe(todayKey(addDays(today, -1)));
    const ids = s.yesterday.items.map((i) => i.id);
    expect(ids).not.toContain(bed.id);
    // food is listed only while yesterday is still open (before noon)
    expect(ids.includes(food.id)).toBe(today.getHours() < 12);
  });
});

describe("ops from widgets and notifications", () => {
  test("absolute amounts, confirmations and legacy ops apply idempotently", () => {
    const d = todayKey(today);
    applyPendingOps([
      { habitId: water.id, date: d, amount: 5, minute: 600 },
      { habitId: water.id, date: d, amount: 5, minute: 600 },
      { habitId: food.id, date: d, status: "clean", minute: 700 },
      { habitId: "gone", date: d, amount: 1 },
    ]);
    const c = useHabits.getState().completions;
    expect(c.find((x) => x.habitId === water.id)!.amount).toBe(5);
    expect(c.find((x) => x.habitId === food.id)!.slipped).toBeUndefined();
    applyPendingOps([{ habitId: water.id, date: d, done: true }]);
    expect(useHabits.getState().completions.find((x) => x.habitId === water.id)!.amount).toBe(8);
  });

  test("an automatic screen verdict never overrides a manual answer", () => {
    const y = todayKey(addDays(today, -1));
    useHabits.getState().setAvoid(bed.id, y, "clean"); // answered by hand
    applyPendingOps([{ habitId: bed.id, date: y, status: "slip", auto: true }]);
    expect(
      useHabits.getState().completions.find((x) => x.habitId === bed.id && x.date === y)!.slipped,
    ).toBeUndefined();
  });
});
