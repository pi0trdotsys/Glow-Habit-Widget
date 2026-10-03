import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { addDays } from "date-fns";
import {
  MAX_PCT,
  MIN_DAYS,
  WARN_LIFT,
  WARN_P,
  dayForecast,
  featuresOn,
  fillForecast,
  forecastHitRate,
  forecastLines,
  forecastSnapshot,
  hitRateText,
  isBadNight,
  lineHash,
  posterior,
  reasonPhrases,
  showForecastAt,
  trainModel,
  untilMinute,
  type ForecastPool,
  type HabitModel,
} from "@/lib/habits/forecast";
import { indexEntries, todayKey } from "@/lib/habits/utils";
import { setLang } from "@/lib/i18n";
import { statusSlideIds } from "@/components/StatusCarousel";
import { NOW, buildForecastVectors, scenario } from "./gen-forecast-vectors";

afterEach(() => setLang("pl"));

const SWEAR_PL = /kurw|chuj|pierdol|jeb|spierdal|dup[ay]|gówn|pizd|wydyma/i;
const SWEAR_EN =
  /\b(fuck\w*|shit\w*|damn\w*|ass|asses|arse|dumbass|jackass|bitch\w*|crap\w*|bastards?|piss\w*|hell|dick\w*|bullshit\w*|screw\w*)\b/i;
const GENDERED = /(?<!\p{L})\p{L}+(łeś|łaś|łbyś|łabyś)(?!\p{L})/u;
const PL_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ„]/;
const PH = /\{\w+\}/g;
const POOLS: ForecastPool[] = ["build", "buildMin", "avoid"];

const model = (p: Partial<HabitModel> = {}): HabitModel => ({
  id: "m",
  name: "Czytanie",
  kind: "build",
  min: "",
  n: 30,
  base: 0.3,
  days: [0, 1, 2, 3, 4, 5, 6],
  wd: [null, null, null, null, null, null, null],
  ...p,
});

describe("forecast model", () => {
  const s = scenario();
  const idx = indexEntries(s.completions);

  test("learns the bad-night pattern: reading falls through after scrolling + short sleep", () => {
    const m = trainModel(s.read, idx, s.reports, NOW)!;
    expect(m).not.toBeNull();
    expect(m.night!.y).toBeGreaterThan(1.5);
    expect(m.night!.n).toBeLessThan(-1.5);
    expect(m.min).toBe("5 min");
    const f = featuresOn(s.read, idx, s.reports, NOW, NOW);
    expect(f).toEqual({ bad: true, short: true, wd: 3, rescue: false });
    const p = posterior(m, f);
    expect(p.warn).toBe(true);
    expect(p.reason).toBe("nightSleep");
    expect(p.pct).toBeLessThanOrEqual(MAX_PCT);
    // after a clean night: well below the base
    expect(posterior(m, { ...f, bad: false, short: false }).p).toBeLessThan(m.base);
  });

  test("weekday pattern: the avoid habit slips on Wednesdays", () => {
    const m = trainModel(s.food, idx, s.reports, NOW)!;
    expect(m.wd[3]).toEqual({ l: expect.any(Number), g: 0 });
    expect(m.wd[3]!.l).toBeGreaterThan(2);
    const p = posterior(m, featuresOn(s.food, idx, s.reports, NOW, NOW));
    expect(p).toMatchObject({ warn: true, reason: "wd" });
  });

  test("Laplace smoothing: base rate and likelihoods never hit 0 or 1", () => {
    // Water is done every day but Saturdays: 8-9 misses in 60 days
    const m = trainModel(s.water, idx, s.reports, NOW)!;
    expect(m.base).toBeGreaterThan(0);
    expect(m.base).toBeLessThan(1);
    for (const w of m.wd) expect(Number.isFinite(w!.l)).toBe(true);
    // Saturday on its own (enough samples), its LR strongly up
    expect(m.wd[6]).toMatchObject({ g: 0 });
    expect(m.wd[6]!.l).toBeGreaterThan(2);
  });

  test("no pattern = no warning (every-other-day walk, base ~50%)", () => {
    const m = trainModel(s.walk, idx, s.reports, NOW)!;
    const p = posterior(m, featuresOn(s.walk, idx, s.reports, NOW, NOW));
    expect(p.warn).toBe(false);
  });

  test(`no forecast with less than ${MIN_DAYS} days of data`, () => {
    expect(trainModel(s.fresh, idx, s.reports, NOW)).toBeNull();
    // a habit with only 20 judged days
    const few = { ...s.read, createdAt: addDays(NOW, -20).toISOString() };
    expect(trainModel(few, idx, s.reports, NOW)).toBeNull();
    const enough = { ...s.read, createdAt: addDays(NOW, -MIN_DAYS).toISOString() };
    expect(trainModel(enough, idx, s.reports, NOW)).not.toBeNull();
    // N times a week has no fixed due days - left out
    const weekly = { ...s.read, schedule: { type: "timesPerWeek" as const, target: 3 } };
    expect(trainModel(weekly, idx, s.reports, NOW)).toBeNull();
  });

  test("features need minimum samples on both sides; no night reports = no night/sleep features", () => {
    const m = trainModel(s.read, idx, {}, NOW)!;
    expect(m.night).toBeUndefined();
    expect(m.sleep).toBeUndefined();
    // only a handful of bad nights -> the night feature isn't trusted
    const few: typeof s.reports = {};
    for (const [k, r] of Object.entries(s.reports))
      few[k] = { ...r, social: 0, screen: 0, sleep: undefined };
    const k1 = todayKey(addDays(NOW, -3));
    few[k1] = { ...few[k1], social: 30 };
    expect(trainModel(s.read, idx, few, NOW)!.night).toBeUndefined();
  });

  test("bad night: social > 0 or 30+ min of screen", () => {
    expect(isBadNight({ social: 1, screen: 0 })).toBe(true);
    expect(isBadNight({ social: 0, screen: 30 })).toBe(true);
    expect(isBadNight({ social: 0, screen: 29 })).toBe(false);
  });

  test("thresholds: needs ≥ 60% and ≥ base + 15 pts and a nameable reason", () => {
    expect(WARN_P).toBe(0.6);
    expect(WARN_LIFT).toBe(0.15);
    const f = { bad: true, short: null, wd: 1, rescue: null };
    // high base, small push: 72% but only +7 pts -> no warning
    const high = posterior(model({ base: 0.65, night: { y: 0.3, n: -0.1 } }), f);
    expect(high.p).toBeGreaterThan(0.6);
    expect(high.warn).toBe(false);
    // low base, big push but below 60% -> no warning
    expect(posterior(model({ base: 0.2, night: { y: 1.2, n: -0.1 } }), f).warn).toBe(false);
    // both met
    const ok = posterior(model({ base: 0.3, night: { y: 1.5, n: -0.3 } }), f);
    expect(ok).toMatchObject({ warn: true, reason: "night" });
    // pushed only by a "good" side (clean night that is oddly risky) -> nothing to name
    const odd = posterior(model({ base: 0.3, night: { y: -1, n: 1.5 } }), { ...f, bad: false });
    expect(odd.p).toBeGreaterThan(0.6);
    expect(odd).toMatchObject({ warn: false, reason: null });
  });

  test("explanations: strongest reason, night + sleep together", () => {
    const m = model({
      night: { y: 0.5, n: 0 },
      sleep: { y: 0.8, n: 0 },
      rescue: { y: 1.1, n: 0 },
      wd: [null, { l: 0.4, g: 0 }, null, null, null, null, { l: 0.2, g: 1 }],
    });
    expect(posterior(m, { bad: true, short: true, wd: 1, rescue: true }).reason).toBe("rescue");
    expect(posterior(m, { bad: true, short: true, wd: 1, rescue: false }).reason).toBe(
      "nightSleep",
    );
    expect(posterior(m, { bad: true, short: false, wd: 1, rescue: false }).reason).toBe("night");
    expect(posterior(m, { bad: false, short: true, wd: 1, rescue: false }).reason).toBe("sleep");
    expect(posterior(m, { bad: false, short: false, wd: 1, rescue: null }).reason).toBe("wd");
    expect(posterior(m, { bad: null, short: null, wd: 2, rescue: null }).reason).toBeNull();
  });

  test("dayForecast: top risky habits with the minimum and a deadline", () => {
    const items = dayForecast(s.habits, s.completions, s.reports, "hard", NOW);
    expect(items.map((i) => i.habitId)).toEqual(["read", "food"]);
    expect(items[0].text.toLowerCase()).toContain("po nocy z 40 min scrollowania i 5 h 30 min snu");
    expect(items[0].text).toContain("„Czytanie”");
    expect(items[0].text).toMatch(/5 min/);
    expect(items[0].text).not.toMatch(PH);
    expect(items[1].text).toContain("W środy");
    // a habit already done today isn't warned about
    const done = [...s.completions, { habitId: "read", date: todayKey(NOW), amount: 20 }];
    expect(dayForecast(s.habits, done, s.reports, "hard", NOW).map((i) => i.habitId)).toEqual([
      "food",
    ]);
    // the minimum counts as safe too
    const min = [...s.completions, { habitId: "read", date: todayKey(NOW), amount: 5 }];
    expect(dayForecast(s.habits, min, s.reports, "hard", NOW).map((i) => i.habitId)).toEqual([
      "food",
    ]);
    // English
    setLang("en");
    const en = dayForecast(s.habits, s.completions, s.reports, "soft", NOW);
    expect(en[0].text.toLowerCase()).toContain(
      "after a night with 40 min of scrolling and 5 h 30 min of sleep",
    );
    expect(en[0].text).not.toMatch(PL_LETTERS);
  });

  test("the slide's window and the deadline", () => {
    expect(showForecastAt(new Date(2026, 8, 23, 4, 59))).toBe(false);
    expect(showForecastAt(new Date(2026, 8, 23, 5, 0))).toBe(true);
    expect(showForecastAt(new Date(2026, 8, 23, 11, 59))).toBe(true);
    expect(showForecastAt(new Date(2026, 8, 23, 12, 0))).toBe(false);
    expect(untilMinute(9 * 60 + 59)).toBe(720);
    expect(untilMinute(10 * 60)).toBe(840);
  });

  test("snapshot: compact models for every habit with enough history", () => {
    const snap = forecastSnapshot(s.habits, s.completions, s.reports, "hard", NOW);
    expect(snap.models.map((m) => m.id)).toEqual(["read", "water", "food", "walk"]);
    expect(Object.keys(snap.lines).sort()).toEqual(["avoid", "build", "buildMin"]);
    expect(snap.reasons.wd).toHaveLength(7);
    // numbers rounded to 4 decimals (the Java side parses the same values)
    for (const m of snap.models)
      for (const v of [m.base, m.night?.y, m.night?.n, ...m.wd.map((w) => w?.l)])
        if (v != null) expect(Math.round(v * 10000) / 10000).toBe(v);
  });

  test("hit rate of past forecasts", () => {
    const r = forecastHitRate(s.habits, s.completions, s.reports, 30, NOW);
    expect(r.warned).toBeGreaterThan(5);
    expect(r.hit / r.warned).toBeGreaterThan(0.5);
    expect(hitRateText({ warned: 4, hit: 4 })).toBeNull();
    expect(hitRateText({ warned: 9, hit: 7 })).toBe(
      "Prognoza się sprawdza: 7 z 9 ostrzeżeń z 30 dni (78%).",
    );
  });
});

describe("forecast lines", () => {
  test("valid placeholders, hard swears, soft doesn't, no gendered forms, English is English", () => {
    for (const lang of ["pl", "en"] as const) {
      setLang(lang);
      const ph = reasonPhrases();
      expect(ph.wd).toHaveLength(7);
      for (const level of ["hard", "soft"] as const) {
        const lines = forecastLines(level);
        for (const k of POOLS) {
          expect(lines[k].length).toBeGreaterThanOrEqual(3);
          for (const l of lines[k]) {
            for (const p of ["{reason}", "{habit}", "{pct}"]) expect(l).toContain(p);
            if (k === "buildMin") expect(l).toContain("{min}");
            if (k !== "avoid") expect(l).toContain("{until}");
            if (k !== "buildMin") expect(l).not.toContain("{min}");
            const filled = fillForecast(l, {
              habit: "Czytanie",
              pct: 78,
              reason: ph.nightSocialSleep,
              min: "5 min",
              until: "12:00",
            });
            expect((filled.match(PH) ?? []).sort()).toEqual(["{sleep}", "{social}"]);
            expect(filled.charAt(0)).toBe(filled.charAt(0).toUpperCase());
            if (lang === "pl") expect(l).not.toMatch(GENDERED);
            if (lang === "en") expect(l).not.toMatch(PL_LETTERS);
            if (level === "soft") {
              expect(l).not.toMatch(SWEAR_PL);
              expect(l).not.toMatch(SWEAR_EN);
            }
          }
          if (level === "hard")
            expect(lines[k].some((l) => (lang === "pl" ? SWEAR_PL : SWEAR_EN).test(l))).toBe(true);
        }
        if (lang === "pl")
          for (const v of Object.values(ph).flat()) expect(v).not.toMatch(GENDERED);
        if (lang === "en")
          for (const v of Object.values(ph).flat()) expect(v).not.toMatch(PL_LETTERS);
      }
    }
  });

  test("the example sentence", () => {
    const l = "{reason} zwykle odpuszczasz „{habit}” ({pct}%). Zrób minimum ({min}) przed {until}.";
    expect(
      fillForecast(l, {
        habit: "Czytanie",
        pct: 78,
        reason: "po nocy z 52 min scrollowania i 5 h 30 min snu",
        min: "5 min",
        until: "12:00",
      }),
    ).toBe(
      "Po nocy z 52 min scrollowania i 5 h 30 min snu zwykle odpuszczasz „Czytanie” (78%). Zrób minimum (5 min) przed 12:00.",
    );
  });

  test("line hash is a stable uint32 (mirrored in Forecast.hash)", () => {
    expect(lineHash("")).toBe(0);
    expect(lineHash("2026-09-23|read")).toBe(lineHash("2026-09-23|read"));
    expect(lineHash("zzzzzzzzzzzzzzzzzzzz")).toBeLessThan(2 ** 32);
  });
});

describe("shared vectors (Forecast.java)", () => {
  test("tests/forecast-vectors.json is up to date with the TS model", () => {
    const file = JSON.parse(
      readFileSync(new URL("./forecast-vectors.json", import.meta.url), "utf8"),
    ) as unknown;
    expect(JSON.parse(JSON.stringify(buildForecastVectors()))).toEqual(file);
  });
});

describe("Today's status slides", () => {
  test("risk sits right after the night bill and before Szpila", () => {
    expect(statusSlideIds({ morning: true, bill: true, social: true, risk: true })).toEqual([
      "morning",
      "bill",
      "risk",
      "szpila",
      "social",
    ]);
    expect(statusSlideIds({ morning: false, bill: false, social: false, risk: true })).toEqual([
      "risk",
      "szpila",
    ]);
    expect(statusSlideIds({ morning: false, bill: false, social: false })).not.toContain("risk");
  });
});
