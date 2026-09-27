// Gamification with the cat: "forma" streaks unlock new faces ("miny") and
// humors ("humory") for Szpila, plus three weekly challenges that rotate every
// Monday. Unlocks follow the BEST streak ever, so a bad week never takes
// anything away. Pure functions - the UI and the widget snapshot read them.
import { addDays, differenceInCalendarDays, startOfWeek } from "date-fns";
import type { Completion, Habit } from "./types";
import {
  countsOn,
  createdKey,
  dayScore,
  indexEntries,
  isAutoScreen,
  kindOf,
  avoidStatus,
  todayKey,
  weeklyReport,
} from "./utils";

/** A day "in form": at least this share of the day's habits done. */
export const FORMA = 0.8;

// ---------------------------------------------------------------------------
// Faces + humors
// ---------------------------------------------------------------------------

export type FaceId = "wredny" | "kujon" | "diabel" | "krol" | "zloty" | "dj";
export type HumorId = "wredny" | "trener" | "mafioso" | "poeta";

export interface Unlockable<T extends string> {
  id: T;
  name: string;
  /** Best forma streak needed (days). */
  streak?: number;
  /** Or: weeks with all 3 challenges done. */
  weeks?: number;
  blurb: string;
}

export const FACES: Unlockable<FaceId>[] = [
  { id: "wredny", name: "Wredny", streak: 0, blurb: "Klasyka. Patrzy na ciebie z pogardą." },
  { id: "kujon", name: "Kujon", streak: 3, blurb: "Okulary. Liczy każde twoje odpuszczenie." },
  { id: "diabel", name: "Diabeł", streak: 7, blurb: "Rogi. Tydzień formy obudził w nim bestię." },
  { id: "krol", name: "Król", streak: 14, blurb: "Korona. Dwa tygodnie - należy mu się." },
  {
    id: "zloty",
    name: "Złoty",
    streak: 30,
    blurb: "Złote futro. Miesiąc formy, legenda dzielnicy.",
  },
  { id: "dj", name: "DJ", weeks: 1, blurb: "Słuchawki. Za komplet tygodniowych wyzwań." },
];

export const HUMORS: Unlockable<HumorId>[] = [
  { id: "wredny", name: "Wredny", streak: 0, blurb: "Wulgarny, złośliwy, bez litości." },
  { id: "trener", name: "Trener", streak: 5, blurb: "Drze się jak na siłowni. Bez wymówek, byku." },
  { id: "mafioso", name: "Mafioso", streak: 10, blurb: "Składa propozycje nie do odrzucenia." },
  { id: "poeta", name: "Poeta", streak: 21, blurb: "Obraża cię wierszem. Częstochowskim." },
];

export interface Progress {
  /** Current forma streak (today counts once it's in form; otherwise from yesterday). */
  current: number;
  /** Best forma streak ever. */
  best: number;
  /** Weeks (last 12) where all 3 challenges were completed. */
  perfectWeeks: number;
}

export function isUnlocked<T extends string>(u: Unlockable<T>, p: Progress): boolean {
  if (u.weeks != null) return p.perfectWeeks >= u.weeks;
  return p.best >= (u.streak ?? 0);
}

/** The next thing to unlock (by streak) and how many days are missing. */
export function nextUnlock(
  p: Progress,
): { name: string; kind: "mina" | "humor"; missing: number } | null {
  const all = [
    ...FACES.filter((f) => f.streak != null).map((f) => ({ ...f, kind: "mina" as const })),
    ...HUMORS.map((h) => ({ ...h, kind: "humor" as const })),
  ]
    .filter((u) => (u.streak ?? 0) > p.best)
    .sort((a, b) => (a.streak ?? 0) - (b.streak ?? 0));
  const n = all[0];
  return n ? { name: n.name, kind: n.kind, missing: (n.streak ?? 0) - p.current } : null;
}

// ---------------------------------------------------------------------------
// Forma
// ---------------------------------------------------------------------------

type Idx = ReturnType<typeof indexEntries>;

/** Share of the day's habits done (0..1), or null when nothing counted that day. */
export function dayFraction(
  habits: Habit[],
  idx: Idx,
  date: Date,
  now: Date = new Date(),
): number | null {
  let n = 0;
  let sum = 0;
  for (const h of habits) {
    if (!countsOn(h, idx, date, now)) continue;
    n++;
    sum += dayScore(h, idx, date, now);
  }
  return n ? sum / n : null;
}

function firstDay(habits: Habit[], now: Date): Date {
  let first = todayKey(now);
  for (const h of habits) {
    const k = createdKey(h);
    if (k !== "0000-00-00" && k < first) first = k;
  }
  const [y, m, d] = first.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  // cap the scan at two years
  return differenceInCalendarDays(now, start) > 730 ? addDays(now, -730) : start;
}

/**
 * Forma streaks. Days where nothing counted (e.g. only an undecided night)
 * neither extend nor break a streak. Today only extends it once in form.
 */
export function formaStreaks(
  habits: Habit[],
  completions: Completion[],
  now: Date = new Date(),
): Omit<Progress, "perfectWeeks"> {
  const idx = indexEntries(completions);
  const start = firstDay(habits, now);
  const days = differenceInCalendarDays(now, start);
  let run = 0;
  let best = 0;
  for (let i = 0; i <= days; i++) {
    const d = addDays(start, i);
    const f = dayFraction(habits, idx, d, now);
    const isToday = i === days;
    if (f == null) continue;
    if (f >= FORMA) run++;
    else if (!isToday) run = 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

export function progressOf(
  habits: Habit[],
  completions: Completion[],
  nightHits: Record<string, number> = {},
  liveOn = false,
  now: Date = new Date(),
): Progress {
  const s = formaStreaks(habits, completions, now);
  const first = todayKey(firstDay(habits, now));
  const thisWeek = startOfWeek(now, { weekStartsOn: 1 });
  let perfectWeeks = 0;
  for (let w = 1; w <= 12; w++) {
    const monday = addDays(thisWeek, -7 * w);
    if (todayKey(addDays(monday, 6)) < first) break;
    const ch = weeklyChallenges(habits, completions, nightHits, liveOn, now, monday);
    if (ch.length === 3 && ch.every((c) => c.status === "done")) perfectWeeks++;
  }
  return { ...s, perfectWeeks };
}

// ---------------------------------------------------------------------------
// "Kot w domu": the cat's condition follows your form
// ---------------------------------------------------------------------------

export type CatCondition = "groomed" | "normal" | "neglected";

/** A day this weak counts as a bad one for the cat. */
export const BAD_DAY = 0.5;

/**
 * Groomed with a forma streak of 3+ days (a fresh streak wins - quick way back);
 * neglected (and offended) after a week of slips - 4+ bad days (< 50%) out of
 * the last 7 finished days; otherwise normal. Widget: SzpilaWidgetProvider.condMood.
 */
export function catCondition(
  habits: Habit[],
  completions: Completion[],
  now: Date = new Date(),
): CatCondition {
  const idx = indexEntries(completions);
  let bad = 0;
  for (let i = 1; i <= 7; i++) {
    const f = dayFraction(habits, idx, addDays(now, -i), now);
    if (f != null && f < BAD_DAY) bad++;
  }
  if (formaStreaks(habits, completions, now).current >= 3) return "groomed";
  return bad >= 4 ? "neglected" : "normal";
}

export const CONDITION_LABEL: Record<CatCondition, string> = {
  groomed: "zadbany i zadowolony",
  normal: "w normie",
  neglected: "zaniedbany i obrażony",
};

// ---------------------------------------------------------------------------
// Weekly challenges
// ---------------------------------------------------------------------------

export type ChallengeStatus = "active" | "done" | "failed";

export interface Challenge {
  id: string;
  title: string;
  detail: string;
  progress: number;
  goal: number;
  status: ChallengeStatus;
}

/** Deterministic seed from the week's Monday. */
export function weekSeed(monday: Date): number {
  const k = todayKey(monday);
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** "Reach `goal` days": done once reached, failed once it can't be reached anymore. */
function daysStatus(done: number, goal: number, remaining: number): ChallengeStatus {
  if (done >= goal) return "done";
  return done + remaining < goal ? "failed" : "active";
}

/**
 * The three challenges of the week starting `monday` (default: this week),
 * evaluated at `now`. Picked by a seed from the week, so they're stable all
 * week and change every Monday.
 */
export function weeklyChallenges(
  habits: Habit[],
  completions: Completion[],
  nightHits: Record<string, number> = {},
  liveOn = false,
  now: Date = new Date(),
  monday: Date = startOfWeek(now, { weekStartsOn: 1 }),
): Challenge[] {
  const idx = indexEntries(completions);
  const seed = weekSeed(monday);
  const sinceMonday = differenceInCalendarDays(now, monday);
  const weekOver = sinceMonday >= 7;
  const last = Math.min(6, sinceMonday); // last day index with data (today or Sunday)
  const day = (i: number) => addDays(monday, i);
  /** Days still ahead (today included unless `todayCounted`). */
  const remaining = (todayCounted: boolean) => (weekOver ? 0 : 6 - last + (todayCounted ? 0 : 1));
  const inWeek = (h: Habit) =>
    [0, 1, 2, 3, 4, 5, 6].some((i) => countsOn(h, idx, day(i), now) || i > last);
  const builds = habits.filter((h) => kindOf(h) === "build" && inWeek(h));
  const avoids = habits.filter((h) => kindOf(h) === "avoid" && !isAutoScreen(h) && inWeek(h));
  const fractions = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    i <= last ? dayFraction(habits, idx, day(i), now) : null,
  );

  const candidates: (() => Challenge)[] = [];

  // A build habit fully done on 5 days.
  if (builds.length) {
    const h = builds[seed % builds.length];
    candidates.push(() => {
      const hit = [0, 1, 2, 3, 4, 5, 6].map((i) => i <= last && dayScore(h, idx, day(i), now) >= 1);
      const done = hit.filter(Boolean).length;
      return {
        id: "habit5",
        title: `${h.name}: 5 z 7 dni`,
        detail: "Zrób to zadanie w pełni przez 5 dni tego tygodnia.",
        progress: Math.min(done, 5),
        goal: 5,
        status: daysStatus(done, 5, remaining(hit[last])),
      };
    });
  }

  // A forbidden habit without a single slip.
  if (avoids.length) {
    const h = avoids[(seed >>> 4) % avoids.length];
    candidates.push(() => {
      let clean = 0;
      let slipped = false;
      for (let i = 0; i <= last; i++) {
        const st = avoidStatus(h, idx, day(i), now);
        if (st === "slip") slipped = true;
        if (st === "clean") clean++;
      }
      return {
        id: "clean",
        title: `Czysty tydzień: ${h.name}`,
        detail: "Ani jednej wpadki od poniedziałku do niedzieli.",
        progress: clean,
        goal: 7,
        status: slipped ? "failed" : weekOver ? "done" : "active",
      };
    });
  }

  // Four days in form.
  candidates.push(() => {
    const done = fractions.filter((f) => f != null && f >= FORMA).length;
    return {
      id: "forma4",
      title: "4 dni w formie",
      detail: `Dzień w formie = co najmniej ${Math.round(FORMA * 100)}% zadań.`,
      progress: Math.min(done, 4),
      goal: 4,
      status: daysStatus(done, 4, remaining((fractions[last] ?? 0) >= FORMA)),
    };
  });

  // Two perfect days.
  candidates.push(() => {
    const done = fractions.filter((f) => f != null && f >= 1).length;
    return {
      id: "perfect2",
      title: "2 dni na 100%",
      detail: "Dwa dni z kompletem zadań. Bez wyjątków.",
      progress: Math.min(done, 2),
      goal: 2,
      status: daysStatus(done, 2, remaining((fractions[last] ?? 0) >= 1)),
    };
  });

  // No social media after midnight (needs the night guard). Hits are keyed by the evening's day.
  if (liveOn) {
    candidates.push(() => {
      let bad = 0;
      let clean = 0;
      for (let i = 0; i <= last; i++) {
        if ((nightHits[todayKey(day(i))] ?? 0) > 0) bad++;
        else if (i < sinceMonday) clean++; // that night is over
      }
      return {
        id: "night0",
        title: "Zero social mediów po północy",
        detail: "Ani razu TikToka, Insta czy YouTube'a w nocy przez cały tydzień.",
        progress: clean,
        goal: 7,
        status: bad > 0 ? "failed" : weekOver ? "done" : "active",
      };
    });
  }

  // Beat last week over the same window - only with a baseline.
  const at = weekOver
    ? new Date(day(6).getFullYear(), day(6).getMonth(), day(6).getDate(), 23, 59)
    : now;
  const rep = weeklyReport(habits, completions, at);
  if (!rep.noBaseline) {
    candidates.push(() => ({
      id: "beat",
      title: "Pobij zeszły tydzień",
      detail: `Teraz ${rep.thisWeek.rate}% vs ${rep.lastWeek.rate}% tydzień temu (do tej samej chwili).`,
      progress: rep.delta > 0 ? 1 : 0,
      goal: 1,
      status: weekOver ? (rep.delta > 0 ? "done" : "failed") : "active",
    }));
  }

  // Seeded shuffle, take 3.
  return candidates
    .map((c, i) => ({ c, k: Math.imul(seed ^ Math.imul(i + 1, 2654435761), 1597334677) >>> 0 }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 3)
    .map((o) => o.c());
}

// ---------------------------------------------------------------------------
// Humor lines (mixed into Szpila's pools for the hard level)
// ---------------------------------------------------------------------------

interface HumorLines {
  nag: string[];
  avoid: string[];
  praise: string[];
  liveFirst: string[];
  liveEscalate: string[];
}

const HUMOR_LINES: Record<Exclude<HumorId, "wredny">, HumorLines> = {
  trener: {
    nag: [
      "DAWAJ, BYKU! „{name}” sama się nie zrobi! Jeszcze jedno powtórzenie życia!",
      "Co to ma być, rozgrzewka dla emerytów? „{name}” - już, kurwa, bez wymówek!",
      "No pain, no gain! „{name}” czeka, a ty się obijasz jak na dniu nóg.",
      "Mięśnie charakteru same nie urosną. „{name}” - raz, dwa, jazda!",
    ],
    avoid: [
      "Trzymaj gardę! „{name}” to twój najgorszy przeciwnik. Nie dawaj mu się, mięczaku!",
      "Dyscyplina, byku! Żadnego „{name}” dziś, słyszysz?!",
    ],
    praise: [
      "TAK JEST! „{name}” zaliczone! Tak się, kurwa, trenuje!",
      "Pompa! „{name}” zrobione. Jutro ciśniemy dalej, mistrzu!",
    ],
    liveFirst: ["{app} o {time}?! Regeneracja to też trening, byku! Telefon na ławkę i spać!"],
    liveEscalate: ["{m} min na {app}? Nawet cardio tyle nie trwa! Spać, kurwa, natychmiast!"],
  },
  mafioso: {
    nag: [
      "Zrobię ci propozycję nie do odrzucenia: „{name}”. Dziś. Capisce?",
      "Rodzina się niecierpliwi. „{name}” wciąż niezrobione. Nie chcesz nas rozczarować, prawda?",
      "Mam przyjaciół, którzy pytają o „{name}”. Źli przyjaciele. Zrób to.",
      "Szanuję cię. Dlatego mówię po dobroci: „{name}”. Zanim zacznę mówić inaczej.",
    ],
    avoid: [
      "„{name}”? Nie w mojej dzielnicy. Pamiętaj, co się stało z tymi, co się nie słuchali.",
      "Jedna wpadka z „{name}” i budzisz się z głową konia w łóżku. Metaforycznie. Chyba.",
    ],
    praise: [
      "„{name}” załatwione. Rodzina jest z ciebie dumna. Na razie.",
      "Dobra robota z „{name}”. Don Szpila to zapamięta.",
    ],
    liveFirst: [
      "{app} o {time}? Don Szpila nie lubi, jak jego ludzie nie śpią. Odłóż to. Grzecznie proszę. Raz.",
    ],
    liveEscalate: [
      "{m} minut. Moja cierpliwość się kończy, a ja nie proszę dwa razy. Telefon. Odłóż.",
    ],
  },
  poeta: {
    nag: [
      "Litwo, ojczyzno moja, ty jesteś jak zdrowie - „{name}” leży odłogiem, leniu, co mi powiesz?",
      "Na ławce siedzi leń i marnuje dzień - „{name}” czeka w cieniu, a ty w zapomnieniu.",
      "Róże są czerwone, fiołki są blade, „{name}” niezrobione - znowu dajesz ciała, gadzie.",
      "Wstań i rób, bo czas ucieka, „{name}” na ciebie, cholera, czeka.",
    ],
    avoid: [
      "Kto „{name}” ulegnie w nocy czy w dzień, ten rano obudzi się jak stary pień.",
      "Nie „{name}”, bracie, nie tą drogą - bo potem rano nie wstaniesz nogą.",
    ],
    praise: [
      "O, cudzie! „{name}” zrobione - niech będzie ten dzień pochwalone!",
      "Z „{name}” wygrana, chwała ci od rana!",
    ],
    liveFirst: [
      "Północ minęła, a ty w {app} tkwisz - sen ci ucieka, a ty wciąż patrzysz. Idź spać.",
    ],
    liveEscalate: [
      "{m} minut w {app} - o, zgrozo, o, klęsko! Odłóż ten telefon, bo będzie ci ciężko.",
    ],
  },
};

const noLines: HumorLines = { nag: [], avoid: [], praise: [], liveFirst: [], liveEscalate: [] };

export function humorLines(humor: HumorId | undefined): HumorLines {
  return humor && humor !== "wredny" ? HUMOR_LINES[humor] : noLines;
}

/** Live-guard extras for a humor: lines for the first jab and for escalation. */
export function humorLive(humor: HumorId | undefined): { first: string[]; escalate: string[] } {
  const l = humorLines(humor);
  return { first: l.liveFirst, escalate: l.liveEscalate };
}

/**
 * Mix humor lines into a pool so roughly half of the jabs use the humor's
 * voice (humor lines are repeated to balance the bigger base pool).
 */
export function withHumor(base: string[], extra: string[]): string[] {
  if (!extra.length) return base;
  const k = Math.max(1, Math.round(base.length / extra.length));
  const out: string[] = [];
  for (let i = 0; i < k; i++) out.push(...extra);
  return [...out, ...base];
}

/** For a habit: which humor pool feeds its nags. */
export function humorNag(h: Habit, humor: HumorId | undefined): string[] {
  const l = humorLines(humor);
  return kindOf(h) === "avoid" || isAutoScreen(h) ? l.avoid : l.nag;
}
