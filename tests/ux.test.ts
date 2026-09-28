import { afterEach, describe, expect, test } from "bun:test";
import { useHabits, UNDO_DEPTH } from "@/lib/habits/store";
import { hasQuickAmounts, quickSteps, sliderMax, snapToStep } from "@/lib/habits/quick";
import { isSwipe, SWIPE_PX, LONG_HOLD_MS, HOLD_TO_COMPLETE_MS } from "@/hooks/useHoldToComplete";
import { reactiveMood, statusSlideIds } from "@/components/StatusCarousel";
import { resolveTheme, THEME_BG } from "@/lib/theme";
import { makePieces, stepPiece } from "@/components/Confetti";
import { haptic, VIBRATION } from "@/lib/haptics";
import { parseTab, SETTINGS_TABS, tabLabel } from "@/components/SettingsTabs";
import { setLang } from "@/lib/i18n";
import { todayKey } from "@/lib/habits/utils";
import { habit } from "./helpers";

const water = habit({
  name: "Picie wody",
  icon: "GlassWater",
  goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
});
const read = habit({
  name: "Czytanie",
  icon: "BookOpen",
  goal: { type: "minutes", target: 20, step: 10 },
});
const teeth = habit({ name: "Mycie zębów", icon: "Tooth" });
const food = habit({ name: "Fast food", icon: "Utensils", kind: "avoid" });

const keep = { habits: useHabits.getState().habits, completions: useHabits.getState().completions };
afterEach(() => {
  useHabits.setState(keep);
  setLang("pl");
});
const amount = (id: string) =>
  useHabits.getState().completions.find((c) => c.habitId === id && c.date === todayKey())?.amount ??
  0;

describe("swipe = undo the last entry", () => {
  test("steps are undone one by one, back to nothing", () => {
    useHabits.setState({ habits: [water, food], completions: [] });
    const s = useHabits.getState();
    const k = todayKey();
    s.setAmount(water.id, k, 1);
    s.setAmount(water.id, k, 2);
    s.setAmount(water.id, k, 7); // e.g. "+5" from the quick sheet
    expect(amount(water.id)).toBe(7);
    expect(s.undoLast(water.id, k)).toBe(2);
    expect(amount(water.id)).toBe(2);
    expect(s.undoLast(water.id, k)).toBe(1);
    expect(s.undoLast(water.id, k)).toBe(0);
    expect(useHabits.getState().completions.some((c) => c.habitId === water.id)).toBe(false);
    expect(s.undoLast(water.id, k)).toBeNull(); // nothing left
  });

  test("a reset to 0 can be undone too; the stack is capped", () => {
    useHabits.setState({ habits: [water], completions: [] });
    const s = useHabits.getState();
    const k = todayKey();
    for (let i = 1; i <= UNDO_DEPTH + 5; i++) s.setAmount(water.id, k, i);
    s.setAmount(water.id, k, 0); // "Wyzeruj"
    expect(amount(water.id)).toBe(0);
    expect(s.undoLast(water.id, k)).toBe(UNDO_DEPTH + 5);
    const c = useHabits.getState().completions.find((x) => x.habitId === water.id)!;
    expect(c.prev!.length).toBeLessThanOrEqual(UNDO_DEPTH);
    // the same amount twice doesn't grow the stack
    s.setAmount(water.id, k, UNDO_DEPTH + 5);
    expect(useHabits.getState().completions.find((x) => x.habitId === water.id)!.prev).toEqual(
      c.prev,
    );
  });

  test("forbidden habits: the day's answer is cleared", () => {
    useHabits.setState({ habits: [food], completions: [] });
    const s = useHabits.getState();
    s.setAvoid(food.id, todayKey(), "clean");
    expect(s.undoLast(food.id, todayKey())).toBe("cleared");
    expect(useHabits.getState().completions.some((c) => c.habitId === food.id)).toBe(false);
    expect(s.undoLast(food.id, todayKey())).toBeNull();
  });

  test("a sideways swipe is a swipe, a vertical drag is a scroll", () => {
    expect(isSwipe(-SWIPE_PX, 4)).toBe(true);
    expect(isSwipe(70, 10)).toBe(true);
    expect(isSwipe(30, 2)).toBe(false); // too short
    expect(isSwipe(60, 50)).toBe(false); // diagonal = scrolling
    expect(isSwipe(5, 80)).toBe(false);
  });
});

describe("quick amounts (hold longer)", () => {
  test("the sheet only for count / minute habits to do; the long hold comes after the normal one", () => {
    expect(hasQuickAmounts(water)).toBe(true);
    expect(hasQuickAmounts(read)).toBe(true);
    expect(hasQuickAmounts(teeth)).toBe(false); // check habit
    expect(hasQuickAmounts(food)).toBe(false);
    expect(LONG_HOLD_MS).toBeGreaterThan(HOLD_TO_COMPLETE_MS);
  });

  test("+1 / +2 / +5 steps, slider range and snapping", () => {
    expect(quickSteps(water)).toEqual([1, 2, 5]);
    expect(quickSteps(read)).toEqual([10, 20, 50]);
    expect(sliderMax(water, 0)).toBe(16); // twice the goal
    expect(sliderMax(water, 30)).toBe(35); // or current + 5 steps
    expect(sliderMax(read, 0)).toBe(50); // 5 steps of 10 min beat twice the goal (40)
    expect(snapToStep(read, 34)).toBe(30);
    expect(snapToStep(read, 36)).toBe(40);
    expect(snapToStep(water, -3)).toBe(0);
  });
});

describe("Today's status card", () => {
  test("slides: what needs you first, Szpila always there", () => {
    expect(statusSlideIds({ morning: false, bill: false, social: false })).toEqual(["szpila"]);
    expect(statusSlideIds({ morning: true, bill: true, social: true })).toEqual([
      "morning",
      "bill",
      "szpila",
      "social",
    ]);
    expect(statusSlideIds({ morning: false, bill: true, social: false })).toEqual([
      "bill",
      "szpila",
    ]);
  });

  test("the cat reacts to progress", () => {
    expect(reactiveMood("angry", false, false)).toBe("angry");
    expect(reactiveMood("angry", true, false)).toBe("impressed"); // a step just done
    expect(reactiveMood("smug", false, true)).toBe("impressed"); // the day is complete
  });

  test("confetti falls (gravity) and is deterministic for a given random source", () => {
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const a = makePieces(20, 400, rnd);
    seed = 1;
    const b = makePieces(20, 400, rnd);
    expect(a).toEqual(b);
    const p = a[0];
    const q = stepPiece(stepPiece(p));
    expect(q.y).toBeGreaterThan(p.y);
    expect(q.vy).toBeGreaterThan(p.vy);
  });

  test("haptics never throw and have a pattern per kind", () => {
    for (const k of ["tick", "success", "celebrate"] as const) {
      expect(VIBRATION[k]).toBeDefined();
      expect(() => haptic(k)).not.toThrow();
    }
  });
});

describe("theme + settings tabs", () => {
  test("theme: explicit choice wins, system follows the phone (dark if unknown)", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", null)).toBe("dark");
    expect(THEME_BG.light).not.toBe(THEME_BG.dark);
    expect(useHabits.getState().theme).toBe("system");
  });

  test("theme is part of the backup", () => {
    useHabits.getState().setTheme("light");
    expect(JSON.parse(useHabits.getState().exportData()).theme).toBe("light");
    useHabits.getState().setTheme("system");
  });

  test("tabs: four sections, unknown values fall back to Szpila, labels in both languages", () => {
    expect(SETTINGS_TABS).toEqual(["szpila", "guard", "notifications", "data"]);
    expect(parseTab("guard")).toBe("guard");
    expect(parseTab("nope")).toBe("szpila");
    expect(parseTab(undefined)).toBe("szpila");
    expect(tabLabel("guard")).toBe("Strażnik");
    setLang("en");
    expect(SETTINGS_TABS.map(tabLabel)).toEqual(["Szpila", "Guard", "Notifications", "Data"]);
  });
});
