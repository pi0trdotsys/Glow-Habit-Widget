import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { addDays } from "date-fns";
import { buildState } from "@/lib/widget/bridge";
import { useHabits } from "@/lib/habits/store";
import { isDiscreet, looksSensitive } from "@/lib/habits/discreet";
import { entry, habit } from "./helpers";

describe("dyskretne: what counts as sensitive", () => {
  test("names generally kept private are caught (PL + EN, any case, diacritics)", () => {
    for (const n of [
      "Pornografia",
      "porno",
      "Masturbacja",
      "Alkohol",
      "Piwo w tygodniu",
      "Wódka",
      "Papierosy",
      "E-papieros",
      "Zioło",
      "Hazard",
      "Zakłady bukmacherskie",
      "Kasyno online",
      "Porn",
      "Beer",
      "Gambling",
      "Vape",
    ])
      expect(looksSensitive(n)).toBe(true);
  });

  test("everyday forbidden habits are not", () => {
    for (const n of [
      "Fast food",
      "Słodycze",
      "Scrollowanie w łóżku",
      "Drugie śniadanie",
      "Kawa po 16:00",
      "Energetyki",
      "Seriale do nocy",
      "Zakupy impulsywne",
    ])
      expect(looksSensitive(n)).toBe(false);
  });

  test("automatic for sensitive avoid habits, the switch always wins, never for build habits", () => {
    const porn = habit({ name: "Pornografia", kind: "avoid" });
    expect(isDiscreet(porn)).toBe(true);
    expect(isDiscreet({ ...porn, discreet: false })).toBe(false);
    expect(isDiscreet(habit({ name: "Fast food", kind: "avoid", discreet: true }))).toBe(true);
    expect(isDiscreet(habit({ name: "Fast food", kind: "avoid" }))).toBe(false);
    expect(isDiscreet(habit({ name: "Piwo", discreet: true }))).toBe(false); // build
  });
});

describe("dyskretne: the native snapshot never names them", () => {
  afterEach(() => setSystemTime());
  const today = new Date();
  const water = habit({ name: "Picie wody", goal: { type: "count", target: 8, step: 1 } }, 30);
  const porn = habit({ name: "Pornografia", kind: "avoid" }, 30);
  const food = habit({ name: "Fast food", kind: "avoid", discreet: true }, 30);
  const sweets = habit({ name: "Słodycze", kind: "avoid" }, 30);

  beforeEach(() => {
    useHabits.setState({
      habits: [water, porn, food, sweets],
      completions: [
        entry(water, today, { amount: 2 }),
        entry(porn, addDays(today, -3), { slipped: true }),
      ],
      seeded: true,
      userName: "Ola",
    });
  });

  test("rows: stand-in name, no lines, flagged; the real name is nowhere in the snapshot", () => {
    const s = buildState();
    const json = JSON.stringify(s);
    expect(json).not.toContain("Pornografia");
    expect(json).not.toContain("Fast food");
    expect(json).toContain("Słodycze"); // ordinary forbidden habits stay as they were
    for (const id of [porn.id, food.id]) {
      const r = s.habits.find((x) => x.id === id)!;
      expect(r).toMatchObject({ kind: "avoid", discreet: true, nag: [], rage: [], memory: [] });
      expect(r.name).not.toBe(porn.name);
    }
    expect(s.habits.find((x) => x.id === sweets.id)).not.toHaveProperty("discreet");
  });

  test("yesterday's open items keep the flag (morning review counts them, never names them)", () => {
    setSystemTime(new Date(2026, 10, 17, 9, 0)); // morning: yesterday is still open until noon
    const s = buildState();
    const it = s.yesterday.items.find((x) => x.id === porn.id)!;
    expect(it).toMatchObject({ discreet: true });
    expect(it.name).not.toContain("Porn");
    expect(s.yesterday.items.find((x) => x.id === sweets.id)).not.toHaveProperty("discreet");
  });
});
