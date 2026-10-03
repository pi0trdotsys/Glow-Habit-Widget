import { afterEach, describe, expect, test } from "bun:test";
import { addDays, startOfWeek } from "date-fns";
import vectors from "./bank-vectors.json";
import {
  BANK_DEFAULTS,
  bankEarned,
  bankGain,
  bankHowTo,
  bankInputs,
  bankLimit,
  bankRules,
  bankToastLine,
  bankToday,
  isBank,
  limitState,
  rawNightDebt,
} from "@/lib/bank";
import { dayGuardState, dayLines, limitScore, limitSeries } from "@/lib/day-guard";
import { useHabits, type NotificationSettings } from "@/lib/habits/store";
import { weeklyChallenges } from "@/lib/habits/gamification";
import type { NightReport } from "@/lib/sensors";
import { setLang } from "@/lib/i18n";
import { buildState } from "@/lib/widget/bridge";
import { WED_1540, entry, habit, key } from "./helpers";

afterEach(() => setLang("pl"));

const now = WED_1540; // 15:40, the night is over
const notif = (p: Partial<NotificationSettings> = {}): NotificationSettings => ({
  ...useHabits.getState().notifications,
  ...p,
});

const teeth = habit({
  name: "Mycie zębów",
  goal: { type: "count", target: 2, step: 1, unit: "razy" },
});
const water = habit({ name: "Picie wody", goal: { type: "count", target: 8, step: 1 } });
const steps = habit({
  name: "Kroki",
  source: "steps",
  goal: { type: "count", target: 8000, step: 1000 },
});
const noAlcohol = habit({ name: "Bez alkoholu", kind: "avoid" });
const habits = [teeth, water, steps, noAlcohol];

const night = (p: Partial<NightReport> = {}): Record<string, NightReport> => ({
  [key(addDays(now, -1))]: { date: key(addDays(now, -1)), granted: true, ...p },
});

describe("shared vectors (Java BankTest checks the same file)", () => {
  test("earned + limit", () => {
    for (const v of vectors.earned) {
      const [base, perHabit, perKSteps, cap] = v.rules;
      const earned = bankEarned({ base, perHabit, perKSteps, cap }, v.done, v.steps);
      expect(earned).toBe(v.earned);
      expect(bankLimit(earned, v.debt)).toBe(v.limit);
    }
  });
  test("limit state", () => {
    for (const v of vectors.state) expect(limitState(v.used, v.limit, v.bank)).toBe(v.expected);
  });
});

describe("the bank's math", () => {
  test("defaults, cap before the debt, never below 0", () => {
    expect(BANK_DEFAULTS).toEqual({ base: 5, perHabit: 10, perKSteps: 5, cap: 120 });
    expect(bankEarned(BANK_DEFAULTS, 0, 0)).toBe(5);
    expect(bankEarned(BANK_DEFAULTS, 20, 0)).toBe(120); // capped
    expect(bankLimit(120, 30)).toBe(90); // the debt still costs on a productive day
    expect(bankLimit(15, 44)).toBe(0);
    expect(bankEarned({ ...BANK_DEFAULTS, cap: 0 }, 20, 0)).toBe(205); // no cap
  });

  test("rules come from the settings, broken values fall back", () => {
    expect(bankRules(notif())).toEqual(BANK_DEFAULTS);
    expect(
      bankRules({ bankBase: 0, bankPerHabit: 15, bankPerKSteps: 2, bankCap: 60 } as never),
    ).toEqual({ base: 0, perHabit: 15, perKSteps: 2, cap: 60 });
    expect(bankRules({ bankBase: -3, bankPerHabit: NaN } as never)).toMatchObject({
      base: 5,
      perHabit: 10,
    });
  });

  test("gain of the last habit (0 once the cap is reached)", () => {
    expect(bankGain(BANK_DEFAULTS, 1, 0)).toBe(10);
    expect(bankGain(BANK_DEFAULTS, 0, 0)).toBe(0);
    expect(bankGain(BANK_DEFAULTS, 12, 0)).toBe(5); // 115 -> 120 (the cap)
    expect(bankGain(BANK_DEFAULTS, 13, 0)).toBe(0); // already full
  });

  test("raw night debt: 2 per social minute, 10 per pass, no floor", () => {
    expect(rawNightDebt(null)).toBe(0);
    expect(rawNightDebt({ social: 22, curfewPasses: 0 })).toBe(44);
    expect(rawNightDebt({ social: 30, curfewPasses: 2 })).toBe(80);
  });
});

describe("today's bank from the store (mirrors the native rows)", () => {
  const completions = [
    entry(teeth, now, { amount: 2 }), // done
    entry(water, now, { amount: 5 }), // not yet
    entry(steps, now, { amount: 6400 }), // 6 x 1000, not the goal
    entry(noAlcohol, now), // a clean day never earns
    entry(water, addDays(now, -1), { amount: 8 }), // yesterday doesn't count
  ];

  test("inputs: finished habits to do + today's steps", () => {
    expect(bankInputs(habits, completions, now)).toEqual({ done: 1, steps: 6400 });
  });

  test("balance: earned - debt - spent", () => {
    const b = bankToday(notif(), habits, completions, {}, 12, now);
    expect(b).toMatchObject({ earned: 45, debt: 0, limit: 45, used: 12, left: 33 });
    // last night: 10 social minutes after midnight = 20 off
    const d = bankToday(notif(), habits, completions, night({ social: 10 }), 12, now);
    expect(d).toMatchObject({ earned: 45, debt: 20, limit: 25, left: 13 });
    // "the night costs the day" off
    expect(
      bankToday(notif({ nightDebt: false }), habits, completions, night({ social: 10 }), 0, now)
        .debt,
    ).toBe(0);
    // before 5:00 the night isn't over
    const early = new Date(2026, 8, 23, 4, 30);
    expect(bankToday(notif(), habits, [], night({ social: 10 }), 0, early).debt).toBe(0);
    // overspent: never below 0
    expect(bankToday(notif(), habits, completions, {}, 60, now).left).toBe(0);
  });

  test("the toast after finishing a habit", () => {
    const n = notif({ dailyLimit: true, limitMode: "bank" });
    expect(bankToastLine(n, teeth, habits, completions, {}, 12, now)).toBe(
      "💰 +10 min do banku · masz 33 min",
    );
    setLang("en");
    expect(bankToastLine(n, teeth, habits, completions, {}, 12, now)).toBe(
      "💰 +10 min in the bank · 33 min left",
    );
    setLang("pl");
    // forbidden habits, fixed mode, limit off: nothing
    expect(bankToastLine(n, noAlcohol, habits, completions, {}, 0, now)).toBeNull();
    expect(
      bankToastLine({ ...n, limitMode: "fixed" }, teeth, habits, completions, {}, 0, now),
    ).toBeNull();
    expect(
      bankToastLine({ ...n, dailyLimit: false }, teeth, habits, completions, {}, 0, now),
    ).toBeNull();
    // full bank
    expect(bankToastLine({ ...n, bankCap: 10 }, teeth, habits, completions, {}, 0, now)).toContain(
      "Bank pełny",
    );
  });

  test("how to earn more", () => {
    expect(bankHowTo(BANK_DEFAULTS)).toBe("+10 za każde zadanie, +5 za 1000 kroków");
    expect(bankHowTo({ ...BANK_DEFAULTS, perKSteps: 0 })).toBe("+10 za każde zadanie");
    setLang("en");
    expect(bankHowTo(BANK_DEFAULTS)).toBe("+10 per habit, +5 per 1000 steps");
  });
});

describe("mode setting: default, migration, backup, snapshot", () => {
  test("bank is the default, also for saves from before the bank (merge backfills it)", () => {
    expect(isBank(notif())).toBe(true);
    expect(isBank({ limitMode: "fixed" })).toBe(false);
    const merge = useHabits.persist.getOptions().merge!;
    const old = { notifications: { dailyLimit: true, dailyLimitMin: 45 }, daySocial: {} };
    const merged = merge(old, useHabits.getState()) as ReturnType<typeof useHabits.getState>;
    expect(merged.notifications.limitMode).toBe("bank");
    expect(merged.notifications.dailyLimitMin).toBe(45); // kept for the fixed mode
    expect(merged.notifications.bankBase).toBe(5);
    expect(merged.dayLimits).toEqual({});
    // a choice made after the update stays
    const fixed = merge(
      { notifications: { limitMode: "fixed" } },
      useHabits.getState(),
    ) as ReturnType<typeof useHabits.getState>;
    expect(fixed.notifications.limitMode).toBe("fixed");
  });

  test("day limits merge, survive a backup round trip, an old backup gets the bank", () => {
    const s = useHabits.getState();
    const keep = { ...s };
    s.mergeDayLimits({ "2026-09-20": 25 });
    s.mergeDayLimits({ "2026-09-20": 35, "2026-09-21": 5 }); // the balance grows during the day
    expect(useHabits.getState().dayLimits).toMatchObject({ "2026-09-20": 35, "2026-09-21": 5 });
    useHabits.getState().setNotifications({ ...s.notifications, limitMode: "fixed", bankCap: 90 });
    const json = useHabits.getState().exportData();
    expect(JSON.parse(json).dayLimits["2026-09-20"]).toBe(35);
    useHabits.setState({ dayLimits: {} });
    useHabits.getState().importData(json);
    expect(useHabits.getState().dayLimits["2026-09-21"]).toBe(5);
    expect(useHabits.getState().notifications).toMatchObject({ limitMode: "fixed", bankCap: 90 });
    // a backup from before the bank
    const old = JSON.parse(json);
    delete old.notifications.limitMode;
    delete old.dayLimits;
    useHabits.getState().importData(JSON.stringify(old));
    expect(useHabits.getState().notifications.limitMode).toBe("bank");
    useHabits.setState(keep);
  });

  test("snapshot: live.day carries the mode and the rules for DayGuard", () => {
    expect(dayGuardState(notif({ limitMode: "bank" }), []).day).toEqual({
      enabled: true,
      limit: 60,
      debt: true,
      mode: "bank",
      bank: BANK_DEFAULTS,
    });
    expect(dayGuardState(notif({ limitMode: "fixed", bankCap: 60 }), []).day).toMatchObject({
      mode: "fixed",
      bank: { cap: 60 },
    });
    const live = buildState().live as unknown as { day: { mode: string }; lines: object };
    expect(["bank", "fixed"]).toContain(live.day.mode);
    expect(live.lines).toHaveProperty("bankOver");
  });

  test("snapshot rows carry what the native side earns from (kind, amount, target, source)", () => {
    const s = useHabits.getState();
    const keep = { habits: s.habits, completions: s.completions };
    const today = new Date();
    useHabits.setState({
      habits: [teeth, steps],
      completions: [entry(teeth, today, { amount: 2 }), entry(steps, today, { amount: 3200 })],
    });
    const rows = buildState().habits as {
      kind: string;
      amount: number;
      target: number;
      source: string;
    }[];
    expect(rows.map((r) => [r.kind, r.amount, r.target, r.source])).toEqual([
      ["build", 2, 2, ""],
      ["build", 3200, 8000, "steps"],
    ]);
    useHabits.setState(keep);
  });
});

describe("bank lines", () => {
  test("every bank moment has lines, hard swears, soft doesn't, only known placeholders", () => {
    const known = /\{(app|used|limit|over|left|bank|earn|m|u)\}/g;
    for (const lang of ["pl", "en"] as const) {
      setLang(lang);
      const hard = dayLines("hard", "Ola");
      const soft = dayLines("soft", "Ola");
      for (const k of ["bankOver", "bankEscalate", "bankWarn", "bankBlock"] as const) {
        expect(hard[k].length).toBeGreaterThan(0);
        expect(soft[k].length).toBeGreaterThan(0);
        for (const l of [...hard[k], ...soft[k]]) expect(l.replace(known, "")).not.toMatch(/\{/);
      }
      const bankHard = [...hard.bankOver, ...hard.bankEscalate, ...hard.bankBlock].join(" ");
      expect(bankHard).toMatch(/kurw|fuck|damn/i);
      const bankSoft = [...soft.bankOver, ...soft.bankEscalate, ...soft.bankBlock].join(" ");
      expect(bankSoft).not.toMatch(/kurw|jeb|fuck|shit|damn/i);
      expect(hard.bankWarn.every((l) => l.includes("{bank}"))).toBe(true);
      if (lang === "en") expect(bankHard).not.toMatch(/[ąćęłńóśźż]/i);
    }
  });
});

describe("stats against the day's balance", () => {
  test("series: each day against its own bank, missing days against the setting", () => {
    const social = { [key(now)]: 30, [key(addDays(now, -1))]: 20, [key(addDays(now, -2))]: 50 };
    const limits = { [key(now)]: 35, [key(addDays(now, -1))]: 15 };
    const s = limitSeries(social, 60, 14, now, limits);
    expect(s[13]).toEqual({ key: key(now), minutes: 30, over: false, limit: 35 });
    expect(s[12]).toMatchObject({ minutes: 20, over: true, limit: 15 });
    expect(s[11]).toMatchObject({ minutes: 50, over: false, limit: 60 });
    expect(limitScore(s)).toEqual({ within: 2, tracked: 3 });
    // without limits: the old fixed behaviour
    expect(limitSeries(social, 60, 14, now)[12]).toEqual({
      key: key(addDays(now, -1)),
      minutes: 20,
      over: false,
    });
  });

  test("limit7 in bank mode: a finished day over its bank fails, today can still be earned", () => {
    const monday = startOfWeek(now, { weekStartsOn: 1 });
    let found = false;
    for (let w = 0; w < 30 && !found; w++) {
      const m = addDays(monday, -7 * w);
      const day = (i: number) => key(addDays(m, i));
      const social = Object.fromEntries([0, 1, 2].map((i) => [day(i), 40]));
      const limits = Object.fromEntries([0, 1, 2].map((i) => [day(i), 50]));
      // Wednesday (today) 40 min on a 30 min bank so far: not failed yet
      const at = new Date(addDays(m, 2).setHours(15, 0));
      const today = weeklyChallenges(habits, [], {}, false, at, m, {
        limit: 60,
        social,
        limits: { ...limits, [day(2)]: 30 },
      }).find((c) => c.id === "limit7");
      if (!today) continue;
      found = true;
      expect(today.status).toBe("active");
      expect(today.detail).toContain("banku");
      // Tuesday over its bank: failed
      const failed = weeklyChallenges(habits, [], {}, false, at, m, {
        limit: 60,
        social,
        limits: { ...limits, [day(1)]: 35 },
      }).find((c) => c.id === "limit7");
      expect(failed?.status).toBe("failed");
    }
    expect(found).toBe(true);
  });
});
