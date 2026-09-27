import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { guardStart, inLiveWindow, liveState, minutesTo } from "@/lib/live";
import { useHabits } from "@/lib/habits/store";

const JAVA = readFileSync(
  "android/app/src/main/java/app/lovable/glow_habit_widget/LiveGuard.java",
  "utf8",
);

describe("bedtime mode (tryb przed snem)", () => {
  test("minutes until a time of day, across midnight (mirrors LiveGuard.minutesTo)", () => {
    expect(minutesTo(23 * 60 + 30, 0)).toBe(30);
    expect(minutesTo(22 * 60, 0)).toBe(120);
    expect(minutesTo(10, 0)).toBe(1430);
    expect(minutesTo(0, 0)).toBe(0);
  });

  test("the guard starts at bedtime when it's before the deadline, else at the deadline", () => {
    expect(guardStart(true, 23 * 60 + 30, 0)).toBe(23 * 60 + 30);
    expect(guardStart(false, 23 * 60 + 30, 0)).toBe(0);
    // bedtime after the deadline that night (00:30 vs 00:00) - no pre-phase
    expect(guardStart(true, 30, 0)).toBe(0);
    // bedtime equal to the deadline
    expect(guardStart(true, 0, 0)).toBe(0);
    // an early evening bedtime still counts (21:00 -> 00:00)
    expect(guardStart(true, 21 * 60, 0)).toBe(21 * 60);
  });

  test("from bedtime the guard window covers the whole night", () => {
    const start = guardStart(true, 23 * 60 + 30, 0);
    expect(inLiveWindow(23 * 60 + 45, start, 5 * 60)).toBe(true);
    expect(inLiveWindow(2 * 60, start, 5 * 60)).toBe(true);
    expect(inLiveWindow(22 * 60, start, 5 * 60)).toBe(false);
  });

  test("settings reach the native guard; defaults are on at 23:30", () => {
    const n = useHabits.getState().notifications;
    expect(n.bedtime).toBe(true);
    expect(n.bedtimeAt).toBe("23:30");
    const st = liveState(n, "hard", null);
    expect(st.bedtime).toBe(true);
    expect(st.bedtimeAt).toBe(23 * 60 + 30);
    expect(st.lines.pre.length).toBeGreaterThan(0);
    expect(st.lines.bedtime.length).toBeGreaterThan(0);
    for (const l of [...st.lines.pre, ...st.lines.bedtime]) expect(l).toContain("{left}");
    expect(liveState({ ...n, bedtime: false }, "soft", null).bedtime).toBe(false);
  });

  test("Java mirrors the same start rule", () => {
    expect(JAVA).toContain("static int start(boolean bedtimeOn, int bedtime, int deadline)");
    expect(JAVA).toContain("lead > 0 && lead < 12 * 60 ? bedtime : deadline");
  });
});
