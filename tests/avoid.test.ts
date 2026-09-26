import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import { avoidStatus, countsOn, dayScore, isDueOn, slipsInPeriod, todayProgress } from "@/lib/habits/utils";
import { WED_1540, entry, habit } from "./helpers";

describe("forbidden habits", () => {
  const now = WED_1540;
  const ff = habit({ name: "Fast food", kind: "avoid", limit: { times: 1, period: "week" } }, 30, now);

  test("an unconfirmed past day is a slip, today stays pending", () => {
    expect(avoidStatus(ff, [], addDays(now, -1), now)).toBe("slip");
    expect(avoidStatus(ff, [], now, now)).toBe("pending");
    expect(avoidStatus(ff, [entry(ff, addDays(now, -1))], addDays(now, -1), now)).toBe("clean");
  });

  test("the weekly allowance forgives the first slip only", () => {
    // Mon unconfirmed (slip #1), Tue confirmed clean, today admitted slip (#2)
    const c = [entry(ff, addDays(now, -1)), entry(ff, now, { slipped: true })];
    expect(slipsInPeriod(ff, c, now, now)).toBe(2);
    expect(dayScore(ff, c, addDays(now, -2), now)).toBe(1); // within the allowance
    expect(dayScore(ff, c, now, now)).toBe(0); // over the limit
  });

  test("days before the habit existed are never slips", () => {
    const fresh = habit({ name: "Słodycze", kind: "avoid" }, 0, now);
    expect(slipsInPeriod(fresh, [], now, now)).toBe(0);
  });

  test("screen-judged habits are never pre-decided: undecided nights don't count at all", () => {
    const phone = habit({ name: "Scrollowanie w łóżku", kind: "avoid", source: "screen" }, 30, now);
    // today and even past days without a verdict stay undecided - not done, not a slip
    expect(avoidStatus(phone, [], now, now)).toBe("pending");
    expect(avoidStatus(phone, [], addDays(now, -3), now)).toBe("pending");
    expect(countsOn(phone, [], now, now)).toBe(false);
    expect(slipsInPeriod(phone, [], now, now)).toBe(0);
    expect(todayProgress([phone, ff], [], now)).toEqual({ done: 0, total: 1, fraction: 0 });
    // once the screen time decides, it counts like any other day
    const decided = [entry(phone, now, { slipped: true, auto: true })];
    expect(countsOn(phone, decided, now, now)).toBe(true);
    expect(dayScore(phone, decided, now, now)).toBe(0);
    expect(todayProgress([phone], [entry(phone, now, { auto: true })], now).done).toBe(1);
  });
});

describe("when an unconfirmed day becomes a slip", () => {
  const ff = habit({ name: "Scrollowanie w łóżku", kind: "avoid" }, 30, WED_1540);

  test("yesterday stays open until noon, then counts as a slip", () => {
    const morning = new Date(2026, 8, 23, 9, 15);
    const afternoon = new Date(2026, 8, 23, 12, 0);
    const yesterday = addDays(morning, -1);
    expect(avoidStatus(ff, [], yesterday, morning)).toBe("pending");
    expect(slipsInPeriod(ff, [], morning, morning)).toBe(1); // only Monday; Tuesday still open
    expect(avoidStatus(ff, [], yesterday, afternoon)).toBe("slip");
    // answering in the morning settles yesterday for good
    expect(avoidStatus(ff, [entry(ff, yesterday)], yesterday, afternoon)).toBe("clean");
  });

  test("the creation day is never an automatic slip", () => {
    const created = new Date(2026, 8, 21, 22, 30); // Monday evening
    const fresh = { ...habit({ name: "Fast food", kind: "avoid" }), createdAt: created.toISOString() };
    const later = new Date(2026, 8, 23, 15, 0);
    expect(avoidStatus(fresh, [], created, later)).toBe("pending");
    expect(avoidStatus(fresh, [], addDays(created, 1), later)).toBe("slip");
  });

  test("the creation day uses the local date, not UTC", () => {
    const justAfterMidnight = new Date(2026, 8, 22, 0, 20); // UTC is still the 21st
    const h = { ...habit({ name: "Słodycze", kind: "avoid" }), createdAt: justAfterMidnight.toISOString() };
    expect(isDueOn(h, addDays(justAfterMidnight, -1))).toBe(false);
    expect(isDueOn(h, justAfterMidnight)).toBe(true);
  });
});
