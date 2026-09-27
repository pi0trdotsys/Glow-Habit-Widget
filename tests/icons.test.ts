import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HABIT_ICONS } from "@/lib/habits/colors";
import { LUCIDE_HABIT_ICONS } from "@/components/habit-icons";

/** Every `icon: "X"` literal in the app source (templates, seeds, migrations). */
function iconLiterals(dir: string, out = new Set<string>()): Set<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) iconLiterals(p, out);
    else if (/\.tsx?$/.test(e.name))
      for (const m of readFileSync(p, "utf8").matchAll(/icon: "([A-Za-z0-9]+)"/g)) out.add(m[1]);
  }
  return out;
}

describe("habit icons", () => {
  test("every pickable icon renders (explicit lucide map + custom Tooth)", () => {
    for (const name of HABIT_ICONS)
      expect(name === "Tooth" || name in LUCIDE_HABIT_ICONS).toBe(true);
  });

  test("every icon used by templates/seeds is pickable", () => {
    for (const name of iconLiterals("src"))
      expect(HABIT_ICONS as readonly string[]).toContain(name);
  });
});
