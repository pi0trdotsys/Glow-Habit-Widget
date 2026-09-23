import { beforeEach, describe, expect, test } from "bun:test";
import { useHabits } from "@/lib/habits/store";
import { memoryLines, nagLines, fill, weeklyRoast } from "@/lib/habits/szpila";
import { todayKey } from "@/lib/habits/utils";
import { addDays } from "date-fns";
import { entry, habit } from "./helpers";

beforeEach(() => {
  useHabits.setState({ habits: [], completions: [], seeded: true });
});

describe("store", () => {
  test("logStep adds one step and caps at the goal", () => {
    const id = useHabits.getState().addHabit({
      name: "Woda",
      icon: "GlassWater",
      color: "sky",
      schedule: { type: "daily" },
      goal: { type: "count", target: 3, step: 2 },
    });
    const s = useHabits.getState();
    s.logStep(id);
    s.logStep(id);
    s.logStep(id);
    const c = useHabits.getState().completions.find((x) => x.habitId === id)!;
    expect(c.amount).toBe(3);
    expect(useHabits.getState().isCompleted(id)).toBe(true);
  });

  test("the day log keeps at most one point per hour", () => {
    const id = useHabits.getState().addHabit({ name: "Kroki", icon: "Footprints", color: "lime", schedule: { type: "daily" } });
    const k = todayKey();
    for (let m = 0; m < 24 * 60; m += 7) useHabits.getState().setAmount(id, k, m, m);
    const log = useHabits.getState().completions[0].log!;
    expect(log.length).toBe(24);
    expect(new Set(log.map(([m]) => Math.floor(m / 60))).size).toBe(24);
  });

  test("backup round-trip restores habits, history and name", () => {
    const s = useHabits.getState();
    s.setUserName("Tester");
    const id = s.addHabit({ name: "Czytanie", icon: "BookOpen", color: "amber", schedule: { type: "daily" } });
    s.setAmount(id, todayKey(), 1);
    const json = useHabits.getState().exportData();
    useHabits.setState({ habits: [], completions: [], userName: null });
    expect(useHabits.getState().importData(json)).toBe(1);
    expect(useHabits.getState().habits[0].name).toBe("Czytanie");
    expect(useHabits.getState().completions).toHaveLength(1);
    expect(useHabits.getState().userName).toBe("Tester");
  });

  test("invalid backups are rejected without touching data", () => {
    const id = useHabits.getState().addHabit({ name: "X", icon: "Star", color: "mint", schedule: { type: "daily" } });
    expect(() => useHabits.getState().importData('{"foo":1}')).toThrow("To nie jest kopia zapasowa Loop.");
    expect(() => useHabits.getState().importData("nope")).toThrow();
    expect(useHabits.getState().habits.map((h) => h.id)).toEqual([id]);
  });

  test("manual avoid answers are kept separate from automatic ones", () => {
    const id = useHabits.getState().addHabit({ name: "Telefon", icon: "Phone", color: "rose", schedule: { type: "daily" }, kind: "avoid" });
    useHabits.getState().setAvoid(id, todayKey(), "slip", 600, true);
    expect(useHabits.getState().completions[0]).toMatchObject({ slipped: true, auto: true });
    useHabits.getState().setAvoid(id, todayKey(), "clean");
    expect(useHabits.getState().completions[0].auto).toBeUndefined();
  });
});

describe("Szpila lines", () => {
  test("placeholders are filled; single-check habits never get amount lines", () => {
    const water = habit({ name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } });
    expect(fill("Wypite {done} z {target}, zostało {left}.", water, 3)).toBe("Wypite 3 z 8, zostało 5 szklanek.");
    const teeth = habit({ name: "Mycie zębów" });
    for (const l of nagLines(teeth, "hard", null)) expect(l).not.toMatch(/\{(left|done|target)\}/);
  });

  test("memory lines only for repeat offenders", () => {
    const ff = habit({ name: "Fast food", kind: "avoid" }, 60);
    const now = new Date();
    const cleanAll = Array.from({ length: 30 }, (_, i) => entry(ff, addDays(now, -i - 1)));
    expect(memoryLines(ff, cleanAll, "hard", null)).toEqual([]);
    const twoSlips = cleanAll.slice(2); // the last two nights unconfirmed = slips
    expect(memoryLines(ff, twoSlips, "hard", null)[0]).toContain("2 wpadki");
  });

  test("weekly roast mentions the week's rate", () => {
    const read = habit({ name: "Czytanie" }, 30);
    expect(weeklyRoast([read], [], "soft", "Ola")).toMatch(/^Ola, tydzień: \d+%/);
    expect(weeklyRoast([], [], "hard", null)).toBe("");
  });
});
