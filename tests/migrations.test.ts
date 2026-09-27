import { describe, expect, test } from "bun:test";
import { useHabits } from "@/lib/habits/store";
import type { Completion, Habit } from "@/lib/habits/types";

type Migrate = (state: unknown, version: number) => { habits: Habit[]; completions: Completion[] };
const migrate = useHabits.persist.getOptions().migrate as unknown as Migrate;

const base = (name: string, extra: Partial<Habit> = {}): Habit => ({
  id: name,
  name,
  icon: "Star",
  color: "mint",
  schedule: { type: "daily" },
  createdAt: "2026-06-01T10:00:00.000Z",
  ...extra,
});

describe("persisted data migrations", () => {
  test("v1 -> English seed habits become Polish with goals; done entries become full amounts", () => {
    const out = migrate(
      {
        habits: [base("Drink water", { icon: "Droplet" }), base("No junk food"), base("Custom")],
        completions: [{ habitId: "Drink water", date: "2026-06-02" }],
      },
      1,
    );
    const names = out.habits.map((h) => h.name);
    expect(names).toContain("Picie wody");
    expect(names).toContain("Fast food");
    expect(names).toContain("Custom");
    expect(out.habits.find((h) => h.name === "Fast food")!.kind).toBe("avoid");
    expect(out.completions[0].amount).toBe(8);
  });

  test("v2 -> 'Telefon do późna' becomes scrolling in bed; coding + language are added once", () => {
    const out = migrate(
      { habits: [base("Telefon do późna", { icon: "Phone", kind: "avoid" })], completions: [] },
      2,
    );
    const names = out.habits.map((h) => h.name);
    expect(names).toContain("Scrollowanie w łóżku");
    expect(out.habits.find((h) => h.name === "Scrollowanie w łóżku")!.icon).toBe("Smartphone");
    expect(names).toContain("Programuj");
    expect(names).toContain("Ucz się języka obcego");
    // already tracking something similar -> not duplicated
    const again = migrate(
      { habits: [base("Nauka angielskiego"), base("Programowanie")], completions: [] },
      2,
    );
    expect(again.habits).toHaveLength(2);
  });

  test("current-version data passes through untouched", () => {
    const state = { habits: [base("Woda")], completions: [] };
    expect(migrate(state, 3)).toEqual(state);
  });
});
