import { afterEach, describe, expect, test } from "bun:test";
import { addDays, startOfWeek } from "date-fns";
import {
  autoMorningHabits,
  dayGuardState,
  dayLines,
  limitScore,
  limitSeries,
  morningDone,
  morningHabitIds,
  morningPending,
  morningWindow,
} from "@/lib/day-guard";
import { liveState } from "@/lib/live";
import { useHabits, type NotificationSettings } from "@/lib/habits/store";
import { weeklyChallenges } from "@/lib/habits/gamification";
import { toCsv } from "@/lib/habits/stats";
import { setLang } from "@/lib/i18n";
import { buildState } from "@/lib/widget/bridge";
import { WED_1540, entry, habit, key } from "./helpers";

afterEach(() => setLang("pl"));

const now = WED_1540;
const teeth = habit(
  { name: "Mycie zębów", icon: "Tooth", goal: { type: "count", target: 2, step: 1, unit: "razy" } },
  30,
  now,
);
const water = habit(
  {
    name: "Picie wody",
    icon: "GlassWater",
    goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
  },
  30,
  now,
);
const read = habit(
  { name: "Czytanie książki", icon: "BookOpen", goal: { type: "minutes", target: 20, step: 10 } },
  30,
  now,
);
const food = habit({ name: "Fast food", icon: "Utensils", kind: "avoid" }, 30, now);
const habits = [teeth, water, read, food];
const base = useHabits.getState().notifications;
const n = (p: Partial<NotificationSettings> = {}): NotificationSettings => ({ ...base, ...p });

describe("morning lock: habits first, then Instagram", () => {
  test("defaults: on until 11:00, brushing teeth + water picked automatically", () => {
    expect(base.morningLock).toBe(true);
    expect(base.morningUntil).toBe("11:00");
    expect(base.morningHabits).toBeNull();
    expect(autoMorningHabits(habits, now)).toEqual([teeth.id, water.id]);
    // English names are recognised too
    const en = [
      habit(
        {
          name: "Brush teeth",
          icon: "Tooth",
          goal: { type: "count", target: 2, step: 1, unit: "times" },
        },
        30,
        now,
      ),
      habit(
        {
          name: "Drink water",
          icon: "GlassWater",
          goal: { type: "count", target: 8, step: 1, unit: "glasses" },
        },
        30,
        now,
      ),
      habit({ name: "Read a book", icon: "BookOpen" }, 30, now),
    ];
    expect(autoMorningHabits(en, now)).toEqual([en[0].id, en[1].id]);
  });

  test("a chosen list wins; forbidden or deleted habits are ignored", () => {
    expect(morningHabitIds(n({ morningHabits: [read.id, food.id, "gone"] }), habits, now)).toEqual([
      read.id,
    ]);
    expect(morningHabitIds(n({ morningHabits: [] }), habits, now)).toEqual([]);
  });

  test("one unit is enough in the morning (mirrors DayGuard.morningDone)", () => {
    const c = [entry(teeth, now, { amount: 1 }), entry(read, now, { amount: 5 })];
    expect(morningDone(teeth, c, now)).toBe(true); // 1 of 2 brushes
    expect(morningDone(water, c, now)).toBe(false);
    expect(morningDone(read, c, now)).toBe(false); // 5 of the 10-min step
    const pending = morningPending(n(), habits, c, now);
    expect(pending.map((h) => h.id)).toEqual([water.id]);
  });

  test("the lock window runs from 5:00 to the chosen time", () => {
    expect(morningWindow(n(), 4 * 60 + 59)).toBe(false);
    expect(morningWindow(n(), 5 * 60)).toBe(true);
    expect(morningWindow(n(), 10 * 60 + 59)).toBe(true);
    expect(morningWindow(n(), 11 * 60)).toBe(false);
    expect(morningWindow(n({ morningLock: false }), 8 * 60)).toBe(false);
  });
});

describe("daily limit", () => {
  test("defaults: on, 60 min", () => {
    expect(base.dailyLimit).toBe(true);
    expect(base.dailyLimitMin).toBe(60);
  });

  test("the snapshot carries morning + day settings and their lines (DayGuard.java)", () => {
    const st = dayGuardState(n({ morningUntil: "10:30", dailyLimitMin: 45 }), habits, now);
    expect(st.morning).toEqual({ enabled: true, until: 630, habits: [teeth.id, water.id] });
    expect(st.day).toMatchObject({ enabled: true, limit: 45, debt: true, mode: "bank" });
    const live = liveState(n(), "hard", null, undefined, habits);
    expect(live.morning.habits).toEqual([teeth.id, water.id]);
    for (const k of ["morning", "morningDone", "dayOver", "dayEscalate", "dayWarn", "dayBlock"]) {
      expect(live.lines[k]?.length).toBeGreaterThan(0);
    }
    // the real snapshot too
    const s = useHabits.getState();
    const keep = { habits: s.habits, completions: s.completions };
    useHabits.setState({ habits, completions: [] });
    expect(buildState().live.day.limit).toBe(s.notifications.dailyLimitMin);
    useHabits.setState(keep);
  });

  test("lines: only known placeholders, hard swears, soft doesn't, English is English", () => {
    const known = /\{(tasks|app|used|limit|over|left|bank|earn|m|time|u)\}/g;
    for (const lang of ["pl", "en"] as const) {
      setLang(lang);
      const hard = dayLines("hard", "Ola");
      const soft = dayLines("soft", "Ola");
      for (const pool of [...Object.values(hard), ...Object.values(soft)])
        for (const l of pool) expect(l.replace(known, "")).not.toMatch(/\{\w+\}/);
      expect(hard.morning.every((l) => l.includes("{tasks}"))).toBe(true);
      expect(hard.dayOver.every((l) => /\{(used|limit|over)\}/.test(l))).toBe(true);
      const swear = /kurw|jeb|fuck|shit/i;
      expect(
        Object.values(hard)
          .flat()
          .some((l) => swear.test(l)),
      ).toBe(true);
      expect(
        Object.values(soft)
          .flat()
          .some((l) => swear.test(l)),
      ).toBe(false);
      if (lang === "en")
        for (const l of Object.values(hard).flat()) expect(l).not.toMatch(/[ąćęłńóśźż]/i);
    }
  });

  test("14-day series against the limit and the score", () => {
    const social = { [key(now)]: 30, [key(addDays(now, -1))]: 75, [key(addDays(now, -3))]: 60 };
    const s = limitSeries(social, 60, 14, now);
    expect(s).toHaveLength(14);
    expect(s[13]).toEqual({ key: key(now), minutes: 30, over: false });
    expect(s[12].over).toBe(true);
    expect(s[10]).toMatchObject({ minutes: 60, over: false }); // exactly the limit is fine
    expect(s[11].minutes).toBeNull();
    expect(limitScore(s)).toEqual({ within: 2, tracked: 3 });
  });

  test("weekly challenge 'a week within the limit' - fails on the first day over", () => {
    const monday = startOfWeek(now, { weekStartsOn: 1 });
    // find a week whose three picks include limit7
    let found = false;
    for (let w = 0; w < 30 && !found; w++) {
      const m = addDays(monday, -7 * w);
      const clean = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [key(addDays(m, i)), 40]));
      const done = weeklyChallenges(habits, [], {}, false, addDays(m, 8), m, {
        limit: 60,
        social: clean,
      });
      const c = done.find((x) => x.id === "limit7");
      if (!c) continue;
      found = true;
      expect(c.status).toBe("done");
      expect(c.goal).toBe(7);
      const over = { ...clean, [key(addDays(m, 2))]: 95 };
      const failed = weeklyChallenges(habits, [], {}, false, addDays(m, 8), m, {
        limit: 60,
        social: over,
      });
      expect(failed.find((x) => x.id === "limit7")?.status).toBe("failed");
    }
    expect(found).toBe(true);
    // without the limit the challenge never appears
    for (let w = 0; w < 10; w++) {
      const m = addDays(monday, -7 * w);
      expect(
        weeklyChallenges(habits, [], {}, false, addDays(m, 8), m).some((c) => c.id === "limit7"),
      ).toBe(false);
    }
  });

  test("CSV gets the day's social media minutes; store merges them into backups", () => {
    const d = addDays(now, -1);
    const csv = toCsv([water], [entry(water, d, { amount: 8 })], {}, now, { [key(d)]: 42 });
    expect(csv.split("\r\n")[0].endsWith(";social_dzien_min;sen_min")).toBe(true);
    expect(csv).toContain(`${key(d)};Picie wody;do zrobienia;8;szklanek;8;zrobione;100;;42`);
    const s = useHabits.getState();
    s.mergeDaySocial({ "2026-09-20": 30 });
    s.mergeDaySocial({ "2026-09-20": 45, "2026-09-21": 10 }); // today's value grows during the day
    expect(useHabits.getState().daySocial).toMatchObject({ "2026-09-20": 45, "2026-09-21": 10 });
    expect(JSON.parse(useHabits.getState().exportData()).daySocial["2026-09-20"]).toBe(45);
  });
});
