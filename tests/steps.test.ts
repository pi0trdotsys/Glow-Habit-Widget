import { afterEach, describe, expect, test } from "bun:test";
import {
  inThousands,
  linkStepsPatch,
  scaleEntries,
  sourceName,
  stepsGoal,
  unlinkedStepHabits,
} from "@/lib/steps";
import { useHabits } from "@/lib/habits/store";
import { setLang } from "@/lib/i18n";
import { buildState } from "@/lib/widget/bridge";
import type { Completion } from "@/lib/habits/types";
import { habit } from "./helpers";

afterEach(() => setLang("pl"));

// The real habit from the phone: "8000 kroków", count 8 with unit "1000", typed in by hand.
const thousands = () =>
  habit({
    name: "8000 kroków",
    icon: "Footprints",
    goal: { type: "count", target: 8, step: 1, unit: "1000" },
  });

describe("goals in thousands", () => {
  test("detects thousands by unit or by a target nobody means as steps", () => {
    expect(inThousands({ type: "count", target: 8, step: 1, unit: "1000" })).toBe(true);
    expect(inThousands({ type: "count", target: 10, unit: "tys." })).toBe(true);
    expect(inThousands({ type: "count", target: 8, unit: "k" })).toBe(true);
    expect(inThousands({ type: "count", target: 8 })).toBe(true);
    expect(inThousands({ type: "count", target: 8000, step: 1000, unit: "kroków" })).toBe(false);
    expect(inThousands({ type: "minutes", target: 20 })).toBe(false);
  });

  test("a linked goal is real steps", () => {
    expect(stepsGoal({ type: "count", target: 8, step: 1, unit: "1000" })).toEqual({
      type: "count",
      target: 8000,
      step: 1000,
      unit: "kroków",
    });
    expect(stepsGoal({ type: "count", target: 10000, step: 500, unit: "kroków" })).toEqual({
      type: "count",
      target: 10000,
      step: 500,
      unit: "kroków",
    });
    setLang("en");
    expect(stepsGoal({ type: "count", target: 6, step: 2 }).unit).toBe("steps");
  });

  test("history is scaled with the goal (raw step entries stay)", () => {
    const h = thousands();
    const other = habit({ name: "Woda", goal: { type: "count", target: 4 } });
    const cs: Completion[] = [
      {
        habitId: h.id,
        date: "2026-09-29",
        amount: 8,
        log: [
          [602, 2],
          [1379, 8],
        ],
        prev: [0, 7],
      },
      { habitId: h.id, date: "2026-09-23", amount: 3000, log: [[1326, 3000]] },
      { habitId: other.id, date: "2026-09-29", amount: 3 },
    ];
    const out = scaleEntries(cs, h.id, 1000);
    expect(out[0]).toEqual({
      habitId: h.id,
      date: "2026-09-29",
      amount: 8000,
      log: [
        [602, 2000],
        [1379, 8000],
      ],
      prev: [0, 7000],
    });
    expect(out[1].amount).toBe(3000);
    expect(out[2]).toBe(cs[2]);
    expect(scaleEntries(cs, h.id, 1)).toBe(cs);
  });

  test("linkStepsPatch = goal + history together", () => {
    const h = thousands();
    const p = linkStepsPatch(h, [{ habitId: h.id, date: "2026-09-30", amount: 8 }]);
    expect(p.goal.target).toBe(8000);
    expect(p.completions[0].amount).toBe(8000);
  });
});

describe("store: linking a habit to the band", () => {
  test("linkSteps switches the source, converts the goal and keeps the stats right", () => {
    const s = useHabits.getState();
    const keep = { habits: s.habits, completions: s.completions };
    const h = thousands();
    useHabits.setState({
      habits: [h],
      completions: [{ habitId: h.id, date: "2026-09-30", amount: 8, log: [[740, 8]] }],
    });
    try {
      expect(unlinkedStepHabits(useHabits.getState().habits).map((x) => x.id)).toEqual([h.id]);
      useHabits.getState().linkSteps(h.id);
      const after = useHabits.getState();
      const linked = after.habits[0];
      expect(linked.source).toBe("steps");
      expect(linked.goal).toEqual({ type: "count", target: 8000, step: 1000, unit: "kroków" });
      expect(after.completions[0].amount).toBe(8000);
      expect(unlinkedStepHabits(after.habits)).toEqual([]);
      // the widget snapshot row follows
      const row = buildState().habits.find((r) => r.id === h.id);
      if (row) {
        expect(row.source).toBe("steps");
        expect(row.target).toBe(8000);
      }
    } finally {
      useHabits.setState(keep);
    }
  });

  test("avoid habits and non-step habits are never offered", () => {
    const list = [
      habit({ name: "Scrollowanie w łóżku", kind: "avoid" }),
      habit({ name: "Picie wody", icon: "GlassWater", goal: { type: "count", target: 4 } }),
      habit({ name: "Spacer", icon: "Footprints", goal: { type: "minutes", target: 30 } }),
      habit({ name: "10 000 steps", icon: "Footprints", goal: { type: "count", target: 10000 } }),
    ];
    expect(unlinkedStepHabits(list).map((h) => h.name)).toEqual(["10 000 steps"]);
  });

  test("the steps source goes to the native snapshot and survives export/import", () => {
    const s = useHabits.getState();
    const before = s.stepsSource;
    s.setStepsSource("com.xiaomi.wearable");
    try {
      expect(buildState().stepsSource).toBe("com.xiaomi.wearable");
      const json = useHabits.getState().exportData();
      expect(JSON.parse(json).stepsSource).toBe("com.xiaomi.wearable");
      useHabits.getState().setStepsSource("");
      expect(useHabits.getState().stepsSource).toBe("auto");
      useHabits.getState().importData(json);
      expect(useHabits.getState().stepsSource).toBe("com.xiaomi.wearable");
    } finally {
      useHabits.getState().setStepsSource(before);
    }
  });

  test("source names", () => {
    expect(sourceName({ pkg: "com.xiaomi.wearable", label: "Xiaomi Wear" })).toBe("Mi Fitness");
    expect(
      sourceName({ pkg: "com.garmin.android.apps.connectmobile", label: "Garmin Connect" }),
    ).toBe("Garmin Connect");
    expect(sourceName({ pkg: "x.y", label: "" })).toBe("x.y");
    expect(sourceName({ pkg: "com.android.healthconnect.phone.j61cccd9c", label: "" })).toBe(
      "Ten telefon",
    );
    expect(sourceName({ pkg: "com.niceboy.ring", label: "com.niceboy.ring" })).toBe("niceboy.ring");
  });
});
