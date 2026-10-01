import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { readFileSync } from "node:fs";
import { setLang } from "@/lib/i18n";
import {
  CTX_CHANCE,
  CTX_KEYS,
  CTX_RULES,
  categoryOf,
  contextLines,
  contextOf,
  contextPools,
  contextRule,
  fill,
  nagLines,
  praiseLines,
  rageLines,
  setHumor,
  slipLines,
  szpilaNow,
  type Category,
  type Ctx,
} from "@/lib/habits/szpila";
import { MOTIVATE } from "@/lib/habits/szpila-more";
import * as PL27 from "@/lib/habits/szpila-27";
import * as EN27 from "@/lib/habits/szpila-en-27";
import { HARD_27X, SOFT_27X } from "@/lib/habits/szpila-27-extra";
import { HARD_27X_EN, SOFT_27X_EN } from "@/lib/habits/szpila-en-27-extra";
import { CTX_HARD, CTX_SOFT } from "@/lib/habits/szpila-ctx";
import { CTX_HARD_EN, CTX_SOFT_EN } from "@/lib/habits/szpila-en-ctx";
import { EN_T } from "@/lib/habits/szpila-en-tables";

const motivateOf = (lang: "pl" | "en") => {
  const m = lang === "pl" ? MOTIVATE : EN_T.MOTIVATE;
  const x = lang === "pl" ? PL27.MOTIVATE_27 : EN_T.M27;
  return {
    nag: new Set([...m.build, ...m.avoid, ...x.build, ...x.avoid]),
    rage: new Set([...m.rage, ...x.rage]),
    praise: new Set([...m.praise, ...x.praise]),
  };
};
import { NAME_PAIRS } from "@/lib/habits/seed-names";
import { planDay } from "@/lib/habits/utils";
import type { Habit } from "@/lib/habits/types";
import { WED_1540, entry, habit } from "./helpers";

const SWEAR_PL = /kurw|chuj|pierdol|jeb|spierdal|dup[ay]|gówn|pizd/i;
const SWEAR_EN =
  /\b(fuck\w*|shit\w*|damn\w*|ass|asses|arse|dumbass|jackass|bitch\w*|crap\w*|bastards?|piss\w*|hell|dick\w*|bullshit\w*|screw\w*)\b/i;
const PL_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ„]/;
const AMOUNTS = /\{(done|left|target)\}/;
const PH = /\{\w+\}/g;
const ph = (l: string) => [...new Set(l.match(PH) ?? [])].sort().join(",");

afterEach(() => {
  setLang("pl");
  setHumor("wredny");
  setSystemTime();
});

const at = (h: number, m = 0) => h * 60 + m;
const COUNT = (target: number, unit = "szklanek") => ({
  type: "count" as const,
  target,
  step: 1,
  unit,
});

/** The user's habits (seed icons included), with goals like in the app. */
const MINE: { name: string; en: string; icon: string; kind: "build" | "avoid"; cat: Category }[] = [
  { name: "Mycie zębów", en: "Brush teeth", icon: "Tooth", kind: "build", cat: "teeth" },
  { name: "Picie wody", en: "Drink water", icon: "GlassWater", kind: "build", cat: "water" },
  { name: "8000 kroków", en: "8000 steps", icon: "Footprints", kind: "build", cat: "steps" },
  { name: "Czytanie książki", en: "Read a book", icon: "BookOpen", kind: "build", cat: "reading" },
  { name: "Programuj", en: "Code", icon: "Code", kind: "build", cat: "coding" },
  {
    name: "Ucz się języka obcego",
    en: "Learn a language",
    icon: "Languages",
    kind: "build",
    cat: "language",
  },
  {
    name: "Scrollowanie w łóżku",
    en: "Scrolling in bed",
    icon: "Smartphone",
    kind: "avoid",
    cat: "phone",
  },
  { name: "Fast food", en: "Fast food", icon: "Utensils", kind: "avoid", cat: "fastfood" },
  {
    name: "Oglądanie pornografii",
    en: "Watching porn",
    icon: "EyeOff",
    kind: "avoid",
    cat: "porn",
  },
  {
    name: "Impulsywne wydawanie",
    en: "Impulse spending",
    icon: "ShoppingCart",
    kind: "avoid",
    cat: "shopping",
  },
  {
    name: "Nie bądź zboczeńcem",
    en: "Don't be a perv",
    icon: "Ban",
    kind: "avoid",
    cat: "pervert",
  },
  {
    name: "Pomijanie posiłków",
    en: "Skipping meals",
    icon: "UtensilsCrossed",
    kind: "avoid",
    cat: "meals",
  },
];
const MINE_CATS = new Set(MINE.map((m) => m.cat));

/** One sample habit per category (counted goals for build habits, so amounts stay in). */
const SAMPLES: [Category, string, "build" | "avoid"][] = [
  ["teeth", "Mycie zębów", "build"],
  ["water", "Picie wody", "build"],
  ["steps", "8000 kroków", "build"],
  ["reading", "Czytanie książki", "build"],
  ["gym", "Siłownia", "build"],
  ["meditation", "Medytacja", "build"],
  ["sleep", "Sen przed 23:00", "build"],
  ["pills", "Witaminy", "build"],
  ["learning", "Nauka", "build"],
  ["generic", "Dziennik", "build"],
  ["coding", "Programuj", "build"],
  ["language", "Ucz się języka obcego", "build"],
  ["phone", "Scrollowanie w łóżku", "avoid"],
  ["fastfood", "Fast food", "avoid"],
  ["sweets", "Słodycze", "avoid"],
  ["alcohol", "Alkohol", "avoid"],
  ["smoking", "Papierosy", "avoid"],
  ["games", "Granie na konsoli", "avoid"],
  ["social", "Rolki na TikToku", "avoid"],
  ["avoidGeneric", "Obgadywanie ludzi", "avoid"],
  ["pervert", "Nie bądź zboczeńcem", "avoid"],
  ["porn", "Oglądanie pornografii", "avoid"],
  ["meals", "Pomijanie posiłków", "avoid"],
  ["energy", "Energetyki", "avoid"],
  ["shopping", "Impulsywne wydawanie", "avoid"],
  ["gambling", "Hazard", "avoid"],
  ["binge", "Seriale do nocy", "avoid"],
  ["snooze", "Drzemka po budziku", "avoid"],
  ["nails", "Obgryzanie paznokci", "avoid"],
  ["caffeine", "Za dużo kawy", "avoid"],
  ["procrastination", "Prokrastynacja", "avoid"],
];

const sample = (name: string, kind: "build" | "avoid", counted = true): Habit =>
  habit({
    name,
    kind,
    icon: "Star",
    ...(kind === "build" && counted ? { goal: COUNT(8, "razy") } : {}),
  });

describe("category detection for the user's habits", () => {
  test("Polish and English names, with and without the seed icons", () => {
    for (const m of MINE) {
      for (const icon of [m.icon, "Star"]) {
        for (const name of [m.name, m.en]) {
          const h = habit({ name, icon, kind: m.kind });
          expect(`${name} [${icon}]: ${categoryOf(h)}`).toBe(`${name} [${icon}]: ${m.cat}`);
        }
      }
    }
  });

  test("the samples used below really land in their categories", () => {
    for (const [cat, name, kind] of SAMPLES)
      expect(`${name}: ${categoryOf(sample(name, kind))}`).toBe(`${name}: ${cat}`);
    // every seed/template name pair is detected the same way (sanity for the user's list)
    const names = new Set(NAME_PAIRS.map((p) => p[0]));
    for (const m of MINE) expect(names.has(m.name)).toBe(true);
  });
});

describe("volume (hard level)", () => {
  const own = (lines: string[], h: Habit, skip: Set<string>) =>
    new Set(lines.filter((l) => ![...skip].some((s) => s.replaceAll("{name}", h.name) === l)));

  for (const lang of ["pl", "en"] as const) {
    test(`${lang}: every category has >=20 own nags, >=8 praise, >=8 rage, >=8 slips; mine ~30 nags`, () => {
      setLang(lang);
      const mot = motivateOf(lang);
      for (const [cat, name, kind] of SAMPLES) {
        const h = sample(name, kind);
        const nag = own(nagLines(h, "hard", null), h, mot.nag);
        const rage = own(rageLines(h, "hard", null), h, mot.rage);
        const praise = own(praiseLines(h, "hard", null), h, mot.praise);
        const min = MINE_CATS.has(cat) ? 28 : 20;
        expect(`${cat} nag ${nag.size >= min}`).toBe(`${cat} nag true`);
        expect(`${cat} praise ${praise.size >= 8}`).toBe(`${cat} praise true`);
        expect(`${cat} rage ${rage.size >= 8}`).toBe(`${cat} rage true`);
        if (kind === "avoid")
          expect(`${cat} slip ${new Set(slipLines(h, "hard", null)).size >= 8}`).toBe(
            `${cat} slip true`,
          );
        // the hard pools actually bite
        expect(
          [...nag].filter((l) => (lang === "pl" ? SWEAR_PL : SWEAR_EN).test(l)).length,
        ).toBeGreaterThan(4);
      }
    });
  }

  test("soft level grew too, and stays polite (both languages)", () => {
    for (const lang of ["pl", "en"] as const) {
      setLang(lang);
      const swear = lang === "pl" ? SWEAR_PL : SWEAR_EN;
      for (const [cat, name, kind] of SAMPLES) {
        const h = sample(name, kind);
        const soft = [
          ...nagLines(h, "soft", null),
          ...rageLines(h, "soft", null),
          ...praiseLines(h, "soft", null),
          ...(kind === "avoid" ? slipLines(h, "soft", null) : []),
          ...CTX_KEYS.flatMap((k) => contextLines(h, "soft", null, k)),
        ];
        expect(`${cat}: ${nagLines(h, "soft", null).length >= 2}`).toBe(`${cat}: true`);
        for (const l of soft) expect(`${cat}: ${l}`).not.toMatch(swear);
      }
    }
  });
});

describe("PL/EN parity of the 2.7 banks", () => {
  type Pools = Record<string, string[] | undefined>;
  const same = (label: string, pl: Record<string, Pools>, en: Record<string, Pools>) => {
    expect(`${label}: ${Object.keys(en).sort()}`).toBe(`${label}: ${Object.keys(pl).sort()}`);
    for (const cat of Object.keys(pl)) {
      expect(`${label}.${cat}: ${Object.keys(en[cat]).sort()}`).toBe(
        `${label}.${cat}: ${Object.keys(pl[cat]).sort()}`,
      );
      for (const [pool, lines] of Object.entries(pl[cat])) {
        const other = en[cat][pool] ?? [];
        expect(`${label}.${cat}.${pool}: ${other.length}`).toBe(
          `${label}.${cat}.${pool}: ${lines!.length}`,
        );
        lines!.forEach((l, i) =>
          expect(`${label}.${cat}.${pool}[${i}] ${ph(other[i] ?? "")}`).toBe(
            `${label}.${cat}.${pool}[${i}] ${ph(l)}`,
          ),
        );
      }
    }
  };

  test("same keys, same number of lines, same placeholders line by line", () => {
    same("HARD_27", PL27.HARD_27 as never, EN27.HARD_27_EN as never);
    same("SOFT_27", PL27.SOFT_27 as never, EN27.SOFT_27_EN as never);
    same("HARD_27X", HARD_27X as never, HARD_27X_EN as never);
    same("SOFT_27X", SOFT_27X as never, SOFT_27X_EN as never);
    same("CTX_HARD", CTX_HARD as never, CTX_HARD_EN as never);
    same("CTX_SOFT", CTX_SOFT as never, CTX_SOFT_EN as never);
    same(
      "misc",
      {
        ALL_DONE: PL27.ALL_DONE_27,
        EVENING: PL27.EVENING_27,
        CAUGHT: PL27.CAUGHT_27,
        CAUGHT_SOCIAL: PL27.CAUGHT_SOCIAL_27,
        MOTIVATE: PL27.MOTIVATE_27,
        RAGE_SOFT: { all: PL27.RAGE_SOFT_27 },
      },
      {
        ALL_DONE: EN27.ALL_DONE_27_EN,
        EVENING: EN27.EVENING_27_EN,
        CAUGHT: EN27.CAUGHT_27_EN,
        CAUGHT_SOCIAL: EN27.CAUGHT_SOCIAL_27_EN,
        MOTIVATE: EN27.MOTIVATE_27_EN,
        RAGE_SOFT: { all: EN27.RAGE_SOFT_27_EN },
      },
    );
    // the lazily loaded English table carries the same pools
    expect(Object.keys(EN_T.X27).length).toBe(Object.keys({ ...PL27.HARD_27, ...HARD_27X }).length);
  });

  test("English banks have no Polish letters", () => {
    const all = JSON.stringify([
      EN27.HARD_27_EN,
      EN27.SOFT_27_EN,
      EN27.ALL_DONE_27_EN,
      EN27.EVENING_27_EN,
      EN27.CAUGHT_27_EN,
      EN27.CAUGHT_SOCIAL_27_EN,
      EN27.MOTIVATE_27_EN,
      EN27.RAGE_SOFT_27_EN,
      HARD_27X_EN,
      SOFT_27X_EN,
      CTX_HARD_EN,
      CTX_SOFT_EN,
    ]);
    expect(all).not.toMatch(PL_LETTERS);
  });
});

describe("form and placeholders", () => {
  const SRC = ["szpila-27.ts", "szpila-27-extra.ts", "szpila-ctx.ts"].map((f) =>
    readFileSync(new URL(`../src/lib/habits/${f}`, import.meta.url), "utf8"),
  );
  const OTHER = ["live.ts", "day-guard.ts", "night.ts", "habits/gamification.ts"].map((f) =>
    readFileSync(new URL(`../src/lib/${f}`, import.meta.url), "utf8"),
  );

  test("no gendered past tense / conditional about the user in Polish lines", () => {
    const offenders = [...SRC, ...OTHER].flatMap(
      (src) => src.match(/"[^"\n]*(?<!\p{L})\p{L}+(łeś|łaś|łbyś|łabyś)(?!\p{L})[^"\n]*"/gu) ?? [],
    );
    expect(offenders).toEqual([]);
    // "będziesz wyglądał(a)" style futures - use "będziesz wyglądać"
    const futures = SRC.flatMap((src) => src.match(/będziesz \p{L}+ła?(?!\p{L})/gu) ?? []);
    expect(futures).toEqual([]);
  });

  const known = /\{(name|u|done|left|target)\}/g;
  const tables: [string, Record<string, Record<string, string[] | undefined>>][] = [
    ["HARD_27", PL27.HARD_27 as never],
    ["HARD_27X", HARD_27X as never],
    ["SOFT_27", PL27.SOFT_27 as never],
    ["SOFT_27X", SOFT_27X as never],
    ["CTX_HARD", CTX_HARD as never],
    ["CTX_SOFT", CTX_SOFT as never],
    ["HARD_27_EN", EN27.HARD_27_EN as never],
    ["HARD_27X_EN", HARD_27X_EN as never],
    ["CTX_HARD_EN", CTX_HARD_EN as never],
  ];
  const avoidCats = new Set(SAMPLES.filter((s) => s[2] === "avoid").map((s) => s[0]));

  test("habit pools only use {name} {u} and amounts where the pool allows them", () => {
    for (const [label, table] of tables)
      for (const [cat, pools] of Object.entries(table))
        for (const [pool, lines] of Object.entries(pools))
          for (const l of lines ?? []) {
            const where = `${label}.${cat}.${pool}: ${l}`;
            expect(where.replace(known, "")).not.toMatch(/\{\w+\}/);
            if (avoidCats.has(cat as Category) || pool === "praise" || pool === "slip")
              expect(where).not.toMatch(AMOUNTS);
          }
  });

  test("evening / caught / all-done additions keep their pool's placeholders", () => {
    for (const [ev, caught, social, done] of [
      [PL27.EVENING_27, PL27.CAUGHT_27, PL27.CAUGHT_SOCIAL_27, PL27.ALL_DONE_27],
      [EN27.EVENING_27_EN, EN27.CAUGHT_27_EN, EN27.CAUGHT_SOCIAL_27_EN, EN27.ALL_DONE_27_EN],
    ])
      for (const level of ["hard", "soft"] as const) {
        expect(ev[level].every((l) => l.includes("{pending}"))).toBe(true);
        for (const l of [...caught[level], ...social[level]])
          expect(l.includes("{m}") && l.includes("{after}")).toBe(true);
        expect(social[level].every((l) => /social/i.test(l))).toBe(true);
        expect(caught[level].some((l) => /social/i.test(l))).toBe(false);
        expect(done[level].some((l) => /\{\w+\}/.test(l))).toBe(false);
      }
  });

  test("single-check habits never get amount placeholders, context pools included", () => {
    for (const lang of ["pl", "en"] as const) {
      setLang(lang);
      for (const [, name, kind] of SAMPLES) {
        const h = sample(name, kind, false);
        const all = [
          ...nagLines(h, "hard", null),
          ...rageLines(h, "hard", null),
          ...CTX_KEYS.flatMap((k) => contextLines(h, "hard", null, k)),
        ];
        for (const l of all) expect(l).not.toMatch(AMOUNTS);
      }
    }
  });
});

describe("context-aware lines", () => {
  /** Same vectors as android/.../HabitContextTest.java. */
  const VECTORS: [boolean, number, number, number, Ctx | null][] = [
    [false, 0, 4, at(8), "morning"],
    [false, 0, 4, at(4, 59), null],
    [false, 0, 4, at(11), null],
    [false, 0, 4, at(13, 59), null],
    [false, 0, 4, at(14), "zero"],
    [false, 0, 4, at(18, 59), "zero"],
    [false, 0, 4, at(19), "late"],
    [false, 3, 4, at(15), "almost"],
    [false, 3, 4, at(9), "almost"],
    [false, 3, 4, at(20), "almost"],
    [false, 1, 2, at(20), "late"],
    [false, 1, 2, at(15), null],
    [false, 1, 2, at(8), null],
    [false, 5600, 8000, at(16), "almost"],
    [false, 5599, 8000, at(16), null],
    [false, 4, 4, at(20), null],
    [false, 9, 4, at(15), null],
    [false, 0, 1, at(20), "late"],
    [false, 0, 1, at(15), "zero"],
    [false, 0, 30, at(10, 59), "morning"],
    [true, 0, 1, at(8), "morning"],
    [true, 0, 1, at(12), null],
    [true, 0, 1, at(19, 30), "late"],
    [true, 0, 1, at(3), null],
  ];

  test("the rule (mirrored by HabitNotifier.contextOf)", () => {
    for (const [avoid, amount, target, now, want] of VECTORS)
      expect(
        `${avoid} ${amount}/${target} @${now}: ${contextRule(avoid, amount, target, now)}`,
      ).toBe(`${avoid} ${amount}/${target} @${now}: ${want}`);
    const water = habit({ name: "Picie wody", goal: COUNT(4) });
    const food = habit({ name: "Fast food", kind: "avoid" });
    expect(contextOf(water, 0, at(15))).toBe("zero");
    expect(contextOf(water, 3, at(15))).toBe("almost");
    expect(contextOf(water, 4, at(21))).toBeNull();
    expect(contextOf(food, 0, at(20))).toBe("late");
    expect(contextOf(food, 0, at(15))).toBeNull();
  });

  test("Java uses the same thresholds and chances", () => {
    const java = readFileSync(
      new URL(
        "../android/app/src/main/java/app/lovable/glow_habit_widget/HabitNotifier.java",
        import.meta.url,
      ),
      "utf8",
    );
    const num = (name: string) => {
      const m = java.match(new RegExp(`${name} = ([0-9 *]+);`));
      expect(m).not.toBeNull();
      return m![1].split("*").reduce((a, b) => a * Number(b.trim()), 1);
    };
    expect(num("CTX_MORNING_FROM")).toBe(CTX_RULES.morningFrom);
    expect(num("CTX_MORNING_UNTIL")).toBe(CTX_RULES.morningUntil);
    expect(num("CTX_ZERO_FROM")).toBe(CTX_RULES.zeroFrom);
    expect(num("CTX_LATE_FROM")).toBe(CTX_RULES.lateFrom);
    expect(num("CTX_ALMOST_PCT")).toBe(CTX_RULES.almostPct);
    expect(num("CTX_CHANCE")).toBe(CTX_CHANCE.normal);
    expect(num("CTX_CHANCE_RAGE")).toBe(CTX_CHANCE.rage);
  });

  test("every one of the user's habits has lines for each of its situations, in both languages", () => {
    for (const lang of ["pl", "en"] as const) {
      setLang(lang);
      for (const m of MINE) {
        const h = habit({
          name: lang === "pl" ? m.name : m.en,
          icon: m.icon,
          kind: m.kind,
          ...(m.kind === "build" ? { goal: COUNT(4) } : {}),
        });
        const keys: Ctx[] = m.kind === "build" ? CTX_KEYS : ["late", "morning"];
        const pools = contextPools(h, "hard", "Ola");
        for (const k of keys) {
          expect(`${m.name} ${k}: ${pools[k].length > 2}`).toBe(`${m.name} ${k}: true`);
          for (const l of pools[k]) {
            expect(l).not.toMatch(/\{(name|u)\}/);
            if (lang === "en") expect(l).not.toMatch(PL_LETTERS);
          }
        }
        if (m.kind === "avoid") expect(pools.zero.length + pools.almost.length).toBe(0);
      }
    }
  });

  test("category lines come first, generic fallback is mixed in", () => {
    const water = habit({ name: "Picie wody", goal: COUNT(4) });
    const lines = contextLines(water, "hard", null, "almost");
    expect(lines.some((l) => /wod|szklan|nawodn|kubek|butelka|nerki/i.test(l))).toBe(true);
    expect(lines.some((l) => l.includes("„Picie wody”"))).toBe(true); // generic ones name the habit
    expect(fill(lines[0], water, 3)).not.toMatch(/\{\w+\}/);
  });

  test("Szpila on the Today screen mixes in the situation lines", () => {
    setSystemTime(WED_1540);
    const water = habit({ name: "Picie wody", goal: COUNT(4) }, 30, WED_1540);
    const completions = [entry(water, WED_1540, { amount: 3 })];
    const plan = planDay([water], completions, WED_1540);
    expect(plan[0]?.amount).toBe(3);
    const almost = new Set(
      contextLines(water, "hard", "Ola", "almost").map((l) => fill(l, water, 3)),
    );
    let hits = 0;
    for (let seed = 0; seed < 60; seed++) {
      const say = szpilaNow([water], completions, plan, "hard", "Ola", seed);
      expect(say.text).not.toMatch(/\{\w+\}/);
      if (almost.has(say.text)) hits++;
    }
    expect(hits).toBeGreaterThan(5);
    expect(hits).toBeLessThan(60);
  });
});

describe("widget snapshot carries the context pools (HabitNotifier.lineFor)", () => {
  test("every row has ctx.{zero,almost,late,morning}, placeholders left for native fill", async () => {
    const { buildState } = await import("@/lib/widget/bridge");
    const { useHabits } = await import("@/lib/habits/store");
    const today = new Date();
    const water = habit({ name: "Picie wody", icon: "GlassWater", goal: COUNT(4) }, 10, today);
    const food = habit({ name: "Fast food", icon: "Utensils", kind: "avoid" }, 10, today);
    const keep = useHabits.getState();
    useHabits.setState({ habits: [water, food], completions: [], seeded: true, userName: "Ola" });
    try {
      const rows = buildState().habits;
      const w = rows.find((r) => r.id === water.id)!;
      const f = rows.find((r) => r.id === food.id)!;
      expect(Object.keys(w.ctx).sort()).toEqual(["almost", "late", "morning", "zero"]);
      expect(w.ctx.almost.some((l) => l.includes("{left}"))).toBe(true);
      expect(w.ctx.zero.join(" ")).not.toContain("{name}");
      expect(f.ctx.late.length).toBeGreaterThan(0);
      expect(f.ctx.zero).toEqual([]);
    } finally {
      useHabits.setState(keep);
    }
  });
});
