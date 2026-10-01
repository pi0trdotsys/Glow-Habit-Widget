import { afterEach, describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import {
  autoMinimum,
  doubleMisses,
  keptOn,
  minimumLabel,
  minimumOf,
  neverTwiceStreak,
  rescueOn,
} from "@/lib/habits/rescue";
import {
  focusChallenge,
  focusHabit,
  focusProgress,
  focusRoast,
  focusSuggestions,
  weekKey,
} from "@/lib/habits/focus";
import { boostSet, chainLines, focusPool, rescuePool, CHAIN_CHANCE } from "@/lib/habits/chain";
import { fillRescue, rescueLines } from "@/lib/habits/szpila-rescue";
import { boostKey, planDay } from "@/lib/habits/utils";
import { szpilaNow } from "@/lib/habits/szpila";
import { statusSlideIds } from "@/components/StatusCarousel";
import { useHabits } from "@/lib/habits/store";
import { buildState } from "@/lib/widget/bridge";
import { setLang } from "@/lib/i18n";
import type { Completion } from "@/lib/habits/types";
import { WED_1540, entry, habit, key } from "./helpers";

afterEach(() => setLang("pl"));

const now = WED_1540; // Wednesday 2026-09-23 15:40
const yesterday = addDays(now, -1);
const read = () =>
  habit(
    { name: "Czytanie książki", icon: "BookOpen", goal: { type: "minutes", target: 20, step: 10 } },
    30,
    now,
  );
const water = () =>
  habit(
    {
      name: "Picie wody",
      icon: "GlassWater",
      goal: { type: "count", target: 4, step: 1, unit: "szklanek" },
    },
    30,
    now,
  );
const food = () => habit({ name: "Fast food", icon: "Hamburger", kind: "avoid" }, 30, now);

describe("minimum version", () => {
  test("automatic: a quarter of the goal (minutes in 5s, counts in steps)", () => {
    expect(autoMinimum("minutes", 20, 10)).toBe(5);
    expect(autoMinimum("minutes", 30, 30)).toBe(10);
    expect(autoMinimum("minutes", 15, 15)).toBe(5);
    expect(autoMinimum("minutes", 5, 5)).toBe(2);
    expect(autoMinimum("count", 4, 1)).toBe(1);
    expect(autoMinimum("count", 2, 1)).toBe(1);
    expect(autoMinimum("count", 8000, 1000)).toBe(2000);
    expect(autoMinimum("count", 1, 1)).toBe(0);
  });

  test("set by hand, 0 = none; avoid and single checks have none", () => {
    expect(minimumOf(read())).toBe(5);
    expect(minimumOf({ ...read(), minimum: 8 })).toBe(8);
    expect(minimumOf({ ...read(), minimum: 0 })).toBe(0);
    expect(minimumOf({ ...read(), minimum: 99 })).toBe(20);
    expect(minimumOf(food())).toBe(0);
    expect(minimumOf(habit({ name: "Witaminy" }))).toBe(0);
    expect(minimumLabel(read())).toBe("5 min");
    expect(minimumLabel(water())).toBe("1 szklanka");
  });

  test("the minimum keeps the day, avoid days need a clean confirmation", () => {
    const h = read();
    expect(keptOn(h, [entry(h, yesterday, { amount: 5 })], yesterday, now)).toBe(true);
    expect(keptOn(h, [entry(h, yesterday, { amount: 4 })], yesterday, now)).toBe(false);
    expect(
      keptOn({ ...h, minimum: 0 }, [entry(h, yesterday, { amount: 10 })], yesterday, now),
    ).toBe(false);
    const f = food();
    expect(keptOn(f, [entry(f, yesterday)], yesterday, now)).toBe(true);
    expect(keptOn(f, [entry(f, yesterday, { slipped: true })], yesterday, now)).toBe(false);
  });
});

describe("never twice in a row", () => {
  test("a rescue day after a miss, until today's minimum is in", () => {
    const h = read();
    expect(rescueOn(h, [], now)).toBe(true); // nothing yesterday
    expect(rescueOn(h, [entry(h, yesterday, { amount: 5 })], now)).toBe(false); // minimum saved it
    expect(
      rescueOn(h, [entry(h, yesterday, { amount: 2 }), entry(h, now, { amount: 5 })], now),
    ).toBe(false);
    expect(
      rescueOn(h, [entry(h, yesterday, { amount: 2 }), entry(h, now, { amount: 3 })], now),
    ).toBe(true);
    // a brand-new habit (created today) has nothing to rescue
    expect(
      rescueOn(
        habit({ name: "Nowe", goal: { type: "minutes", target: 20, step: 10 } }, 0, now),
        [],
        now,
      ),
    ).toBe(false);
  });

  test("avoid habits: a slip yesterday -> rescue until today is clean", () => {
    const f = food();
    expect(rescueOn(f, [entry(f, yesterday, { slipped: true })], now)).toBe(true);
    expect(rescueOn(f, [entry(f, yesterday, { slipped: true }), entry(f, now)], now)).toBe(false);
    expect(rescueOn(f, [entry(f, yesterday)], now)).toBe(false);
  });

  test("the chain counts due days since the last double miss", () => {
    const h = read();
    const cs: Completion[] = [];
    // 10..4 days ago kept, 3 and 2 days ago missed (double miss), yesterday kept, today kept
    for (let i = 10; i >= 4; i--) cs.push(entry(h, addDays(now, -i), { amount: 20 }));
    cs.push(entry(h, yesterday, { amount: 5 }), entry(h, now, { amount: 6 }));
    expect(neverTwiceStreak(h, cs, now)).toBe(2); // today + yesterday since the double miss
  });

  test("single gaps don't break the chain; double ones are counted", () => {
    const h = read();
    const cs: Completion[] = [];
    // kept, miss, kept, miss, kept ... for 12 days
    for (let i = 12; i >= 1; i--)
      if (i % 2 === 0) cs.push(entry(h, addDays(now, -i), { amount: 20 }));
    expect(doubleMisses(h, cs, 12, now)).toBe(0);
    expect(neverTwiceStreak(h, cs, now)).toBeGreaterThanOrEqual(11);
    // now two misses in a row: 3 and 2 days ago
    const cs2 = cs.filter((c) => c.date !== key(addDays(now, -2)));
    expect(doubleMisses(h, cs2, 12, now)).toBe(2); // misses 3, 2 and 1 days ago = two pairs
  });
});

describe("weekly focus", () => {
  test("week key = Monday; the focus only counts in its week", () => {
    expect(weekKey(now)).toBe("2026-09-21");
    const h = read();
    expect(focusHabit([h], { week: "2026-09-21", habitId: h.id }, now)).toBe(h);
    expect(focusHabit([h], { week: "2026-09-14", habitId: h.id }, now)).toBeNull();
    expect(focusHabit([h], { week: "2026-09-21", habitId: "gone" }, now)).toBeNull();
    expect(focusHabit([h], null, now)).toBeNull();
  });

  test("progress: days done so far, today only once it's done", () => {
    const h = read();
    const mon = addDays(now, -2);
    const cs = [entry(h, mon, { amount: 20 }), entry(h, yesterday, { amount: 3 })];
    expect(focusProgress(h, cs, now)).toEqual({ done: 1, due: 2, week: 7 });
    expect(focusProgress(h, [...cs, entry(h, now, { amount: 20 })], now)).toEqual({
      done: 2,
      due: 3,
      week: 7,
    });
  });

  test("the challenge: all due days but one, judged from the day it was picked", () => {
    const h = read();
    // picked on Monday, nothing done Mon + Tue: 5 days left of 7, 6 needed -> failed
    expect(focusChallenge(h, [], now, "2026-09-21")).toMatchObject({ goal: 6, status: "failed" });
    // picked today (Wed): Wed..Sun = 5 days, 4 needed
    expect(focusChallenge(h, [], now, key(now))).toMatchObject({
      goal: 4,
      progress: 0,
      status: "active",
    });
    const done = [0, 1, 2, 3].map((i) => entry(h, addDays(now, i), { amount: 20 }));
    expect(focusChallenge(h, done, addDays(now, 3), key(now)).status).toBe("done");
    // no "since" (older saves): the whole week
    expect(focusChallenge(h, [], now).goal).toBe(6);
  });

  test("suggestions: the weakest habits first, screen-judged ones left out", () => {
    const a = read();
    const b = water();
    const s = habit({ name: "Scrollowanie", kind: "avoid", source: "screen" }, 30, now);
    const cs: Completion[] = [];
    for (let i = 1; i <= 7; i++) cs.push(entry(b, addDays(now, -i), { amount: 4 }));
    const out = focusSuggestions([b, a, s], cs, now);
    expect(out[0].id).toBe(a.id);
    expect(out.map((h) => h.id)).not.toContain(s.id);
  });

  test("Sunday's roast line", () => {
    const h = read();
    const f = { week: weekKey(now), habitId: h.id };
    expect(focusRoast([h], [], f, true, now)).toContain("Czytanie książki");
    expect(focusRoast([h], [], null, true, now)).toBe("");
  });
});

describe("plan order and Szpila", () => {
  test("boosted habits go first once due, later ones keep their place", () => {
    expect(boostKey(-1.2, true)).toBeLessThan(-2.9);
    expect(boostKey(30, true)).toBeLessThan(-2.9);
    expect(boostKey(300, true)).toBe(300);
    expect(boostKey(-1.2, false)).toBe(-1.2);
  });

  test("planDay puts the rescue habit before an earlier-due one", () => {
    const a = read();
    const b = water();
    const cs = [entry(a, yesterday, { amount: 20 })]; // reading kept yesterday, water missed
    const boost = boostSet([a, b], cs, null, now);
    expect([...boost]).toEqual([b.id]);
    const plan = planDay([a, b], cs, now, boost);
    expect(plan[0].habit.id).toBe(b.id);
    // the weekly focus is boosted too
    expect(boostSet([a, b], cs, { week: weekKey(now), habitId: a.id }, now).has(a.id)).toBe(true);
  });

  test("Szpila uses the rescue / focus lines for the top habit", () => {
    setLang("pl");
    const a = read();
    const plan = planDay([a], [], now);
    const pool = rescuePool(a, [], "hard", now);
    expect(pool.length).toBeGreaterThan(5);
    let hits = 0;
    for (let seed = 0; seed < 60; seed++) {
      const say = szpilaNow([a], [], plan, "hard", null, seed);
      if (pool.includes(say.text)) hits++;
    }
    expect(hits).toBeGreaterThan(10); // ~60% of jabs on a rescue day
    const fp = focusPool(a, a.id, "hard");
    let fhits = 0;
    // szpilaNow judges "now": kept yesterday (real time) = no rescue, only the focus
    const real = new Date();
    const kept = [entry(a, addDays(real, -1), { amount: 20 })];
    for (let seed = 0; seed < 60; seed++) {
      const say = szpilaNow([a], kept, planDay([a], kept, real), "hard", null, seed, a.id);
      if (fp.includes(say.text)) fhits++;
    }
    expect(fhits).toBeGreaterThan(5);
    expect(focusPool(a, "other", "hard")).toEqual([]);
    expect(CHAIN_CHANCE.rescue).toBeGreaterThan(CHAIN_CHANCE.focus);
  });

  test("Today shows the focus slide (picker / progress) when there are habits", () => {
    expect(statusSlideIds({ morning: false, bill: false, social: true, focus: true })).toEqual([
      "szpila",
      "social",
      "focus",
    ]);
    expect(statusSlideIds({ morning: false, bill: false, social: false })).toEqual(["szpila"]);
  });
});

describe("lines", () => {
  const GENDERED = /\b\w+(łeś|łaś|łem|łam)\b/u;
  const SWEAR = /kurw|chuj|pierdol|jeb|gówn|dup|fuck|shit|damn|ass\b/i;
  for (const lang of ["pl", "en"] as const) {
    for (const level of ["hard", "soft"] as const) {
      test(`${lang}/${level}: pools, placeholders, tone`, () => {
        setLang(lang);
        const l = rescueLines(level);
        for (const [k, pool] of Object.entries(l)) {
          expect(pool.length).toBeGreaterThan(level === "hard" ? 3 : 0);
          for (const line of pool) {
            for (const m of line.matchAll(/\{(\w+)\}/g)) expect(["name", "min"]).toContain(m[1]);
            if (lang === "pl") expect(GENDERED.test(line)).toBe(false);
            if (level === "soft") expect(SWEAR.test(line)).toBe(false);
            if (k.startsWith("focus")) expect(line.includes("{min}")).toBe(false);
          }
        }
      });
    }
  }

  test("PL and EN pools have the same sizes", () => {
    setLang("pl");
    const pl = rescueLines("hard");
    setLang("en");
    const en = rescueLines("hard");
    for (const k of Object.keys(pl) as (keyof typeof pl)[]) expect(en[k].length).toBe(pl[k].length);
  });

  test("no minimum: only lines that don't need one", () => {
    const out = fillRescue(rescueLines("hard").rescue, "Witaminy", "");
    expect(out.length).toBeGreaterThan(0);
    for (const l of out) expect(l.includes("{min}") || l.includes("  ")).toBe(false);
    expect(chainLines(habit({ name: "Witaminy" }), "hard").length).toBe(out.length);
  });
});

describe("store + native snapshot", () => {
  test("setFocus stores this week's focus; backups and old saves keep working", () => {
    const s = useHabits.getState();
    const keep = { habits: s.habits, completions: s.completions, focus: s.focus };
    const a = read();
    useHabits.setState({ habits: [a], completions: [] });
    try {
      useHabits.getState().setFocus(a.id);
      expect(useHabits.getState().focus).toEqual({
        week: weekKey(),
        habitId: a.id,
        since: key(new Date()),
      });
      const json = useHabits.getState().exportData();
      expect(JSON.parse(json).focus.habitId).toBe(a.id);
      useHabits.getState().setFocus(null);
      expect(useHabits.getState().focus).toBeNull();
      useHabits.getState().importData(json);
      expect(useHabits.getState().focus?.habitId).toBe(a.id);
      const merged = useHabits.persist.getOptions().merge!({}, useHabits.getState()) as ReturnType<
        typeof useHabits.getState
      >;
      expect(merged.focus).toBeNull();
    } finally {
      useHabits.setState(keep);
    }
  });

  test("rows carry minimum, rescue, focus and boost for HabitNotifier / WidgetShared", () => {
    const s = useHabits.getState();
    const keep = { habits: s.habits, completions: s.completions, focus: s.focus };
    const a = read();
    const b = water();
    useHabits.setState({
      habits: [a, b],
      completions: [entry(a, addDays(new Date(), -1), { amount: 20 })],
      focus: { week: weekKey(), habitId: a.id },
    });
    try {
      const rows = buildState().habits as unknown as Record<string, unknown>[];
      const ra = rows.find((r) => r.id === a.id)!;
      const rb = rows.find((r) => r.id === b.id)!;
      expect(ra.minimum).toBe(5);
      expect(ra.focus).toBe(true);
      expect((ra.focusLines as string[]).length).toBeGreaterThan(3);
      expect(ra.boost).toBe(true);
      expect(rb.focus).toBe(false);
      expect(rb.focusLines).toEqual([]);
      expect(rb.rescue).toBe(true);
      expect(rb.boost).toBe(true);
      expect((rb.rescueLines as string[]).some((l) => l.includes("1 szklanka"))).toBe(true);
      for (const r of rows)
        for (const l of r.rescueLines as string[]) expect(l).not.toMatch(/\{(name|min|u)\}/);
    } finally {
      useHabits.setState(keep);
    }
  });
});

test("native mirrors: CHAIN_CHANCE and boostKey in HabitNotifier / WidgetShared", async () => {
  const dir = "android/app/src/main/java/app/lovable/glow_habit_widget/";
  const notifier = await Bun.file(dir + "HabitNotifier.java").text();
  expect(notifier).toContain(
    `CHAIN_RESCUE = ${CHAIN_CHANCE.rescue}, CHAIN_FOCUS = ${CHAIN_CHANCE.focus}`,
  );
  const shared = await Bun.file(dir + "WidgetShared.java").text();
  expect(shared).toContain("boost && key < 62 ? key / 1000.0 - 3 : key");
});
