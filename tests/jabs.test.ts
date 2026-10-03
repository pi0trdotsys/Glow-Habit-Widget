import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  JAB,
  JAB_KINDS,
  armKey,
  armLine,
  bestStyle,
  betaSample,
  chooseArm,
  daypartOf,
  decide,
  effective,
  emptyJabLearn,
  lineHash,
  logSuccess,
  mergeJabLog,
  normalizeJabLearn,
  pickLine,
  rng,
  styleOf,
  thompson,
  topArms,
  type ArmStats,
  type JabEntry,
} from "@/lib/habits/jabs";
import {
  contextLines,
  fill,
  memoryLines,
  nagLines,
  rageLines,
  szpilaNow,
} from "@/lib/habits/szpila";
import { addDays } from "date-fns";
import { useHabits } from "@/lib/habits/store";
import { buildState } from "@/lib/widget/bridge";
import { planDay } from "@/lib/habits/utils";
import { setLang } from "@/lib/i18n";
import type { Completion } from "@/lib/habits/types";
import { WED_1540, entry, habit, key } from "./helpers";

const V = JSON.parse(readFileSync(new URL("./jab-vectors.json", import.meta.url), "utf8"));

const T0 = WED_1540.getTime(); // jab at 15:40
const MIN = 60_000;

function jab(p: Partial<JabEntry> & { habitId: string }): JabEntry {
  return {
    id: `${p.ts ?? T0}:${p.habitId}`,
    ts: T0,
    date: key(WED_1540),
    min: 15 * 60 + 40,
    arm: "nag",
    daypart: "afternoon",
    hash: 1,
    style: "plain",
    amount: 0,
    status: "",
    outcome: -1,
    ...p,
  };
}

afterEach(() => {
  setSystemTime();
  setLang("pl");
});

describe("parity with JabLearn.java (tests/jab-vectors.json)", () => {
  test("constants", () => {
    expect(V.constants).toEqual({ ...JAB, kinds: [...JAB_KINDS] });
  });

  test("mulberry32 RNG, Java hashCode, style tags, day parts", () => {
    const r = rng(V.rng.seed);
    for (const v of V.rng.values) expect(r()).toBe(v);
    const r2 = rng(V.rngNeg.seed);
    for (const v of V.rngNeg.values) expect(r2()).toBe(v);
    for (const [s, h] of V.hashes) expect(lineHash(s)).toBe(h);
    expect(lineHash("a")).toBe(97);
    for (const [t, n, tag] of V.styles) expect(styleOf(t, n)).toBe(tag);
    for (const [m, p] of V.dayparts) expect(daypartOf(m)).toBe(p);
    for (const [s, n, es, en] of V.effective) expect(effective(s, n)).toEqual([es, en]);
  });

  test("Beta samples and arm choice", () => {
    for (const b of V.beta) expect(betaSample(b.s, b.n, rng(b.seed))).toBe(b.v);
    for (const c of V.choose) {
      const cands = c.cands.map(([s, n]: number[]) => ({ s, n }));
      expect(chooseArm(cands, rng(c.seed))).toBe(c.expected);
    }
  });
});

describe("Thompson sampling", () => {
  test("Beta samples stay in [0, 1] and follow the posterior mean", () => {
    const r = rng(7);
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const v = betaSample(8, 10, r); // Beta(9, 3): mean 0.75
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 2000).toBeGreaterThan(0.7);
    expect(sum / 2000).toBeLessThan(0.8);
  });

  test("the better arm wins most draws, the unknown one still gets tried", () => {
    const r = rng(11);
    const wins = [0, 0, 0];
    for (let i = 0; i < 3000; i++) {
      wins[
        thompson(
          [
            { s: 2, n: 20 },
            { s: 16, n: 20 },
            { s: 0, n: 0 },
          ],
          r,
        )
      ]++;
    }
    expect(wins[1]).toBeGreaterThan(wins[0] * 10);
    expect(wins[2]).toBeGreaterThan(50); // Beta(1,1) beats 17/22 sometimes
    expect(wins[1]).toBeGreaterThan(2000);
  });

  test("huge counts are capped so old evidence fades", () => {
    expect(effective(600, 1000)).toEqual([18, JAB.sampleCap]);
    expect(effective(5, 9)).toEqual([5, 9]);
  });
});

describe("exploration floor + empty pools", () => {
  test("~15% of jabs keep the old random choice", () => {
    let legacy = 0;
    const N = 4000;
    for (let seed = 0; seed < N; seed++) {
      if (
        chooseArm(
          [
            { s: 9, n: 10 },
            { s: 1, n: 10 },
          ],
          rng(seed),
        ) === -1
      )
        legacy++;
    }
    expect(legacy / N).toBeGreaterThan(0.12);
    expect(legacy / N).toBeLessThan(0.18);
  });

  test("no candidates or no evidence -> the old behaviour", () => {
    expect(chooseArm([], rng(1))).toBe(-1);
    for (let seed = 0; seed < 50; seed++) {
      expect(chooseArm([{ s: 0, n: 0 }], rng(seed))).toBe(-1);
    }
  });

  test("pickLine: empty pool gives '', never the same line twice in a row", () => {
    expect(pickLine([], rng(1))).toBe("");
    const pool = ["a", "b", "c"];
    for (let seed = 0; seed < 200; seed++) {
      expect(pickLine(pool, rng(seed), lineHash("b"))).not.toBe("b");
    }
    expect(pickLine(["only"], rng(3), lineHash("only"))).toBe("only");
  });

  test("szpilaNow never picks an arm whose pool is empty and follows what works", () => {
    setSystemTime(WED_1540); // 15:40: afternoon, "zero" situation for water
    const water = habit(
      { name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } },
      30,
      WED_1540,
    );
    // A clean last week: no memory lines, no rescue day; no weekly focus either.
    const kept = [1, 2, 3, 4, 5, 6, 7].map((i) =>
      entry(water, addDays(WED_1540, -i), { amount: 8 }),
    );
    expect(memoryLines(water, kept, "hard", "Ola")).toEqual([]);
    const plan = planDay([water], kept, WED_1540);
    const filled = (ls: string[]) => new Set(ls.map((l) => fill(l, water, 0)));
    const ctx = filled(contextLines(water, "hard", "Ola", "zero"));
    const allowed = new Set([
      ...ctx,
      ...filled(nagLines(water, "hard", "Ola")),
      ...filled(rageLines(water, "hard", "Ola")),
    ]);
    // Memory / rescue / focus would win on paper, but this habit has no such lines.
    const learned: ArmStats = {
      "memory@afternoon": { n: 30, s: 30 },
      "rescue@afternoon": { n: 30, s: 30 },
      "focus@afternoon": { n: 30, s: 30 },
      "ctx:zero@afternoon": { n: 20, s: 18 },
      "nag@afternoon": { n: 20, s: 1 },
      "rage@afternoon": { n: 20, s: 1 },
    };
    let ctxHits = 0;
    let legacyCtx = 0;
    for (let seed = 0; seed < 200; seed++) {
      const say = szpilaNow([water], kept, plan, "hard", "Ola", seed, null, learned);
      expect(allowed.has(say.text)).toBe(true);
      if (ctx.has(say.text)) ctxHits++;
      if (ctx.has(szpilaNow([water], kept, plan, "hard", "Ola", seed).text)) legacyCtx++;
    }
    // Learned: the situation pool wins ~85%+ (the old random choice gives it ~50%).
    expect(ctxHits).toBeGreaterThan(150);
    expect(ctxHits).toBeGreaterThan(legacyCtx);
  });

  test("szpilaNow with learned stats doesn't repeat the line for a habit", () => {
    setSystemTime(WED_1540);
    const water = habit(
      { name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } },
      30,
      WED_1540,
    );
    const plan = planDay([water], [], WED_1540);
    const learned: ArmStats = { "nag@afternoon": { n: 10, s: 9 } };
    // seed 3: not an exploration roll, so the learned path runs both times
    const a = szpilaNow([water], [], plan, "hard", null, 3, null, learned).text;
    const b = szpilaNow([water], [], plan, "hard", null, 3, null, learned).text;
    expect(a).not.toBe(b);
  });
});

describe("outcomes", () => {
  const water = habit({ name: "Picie wody", goal: { type: "count", target: 8, step: 1 } }, 30);
  const fast = habit({ name: "Fast food", kind: "avoid" }, 30);
  const day = key(WED_1540);
  const withLog = (h = water, log: [number, number][], extra: Partial<Completion> = {}) =>
    entry(h, WED_1540, { log, ...extra });

  test("progress within 30 min in the completions log = it worked", () => {
    const e = jab({ habitId: water.id, amount: 2 });
    expect(
      logSuccess(
        e,
        [
          withLog(water, [
            [600, 2],
            [960, 3],
          ]),
        ],
        [water],
      ),
    ).toBe(true); // 16:00
    expect(logSuccess(e, [withLog(water, [[970, 3]])], [water])).toBe(true); // 16:10 = edge
    expect(logSuccess(e, [withLog(water, [[971, 3]])], [water])).toBe(false); // 31 min later
    expect(logSuccess(e, [withLog(water, [[930, 3]])], [water])).toBe(false); // before the jab
    expect(logSuccess(e, [withLog(water, [[950, 2]])], [water])).toBe(false); // no more than before
    expect(logSuccess(e, [{ ...withLog(water, [[950, 3]]), date: "2026-09-22" }], [water])).toBe(
      false,
    );
  });

  test("avoid habits: a clean confirmation in the window counts, a slip doesn't", () => {
    const e = jab({ habitId: fast.id, status: "pending" });
    expect(logSuccess(e, [withLog(fast, [[955, 1]])], [fast])).toBe(true);
    expect(logSuccess(e, [withLog(fast, [[955, -1]], { slipped: true })], [fast])).toBe(false);
    expect(logSuccess({ ...e, status: "clean" }, [withLog(fast, [[955, 1]])], [fast])).toBe(false);
  });

  test("decide: native verdict, log success, open window", () => {
    const e = jab({ habitId: water.id });
    expect(decide({ ...e, outcome: 1 }, [], [water], T0 + 5 * MIN)).toBe(1);
    expect(decide({ ...e, outcome: 0 }, [], [water], T0 + 90 * MIN)).toBe(0);
    // the log knows better than a native 0 (e.g. logged in the app, synced later)
    expect(decide({ ...e, outcome: 0 }, [withLog(water, [[950, 1]])], [water], T0)).toBe(1);
    expect(decide(e, [], [water], T0 + 10 * MIN)).toBeNull();
    expect(decide(e, [], [water], T0 + 31 * MIN)).toBe(0);
    expect(day).toBe("2026-09-23");
  });
});

describe("store: merge, reset, backup", () => {
  const water = habit({ name: "Picie wody", goal: { type: "count", target: 8, step: 1 } }, 30);
  const entries = [
    jab({ habitId: water.id, ts: T0, outcome: 1, arm: "ctx:zero", style: "swear,name" }),
    jab({ habitId: water.id, ts: T0 + 60 * MIN, min: 16 * 60 + 40, outcome: 0 }),
    jab({ habitId: water.id, ts: T0 + 120 * MIN, min: 17 * 60 + 40, outcome: -1 }),
  ];

  beforeEach(() => {
    useHabits.setState({
      habits: [water],
      completions: [],
      seeded: true,
      jabLearn: emptyJabLearn(),
    });
  });

  test("merging is idempotent and waits for open windows", () => {
    const s = useHabits.getState();
    // "now" = 10 min after the third jab: still open, counted next time
    s.mergeJabs(entries, T0 + 130 * MIN);
    s.mergeJabs(entries, T0 + 130 * MIN);
    let l = useHabits.getState().jabLearn;
    expect(l.arms).toEqual({
      "ctx:zero@afternoon": { n: 1, s: 1 },
      "nag@afternoon": { n: 1, s: 0 },
    });
    expect(l.styles).toEqual({
      swear: { n: 1, s: 1 },
      name: { n: 1, s: 1 },
      plain: { n: 1, s: 0 },
    });
    expect(l.until).toBe(T0 + 60 * MIN);
    // window over -> the third one counts (as nothing happened), exactly once
    s.mergeJabs(entries, T0 + 200 * MIN);
    s.mergeJabs(entries, T0 + 200 * MIN);
    l = useHabits.getState().jabLearn;
    expect(l.arms["nag@afternoon"]).toEqual({ n: 2, s: 0 });
    // garbage from the native side is skipped
    s.mergeJabs([null, { ts: "x" }, { ...entries[0], arm: "lol", ts: T0 + 999 * MIN }]);
    expect(useHabits.getState().jabLearn).toBe(l);
  });

  test("reset forgets and ignores older native entries", () => {
    const s = useHabits.getState();
    s.mergeJabs(entries, T0 + 200 * MIN);
    s.resetJabs(T0 + 300 * MIN);
    expect(useHabits.getState().jabLearn.arms).toEqual({});
    s.mergeJabs(entries, T0 + 400 * MIN);
    expect(useHabits.getState().jabLearn.arms).toEqual({});
    s.mergeJabs([jab({ habitId: water.id, ts: T0 + 350 * MIN, outcome: 1 })], T0 + 400 * MIN);
    expect(useHabits.getState().jabLearn.arms).toEqual({ "nag@afternoon": { n: 1, s: 1 } });
  });

  test("backup export/import keeps what was learned; bad data is cleaned", () => {
    const s = useHabits.getState();
    s.mergeJabs(entries, T0 + 200 * MIN);
    const before = useHabits.getState().jabLearn;
    const json = s.exportData();
    expect(JSON.parse(json).jabLearn).toEqual(before);
    useHabits.setState({ jabLearn: emptyJabLearn() });
    useHabits.getState().importData(json);
    expect(useHabits.getState().jabLearn).toEqual(before);
    // an old backup without it keeps the current stats
    const old = JSON.parse(json);
    delete old.jabLearn;
    useHabits.getState().importData(JSON.stringify(old));
    expect(useHabits.getState().jabLearn).toEqual(before);
    expect(normalizeJabLearn({ arms: { a: { n: 3, s: 9 }, b: "x" }, since: "?" })).toEqual({
      arms: { a: { n: 3, s: 3 } },
      styles: {},
      since: 0,
      until: 0,
    });
    expect(normalizeJabLearn(undefined)).toEqual(emptyJabLearn());
  });

  test("the widget snapshot carries the stats for native sampling", () => {
    useHabits.getState().mergeJabs(entries, T0 + 200 * MIN);
    const snap = buildState() as unknown as { jabs: { arms: ArmStats; until: number } };
    expect(snap.jabs.arms["ctx:zero@afternoon"]).toEqual({ n: 1, s: 1 });
    expect(snap.jabs.until).toBe(T0 + 120 * MIN);
  });
});

describe("Co na ciebie działa card", () => {
  test("top arms by success, with enough samples; bilingual lines", () => {
    const stats: ArmStats = {
      [armKey("ctx:late", "evening")]: { n: 9, s: 7 },
      [armKey("nag", "morning")]: { n: 10, s: 2 },
      [armKey("rage", "afternoon")]: { n: 2, s: 2 }, // too few
      "junk@x": { n: 50, s: 50 },
    };
    const top = topArms(stats);
    expect(top.map((a) => a.key)).toEqual(["ctx:late@evening", "nag@morning"]);
    expect(armLine(top[0])).toBe(
      "Wieczorem: „dzień się kończy” - 7/9 razy ruszasz się w ciągu 30 min",
    );
    setLang("en");
    expect(armLine(top[0])).toBe(
      "Evenings: “the day is ending” - you get moving within 30 min 7/9 times",
    );
    expect(
      bestStyle({ q: { n: 6, s: 5 }, swear: { n: 10, s: 3 }, name: { n: 2, s: 2 } })?.tag,
    ).toBe("q");
    expect(bestStyle({ q: { n: 2, s: 2 } })).toBeNull();
  });

  test("an empty log merges to nothing", () => {
    const l = emptyJabLearn(5);
    expect(mergeJabLog(l, [], [], [], 0)).toBe(l);
  });
});
