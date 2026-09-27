import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  allDoneLines,
  caughtLines,
  escalationTier,
  eveningLines,
  nagLines,
  praiseFor,
  rageLines,
  slipFor,
  szpilaNow,
  SZPILA_EMOJI,
} from "@/lib/habits/szpila";
import { MOTIVATE } from "@/lib/habits/szpila-more";
import { planDay } from "@/lib/habits/utils";
import type { Habit } from "@/lib/habits/types";
import { WED_1540, habit } from "./helpers";

const SWEAR = /kurw|chuj|pierdol|jeb|spierdal|dup[ay]|gówn|pizd/i;

/** name, kind, a word that only that category's lines contain */
const CATEGORIES: [string, "build" | "avoid", RegExp][] = [
  ["Mycie zębów", "build", /zęb|szczotecz|próchnic/i],
  ["Picie wody", "build", /wod|pij|nawodn/i],
  ["8000 kroków", "build", /krok|spacer|nog/i],
  ["Czytanie książki", "build", /książ|czyt|stron/i],
  ["Siłownia", "build", /trening|mięś|hantl/i],
  ["Medytacja", "build", /medyt|oddech|cisz|zen/i],
  ["Programuj", "build", /kod|edytor|commit|repo/i],
  ["Ucz się języka obcego", "build", /języ|słówk|Duolingo/i],
  ["Scrollowanie w łóżku", "avoid", /telefon|scroll|łóżk|ekran/i],
  ["Fast food", "avoid", /fast food|burger|frytk/i],
  ["Słodycze", "avoid", /słodycz|cukier|czekolad/i],
  ["Alkohol", "avoid", /trzeźw|procent|browar|wątrob/i],
  ["Papierosy", "avoid", /fajk|dym|płuc/i],
  ["Oglądanie pornografii", "avoid", /porno|incognito/i],
  ["Pomijanie posiłków", "avoid", /posiłk|jedzeni/i],
  ["Impulsywne wydawanie", "avoid", /zakup|portfel|koszyk|wydawani/i],
  ["Hazard", "avoid", /hazard|zakład|kasyn/i],
  ["Nie bądź zboczeńcem", "avoid", /zboczeń/i],
  ["Drzemka budzika", "avoid", /drzemk|budzik/i],
];

describe("Szpila picks lines for the right habit", () => {
  for (const [name, kind, re] of CATEGORIES) {
    test(`${name}: own lines, hard + soft`, () => {
      const h = habit({ name, kind, icon: "Star" });
      expect(nagLines(h, "hard", null).some((l) => re.test(l))).toBe(true);
      expect(nagLines(h, "soft", null).length).toBeGreaterThan(0);
      expect(praiseFor(h, "hard", null).length).toBeGreaterThan(0);
      if (kind === "avoid") expect(slipFor(h, "hard", null).length).toBeGreaterThan(0);
      expect(rageLines(h, "hard", null).length).toBeGreaterThan(0);
    });
  }

  test("the motivating pool reaches every habit (build vs avoid), plus motivating rage for build", () => {
    const build = habit({ name: "Programuj", icon: "Code" });
    const avoid = habit({ name: "Hazard", kind: "avoid", icon: "Dice5" });
    const resolved = (l: string, h: Habit) => l.replaceAll("{name}", h.name);
    expect(nagLines(build, "hard", null)).toContain(resolved(MOTIVATE.build[0], build));
    expect(nagLines(avoid, "hard", null)).toContain(resolved(MOTIVATE.avoid[0], avoid));
    expect(nagLines(avoid, "hard", null)).not.toContain(resolved(MOTIVATE.build[0], avoid));
    expect(rageLines(build, "hard", null)).toContain(resolved(MOTIVATE.rage[0], build));
    expect(rageLines(avoid, "hard", null)).not.toContain(resolved(MOTIVATE.rage[0], avoid));
  });
});

describe("tone and form", () => {
  test("soft level never swears", () => {
    for (const [name, kind] of CATEGORIES) {
      const h = habit({ name, kind, icon: "Star" });
      for (const l of [...nagLines(h, "soft", null), ...rageLines(h, "soft", null)])
        expect(l).not.toMatch(SWEAR);
    }
    for (const l of [...allDoneLines("soft"), ...eveningLines("soft"), ...caughtLines("soft")])
      expect(l).not.toMatch(SWEAR);
  });

  test("hard level has plenty to say", () => {
    const water = habit({
      name: "Picie wody",
      goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
    });
    expect(nagLines(water, "hard", null).length).toBeGreaterThanOrEqual(25);
    expect(
      nagLines(water, "hard", null).filter((l) => SWEAR.test(l)).length,
    ).toBeGreaterThanOrEqual(10);
  });

  test("no gendered past tense about the user anywhere (works for everyone)", () => {
    const files = ["szpila.ts", "szpila-more.ts", "szpila-extra.ts"].map((f) =>
      readFileSync(new URL(`../src/lib/habits/${f}`, import.meta.url), "utf8"),
    );
    // "zrobiłeś / zrobiłaś / byłeś / byłaś" style forms inside string literals
    // Unicode-aware word edges: JS \b doesn't know Polish letters ("właśnie" is not "...łaś").
    const offenders = files.flatMap(
      (src) => src.match(/"[^"\n]*(?<!\p{L})\p{L}+(łeś|łaś)(?!\p{L})[^"\n]*"/gu) ?? [],
    );
    expect(offenders).toEqual([]);
  });

  test("the cat emoji set", () => {
    expect(SZPILA_EMOJI).toEqual({ normal: "😼", angry: "😾", impressed: "😸" });
  });
});

describe("what Szpila says right now", () => {
  test("never leaks placeholders, escalates when overdue", () => {
    const water = habit(
      { name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } },
      30,
      WED_1540,
    );
    const teeth = habit({ name: "Mycie zębów" }, 30, WED_1540);
    const plan = planDay([water, teeth], [], WED_1540);
    for (let seed = 0; seed < 40; seed++) {
      const say = szpilaNow([water, teeth], [], plan, "hard", "Ola", seed);
      expect(say.text).not.toMatch(/\{(name|done|left|target|u|pending)\}/);
      expect(say.text.length).toBeGreaterThan(10);
    }
    expect(escalationTier(0, 0)).toBe(0);
    expect(escalationTier(200, 0)).toBe(1);
    expect(escalationTier(0, 3)).toBe(1);
  });

  test("nothing left -> grudging praise", () => {
    const h = habit({ name: "Czytanie" }, 30, WED_1540);
    expect(szpilaNow([h], [], [], "hard", null, 1).mood).toBe("impressed");
  });
});
