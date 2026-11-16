import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import { forecastFacts, weekFacts } from "@/lib/habits/coach-facts";
import type { ForecastItem } from "@/lib/habits/forecast";
import { setLang } from "@/lib/i18n";
import { entry, habit } from "./helpers";

// Sunday 2026-11-15, 20:00 - when the week's comment goes out.
const SUNDAY = new Date(2026, 10, 15, 20, 0);

beforeEach(() => setLang("pl"));
afterAll(() => setLang("pl"));

describe("coach facts", () => {
  test("the week: percent vs last week, the best and the weakest habits", () => {
    const water = habit({ name: "Woda" }, 60, SUNDAY);
    const gym = habit({ name: "Siłownia" }, 60, SUNDAY);
    const done = [];
    // this week (Mon 9th - Sun 15th): water every day, the gym never
    for (let i = 0; i < 7; i++) done.push(entry(water, addDays(SUNDAY, -i)));
    // last week: both, every day
    for (let i = 7; i < 14; i++)
      done.push(entry(water, addDays(SUNDAY, -i)), entry(gym, addDays(SUNDAY, -i)));
    const f = weekFacts([water, gym], done, SUNDAY);
    expect(f.best).toEqual(["Woda"]);
    expect(f.worst).toEqual(["Siłownia"]);
    expect(f.prev).not.toBeNull();
    expect(f.pct).toBeLessThan(f.prev as number);
  });

  test("the first week has nothing to compare with", () => {
    const water = habit({ name: "Woda" }, 3, SUNDAY);
    const f = weekFacts([water], [entry(water, SUNDAY)], SUNDAY);
    expect(f.prev).toBeNull();
  });

  test("the forecast: risky habits and today's plan, never a discreet habit", () => {
    const gym = habit({ name: "Siłownia" }, 60, SUNDAY);
    const secret = habit({ name: "Coś wstydliwego", kind: "avoid", discreet: true }, 60, SUNDAY);
    const sweets = habit({ name: "Słodycze", kind: "avoid" }, 60, SUNDAY);
    const item = (
      h: typeof gym,
      kind: "build" | "avoid",
      reason: ForecastItem["reason"],
    ): ForecastItem => ({
      habitId: h.id,
      name: h.name,
      kind,
      p: 0.6,
      pct: 60,
      base: 0.3,
      reason,
      text: "",
    });
    const f = forecastFacts(
      [item(gym, "build", "sleep"), item(secret, "avoid", "rescue"), item(sweets, "avoid", "wd")],
      [gym, secret, sweets],
      SUNDAY,
      "hard",
      "Piotr",
    );
    expect(f.kind).toBe("forecast");
    expect(f.wd).toBe(0);
    expect(f.risks.map((r) => r.name)).toEqual(["Siłownia", "Słodycze"]);
    expect(f.plan).toEqual(["Siłownia"]);
    expect(JSON.stringify(f)).not.toContain("wstydliw");
  });
});
