import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import {
  GLASS_ML,
  isKropi,
  kropiGoal,
  kropiUpdates,
  linkKropiPatch,
  unlinkedWaterHabits,
  type KropiDay,
} from "@/lib/kropi";
import { ringMarks, ringPoint } from "@/lib/habits/ring";
import { useHabits } from "@/lib/habits/store";
import { buildState } from "@/lib/widget/bridge";
import type { Completion } from "@/lib/habits/types";
import { WED_1540, entry, habit, key } from "./helpers";

const now = WED_1540;
const water = () =>
  habit(
    { name: "Picie wody", icon: "GlassWater", goal: { type: "count", target: 4, step: 1 } },
    30,
    now,
  );
const day = (d: Date, ml: number, goal = 2000): KropiDay => ({ date: key(d), ml, goal });

describe("water from Kropi", () => {
  test("only build count water habits not yet linked are offered", () => {
    const w = water();
    const list = [
      w,
      { ...water(), id: "linked", source: "kropi" as const },
      habit({ name: "Fast food", kind: "avoid" }),
      habit({ name: "Czytanie", icon: "BookOpen", goal: { type: "minutes", target: 20 } }),
    ];
    expect(unlinkedWaterHabits(list).map((h) => h.id)).toEqual([w.id]);
    expect(isKropi(list[1])).toBe(true);
  });

  test("the goal becomes ml: Kropi's goal, or glasses × 250 ml", () => {
    expect(kropiGoal({ type: "count", target: 4, step: 1 }, 2400)).toEqual({
      type: "count",
      target: 2400,
      step: GLASS_ML,
      unit: "ml",
    });
    expect(kropiGoal({ type: "count", target: 4, step: 1 }, null).target).toBe(1000);
    expect(kropiGoal(undefined, 0).target).toBe(8 * GLASS_ML);
  });

  test("linking: Kropi's days win, old glasses become ml, missing days are added", () => {
    const w = water();
    const other = habit({ name: "Kroki", goal: { type: "count", target: 8000 } });
    const cs: Completion[] = [
      entry(w, addDays(now, -1), {
        amount: 3,
        log: [
          [600, 1],
          [900, 3],
        ],
        prev: [0, 1],
      }),
      entry(w, addDays(now, -5), { amount: 2 }),
      entry(other, addDays(now, -1), { amount: 5000 }),
    ];
    const days = [day(now, 750, 2400), day(addDays(now, -1), 1800), day(addDays(now, -2), 0)];
    const p = linkKropiPatch(w, cs, days);
    expect(p.goal.target).toBe(2400);
    const byDate = (d: Date) => p.completions.find((c) => c.habitId === w.id && c.date === key(d));
    expect(byDate(addDays(now, -1))?.amount).toBe(1800); // Kropi knows that day
    expect(byDate(addDays(now, -1))?.log).toBeUndefined();
    expect(byDate(addDays(now, -5))?.amount).toBe(500); // 2 glasses
    expect(byDate(now)?.amount).toBe(750); // added from Kropi
    expect(byDate(addDays(now, -2))).toBeUndefined(); // 0 ml: nothing to add
    expect(p.completions.find((c) => c.habitId === other.id)?.amount).toBe(5000);
  });

  test("sync: only days that differ, and Kropi's goal for today", () => {
    const w = {
      ...water(),
      source: "kropi" as const,
      goal: { type: "count" as const, target: 2000, step: 250, unit: "ml" },
    };
    const cs = [entry(w, now, { amount: 500 }), entry(w, addDays(now, -1), { amount: 1500 })];
    const days = [day(now, 750, 2400), day(addDays(now, -1), 1500)];
    const u = kropiUpdates(w, cs, days, key(now));
    expect(u.amounts).toEqual([{ date: key(now), ml: 750 }]);
    expect(u.target).toBe(2400);
    expect(kropiUpdates(w, cs, [day(now, 500, 2000)], key(now))).toEqual({
      amounts: [],
      target: null,
    });
  });

  test("store: link and unlink; the native row carries source kropi", () => {
    const s = useHabits.getState();
    const keep = { habits: s.habits, completions: s.completions };
    const w = water();
    useHabits.setState({ habits: [w], completions: [] });
    try {
      useHabits.getState().linkKropi(w.id, [{ date: key(new Date()), ml: 1000, goal: 2000 }]);
      const h = useHabits.getState().habits[0];
      expect(h.source).toBe("kropi");
      expect(h.goal).toEqual({ type: "count", target: 2000, step: 250, unit: "ml" });
      const row = buildState().habits.find((r) => r.id === w.id)!;
      expect(row.source).toBe("kropi");
      expect(row.amount).toBe(1000);
      expect(row.target).toBe(2000);
      useHabits.getState().unlinkKropi(w.id);
      expect(useHabits.getState().habits[0].source).toBeUndefined();
      expect(useHabits.getState().habits[0].goal?.unit).toBe("ml");
    } finally {
      useHabits.setState(keep);
    }
  });

  test("native mirrors exist (permission, receiver, provider URI, quick add)", async () => {
    const m = await Bun.file("android/app/src/main/AndroidManifest.xml").text();
    expect(m).toContain(
      'uses-permission android:name="com.kropi.hydration.permission.READ_HYDRATION"',
    );
    expect(m).toContain('android:name=".KropiReceiver"');
    expect(m).toContain('<package android:name="com.kropi.hydration" />');
    const j = await Bun.file(
      "android/app/src/main/java/app/lovable/glow_habit_widget/Kropi.java",
    ).text();
    expect(j).toContain("content://com.kropi.hydration.export/days");
    expect(j).toContain("kropi://add");
  });
});

describe("tile ring: the progress dot moves, the minimum is a tick", () => {
  test("the head follows the progress - also for automatic steps", () => {
    const base = { amount: 0, target: 8000, min: 2000, done: false, avoid: false };
    expect(ringMarks({ ...base, progress: 0 }).head).toBeNull();
    expect(ringMarks({ ...base, amount: 4000, progress: 0.5 }).head).toBe(0.5);
    expect(ringMarks({ ...base, amount: 7943, progress: 7943 / 8000 }).head).toBeCloseTo(0.9929, 3);
    expect(ringMarks({ ...base, amount: 8000, progress: 1, done: true }).head).toBeNull();
  });

  test("the minimum tick shows only until the minimum is reached", () => {
    const base = { target: 20, min: 5, done: false, avoid: false };
    expect(ringMarks({ ...base, amount: 0, progress: 0 }).minTick).toBe(0.25);
    expect(ringMarks({ ...base, amount: 5, progress: 0.25 }).minTick).toBeNull();
    expect(ringMarks({ ...base, min: 0, amount: 0, progress: 0 }).minTick).toBeNull();
    expect(ringMarks({ ...base, avoid: true, amount: 0, progress: 0 })).toEqual({
      head: null,
      minTick: null,
    });
  });

  test("ring points: 0 at 12 o'clock of the rotated svg", () => {
    const p = ringPoint(100, 40, 0);
    expect(p.x).toBeCloseTo(90);
    expect(p.y).toBeCloseTo(50);
    expect(ringPoint(100, 40, 0.25).y).toBeCloseTo(90);
  });
});
