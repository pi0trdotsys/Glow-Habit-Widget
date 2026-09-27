import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import {
  FACES,
  HUMORS,
  dayFraction,
  formaStreaks,
  humorLines,
  isUnlocked,
  nextUnlock,
  progressOf,
  weeklyChallenges,
  withHumor,
} from "@/lib/habits/gamification";
import { indexEntries } from "@/lib/habits/utils";
import { nagLines, praiseFor, setHumor } from "@/lib/habits/szpila";
import type { Completion } from "@/lib/habits/types";
import { WED_1540, entry, habit, key } from "./helpers";

const now = WED_1540;
const water = habit(
  { name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } },
  60,
  now,
);
const read = habit(
  { name: "Czytanie książki", goal: { type: "minutes", target: 20, step: 10 } },
  60,
  now,
);
const food = habit(
  { name: "Fast food", kind: "avoid", limit: { times: 0, period: "week" } },
  60,
  now,
);
const habits = [water, read, food];

/** Full days for `days` days back from yesterday (and optionally today). */
function perfect(days: number, from = 1): Completion[] {
  const out: Completion[] = [];
  for (let i = from; i < from + days; i++) {
    const d = addDays(now, -i);
    out.push(entry(water, d, { amount: 8 }), entry(read, d, { amount: 20 }), entry(food, d));
  }
  return out;
}

describe("forma", () => {
  test("day fraction averages habit scores; null when nothing counts", () => {
    const d = addDays(now, -1);
    const idx = indexEntries([
      entry(water, d, { amount: 4 }),
      entry(read, d, { amount: 20 }),
      entry(food, d),
    ]);
    expect(dayFraction(habits, idx, d, now)).toBeCloseTo((0.5 + 1 + 1) / 3);
    expect(dayFraction(habits, idx, addDays(now, -200), now)).toBeNull(); // before creation
  });

  test("streak counts consecutive days >= 80%, today only once in form", () => {
    const c = perfect(5);
    expect(formaStreaks(habits, c, now)).toEqual({ current: 5, best: 5 });
    // a weak day 3 days ago breaks it
    const broken = c.filter((e) => !(e.date === key(addDays(now, -3)) && e.habitId === read.id));
    expect(formaStreaks(habits, broken, now).current).toBe(2);
    expect(formaStreaks(habits, broken, now).best).toBe(2);
    // today in form extends it
    const today = [
      ...c,
      entry(water, now, { amount: 8 }),
      entry(read, now, { amount: 20 }),
      entry(food, now),
    ];
    expect(formaStreaks(habits, today, now).current).toBe(6);
  });

  test("best streak is kept after the streak breaks", () => {
    const c = perfect(8, 10); // days -10..-17
    const s = formaStreaks(habits, c, now);
    expect(s.best).toBe(8);
    expect(s.current).toBe(0);
  });
});

describe("unlocks", () => {
  test("faces and humors unlock by best streak, DJ by a perfect challenge week", () => {
    const p = { current: 0, best: 7, perfectWeeks: 0 };
    const open = FACES.filter((f) => isUnlocked(f, p)).map((f) => f.id);
    expect(open).toEqual(["wredny", "kujon", "diabel"]);
    expect(HUMORS.filter((h) => isUnlocked(h, p)).map((h) => h.id)).toEqual(["wredny", "trener"]);
    expect(isUnlocked(FACES.find((f) => f.id === "dj")!, { ...p, perfectWeeks: 1 })).toBe(true);
  });

  test("next unlock is the closest one above the best streak", () => {
    expect(nextUnlock({ current: 2, best: 2, perfectWeeks: 0 })).toEqual({
      name: "Kujon",
      kind: "mina",
      missing: 1,
    });
    expect(nextUnlock({ current: 1, best: 7, perfectWeeks: 0 })?.name).toBe("Mafioso");
    expect(nextUnlock({ current: 30, best: 30, perfectWeeks: 0 })).toBeNull();
  });

  test("progressOf wires streaks together", () => {
    const p = progressOf(habits, perfect(4), {}, false, now);
    expect(p.current).toBe(4);
    expect(p.best).toBe(4);
  });
});

describe("weekly challenges", () => {
  test("three stable challenges per week, different across weeks", () => {
    const a = weeklyChallenges(habits, perfect(30), {}, true, now);
    const b = weeklyChallenges(habits, perfect(30), {}, true, addDays(now, 1));
    expect(a).toHaveLength(3);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id)); // same week
    const ids = new Set<string>();
    for (let w = 0; w < 8; w++) {
      weeklyChallenges(habits, perfect(90), {}, true, addDays(now, -7 * w)).forEach((c) =>
        ids.add(c.id),
      );
    }
    expect(ids.size).toBeGreaterThan(3); // rotates
  });

  test("a slip fails the clean week; a finished perfect week completes forma/perfect challenges", () => {
    const monday = addDays(now, -9); // Mon 2026-09-14
    const week: Completion[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      week.push(entry(water, d, { amount: 8 }), entry(read, d, { amount: 20 }), entry(food, d));
    }
    const all = weeklyChallenges(habits, week, {}, false, now, monday);
    for (const c of all) expect(c.status).toBe("done");

    const slipped = week.map((e) =>
      e.habitId === food.id && e.date === key(addDays(monday, 2)) ? { ...e, slipped: true } : e,
    );
    const clean = weeklyChallenges(habits, slipped, {}, false, now, monday).find(
      (c) => c.id === "clean",
    );
    if (clean) expect(clean.status).toBe("failed");
  });

  test("night challenge fails after one night on social media", () => {
    const monday = addDays(now, -2);
    const hits = { [key(monday)]: 2 };
    let found = false;
    for (let w = 0; w < 20 && !found; w++) {
      const m = addDays(monday, -7 * w);
      const c = weeklyChallenges(
        habits,
        perfect(200),
        { ...hits, [key(m)]: 1 },
        true,
        addDays(m, 2),
        m,
      ).find((x) => x.id === "night0");
      if (c) {
        expect(c.status).toBe("failed");
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  test("unreachable day goals fail early", () => {
    // Sunday with nothing done all week: 4 forma days impossible
    const sunday = addDays(now, 4);
    const c = weeklyChallenges(habits, [], {}, false, sunday).find(
      (x) => x.id === "forma4" || x.id === "perfect2" || x.id === "habit5",
    );
    if (c) expect(c.status).toBe("failed");
  });
});

describe("humors", () => {
  test("humor lines are mixed in (about half) and reach Szpila's pools", () => {
    const mixed = withHumor(["a", "b", "c", "d"], ["X", "Y"]);
    expect(mixed.filter((l) => l === "X" || l === "Y").length).toBe(4);
    expect(withHumor(["a"], [])).toEqual(["a"]);

    setHumor("mafioso");
    const nag = nagLines(water, "hard", null);
    expect(nag.some((l) => l.includes("propozycję nie do odrzucenia"))).toBe(true);
    expect(nag.every((l) => !l.includes("{name}"))).toBe(true);
    const praise = new Set(Array.from({ length: 60 }, () => praiseFor(water, "hard", null)));
    expect([...praise].some((l) => /Rodzina|Don Szpila/.test(l))).toBe(true);
    // soft level stays gentle
    expect(nagLines(water, "soft", null).some((l) => l.includes("propozycję"))).toBe(false);
    setHumor("wredny");
    expect(
      nagLines(water, "hard", null).some((l) => l.includes("propozycję nie do odrzucenia")),
    ).toBe(false);
  });

  test("every humor has lines for all pools", () => {
    for (const h of HUMORS.filter((x) => x.id !== "wredny")) {
      const l = humorLines(h.id);
      expect(l.nag.length).toBeGreaterThan(0);
      expect(l.avoid.length).toBeGreaterThan(0);
      expect(l.praise.length).toBeGreaterThan(0);
      expect(l.liveFirst.length).toBeGreaterThan(0);
      expect(l.liveEscalate.length).toBeGreaterThan(0);
    }
  });
});
