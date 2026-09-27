import { afterEach, describe, expect, test } from "bun:test";
import { setLang } from "@/lib/i18n";
import {
  allDoneLines,
  caughtLines,
  categoryOf,
  eveningLines,
  memoryLines,
  nagLines,
  pendingLabel,
  praiseFor,
  rageLines,
  setHumor,
  slipFor,
  szpilaNow,
  weeklyRoast,
} from "@/lib/habits/szpila";
import {
  FACES,
  HUMORS,
  conditionLabel,
  humorLines,
  kindLabel,
  nextUnlock,
  unlockBlurb,
  unlockName,
  weeklyChallenges,
} from "@/lib/habits/gamification";
import { SOCIAL_APPS, liveLines } from "@/lib/live";
import { billComment, billLines } from "@/lib/night";
import type { NightReport } from "@/lib/sensors";
import { NAME_PAIRS } from "@/lib/habits/seed-names";
import { planDay } from "@/lib/habits/utils";
import type { Habit } from "@/lib/habits/types";
import { WED_1540, entry, habit } from "./helpers";

/** Polish letters or Polish opening quote - must never show up in English lines. */
const PL = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ„]/;
const SWEAR_EN =
  /\b(fuck\w*|shit\w*|damn\w*|ass|asses|arse|dumbass|jackass|bitch\w*|crap\w*|bastards?|piss\w*|hell|dick\w*|bullshit\w*|screw\w*)\b/i;
const PLACEHOLDER = /\{\w+\}/g;

const ph = (lines: string[]) => new Set(lines.flatMap((l) => l.match(PLACEHOLDER) ?? []));
const subset = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x));

/** Polish name, English name, kind, a word only that category's English lines contain. */
const CATS: [string, string, "build" | "avoid", RegExp][] = [
  ["Mycie zębów", "Brush teeth", "build", /tooth|teeth|cavit|dentist/i],
  ["Picie wody", "Drink water", "build", /water|hydrat/i],
  ["8000 kroków", "8000 steps", "build", /steps|walk|legs/i],
  ["Czytanie książki", "Read a book", "build", /book|reading|pages/i],
  ["Siłownia", "Gym", "build", /workout|muscle|dumbbell|train/i],
  ["Medytacja", "Meditation", "build", /meditat|breath|zen|silence/i],
  ["Programuj", "Code", "build", /code|editor|commit|repo/i],
  ["Ucz się języka obcego", "Learn a language", "build", /language|vocab|Duolingo/i],
  ["Dziennik", "Journal", "build", /./],
  ["Scrollowanie w łóżku", "Scrolling in bed", "avoid", /phone|scroll|screen/i],
  ["Fast food", "Fast food", "avoid", /burger|fries|fryer|drive-thru/i],
  ["Słodycze", "Sweets", "avoid", /sugar|chocolate|candy|sweets/i],
  ["Alkohol", "Alcohol", "avoid", /sober|booze|beer|liver/i],
  ["Papierosy", "Cigarettes", "avoid", /cigarette|smok|lungs/i],
  ["Oglądanie pornografii", "Watching porn", "avoid", /porn|incognito/i],
  ["Nie bądź zboczeńcem", "Don't be a perv", "avoid", /perv|ogle/i],
  ["Pomijanie posiłków", "Skipping meals", "avoid", /meals?\b|ate at normal/i],
  ["Impulsywne wydawanie", "Impulse spending", "avoid", /impulse|wallet|cart|spending/i],
  ["Hazard", "Gambling", "avoid", /gambl|bets|casino/i],
  ["Obgryzanie paznokci", "Nail biting", "avoid", /nail/i],
  ["Za dużo kawy", "Too much coffee", "avoid", /coffee|caffeine/i],
  ["Prokrastynacja", "Procrastination", "avoid", /procrastinat|later/i],
  ["Drzemka po budziku", "Snoozing the alarm", "avoid", /snooz|alarm/i],
  ["Binge-watching", "Binge-watching", "avoid", /episode|series|binge/i],
  ["Energetyki", "Energy drinks", "avoid", /energy drink|taurine/i],
];

const AVOID_EN = new Set(CATS.filter((c) => c[2] === "avoid").map((c) => c[1]));
for (const n of [
  "Porn",
  "Impulse shopping",
  "Scrolling reels",
  "Shows till late",
  "Impulse buys",
  "Hitting snooze",
  "Coffee after 4 pm",
])
  AVOID_EN.add(n);

const COUNT = { type: "count" as const, target: 8, step: 1, unit: "x" };
const make = (name: string, kind: "build" | "avoid", counted = false): Habit =>
  habit({ name, kind, icon: "Star", ...(counted && kind === "build" ? { goal: COUNT } : {}) });

afterEach(() => {
  setLang("pl");
  setHumor("wredny");
});

describe("category detection knows English names", () => {
  test("every seed/template pair lands in the same category in both languages", () => {
    for (const [pl, en] of NAME_PAIRS) {
      // Unknown (newly added) pairs: avoid when only the avoid rules recognise the Polish name.
      const avoidish =
        categoryOf(make(pl, "build")) === "generic" &&
        categoryOf(make(pl, "avoid")) !== "avoidGeneric";
      const kind = AVOID_EN.has(en) || avoidish ? "avoid" : "build";
      expect(`${en}: ${categoryOf(make(en, kind))}`).toBe(`${en}: ${categoryOf(make(pl, kind))}`);
    }
  });

  test("specific English names get their own category", () => {
    for (const [, en, kind] of CATS) {
      if (en === "Journal") continue;
      expect(`${en}: ${categoryOf(make(en, kind))}`).not.toMatch(/: (generic|avoidGeneric)$/);
    }
    expect(categoryOf(make("Stretching", "build"))).toBe("gym");
    expect(categoryOf(make("Vitamins", "build"))).toBe("pills");
  });

  test("no false positives from bare substrings", () => {
    expect(categoryOf(make("Bake bread", "build"))).toBe("generic"); // not "read"
    expect(categoryOf(make("Spread the love", "build"))).toBe("generic");
    expect(categoryOf(make("Buyer's remorse", "avoid"))).not.toBe("shopping");
  });
});

describe("Szpila in English", () => {
  for (const [, en, kind, re] of CATS) {
    test(`${en}: English lines for its category, hard + soft`, () => {
      setLang("en");
      const h = make(en, kind);
      const hardNag = nagLines(h, "hard", null);
      expect(hardNag.map((l) => l.replaceAll(en, "")).some((l) => re.test(l))).toBe(true);
      expect(hardNag.some((l) => SWEAR_EN.test(l))).toBe(true);
      const soft = [...nagLines(h, "soft", null), ...rageLines(h, "soft", null)];
      expect(soft.length).toBeGreaterThan(0);
      for (const l of soft) expect(l).not.toMatch(SWEAR_EN);
      const all = [...hardNag, ...rageLines(h, "hard", null), ...soft];
      for (let i = 0; i < 30; i++)
        all.push(praiseFor(h, "hard", "Sam"), praiseFor(h, "soft", "Sam"));
      if (kind === "avoid") all.push(slipFor(h, "hard", null), slipFor(h, "soft", null));
      for (const l of all) {
        expect(l).not.toMatch(PL);
        expect(l.replace(/\{(done|left|target)\}/g, "")).not.toMatch(/\{\w+\}/);
      }
    });
  }

  test("placeholders match the Polish pools (per category, level and pool)", () => {
    for (const [pl, en, kind] of CATS) {
      for (const level of ["hard", "soft"] as const) {
        for (const fn of [nagLines, rageLines]) {
          setLang("pl");
          const plSet = ph(fn(make(pl, kind, true), level, null));
          setLang("en");
          const enSet = ph(fn(make(en, kind, true), level, null));
          expect(`${en} ${level} ${fn.name}: ${subset(enSet, plSet).join(",")}`).toBe(
            `${en} ${level} ${fn.name}: `,
          );
        }
      }
    }
  });

  test("single-check habits never get amount placeholders", () => {
    setLang("en");
    for (const [, en, kind] of CATS) {
      const h = make(en, kind);
      for (const l of [...nagLines(h, "hard", null), ...rageLines(h, "hard", null)])
        expect(l).not.toMatch(/\{(done|left|target)\}/);
    }
  });

  test("hard level still has plenty to say", () => {
    setLang("en");
    const water = make("Drink water", "build", true);
    expect(nagLines(water, "hard", null).length).toBeGreaterThanOrEqual(20);
    expect(nagLines(water, "hard", null).filter((l) => SWEAR_EN.test(l)).length).toBeGreaterThan(8);
  });

  test("caught, all-done, evening lines are English; social basis talks about social media", () => {
    setLang("en");
    expect(caughtLines("hard", "social").every((l) => /social/i.test(l))).toBe(true);
    expect(caughtLines("hard", "screen").some((l) => /social/i.test(l))).toBe(false);
    for (const level of ["hard", "soft"] as const) {
      const lines = [
        ...caughtLines(level, "social"),
        ...caughtLines(level, "screen"),
        ...allDoneLines(level),
        ...eveningLines(level),
      ];
      for (const l of lines) {
        expect(l).not.toMatch(PL);
        expect(l.replace(/\{(m|after|pending)\}/g, "")).not.toMatch(/\{\w+\}/);
        if (level === "soft") expect(l).not.toMatch(SWEAR_EN);
      }
      expect(eveningLines(level).every((l) => l.includes("{pending}"))).toBe(true);
      expect(caughtLines(level).every((l) => l.includes("{m}") && l.includes("{after}"))).toBe(
        true,
      );
    }
    expect(allDoneLines("hard").some((l) => SWEAR_EN.test(l))).toBe(true);
    expect(pendingLabel(1)).toBe("1 task");
    expect(pendingLabel(3)).toBe("3 tasks");
  });

  test("what Szpila says right now is English and resolved", () => {
    setLang("en");
    const read = habit(
      { name: "Read a book", goal: { type: "minutes", target: 30, step: 10 } },
      30,
      WED_1540,
    );
    const teeth = habit({ name: "Brush teeth" }, 30, WED_1540);
    const plan = planDay([read, teeth], [], WED_1540);
    for (let seed = 0; seed < 40; seed++) {
      const say = szpilaNow([read, teeth], [], plan, "hard", "Sam", seed);
      expect(say.text).not.toMatch(/\{(name|done|left|target|u|pending)\}/);
      expect(say.text).not.toMatch(PL);
    }
    expect(szpilaNow([], [], [], "soft", null, 1).text).not.toMatch(PL);
    expect(szpilaNow([read], [], [], "hard", null, 1).text).not.toMatch(PL);
  });

  test("memory lines and the weekly roast are English", () => {
    setLang("en");
    const water = habit({ name: "Drink water" }, 30);
    const bets = habit({ name: "Gambling", kind: "avoid" }, 60);
    for (const level of ["hard", "soft"] as const) {
      const m1 = memoryLines(water, [], level, "Sam");
      const m2 = memoryLines(bets, [], level, "Sam");
      expect(m1.length).toBeGreaterThan(0);
      expect(m2.length).toBeGreaterThan(0);
      for (const l of [...m1, ...m2]) {
        expect(l).not.toMatch(PL);
        expect(l).not.toMatch(/\{\w+\}/);
      }
      expect(m1.join(" ")).toContain("Drink water");
      expect(m2.join(" ")).toMatch(/\bslips\b/);
      const roast = weeklyRoast([water, bets], [entry(water, new Date())], level, "Sam");
      expect(roast).toMatch(/^Sam, your week: \d+%/);
      expect(roast).not.toMatch(PL);
      if (level === "soft") expect(roast).not.toMatch(SWEAR_EN);
    }
  });

  test("humor voices speak English and mix into the pools", () => {
    setLang("en");
    for (const h of HUMORS.filter((x) => x.id !== "wredny")) {
      const l = humorLines(h.id);
      const pools = [l.nag, l.avoid, l.praise, l.liveFirst, l.liveEscalate];
      for (const p of pools) {
        expect(p.length).toBeGreaterThan(0);
        for (const line of p) expect(line).not.toMatch(PL);
      }
    }
    setHumor("mafioso");
    const water = make("Drink water", "build");
    expect(nagLines(water, "hard", null).some((l) => l.includes("offer you can't refuse"))).toBe(
      true,
    );
    expect(nagLines(water, "soft", null).some((l) => l.includes("offer"))).toBe(false);
    expect(liveLines("hard", null, "trener").generic.some((l) => l.includes("champ"))).toBe(true);
  });
});

describe("night guard and night bill in English", () => {
  test("live lines: same pools, same placeholders, English, hard swears and soft doesn't", () => {
    for (const level of ["hard", "soft"] as const) {
      setLang("pl");
      const pl = liveLines(level, "Sam");
      setLang("en");
      const en = liveLines(level, "Sam");
      expect(Object.keys(en).sort()).toEqual(Object.keys(pl).sort());
      for (const app of SOCIAL_APPS) expect(en[app.key]?.length).toBeGreaterThan(0);
      expect(en.escalate.every((l) => l.includes("{m}"))).toBe(true);
      for (const [k, pool] of Object.entries(en)) {
        expect(`${k}: ${subset(ph(pool), ph(pl[k])).join(",")}`).toBe(`${k}: `);
        for (const l of pool) {
          expect(l).not.toMatch(PL);
          expect(l.replace(/\{(app|time|m|count|left|deadline)\}/g, "")).not.toMatch(/\{\w+\}/);
          if (level === "soft") expect(l).not.toMatch(SWEAR_EN);
        }
      }
      if (level === "hard") {
        expect(
          Object.values(en)
            .flat()
            .some((l) => SWEAR_EN.test(l)),
        ).toBe(true);
        expect(en.generic.some((l) => l.includes("Sam"))).toBe(true);
      }
    }
    setLang("en");
    expect(liveLines("hard", null).generic.some((l) => l.includes("Hey, you."))).toBe(true);
  });

  test("bill lines: English, stable comment, never {asleep} when unknown", () => {
    const bad: NightReport = {
      date: "2026-09-25",
      granted: true,
      apps: [{ pkg: "com.instagram.android", label: "Instagram", visits: 3, minutes: 22 }],
      visits: 3,
      social: 22,
      screen: 40,
      asleep: 100,
    };
    for (const level of ["hard", "soft"] as const) {
      setLang("pl");
      const pl = billLines(level, null);
      setLang("en");
      const en = billLines(level, null);
      for (const k of ["bad", "good"] as const) {
        expect(en[k].length).toBeGreaterThan(0);
        expect(subset(ph(en[k]), ph(pl[k]))).toEqual([]);
        for (const l of en[k]) {
          expect(l).not.toMatch(PL);
          if (level === "soft") expect(l).not.toMatch(SWEAR_EN);
        }
      }
    }
    setLang("en");
    expect(billLines("hard", null).bad.some((l) => SWEAR_EN.test(l))).toBe(true);
    const c = billComment(bad, "hard", null);
    expect(c).toBe(billComment(bad, "hard", null));
    expect(c).not.toMatch(/\{\w+\}/);
    for (let i = 0; i < 20; i++) {
      const clean = {
        ...bad,
        apps: [],
        visits: 0,
        social: 0,
        asleep: -1,
        date: `2026-09-${10 + i}`,
      };
      expect(billComment(clean, "hard", null)).not.toContain("?");
    }
  });
});

describe("gamification texts in English", () => {
  test("faces, humors, kinds and cat condition", () => {
    setLang("en");
    for (const u of [...FACES, ...HUMORS]) {
      expect(unlockName(u)).not.toMatch(PL);
      expect(unlockBlurb(u)).not.toMatch(PL);
      expect(unlockBlurb(u)).not.toBe(u.blurb);
    }
    expect(unlockName(FACES.find((f) => f.id === "kujon")!)).toBe("Nerd");
    expect(unlockName(HUMORS.find((f) => f.id === "trener")!)).toBe("Coach");
    expect(nextUnlock({ current: 2, best: 2, perfectWeeks: 0 })).toEqual({
      name: "Nerd",
      kind: "mina",
      missing: 1,
    });
    expect(kindLabel("mina")).toBe("face");
    expect(kindLabel("humor")).toBe("mood");
    expect(conditionLabel("groomed")).toBe("well groomed and happy");
    expect(conditionLabel("neglected")).not.toMatch(PL);
  });

  test("weekly challenges are English", () => {
    setLang("en");
    const now = WED_1540;
    const water = habit({ name: "Drink water", goal: COUNT }, 60, now);
    const food = habit({ name: "Fast food", kind: "avoid" }, 60, now);
    const seen = new Set<string>();
    for (let w = 0; w < 10; w++) {
      const at = new Date(now.getTime() - w * 7 * 86400000);
      for (const c of weeklyChallenges([water, food], [], {}, true, at)) {
        seen.add(c.id);
        expect(c.title).not.toMatch(PL);
        expect(c.detail).not.toMatch(PL);
        expect(c.title).not.toMatch(/\b(dni|tydzie\w*|Pobij|Czysty)\b/);
      }
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe("Polish stays Polish", () => {
  test("default language keeps the original lines", () => {
    setLang("pl");
    const teeth = make("Mycie zębów", "build");
    expect(nagLines(teeth, "hard", null).some((l) => /zęb|szczotecz/i.test(l))).toBe(true);
    expect(nagLines(teeth, "hard", null).some((l) => /teeth|brush/i.test(l))).toBe(false);
    expect(liveLines("hard", null).tiktok[0]).toContain("odpalasz TikToka");
    expect(liveLines("hard", null).generic.some((l) => l.includes("Hej, ty."))).toBe(true);
    expect(billLines("soft", null).good[0]).toContain("Czysta noc");
    expect(caughtLines("soft")[0]).toContain("zapisuję wpadkę");
    expect(pendingLabel(3)).toBe("3 zadania");
    expect(pendingLabel(5)).toBe("5 zadań");
    expect(unlockName(FACES[1])).toBe("Kujon");
    expect(kindLabel("mina")).toBe("mina");
    expect(conditionLabel("normal")).toBe("w normie");
    expect(humorLines("poeta").nag[0]).toContain("Litwo");
    const bets = habit({ name: "Hazard", kind: "avoid" }, 60);
    expect(memoryLines(bets, [], "soft", null)[0]).toMatch(/wpad/);
  });

  test("switching back and forth follows the language at call time", () => {
    const h = make("Picie wody", "build");
    setLang("en");
    const en = nagLines(h, "soft", null);
    setLang("pl");
    const pl = nagLines(h, "soft", null);
    expect(en.join(" ")).not.toMatch(PL);
    expect(pl.join(" ")).toMatch(/wod/);
  });
});
