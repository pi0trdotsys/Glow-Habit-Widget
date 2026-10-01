import { afterEach, describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import {
  billComment,
  billLines,
  billPools,
  fellAfter,
  fellLine,
  fillBill,
  fmtSleep,
  sleepByDate,
  sleepRange,
  sleepWeeks,
  usableLine,
  type BillPool,
} from "@/lib/night";
import { sleepInsights } from "@/lib/habits/insights";
import { toCsv } from "@/lib/habits/stats";
import { useHabits } from "@/lib/habits/store";
import { setLang } from "@/lib/i18n";
import type { NightReport } from "@/lib/sensors";
import type { Completion } from "@/lib/habits/types";
import { entry, habit, key } from "./helpers";

const SWEAR_PL = /kurw|chuj|pierdol|jeb|spierdal|dup[ay]|gówn|pizd/i;
const SWEAR_EN =
  /\b(fuck\w*|shit\w*|damn\w*|ass|asses|arse|dumbass|jackass|bitch\w*|crap\w*|bastards?|piss\w*|hell|dick\w*|bullshit\w*|screw\w*)\b/i;
const GENDERED = /(?<!\p{L})\p{L}+(łeś|łaś|łbyś|łabyś)(?!\p{L})/u;
const PL_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ„]/;
const PH = /\{\w+\}/g;
const POOLS: BillPool[] = ["bad", "good", "short", "rested"];

afterEach(() => setLang("pl"));

const night = (p: Partial<NightReport> = {}): NightReport => ({
  date: "2026-09-25",
  granted: true,
  apps: [],
  visits: 0,
  social: 0,
  screen: 3,
  asleep: 30, // 00:30
  ...p,
});
const sleep = (minutes: number, start = 48, end = 420) => ({
  start,
  end,
  minutes,
  source: "com.xiaomi.wearable",
});

describe("sleep from the band: formatting", () => {
  test("duration, range, phone-down vs asleep", () => {
    expect(fmtSleep(372)).toBe("6 h 12 min");
    expect(fmtSleep(420)).toBe("7 h");
    expect(fmtSleep(45)).toBe("45 min");
    const r = night({ sleep: sleep(372) });
    expect(sleepRange(r)).toBe("00:48–07:00");
    expect(fellAfter(r)).toBe(18);
    expect(fellLine(r)).toBe("zasypiasz 18 min po odłożeniu telefonu");
    // across midnight
    expect(fellAfter(night({ asleep: 23 * 60 + 50, sleep: sleep(400, 15) }))).toBe(25);
    // the phone went down after falling asleep: the jab
    const late = night({ asleep: 100, sleep: sleep(372) });
    expect(fellAfter(late)).toBe(-52);
    expect(fellLine(late)).toBe("telefon odłożony 52 min po zaśnięciu?!");
    setLang("en");
    expect(fellLine(late)).toBe("phone down 52 min after falling asleep?!");
    expect(fellLine(r)).toBe("asleep 18 min after the phone went down");
    // unknown / too far apart
    expect(fellAfter(night({ asleep: -1, sleep: sleep(372) }))).toBeNull();
    expect(fellAfter(night())).toBeNull();
    expect(fellAfter(night({ asleep: 21 * 60, sleep: sleep(372, 5 * 60) }))).toBeNull();
  });

  test("placeholders {sleep} and {fell} (mirror NightStats.fill / usable)", () => {
    const r = night({ sleep: sleep(372) });
    expect(fillBill("{sleep} / {fell}", r)).toBe("6 h 12 min / 18");
    expect(fillBill("{sleep}", night())).toBe("?");
    expect(usableLine("{sleep}", night())).toBe(false);
    expect(usableLine("{fell}", night({ asleep: 100, sleep: sleep(372) }))).toBe(false);
    expect(usableLine("{fell} {sleep}", r)).toBe(true);
  });
});

describe("sleep in the night bill", () => {
  test("pools mirror SleepCalc.billPools", () => {
    expect(billPools(night())).toEqual(["good"]);
    expect(billPools(night({ social: 10 }))).toEqual(["bad"]);
    expect(billPools(night({ social: 10, sleep: sleep(300) }))).toEqual(["bad", "short"]);
    expect(billPools(night({ sleep: sleep(359) }))).toEqual(["short"]);
    expect(billPools(night({ sleep: sleep(400) }))).toEqual(["good"]);
    expect(billPools(night({ sleep: sleep(420) }))).toEqual(["good", "rested"]);
    expect(billPools(night({ social: 5, sleep: sleep(480) }))).toEqual(["bad"]);
  });

  test("comment comes from the right pool, stable, never with unknown placeholders", () => {
    for (const level of ["hard", "soft"] as const) {
      const lines = billLines(level, null);
      for (let i = 0; i < 25; i++) {
        const date = `2026-08-${String(i + 1).padStart(2, "0")}`;
        const short = night({ date, sleep: sleep(300) });
        const c = billComment(short, level, null);
        expect(c).toBe(billComment(short, level, null));
        expect(lines.short.map((l) => fillBill(l, short))).toContain(c);
        expect(c).toContain("5 h");

        const rested = night({ date, sleep: sleep(450) });
        expect([...lines.good, ...lines.rested].map((l) => fillBill(l, rested))).toContain(
          billComment(rested, level, null),
        );

        const both = night({ date, social: 20, visits: 2, sleep: sleep(300) });
        expect([...lines.bad, ...lines.short].map((l) => fillBill(l, both))).toContain(
          billComment(both, level, null),
        );

        // phone down after falling asleep / no phone-down time: never a {fell} or {asleep} line
        for (const asleep of [100, -1]) {
          for (const minutes of [300, 480]) {
            const r = night({ date, asleep, sleep: sleep(minutes) });
            const ok = POOLS.flatMap((k) => lines[k])
              .filter((l) => !l.includes("{fell}") && (asleep >= 0 || !l.includes("{asleep}")))
              .map((l) => fillBill(l, r));
            expect(ok).toContain(billComment(r, level, null));
          }
        }
      }
    }
  });

  test("lines: valid placeholders, hard swears, soft doesn't, no gendered past tense, English is English", () => {
    const full = night({
      social: 12,
      visits: 2,
      apps: [{ pkg: "com.instagram.android", label: "Instagram", visits: 2, minutes: 12 }],
      sleep: sleep(372),
    });
    for (const lang of ["pl", "en"] as const) {
      setLang(lang);
      for (const level of ["hard", "soft"] as const) {
        const lines = billLines(level, "Ola");
        expect(lines.short.length).toBeGreaterThanOrEqual(3);
        expect(lines.rested.length).toBeGreaterThanOrEqual(3);
        for (const k of POOLS) {
          for (const l of lines[k]) {
            expect(fillBill(l, full)).not.toMatch(PH);
            if (lang === "pl") expect(l).not.toMatch(GENDERED);
            if (lang === "en") expect(l).not.toMatch(PL_LETTERS);
            if (level === "soft") {
              expect(l).not.toMatch(SWEAR_PL);
              expect(l).not.toMatch(SWEAR_EN);
            }
          }
        }
        for (const k of ["short", "rested"] as const) {
          expect(lines[k].every((l) => l.includes("{sleep}"))).toBe(true);
          if (level === "hard")
            expect(lines[k].some((l) => (lang === "pl" ? SWEAR_PL : SWEAR_EN).test(l))).toBe(true);
        }
      }
    }
    // English pools use only placeholders the Polish ones have
    for (const level of ["hard", "soft"] as const) {
      setLang("pl");
      const pl = new Set(POOLS.flatMap((k) => billLines(level, null)[k].join(" ").match(PH) ?? []));
      setLang("en");
      const en = POOLS.flatMap((k) => billLines(level, null)[k].join(" ").match(PH) ?? []);
      expect(en.filter((p) => !pl.has(p))).toEqual([]);
    }
  });
});

describe("sleep stats", () => {
  const now = new Date(2026, 8, 23, 12, 0);
  const reports = (n: number, minutes: (i: number) => number, social = (_i: number) => 0) => {
    const out: Record<string, NightReport> = {};
    for (let i = 1; i <= n; i++) {
      const date = key(addDays(now, -i));
      out[date] = night({ date, social: social(i), sleep: sleep(minutes(i)) });
    }
    return out;
  };

  test("last 7 nights vs the 7 before", () => {
    const r = reports(14, (i) => (i <= 7 ? 400 : 380));
    const w = sleepWeeks(r, now);
    expect(w.last).toEqual({ avg: 400, nights: 7 });
    expect(w.prev).toEqual({ avg: 380, nights: 7 });
    expect(w.delta).toBe(20);
    // too few nights the week before -> no comparison
    const few = sleepWeeks(
      reports(8, () => 400),
      now,
    );
    expect(few.last?.nights).toBe(7);
    expect(few.delta).toBeNull();
    expect(sleepWeeks({}, now).last).toBeNull();
  });

  test("insight: social media after midnight vs sleep", () => {
    const r = reports(
      20,
      (i) => (i % 2 === 0 ? 360 : 420),
      (i) => (i % 2 === 0 ? 30 : 0),
    );
    const found = sleepInsights([], [], r, 60, now);
    expect(found[0].text).toBe(
      "Po nocy z social mediami po północy śpisz średnio 60 min krócej (6 h zamiast 7 h).",
    );
    expect(found[0].negative).toBe(true);
    setLang("en");
    expect(sleepInsights([], [], r, 60, now)[0].text).toBe(
      "After a night with social media past midnight you sleep 60 min less on average (6 h instead of 7 h).",
    );
    // not enough nights, or no real difference -> quiet
    expect(
      sleepInsights(
        [],
        [],
        reports(
          5,
          () => 400,
          (i) => i % 2,
        ),
        60,
        now,
      ),
    ).toEqual([]);
    expect(
      sleepInsights(
        [],
        [],
        reports(
          20,
          () => 400,
          (i) => i % 2,
        ),
        60,
        now,
      ),
    ).toEqual([]);
  });

  test("insight: short nights vs the next day's steps", () => {
    const steps = habit(
      { name: "8000 kroków", goal: { type: "count", target: 8000, step: 1000, unit: "kroków" } },
      50,
      now,
    );
    const r = reports(30, (i) => (i % 3 === 0 ? 300 : 450));
    const c: Completion[] = [];
    for (let i = 1; i <= 30; i++) {
      // the day after the night filed under now-i
      const d = addDays(now, -i + 1);
      if (i >= 2) c.push(entry(steps, d, { amount: i % 3 === 0 ? 4000 : 9000 }));
    }
    const found = sleepInsights([steps], c, r, 60, now);
    const hit = found.find((f) => f.effectId === steps.id);
    expect(hit?.text).toBe(
      "Po nocy krótszej niż 6 h snu: „8000 kroków” średnio 4000 zamiast 9000 kroków (o 5000 kroków mniej).",
    );
    expect(hit?.negative).toBe(true);
  });

  test("CSV gets the night's sleep minutes in a new last column", () => {
    const water = habit(
      { name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } },
      3,
      now,
    );
    const d = addDays(now, -1);
    const r = { [key(d)]: night({ date: key(d), sleep: sleep(372) }), x: night({ date: "x" }) };
    expect(sleepByDate(r)).toEqual({ [key(d)]: 372 });
    const csv = toCsv([water], [entry(water, d, { amount: 8 })], {}, now, {}, sleepByDate(r));
    const lines = csv.trim().split("\r\n");
    expect(lines[0].endsWith(";social_w_nocy;social_dzien_min;sen_min")).toBe(true);
    expect(lines).toContain(`${key(d)};Picie wody;do zrobienia;8;szklanek;8;zrobione;100;;;372`);
    setLang("en");
    expect(toCsv([water], [], {}, now).split("\r\n")[0].endsWith(";sleep_min")).toBe(true);
  });

  test("a later read without sleep keeps the sleep seen earlier", () => {
    const s = useHabits.getState();
    s.mergeNightReports({ "2026-09-20": night({ date: "2026-09-20", sleep: sleep(400) }) });
    s.mergeNightReports({ "2026-09-20": night({ date: "2026-09-20", social: 5 }) });
    const got = useHabits.getState().nightReports["2026-09-20"];
    expect(got.social).toBe(5);
    expect(got.sleep?.minutes).toBe(400);
    s.mergeNightReports({ "2026-09-20": night({ date: "2026-09-20", sleep: sleep(410) }) });
    expect(useHabits.getState().nightReports["2026-09-20"].sleep?.minutes).toBe(410);
  });
});
