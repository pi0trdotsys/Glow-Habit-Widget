// Shared vectors for the morning risk forecast: the TS model (src/lib/habits/forecast.ts)
// and its native mirror (Forecast.java, ForecastTest) must agree on them.
// Regenerate: bun tests/gen-forecast-vectors.ts  (forecast.test.ts fails when stale)
import { writeFileSync } from "node:fs";
import { addDays } from "date-fns";
import {
  fillForecast,
  forecastLines,
  lineHash,
  poolOf,
  posterior,
  reasonPhrases,
  reasonText,
  trainModel,
  untilMinute,
  type Features,
  type HabitModel,
  type NightNums,
} from "@/lib/habits/forecast";
import { indexEntries, todayKey } from "@/lib/habits/utils";
import { setLang } from "@/lib/i18n";
import type { Completion, Habit } from "@/lib/habits/types";
import type { NightReport } from "@/lib/sensors";

/** Wednesday 2026-09-23 08:30 - the forecast morning. */
export const NOW = new Date(2026, 8, 23, 8, 30);

const mk = (p: Partial<Habit> & { id: string; name: string }, createdDaysAgo = 70): Habit => ({
  icon: "Sparkles",
  color: "mint",
  schedule: { type: "daily" },
  createdAt: addDays(NOW, -createdDaysAgo).toISOString(),
  ...p,
});

/**
 * 60 days of synthetic history:
 *  - every third evening is a bad night (40 min of social media, 52 min of screen, 5 h 30 min of sleep),
 *    the others clean with 7 h 30 min of sleep; last night (Tue) was bad;
 *  - "Czytanie" (20 min, minimum 5 min): skipped after bad nights (done after 1 in 5 of them);
 *  - "Woda" (8 glasses): always done except Saturdays;
 *  - "Fast food" (avoid): slips on Wednesdays, clean otherwise;
 *  - "Spacer": missed every other day, no pattern;
 *  - "Nowy": created 10 days ago - too little data.
 */
export function scenario() {
  const read = mk({ id: "read", name: "Czytanie", goal: { type: "minutes", target: 20, step: 5 } });
  const water = mk({
    id: "water",
    name: "Woda",
    goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
  });
  const food = mk({ id: "food", name: "Fast food", kind: "avoid" });
  const walk = mk({ id: "walk", name: "Spacer" });
  const fresh = mk({ id: "fresh", name: "Nowy" }, 10);
  const habits = [read, water, food, walk, fresh];
  const reports: Record<string, NightReport> = {};
  const c: Completion[] = [];
  // Evenings 1..61 days ago; every third one bad, starting with last night.
  const badEvening = (j: number) => j % 3 === 1;
  for (let j = 1; j <= 61; j++) {
    const e = todayKey(addDays(NOW, -j));
    const bad = badEvening(j);
    reports[e] = {
      date: e,
      granted: true,
      social: bad ? 40 : 0,
      screen: bad ? 52 : 10,
      visits: bad ? 3 : 0,
      sleep: { start: 60, end: 60 + (bad ? 330 : 450), minutes: bad ? 330 : 450, source: "x" },
    };
  }
  let badCount = 0;
  for (let k = 60; k >= 1; k--) {
    const d = addDays(NOW, -k);
    const key = todayKey(d);
    const bad = badEvening(k + 1); // the night before day d
    if (bad) badCount++;
    if (!bad || badCount % 5 === 0) c.push({ habitId: read.id, date: key, amount: 20 });
    if (d.getDay() !== 6) c.push({ habitId: water.id, date: key, amount: 8 });
    c.push({ habitId: food.id, date: key, slipped: d.getDay() === 3 });
    if (k % 2 === 0) c.push({ habitId: walk.id, date: key, amount: 1 });
    if (k <= 9) c.push({ habitId: fresh.id, date: key, amount: 1 });
  }
  return { habits, completions: c, reports, read, water, food, walk, fresh };
}

const NIGHTS: { name: string; night: NightNums; bad: boolean | null; short: boolean | null }[] = [
  { name: "bad+short", night: { social: 52, screen: 61, sleep: 330 }, bad: true, short: true },
  { name: "screen only", night: { social: 0, screen: 45, sleep: 400 }, bad: true, short: false },
  { name: "clean", night: { social: 0, screen: 5, sleep: 470 }, bad: false, short: false },
  { name: "short only", night: { social: 0, screen: 8, sleep: 300 }, bad: false, short: true },
  { name: "no report", night: { social: 0, screen: 0, sleep: -1 }, bad: null, short: null },
  { name: "no sleep", night: { social: 12, screen: 20, sleep: -1 }, bad: true, short: null },
];

/** A hand-made model to cover the branches the scenario doesn't. */
const HAND: HabitModel[] = [
  {
    id: "hand1",
    name: "Siłownia",
    kind: "build",
    min: "",
    n: 30,
    base: 0.3,
    days: [1, 3, 5],
    night: { y: 0.4, n: -0.2 },
    sleep: { y: 0.9, n: -0.1 },
    rescue: { y: 1.2, n: -0.3 },
    wd: [null, { l: 0.5, g: 0 }, null, { l: 0.05, g: 0 }, null, { l: -0.6, g: 1 }, null],
  },
  {
    id: "hand2",
    name: "Słodycze",
    kind: "avoid",
    min: "",
    n: 25,
    base: 0.45,
    days: [0, 1, 2, 3, 4, 5, 6],
    night: { y: 0.15, n: 0.3 },
    wd: [
      { l: 0.8, g: 1 },
      { l: -0.2, g: 1 },
      { l: -0.2, g: 1 },
      { l: -0.2, g: 1 },
      { l: -0.2, g: 1 },
      { l: -0.2, g: 1 },
      { l: 0.8, g: 1 },
    ],
  },
  {
    id: "hand3",
    name: "Bieganie",
    kind: "build",
    min: "10 min",
    n: 40,
    base: 0.35,
    days: [0, 1, 2, 3, 4, 5, 6],
    sleep: { y: 1.5, n: -0.3 },
    wd: [null, null, null, null, null, null, null],
  },
];

export function buildForecastVectors() {
  const s = scenario();
  const idx = indexEntries(s.completions);
  const trained = s.habits
    .map((h) => trainModel(h, idx, s.reports, NOW))
    .filter((m): m is HabitModel => m != null);
  const models = [...trained, ...HAND];
  // Posterior cases (language-independent).
  const cases = [];
  for (const m of models)
    for (let n = 0; n < NIGHTS.length; n++)
      for (const wd of [0, 3, 6])
        for (const rescue of [true, false, null]) {
          const f: Features = { bad: NIGHTS[n].bad, short: NIGHTS[n].short, wd, rescue };
          const post = posterior(m, f);
          cases.push({
            model: m.id,
            f,
            night: n,
            p: Math.round(post.p * 1e9) / 1e9,
            pct: post.pct,
            reason: post.reason,
            warn: post.warn,
          });
        }
  // The warning texts per language and level, for the warning cases.
  const texts: Record<string, unknown> = {};
  for (const lang of ["pl", "en"] as const) {
    setLang(lang);
    const ph = reasonPhrases();
    for (const level of ["hard", "soft"] as const) {
      const lines = forecastLines(level);
      const out = [];
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        if (!c.warn || !c.reason || i % 5 !== 0) continue; // a spread of the warnings
        const m = models.find((x) => x.id === c.model)!;
        const date = todayKey(addDays(NOW, c.f.wd - NOW.getDay()));
        const nowMin = c.f.wd === 3 ? 10 * 60 + 15 : 8 * 60 + 30;
        const pool = lines[poolOf(m)];
        const line = pool[lineHash(`${date}|${m.id}`) % pool.length];
        const u = untilMinute(nowMin);
        out.push({
          i,
          date,
          nowMin,
          text: fillForecast(line, {
            habit: m.name,
            pct: c.pct,
            reason: reasonText(c.reason, m, c.f, NIGHTS[c.night].night, ph),
            min: m.min,
            until: `${u / 60}:00`,
          }),
        });
      }
      texts[`${lang}_${level}`] = { lines, reasons: ph, cases: out };
    }
  }
  setLang("pl");
  return { models, nights: NIGHTS.map((n) => n.night), cases, texts };
}

if (import.meta.main) {
  const v = buildForecastVectors();
  writeFileSync(
    new URL("./forecast-vectors.json", import.meta.url),
    JSON.stringify(v, null, 1) + "\n",
  );
  console.log(`models ${(v.models as unknown[]).length}`);
}
