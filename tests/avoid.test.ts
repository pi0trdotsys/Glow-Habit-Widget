import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import { avoidStatus, dayScore, slipsInPeriod, todayProgress } from "@/lib/habits/utils";
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

  test("screen-judged habits count as fine today until proven otherwise", () => {
    const phone = habit({ name: "Telefon", kind: "avoid", source: "screen" }, 30, now);
    expect(dayScore(phone, [], now, now)).toBe(1);
    expect(dayScore(phone, [entry(phone, now, { slipped: true, auto: true })], now, now)).toBe(0);
    expect(todayProgress([phone, ff], [], now).done).toBe(1);
  });
});
