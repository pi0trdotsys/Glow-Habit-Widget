import { afterEach, describe, expect, test } from "bun:test";
import { L, detectLang, getLang, pick, plPlural, plural, setLang } from "@/lib/i18n";
import { translateHabit, translateName, translateUnit } from "@/lib/habits/seed-names";
import { useHabits } from "@/lib/habits/store";
import { buildState } from "@/lib/widget/bridge";

afterEach(() => {
  useHabits.getState().setLanguage("pl");
  setLang("pl");
});

describe("i18n core", () => {
  test("L / pick follow the current language", () => {
    setLang("pl");
    expect(L("Zapisz", "Save")).toBe("Zapisz");
    setLang("en");
    expect(L("Zapisz", "Save")).toBe("Save");
    expect(pick([1], [2])).toEqual([2]);
  });

  test("plurals: Polish 1 / 2-4 / 5+ (12-14 many), English 1 / other", () => {
    const pl: [string, string, string] = ["zadanie", "zadania", "zadań"];
    expect([1, 2, 5, 12, 22, 25].map((n) => plPlural(n, pl))).toEqual([
      "zadanie",
      "zadania",
      "zadań",
      "zadań",
      "zadania",
      "zadań",
    ]);
    setLang("en");
    expect(plural(1, pl, ["task", "tasks"])).toBe("task");
    expect(plural(3, pl, ["task", "tasks"])).toBe("tasks");
  });

  test("language detection defaults to Polish without a browser language", () => {
    expect(["pl", "en"]).toContain(detectLang());
  });
});

describe("default habits follow the language", () => {
  test("seed names and units translate both ways; user names stay", () => {
    expect(translateName("Picie wody", "en")).toBe("Drink water");
    expect(translateName("Drink water", "pl")).toBe("Picie wody");
    expect(translateName("Mój nawyk", "en")).toBe("Mój nawyk");
    expect(translateUnit("szklanek", "en")).toBe("glasses");
    const h = translateHabit(
      {
        name: "Picie wody",
        icon: "GlassWater",
        color: "sky",
        schedule: { type: "daily" },
        goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
      },
      "en",
    );
    expect(h.name).toBe("Drink water");
    expect(h.goal?.unit).toBe("glasses");
  });

  test("switching the language renames default habits, keeps ids/history and reaches native", () => {
    const s = useHabits.getState();
    const keep = { habits: s.habits, completions: s.completions };
    const id = s.addHabit({
      name: "Picie wody",
      icon: "GlassWater",
      color: "sky",
      schedule: { type: "daily" },
      goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
    });
    const own = s.addHabit({
      name: "Gitara",
      icon: "Guitar",
      color: "amber",
      schedule: { type: "daily" },
    });
    s.setLanguage("en");
    expect(getLang()).toBe("en");
    const after = useHabits.getState().habits;
    expect(after.find((h) => h.id === id)?.name).toBe("Drink water");
    expect(after.find((h) => h.id === own)?.name).toBe("Gitara");
    expect(buildState().lang).toBe("en");
    expect(JSON.parse(useHabits.getState().exportData()).language).toBe("en");
    useHabits.getState().setLanguage("pl");
    expect(useHabits.getState().habits.find((h) => h.id === id)?.name).toBe("Picie wody");
    useHabits.setState(keep);
  });
});
