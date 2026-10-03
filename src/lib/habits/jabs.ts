// "Co na ciebie działa": Szpila learns which jabs get you moving.
//
// A contextual multi-armed bandit. An arm is the pool a jab came from (nag,
// rage, memory, a situation pool, rescue, focus) × the part of the day. Every
// native jab (HabitNotifier) is logged with the habit's amount at that moment;
// the outcome is whether the habit progressed within OUTCOME_WINDOW minutes
// (judged natively on later refreshes and here from Completion.log). Selection
// is Beta-Bernoulli Thompson sampling with an exploration floor that keeps the
// old random behaviour, so new lines still get tried.
//
// Mirrored by JabLearn.java (constants, RNG, hash, style, sampling) - the shared
// vectors live in tests/jab-vectors.json. Pure: no store, no Capacitor.
import type { Completion, Habit } from "./types";
import { kindOf } from "./utils";
import { L } from "@/lib/i18n";

export const JAB_KINDS = [
  "nag",
  "rage",
  "memory",
  "ctx:zero",
  "ctx:almost",
  "ctx:late",
  "ctx:morning",
  "rescue",
  "focus",
] as const;
export type JabKind = (typeof JAB_KINDS)[number];

export const DAYPARTS = ["morning", "afternoon", "evening"] as const;
export type Daypart = (typeof DAYPARTS)[number];

/** Shared with JabLearn.java (JabLearnTest checks them against tests/jab-vectors.json). */
export const JAB = {
  /** Progress within this many minutes after a jab = it worked. */
  windowMin: 30,
  /** Native log keeps the newest N jabs. */
  logCap: 500,
  /** Percent of jabs that keep the old random pool choice (exploration floor). */
  explorePct: 15,
  /** Beta prior pseudo-counts (successes / failures). */
  priorA: 1,
  priorB: 1,
  /** Counts above this are scaled down before sampling (older evidence fades, sampling stays cheap). */
  sampleCap: 30,
  /** Day parts: morning before 12:00, afternoon before 18:00, evening after. */
  afternoonFrom: 12 * 60,
  eveningFrom: 18 * 60,
} as const;

export function daypartOf(minute: number): Daypart {
  return minute < JAB.afternoonFrom
    ? "morning"
    : minute < JAB.eveningFrom
      ? "afternoon"
      : "evening";
}

export const armKey = (kind: JabKind, part: Daypart): string => `${kind}@${part}`;

export interface ArmStat {
  /** Jabs with a known outcome. */
  n: number;
  /** ...of which the habit moved within the window. */
  s: number;
}
export type ArmStats = Record<string, ArmStat>;

// ---------------------------------------------------------------------------
// Deterministic helpers shared with Java
// ---------------------------------------------------------------------------

/** mulberry32: a tiny seeded PRNG in [0, 1), bit-identical to JabLearn.Rng. */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Java's String.hashCode() - the line id in the native log. */
export function lineHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const SWEAR =
  /kurw|chuj|pierdol|jeb|dup[aąeiy]|gówn|pizd|cholera|szlag|fuck|shit|damn|bitch|crap|bastard|arse/i;

/**
 * Cheap style tags of a line: "swear", "name" (calls you by name), "q" (a question),
 * comma-joined in that order, or "plain". Mirrors JabLearn.style().
 */
export function styleOf(text: string, userName: string | null | undefined): string {
  const tags: string[] = [];
  if (SWEAR.test(text)) tags.push("swear");
  const name = (userName ?? "").trim().toLowerCase();
  if (name && text.toLowerCase().includes(name)) tags.push("name");
  if (text.includes("?")) tags.push("q");
  return tags.length ? tags.join(",") : "plain";
}

/** Counts used for sampling: capped at sampleCap (proportionally), so old evidence fades. */
export function effective(s: number, n: number): [number, number] {
  if (n <= JAB.sampleCap) return [s, n];
  return [Math.round((s * JAB.sampleCap) / n), JAB.sampleCap];
}

/**
 * A Beta(priorA + s, priorB + n - s) sample. With integer parameters it's the
 * a-th smallest of a+b-1 uniforms - exact, and identical in Java.
 */
export function betaSample(s: number, n: number, rand: () => number): number {
  const [es, en] = effective(Math.max(0, s), Math.max(0, n));
  const a = JAB.priorA + Math.min(es, en);
  const b = JAB.priorB + en - Math.min(es, en);
  const u: number[] = [];
  for (let i = 0; i < a + b - 1; i++) u.push(rand());
  u.sort((x, y) => x - y);
  return u[a - 1];
}

/** Thompson sampling: the candidate with the highest Beta sample (first wins ties). */
export function thompson(cands: ArmStat[], rand: () => number): number {
  let best = -1;
  let bestV = -1;
  cands.forEach((c, i) => {
    const v = betaSample(c.s, c.n, rand);
    if (v > bestV) {
      best = i;
      bestV = v;
    }
  });
  return best;
}

/**
 * Which candidate arm to use, or -1 = the old random behaviour (the exploration
 * floor, or no evidence for any candidate yet). The roll is always drawn first.
 */
export function chooseArm(cands: ArmStat[], rand: () => number): number {
  const roll = rand() * 100;
  if (cands.length === 0 || roll < JAB.explorePct || !cands.some((c) => c.n > 0)) return -1;
  return thompson(cands, rand);
}

/** A random line of `pool`, never the one with `lastHash` when there's another. */
export function pickLine(pool: string[], rand: () => number, lastHash?: number | null): string {
  if (pool.length === 0) return "";
  let i = Math.floor(rand() * pool.length);
  if (pool.length > 1 && lastHash != null && lineHash(pool[i]) === lastHash) {
    i = (i + 1 + Math.floor(rand() * (pool.length - 1))) % pool.length;
  }
  return pool[i];
}

/** Stats of one arm (zero when unknown). */
export const statOf = (stats: ArmStats | null | undefined, key: string): ArmStat =>
  stats?.[key] ?? { n: 0, s: 0 };

// ---------------------------------------------------------------------------
// Native log + outcomes
// ---------------------------------------------------------------------------

/** One logged jab (JabLearn.entry in Java). */
export interface JabEntry {
  id: string;
  /** Epoch ms of the jab. */
  ts: number;
  /** Habit day (YYYY-MM-DD) and minute of day of the jab. */
  date: string;
  min: number;
  habitId: string;
  arm: JabKind;
  daypart: Daypart;
  hash: number;
  style: string;
  /** Amount (build) / status (avoid) of the habit at the jab. */
  amount: number;
  status: string;
  /** True when the old random choice picked the pool (exploration). */
  explore?: boolean;
  /** Native verdict: -1 open, 0 nothing happened, 1 moved within the window. */
  outcome: -1 | 0 | 1;
}

const isKind = (x: unknown): x is JabKind => JAB_KINDS.includes(x as JabKind);
const isPart = (x: unknown): x is Daypart => DAYPARTS.includes(x as Daypart);

/** Entries from the native side are data: keep only well-formed ones. */
export function validEntry(e: unknown): e is JabEntry {
  const x = e as Partial<JabEntry> | null;
  return (
    !!x &&
    typeof x.ts === "number" &&
    Number.isFinite(x.ts) &&
    typeof x.date === "string" &&
    typeof x.min === "number" &&
    typeof x.habitId === "string" &&
    isKind(x.arm) &&
    isPart(x.daypart) &&
    typeof x.amount === "number"
  );
}

/**
 * Did the day's history show progress within the window after the jab?
 * Build: a log point with a bigger amount; avoid: a clean confirmation.
 * (The log keeps one point per hour, so the native verdict is the other half.)
 */
export function logSuccess(e: JabEntry, completions: Completion[], habits: Habit[]): boolean {
  const h = habits.find((x) => x.id === e.habitId);
  const c = completions.find((x) => x.habitId === e.habitId && x.date === e.date);
  if (!h || !c?.log) return false;
  const avoid = kindOf(h) === "avoid";
  if (avoid && e.status === "clean") return false;
  return c.log.some(
    ([m, v]) => m > e.min && m <= e.min + JAB.windowMin && (avoid ? v === 1 : v > e.amount),
  );
}

/** 1 = it worked, 0 = it didn't, null = still inside the window. */
export function decide(
  e: JabEntry,
  completions: Completion[],
  habits: Habit[],
  nowMs: number,
): 0 | 1 | null {
  if (e.outcome === 1 || logSuccess(e, completions, habits)) return 1;
  if (e.outcome === 0) return 0;
  return nowMs - e.ts > JAB.windowMin * 60_000 ? 0 : null;
}

/** What the store keeps: aggregated arms + style tags; entries up to `until` are counted. */
export interface JabLearn {
  arms: ArmStats;
  styles: ArmStats;
  /** Reset time: older entries are ignored. */
  since: number;
  /** Ts of the newest counted entry (merging is idempotent). */
  until: number;
}

export const emptyJabLearn = (now = 0): JabLearn => ({
  arms: {},
  styles: {},
  since: now,
  until: now,
});

const bump = (stats: ArmStats, key: string, ok: boolean): void => {
  const cur = stats[key] ?? { n: 0, s: 0 };
  stats[key] = { n: cur.n + 1, s: cur.s + (ok ? 1 : 0) };
};

/**
 * Fold the native log into the stats. Entries are counted once, in time order;
 * merging stops at the first one still inside its window (counted next time).
 * Returns `learn` itself when nothing changed.
 */
export function mergeJabLog(
  learn: JabLearn,
  entries: unknown[],
  completions: Completion[],
  habits: Habit[],
  nowMs: number,
): JabLearn {
  const fresh = entries
    .filter(validEntry)
    .filter((e) => e.ts > learn.until && e.ts >= learn.since)
    .sort((a, b) => a.ts - b.ts);
  if (fresh.length === 0) return learn;
  const arms = { ...learn.arms };
  const styles = { ...learn.styles };
  let until = learn.until;
  for (const e of fresh) {
    const o = decide(e, completions, habits, nowMs);
    if (o == null) break;
    bump(arms, armKey(e.arm, e.daypart), o === 1);
    for (const tag of (e.style || "plain").split(",")) bump(styles, tag, o === 1);
    until = e.ts;
  }
  return until === learn.until ? learn : { arms, styles, since: learn.since, until };
}

const cleanStats = (x: unknown): ArmStats => {
  const out: ArmStats = {};
  if (!x || typeof x !== "object") return out;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    const st = v as Partial<ArmStat> | null;
    if (!st || typeof st.n !== "number" || typeof st.s !== "number") continue;
    const n = Math.max(0, Math.floor(st.n));
    out[k] = { n, s: Math.min(n, Math.max(0, Math.floor(st.s))) };
  }
  return out;
};

/** Persisted / imported value -> a valid JabLearn (garbage = empty). */
export function normalizeJabLearn(x: unknown): JabLearn {
  const p = (x ?? {}) as Partial<JabLearn>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    arms: cleanStats(p.arms),
    styles: cleanStats(p.styles),
    since: num(p.since),
    until: Math.max(num(p.until), num(p.since)),
  };
}

/** The widget snapshot's `jabs` (HabitNotifier samples from it plus its own newer log). */
export const jabSnapshot = (l: JabLearn) => ({ arms: l.arms, since: l.since, until: l.until });

// ---------------------------------------------------------------------------
// "Co na ciebie działa" card
// ---------------------------------------------------------------------------

/** Jabs with an outcome needed before an arm is shown. */
export const MIN_SHOWN = 3;

export interface TopArm {
  key: string;
  kind: JabKind;
  daypart: Daypart;
  n: number;
  s: number;
}

/** Best arms first (posterior mean, then sample size), at least MIN_SHOWN samples. */
export function topArms(stats: ArmStats, max = 3, minN = MIN_SHOWN): TopArm[] {
  const mean = (a: ArmStat) => (a.s + JAB.priorA) / (a.n + JAB.priorA + JAB.priorB);
  return Object.entries(stats)
    .map(([key, st]) => {
      const [kind, daypart] = key.split("@");
      return { key, kind, daypart, n: st.n, s: st.s } as TopArm;
    })
    .filter((a) => isKind(a.kind) && isPart(a.daypart) && a.n >= minN)
    .sort((a, b) => mean(b) - mean(a) || b.n - a.n)
    .slice(0, max);
}

/** Total jabs with a known outcome. */
export const jabsCounted = (stats: ArmStats): number =>
  Object.values(stats).reduce((acc, a) => acc + a.n, 0);

export function jabKindLabel(kind: JabKind): string {
  switch (kind) {
    case "nag":
      return L("zwykłe przytyki", "plain nags");
    case "rage":
      return L("wściekłe szpile", "rage jabs");
    case "memory":
      return L("wypominanie wpadek", "reminders of past slips");
    case "ctx:zero":
      return L("„jeszcze zero”", "“still zero”");
    case "ctx:almost":
      return L("„zostało tylko…”", "“only … left”");
    case "ctx:late":
      return L("„dzień się kończy”", "“the day is ending”");
    case "ctx:morning":
      return L("poranne pobudki", "morning wake-up calls");
    case "rescue":
      return L("„nigdy dwa razy”", "“never twice”");
    case "focus":
      return L("„cel tygodnia”", "“weekly focus”");
  }
}

export function daypartLabel(p: Daypart): string {
  return p === "morning"
    ? L("Rano", "Mornings")
    : p === "afternoon"
      ? L("Po południu", "Afternoons")
      : L("Wieczorem", "Evenings");
}

/** "Wieczorem: „dzień się kończy” - 7/9 razy ruszasz się w ciągu 30 min". */
export function armLine(a: TopArm): string {
  return L(
    `${daypartLabel(a.daypart)}: ${jabKindLabel(a.kind)} - ${a.s}/${a.n} razy ruszasz się w ciągu ${JAB.windowMin} min`,
    `${daypartLabel(a.daypart)}: ${jabKindLabel(a.kind)} - you get moving within ${JAB.windowMin} min ${a.s}/${a.n} times`,
  );
}

export function styleLabel(tag: string): string {
  switch (tag) {
    case "swear":
      return L("z przekleństwem", "with swearing");
    case "name":
      return L("po imieniu", "using your name");
    case "q":
      return L("z pytaniem", "with a question");
    default:
      return L("bez fajerwerków", "plain ones");
  }
}

/** The style tag that works best (at least `minN` samples), or null. */
export function bestStyle(
  styles: ArmStats,
  minN = 5,
): { tag: string; n: number; s: number } | null {
  let best: { tag: string; n: number; s: number } | null = null;
  for (const [tag, st] of Object.entries(styles)) {
    if (st.n < minN) continue;
    const r = (st.s + 1) / (st.n + 2);
    if (!best || r > (best.s + 1) / (best.n + 2)) best = { tag, ...st };
  }
  return best;
}
