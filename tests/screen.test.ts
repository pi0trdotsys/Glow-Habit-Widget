import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import { DEFAULT_LATE_AFTER, DEFAULT_LATE_LIMIT, lateAfterMin, screenVerdict } from "@/lib/sensors";
import { avoidStatus, countsOn, planDay, todayProgress, weeklyReport } from "@/lib/habits/utils";
import { WED_1540, entry, habit } from "./helpers";

describe("scrolling in bed judged from screen time", () => {
  test("default 'late' is after midnight with a 15 min tolerance", () => {
    expect(DEFAULT_LATE_AFTER).toBe("00:00");
    expect(DEFAULT_LATE_LIMIT).toBe(15);
    expect(lateAfterMin(habit({ name: "X", kind: "avoid", source: "screen" }))).toBe(0);
    expect(lateAfterMin(habit({ name: "X", kind: "avoid", source: "screen", lateAfter: "23:30" }))).toBe(1410);
  });

  test("verdict: over the limit = slip even mid-night; quiet night = clean only once it's over", () => {
    expect(screenVerdict(40, 15, false)).toBe("slip");
    expect(screenVerdict(40, 15, true)).toBe("slip");
    expect(screenVerdict(10, 15, false)).toBeNull(); // night still running - undecided
    expect(screenVerdict(10, 15, true)).toBe("clean");
    expect(screenVerdict(15, 15, true)).toBe("clean"); // exactly the tolerance is fine
  });

  const bed = habit({ name: "Scrollowanie w łóżku", icon: "Smartphone", kind: "avoid", source: "screen", lateAfter: "00:00" }, 30, WED_1540);
  const now = WED_1540;

  test("never pre-ticked either way, never an automatic slip", () => {
    for (const d of [0, 1, 2, 7]) {
      expect(avoidStatus(bed, [], addDays(now, -d), now)).toBe("pending");
      expect(countsOn(bed, [], addDays(now, -d), now)).toBe(false);
    }
    expect(planDay([bed], [], now)).toEqual([]); // nothing to confirm by hand
    expect(todayProgress([bed], [], now).total).toBe(0);
  });

  test("automatic verdicts count; undecided nights stay out of the weekly comparison", () => {
    const c = [entry(bed, addDays(now, -1), { auto: true }), entry(bed, addDays(now, -2), { slipped: true, auto: true })];
    expect(avoidStatus(bed, c, addDays(now, -1), now)).toBe("clean");
    expect(avoidStatus(bed, c, addDays(now, -2), now)).toBe("slip");
    const r = weeklyReport([bed], c, now);
    expect(r.thisWeek.due).toBe(2); // Mon + Tue decided, Wed undecided
  });
});
