import { afterEach, describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import { setLang } from "@/lib/i18n";
import { useHabits } from "@/lib/habits/store";
import {
  daysLabel,
  fmtNum,
  goalLabel,
  greetingFor,
  limitLabel,
  scheduleLabel,
  timesLabel,
  unitForms,
  unitLabel,
  weeklyReport,
} from "@/lib/habits/utils";
import { habitInsights } from "@/lib/habits/insights";
import { csvFileName, monthCompare, monthStats, toCsv } from "@/lib/habits/stats";
import { backupFileName } from "@/lib/backup";
import type { Completion } from "@/lib/habits/types";
import { WED_1540, entry, habit, key } from "./helpers";

const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
const now = WED_1540; // Wed 2026-09-23 15:40

afterEach(() => {
  setLang("pl");
  useHabits.setState({ language: "pl" });
});

function en() {
  useHabits.setState({ language: "en" });
  setLang("en");
}

describe("labels in English", () => {
  const water = habit(
    { name: "Drink water", goal: { type: "count", target: 8, step: 1, unit: "glasses" } },
    60,
    now,
  );
  const read = habit({ name: "Read", goal: { type: "minutes", target: 20, step: 10 } }, 60, now);
  const brush = habit({ name: "Brush teeth" }, 60, now);
  const food = habit(
    { name: "Fast food", kind: "avoid", limit: { times: 1, period: "week" } },
    60,
    now,
  );

  test("goalLabel / limitLabel", () => {
    en();
    expect(goalLabel(water)).toBe("8 glasses a day");
    expect(goalLabel(read)).toBe("20 min a day");
    expect(goalLabel(brush)).toBe("Once a day");
    expect(goalLabel(food)).toBe("Max once a week");
    expect(limitLabel({ times: 0, period: "week" })).toBe("Total ban");
    expect(limitLabel({ times: 3, period: "day" })).toBe("Max 3 times a day");
  });

  test("scheduleLabel / daysLabel / timesLabel", () => {
    en();
    expect(scheduleLabel(brush)).toBe("Every day");
    expect(scheduleLabel({ ...brush, schedule: { type: "weekdays", days: [1, 2, 3] } })).toBe(
      "3 days a week",
    );
    expect(scheduleLabel({ ...brush, schedule: { type: "timesPerWeek", target: 4 } })).toBe(
      "4 times a week",
    );
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(5)).toBe("5 days");
    expect(timesLabel(2)).toBe("twice");
  });

  test("greetingFor", () => {
    en();
    const at = (h: number) => greetingFor(new Date(2026, 8, 23, h, 0));
    expect([2, 8, 14, 20, 23].map(at)).toEqual([
      "Still up",
      "Good morning",
      "Hi",
      "Good evening",
      "Good night",
    ]);
  });

  test("unitForms / unitLabel: English units, Polish units keep Polish forms", () => {
    en();
    expect(unitForms("glasses")).toEqual(["glass", "glasses", "glasses"]);
    expect(unitForms("steps")).toEqual(["step", "steps", "steps"]);
    expect(unitForms("times")).toEqual(["time", "times", "times"]);
    expect(unitForms("km")).toEqual(["km", "km", "km"]);
    expect(unitForms("laps")).toEqual(["lap", "laps", "laps"]);
    expect(unitForms(undefined)).toEqual(["time", "times", "times"]);
    expect(unitForms("szklanek")).toEqual(["szklanka", "szklanki", "szklanek"]);
    expect([1, 3, 5, 21].map((n) => unitLabel(water, n))).toEqual([
      "glass",
      "glasses",
      "glasses",
      "glasses",
    ]);
    expect(unitLabel(read, 1)).toBe("min");
  });

  test("fmtNum: dot in English, comma in Polish", () => {
    en();
    expect(fmtNum(1.5)).toBe("1.5");
    expect(fmtNum(12000)).toBe("12,000");
    setLang("pl");
    expect(fmtNum(1.5)).toBe("1,5");
    expect(fmtNum(12000)).toMatch(/^12\s000$/);
  });

  test("weeklyReport window and day labels", () => {
    en();
    const r = weeklyReport([brush], [], now);
    expect(r.windowLabel).toBe("Mon–Wed until 15:40");
    expect(r.days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    const mon = weeklyReport([brush], [], new Date(2026, 8, 21, 9, 5));
    expect(mon.windowLabel).toBe("Monday until 09:05");
  });

  test("Polish stays unchanged", () => {
    const pl = habit(
      { name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } },
      60,
      now,
    );
    expect(goalLabel(pl)).toBe("8 szklanek dziennie");
    expect(goalLabel(brush)).toBe("Raz dziennie");
    expect(scheduleLabel(brush)).toBe("Codziennie");
    expect(greetingFor(new Date(2026, 8, 23, 8, 0))).toBe("Dzień dobry");
    expect(unitForms(undefined)).toEqual(["raz", "razy", "razy"]);
    expect(weeklyReport([brush], [], now).windowLabel).toBe("pon–śr do 15:40");
  });
});

describe("insights in English", () => {
  const phone = habit({ name: "Late phone", kind: "avoid" }, 50, now);
  const steps = habit(
    { name: "8000 steps", goal: { type: "count", target: 8000, step: 1000, unit: "steps" } },
    50,
    now,
  );

  test("same numbers, English template", () => {
    const c: Completion[] = [];
    for (let i = 50; i >= 1; i--) {
      const d = addDays(now, -i);
      if (i % 3 !== 0) c.push(entry(phone, d));
      c.push(entry(steps, d, { amount: (i + 1) % 3 === 0 ? 4000 : 9000 }));
    }
    en();
    const hit = habitInsights([phone, steps], c, 60, now).find(
      (f) => f.causeId === phone.id && f.effectId === steps.id,
    );
    expect(hit?.text).toBe(
      "The day after a slip with “Late phone”: “8000 steps” averages 4000 instead of 9000 steps (5000 steps fewer).",
    );
    expect(hit!.text).not.toMatch(POLISH);
  });
});

describe("stats in English", () => {
  const water = habit(
    { name: "Drink water", goal: { type: "count", target: 8, step: 1, unit: "glasses" } },
    3,
    now,
  );
  const food = habit(
    { name: "Fast food", kind: "avoid", limit: { times: 1, period: "week" } },
    3,
    now,
  );

  test("month labels", () => {
    en();
    const m = monthStats([water], [], 2, now);
    expect(m.map((x) => [x.label, x.long])).toEqual([
      ["Aug", "August"],
      ["Sep", "September"],
    ]);
    const cmp = monthCompare([water], [], now);
    expect([cmp.thisMonth.label, cmp.lastMonth.label]).toEqual(["September", "August"]);
    setLang("pl");
    expect(monthStats([water], [], 1, now)[0].long).toBe("wrzesień");
  });

  test("CSV header, kinds and statuses", () => {
    const y = addDays(now, -1);
    const c = [
      entry(water, y, { amount: 8 }),
      entry(water, addDays(now, -2), { amount: 3 }),
      entry(food, y),
      entry(food, addDays(now, -2), { slipped: true }),
    ];
    en();
    const csv = toCsv([water, food], c, {}, now);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "date;habit;kind;target;unit;result;status;percent;social_at_night;social_by_day_min",
    );
    expect(lines).toContain(`${key(y)};Drink water;to do;8;glasses;8;done;100;;`);
    expect(lines).toContain(`${key(y)};Fast food;forbidden;0;;0;clean;100;;`);
    expect(lines.some((l) => l.includes(";3;partly;38;"))).toBe(true);
    expect(lines.some((l) => l.includes(";1;slip;"))).toBe(true);
    expect(csv).not.toMatch(POLISH);
  });

  test("file names", () => {
    en();
    expect(csvFileName(now)).toBe("szpila-history-2026-09-23.csv");
    expect(backupFileName(now)).toBe("szpila-backup-2026-09-23.json");
    setLang("pl");
    expect(csvFileName(now)).toBe("szpila-historia-2026-09-23.csv");
    expect(backupFileName(now)).toBe("szpila-kopia-2026-09-23.json");
  });
});

describe("store messages in English", () => {
  test("importData rejects a non-backup with an English error", () => {
    en();
    expect(() => useHabits.getState().importData('{"foo":1}')).toThrow(
      "This is not a Szpila backup.",
    );
    setLang("pl");
    useHabits.setState({ language: "pl" });
    expect(() => useHabits.getState().importData('{"foo":1}')).toThrow(
      "To nie jest kopia zapasowa Szpili.",
    );
  });
});
