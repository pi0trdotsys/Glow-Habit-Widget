import { afterEach, describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import {
  CURFEW_PASS_MIN,
  DEBT_FLOOR_MIN,
  cleanNight,
  cleanNightStreak,
  curfewLines,
  nightDebt,
} from "@/lib/curfew";
import { dayGuardState } from "@/lib/day-guard";
import { liveState } from "@/lib/live";
import { useHabits, type NotificationSettings } from "@/lib/habits/store";
import type { NightReport } from "@/lib/sensors";
import { setLang } from "@/lib/i18n";
import { buildState } from "@/lib/widget/bridge";
import { WED_1540, key } from "./helpers";

afterEach(() => setLang("pl"));

const notif = (p: Partial<NotificationSettings> = {}): NotificationSettings => ({
  ...useHabits.getState().notifications,
  ...p,
});

const night = (d: Date, p: Partial<NightReport> = {}): NightReport => ({
  date: key(d),
  granted: true,
  social: 0,
  screen: 0,
  ...p,
});

/** Placeholders LiveGuardService.curfewFill / quickNote resolve. */
const ALLOWED = new Set(["app", "time", "count", "until", "left"]);
const GENDERED = /\b\w+(łeś|łaś|łem|łam)\b/u;
const SWEAR = /kurw|chuj|pierdol|jeb|gówn|fuck|shit|damn/i;

describe("curfew lines", () => {
  for (const lang of ["pl", "en"] as const) {
    for (const level of ["hard", "soft"] as const) {
      test(`${lang}/${level}: every pool, valid placeholders, no gendered past tense`, () => {
        setLang(lang);
        const l = curfewLines(level);
        for (const pool of ["curfew", "pass", "charger", "unplug"] as const) {
          expect(l[pool].length).toBeGreaterThan(level === "hard" ? 3 : 0);
          for (const line of l[pool]) {
            for (const m of line.matchAll(/\{(\w+)\}/g)) expect(ALLOWED.has(m[1])).toBe(true);
            if (lang === "pl") expect(GENDERED.test(line)).toBe(false);
            if (level === "soft") expect(SWEAR.test(line)).toBe(false);
          }
        }
      });
    }
  }

  test("PL and EN differ and have the same pools", () => {
    setLang("pl");
    const pl = curfewLines("hard");
    setLang("en");
    const en = curfewLines("hard");
    expect(Object.keys(en)).toEqual(Object.keys(pl));
    expect(en.curfew[0]).not.toBe(pl.curfew[0]);
    expect(en.curfew.length).toBe(pl.curfew.length);
  });

  test("the block's {count} lines make sense with passes (pass lines mention 3 minutes)", () => {
    for (const lang of ["pl", "en"] as const) {
      setLang(lang);
      expect(curfewLines("hard").pass.some((l) => l.includes(String(CURFEW_PASS_MIN)))).toBe(true);
    }
  });
});

describe("the night costs the day", () => {
  test("2 min per social minute after midnight, 10 per pass, at least 15 left", () => {
    expect(nightDebt(null, 60)).toBe(0);
    expect(nightDebt({ social: 0, curfewPasses: 0 }, 60)).toBe(0);
    expect(nightDebt({ social: 4 }, 60)).toBe(8);
    expect(nightDebt({ social: 4, curfewPasses: 2 }, 60)).toBe(28);
    expect(nightDebt({ social: 200, curfewPasses: 9 }, 60)).toBe(60 - DEBT_FLOOR_MIN);
    expect(nightDebt({ social: 30 }, 15)).toBe(0);
  });

  test("Today's social card shows the limit after the debt (store + guard status)", async () => {
    const { useGuardStatus } = await import("@/components/TodayGuard");
    expect(typeof useGuardStatus).toBe("function");
    const s = dayGuardState(notif({ nightDebt: true }), []);
    expect(s.day).toMatchObject({ enabled: true, limit: 60, debt: true });
    expect(dayGuardState(notif({ nightDebt: false }), []).day.debt).toBe(false);
  });
});

describe("clean nights in a row", () => {
  const now = WED_1540;
  test("counts back from last night, a pass or social media breaks it", () => {
    const r: Record<string, NightReport> = {};
    for (let i = 1; i <= 3; i++) r[key(addDays(now, -i))] = night(addDays(now, -i));
    r[key(addDays(now, -4))] = night(addDays(now, -4), { social: 5 });
    r[key(addDays(now, -5))] = night(addDays(now, -5));
    expect(cleanNightStreak(r, now)).toBe(3);
    r[key(addDays(now, -2))] = night(addDays(now, -2), { curfewPasses: 1 });
    expect(cleanNightStreak(r, now)).toBe(1);
    expect(cleanNight(night(now, { curfewPasses: 1 }))).toBe(false);
  });

  test("a missing night ends the streak; tonight doesn't count yet", () => {
    const r: Record<string, NightReport> = { [key(now)]: night(now) };
    expect(cleanNightStreak(r, now)).toBe(0);
    r[key(addDays(now, -1))] = night(addDays(now, -1));
    r[key(addDays(now, -3))] = night(addDays(now, -3));
    expect(cleanNightStreak(r, now)).toBe(1);
    r[key(addDays(now, -2))] = { ...night(addDays(now, -2)), granted: false };
    expect(cleanNightStreak(r, now)).toBe(1);
  });
});

describe("native snapshot", () => {
  test("liveState carries the curfew settings and lines", () => {
    const s = liveState(
      notif({ curfew: true, curfewAllow: ["com.spotify.music"], curfewDim: false }),
      "hard",
      "Piotr",
    );
    expect(s.curfew).toBe(true);
    expect(s.curfewAllow).toEqual(["com.spotify.music"]);
    expect(s.curfewDim).toBe(false);
    for (const pool of ["curfew", "pass", "charger", "unplug"]) {
      expect((s.lines as Record<string, string[]>)[pool].length).toBeGreaterThan(0);
    }
    // the older pools are still there
    expect((s.lines as Record<string, string[]>).bedtime.length).toBeGreaterThan(0);
    expect(s.day.debt).toBe(true);
  });

  test("curfew is off by default, debt on, dim on", () => {
    const n = useHabits.getState().notifications;
    expect(n.curfew).toBe(false);
    expect(n.curfewAllow).toEqual([]);
    expect(n.curfewDim).toBe(true);
    expect(n.nightDebt).toBe(true);
  });

  test("buildState mirrors it to the widget snapshot", () => {
    const before = useHabits.getState().notifications;
    useHabits.getState().setNotifications({ ...before, curfew: true, curfewAllow: ["a.b"] });
    try {
      const live = buildState().live as unknown as { curfew: boolean; curfewAllow: string[] };
      expect(live.curfew).toBe(true);
      expect(live.curfewAllow).toEqual(["a.b"]);
    } finally {
      useHabits.getState().setNotifications(before);
    }
  });

  test("older saves get the new fields backfilled", () => {
    const merged = useHabits.persist.getOptions().merge!(
      { notifications: { live: true } },
      useHabits.getState(),
    ) as ReturnType<typeof useHabits.getState>;
    expect(merged.notifications.curfew).toBe(false);
    expect(merged.notifications.nightDebt).toBe(true);
    expect(merged.stepsSource).toBe("auto");
  });
});
