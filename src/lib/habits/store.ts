import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Completion, Habit, HabitColor, HabitSchedule } from "./types";
import type { FaceId, HumorId } from "./gamification";
import type { NightReport } from "@/lib/sensors";
import { loadEnglishLines, setHumor } from "./szpila";
import { detectLang, getLang, L, setLang, type Lang } from "@/lib/i18n";
import { isThemePref, type ThemePref } from "@/lib/theme";
import { translateHabit } from "./seed-names";
import { linkStepsPatch } from "@/lib/steps";
import { linkKropiPatch, type KropiDay } from "@/lib/kropi";
import { appShift, cleanSplit, sameSplit } from "@/lib/apps";
import { normalizeWishlist, wishReady, type WishItem } from "@/lib/shop";
import { weekKey, type WeeklyFocus } from "./focus";
import { goalOf, kindOf, minuteOfDay, todayKey } from "./utils";
import { normalizeCalendarIds } from "@/lib/calendar";
import { emptyJabLearn, mergeJabLog, normalizeJabLearn, type JabLearn } from "./jabs";

export type TauntLevel = "hard" | "soft";

export interface NotificationSettings {
  /** Master daily check-in reminder. */
  enabled: boolean;
  time: string; // "HH:mm"
  /** Weekly recap nudge comparing this week vs last week. */
  weeklyReport: boolean;
  /** Day of week for the weekly recap. 0 = Sunday ... 6 = Saturday. */
  reportDay: number;
  reportTime: string; // "HH:mm"
  /** Motivational midday boosts directly comparing this week vs last week. */
  boosts: boolean;
  /** Persistent notification with today's progress bar + plan for the rest of the day (Android). */
  progress: boolean;
  /** The nasty sidekick ("Szpila") jabbing you during the day (Android). */
  taunts: boolean;
  tauntLevel: TauntLevel;
  /** Jabs per day. */
  tauntsPerDay: number;
  /** Quiet hours ("tryb snu"): no jabs between bedtime and wake-up. "HH:mm". */
  quietFrom: string;
  quietTo: string;
  /** Evening review notification to settle all forbidden habits at once. */
  review: boolean;
  reviewAt: string;
  /** "Szpila na żywo": pop up the moment a social media app opens at night (Android, usage access). */
  live: boolean;
  liveFrom: string;
  liveUntil: string;
  /** Packages the night guard ignores. */
  liveOff: string[];
  /** After the 3rd jab of a session: full-screen block over the app (needs "draw over other apps"). */
  liveBlock: boolean;
  /** "Tryb przed snem": at bedtimeAt Szpila says "put the phone down in 30 min" and the guard starts. */
  bedtime: boolean;
  bedtimeAt: string;
  /** Mornings: social media blocked until the morning habits are ticked off (05:00 .. morningUntil). */
  morningLock: boolean;
  morningUntil: string;
  /** Habit ids required in the morning; null = automatic (brushing teeth + water). */
  morningHabits: string[] | null;
  /** Daily social media limit (05:00 .. bedtime): past it Szpila jabs and blocks. */
  dailyLimit: boolean;
  dailyLimitMin: number;
  /**
   * "Bank minut": "fixed" = dailyLimitMin a day; "bank" = the limit is earned
   * (bankBase + bankPerHabit per finished habit to do + bankPerKSteps per 1000
   * steps, at most bankCap), see src/lib/bank.ts. Default "bank" (also for
   * existing installs - backfilled by merge).
   */
  limitMode: "fixed" | "bank";
  bankBase: number;
  bankPerHabit: number;
  bankPerKSteps: number;
  bankCap: number;
  /**
   * "Cisza nocna": after liveFrom every app outside curfewAllow is blocked at
   * once (alarm, calls, home screen always work). Urgent passes: a growing hold.
   */
  curfew: boolean;
  /** Packages allowed through the curfew (music, a sleep app, a messenger...). */
  curfewAllow: string[];
  /** Darken the screen during an urgent pass. */
  curfewDim: boolean;
  /** "Noc kosztuje dzień": last night's scrolling and passes come off today's limit. */
  nightDebt: boolean;
  /** "24 h do namysłu": shopping apps are blocked; impulses go on the wishlist first (src/lib/shop.ts). */
  shopGuard: boolean;
  /** Shopping packages the guard ignores. */
  shopOff: string[];
  /** Minutes of shopping a pass gives (hold-through or "Kupuję" after 24 h). */
  shopPassMin: number;
  /** "Nie szpiluj w trakcie spotkań": jabs inside a busy event of the picked calendars wait for its end. */
  meetingQuiet: boolean;
  /** "Podpowiadaj wolne okna": free windows for minutes habits (Today, one jab a day) + plan times out of meetings. */
  freeWindows: boolean;
}

/** The cat's look + voice (unlocked by forma streaks, see gamification.ts). */
export interface SzpilaLook {
  face: FaceId;
  humor: HumorId;
}

const defaultNotifications: NotificationSettings = {
  enabled: false,
  time: "20:00",
  weeklyReport: false,
  reportDay: 0, // Sunday
  reportTime: "19:00",
  boosts: false,
  progress: true,
  taunts: true,
  tauntLevel: "hard",
  tauntsPerDay: 5,
  quietFrom: "22:00",
  quietTo: "09:00",
  review: true,
  reviewAt: "21:30",
  live: true,
  liveFrom: "00:00",
  liveUntil: "05:00",
  liveOff: [],
  liveBlock: true,
  bedtime: true,
  bedtimeAt: "23:30",
  morningLock: true,
  morningUntil: "11:00",
  morningHabits: null,
  dailyLimit: true,
  dailyLimitMin: 60,
  limitMode: "bank",
  bankBase: 5,
  bankPerHabit: 10,
  bankPerKSteps: 5,
  bankCap: 120,
  curfew: false,
  curfewAllow: [],
  curfewDim: true,
  nightDebt: true,
  shopGuard: false,
  shopOff: [],
  shopPassMin: 15,
  meetingQuiet: true,
  freeWindows: true,
};

const defaultLook: SzpilaLook = { face: "wredny", humor: "wredny" };

interface HabitsState {
  habits: Habit[];
  completions: Completion[];
  seeded: boolean;
  userName: string | null;
  setUserName: (name: string) => void;
  /** App language (Polish / English), chosen at first launch or in Settings. */
  language: Lang;
  /** Switch the language; default habit names (seeds, templates) follow it. */
  setLanguage: (lang: Lang) => void;
  /** Light / dark / like the phone. */
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  /** Android: the launcher icon matches the theme (off = the original icon). */
  iconFollowsTheme: boolean;
  setIconFollowsTheme: (on: boolean) => void;
  notifications: NotificationSettings;
  setNotifications: (n: NotificationSettings) => void;
  /** "Cel tygodnia": one habit that gets the most attention this week. */
  focus: WeeklyFocus | null;
  /** Set this week's focus (null clears it). */
  setFocus: (habitId: string | null) => void;
  /** Where steps come from: "auto" or the package of one Health Connect source (e.g. Mi Fitness). */
  stepsSource: string;
  setStepsSource: (source: string) => void;
  /** Ids of the phone's calendars to respect (Android calendar provider, any account incl. work). */
  calendars: string[];
  setCalendars: (ids: string[]) => void;
  /** Fill a habit from the band's steps (source "steps"; a goal in thousands becomes real steps). */
  linkSteps: (habitId: string) => void;
  /** Fill a water habit from Kropi (source "kropi", ml; history from Kropi's days). */
  linkKropi: (habitId: string, days: KropiDay[]) => void;
  /** Back to logging by hand (the ml goal stays). */
  unlinkKropi: (habitId: string) => void;
  /** Count a minutes habit from apps (source "apps", e.g. Duolingo + Busuu); empty list unlinks. */
  linkApps: (habitId: string, apps: string[]) => void;
  /**
   * source "apps": the day's app minutes (and per-app split) from the phone.
   * The manual adjustment (amount - appMin) stays on top (src/lib/apps.ts appShift).
   */
  setAppMinutes: (
    habitId: string,
    dateKey: string,
    minutes: number,
    split?: Record<string, number>,
    minute?: number,
  ) => void;
  /** Daily automatic backup to Download/Szpila (Android). */
  autoBackup: boolean;
  setAutoBackup: (on: boolean) => void;
  /** Night-time social media visits per habit day (from the native night guard). */
  nightHits: Record<string, number>;
  mergeNightHits: (hits: Record<string, number>) => void;
  /** "Rachunek za noc" per night (habit day of the evening). */
  nightReports: Record<string, NightReport>;
  mergeNightReports: (r: Record<string, NightReport>) => void;
  /** Social media minutes per day (05:00 .. bedtime), from the native guard. */
  daySocial: Record<string, number>;
  mergeDaySocial: (m: Record<string, number>) => void;
  /** The day's actual limit ("yyyy-MM-dd" -> min; what the bank held in bank mode), from the native guard. */
  dayLimits: Record<string, number>;
  mergeDayLimits: (m: Record<string, number>) => void;
  szpila: SzpilaLook;
  setSzpila: (look: Partial<SzpilaLook>) => void;
  /** "Co na ciebie działa": what Szpila learned about its jabs (src/lib/habits/jabs.ts). */
  jabLearn: JabLearn;
  /** Fold the native jab log (HabitWidget.jabStats) into jabLearn; idempotent. */
  mergeJabs: (entries: unknown[], now?: number) => void;
  /** Forget everything learned (older native log entries are ignored from now on). */
  resetJabs: (now?: number) => void;
  /** "24 h do namysłu": things to buy wait a day before they can be bought (src/lib/shop.ts). */
  wishlist: WishItem[];
  addWish: (w: { name: string; price?: number; app?: string }, now?: Date) => string;
  /** "Kupuję" (only once ready, see wishReady) or "Już nie chcę" (any time). */
  decideWish: (id: string, status: "bought" | "dropped", now?: Date) => void;
  removeWish: (id: string) => void;
  addHabit: (h: Omit<Habit, "id" | "createdAt">) => string;
  updateHabit: (id: string, patch: Partial<Omit<Habit, "id">>) => void;
  removeHabit: (id: string) => void;
  /** Build: add one step toward the goal. Avoid: confirm a clean day. */
  logStep: (habitId: string, date?: Date) => void;
  /** Build: set the absolute amount for a day (0 clears it). */
  setAmount: (habitId: string, dateKey: string, amount: number, minute?: number) => void;
  /**
   * Build: undo the last change of the day's amount (swipe on a tile). Avoid:
   * clear the day's answer. Returns the amount/status it went back to, or null
   * when there was nothing to undo.
   */
  undoLast: (habitId: string, dateKey: string) => number | "cleared" | null;
  /** Avoid: mark a day clean, admit a slip, or clear the confirmation. */
  setAvoid: (
    habitId: string,
    dateKey: string,
    status: "clean" | "slip" | null,
    minute?: number,
    auto?: boolean,
  ) => void;
  toggleCompletion: (habitId: string, date?: Date) => void;
  setCompletion: (habitId: string, dateKey: string, done: boolean) => void;
  isCompleted: (habitId: string, date?: Date) => boolean;
  /** Full backup as JSON (habits, history, name, settings). */
  exportData: () => string;
  /** Restore a backup. Throws on invalid input. Returns the number of habits restored. */
  importData: (json: string) => number;
  reset: () => void;
  ensureSeeded: () => void;
}

const seedHabits: Omit<Habit, "id" | "createdAt">[] = [
  {
    name: "Mycie zębów",
    icon: "Tooth",
    color: "mint",
    schedule: { type: "daily" },
    goal: { type: "count", target: 2, step: 1, unit: "razy" },
  },
  {
    name: "Picie wody",
    icon: "GlassWater",
    color: "sky",
    schedule: { type: "daily" },
    goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
  },
  {
    name: "8000 kroków",
    icon: "Footprints",
    color: "lime",
    schedule: { type: "daily" },
    goal: { type: "count", target: 8000, step: 1000, unit: "kroków" },
  },
  {
    name: "Czytanie książki",
    icon: "BookOpen",
    color: "amber",
    schedule: { type: "daily" },
    goal: { type: "minutes", target: 20, step: 10 },
    timeOfDay: "evening",
  },
  {
    name: "Programuj",
    icon: "Code",
    color: "violet",
    schedule: { type: "daily" },
    goal: { type: "minutes", target: 30, step: 15 },
  },
  {
    name: "Ucz się języka obcego",
    icon: "Languages",
    color: "coral",
    schedule: { type: "daily" },
    goal: { type: "minutes", target: 15, step: 5 },
  },
  {
    name: "Scrollowanie w łóżku",
    icon: "Smartphone",
    color: "rose",
    schedule: { type: "daily" },
    kind: "avoid",
    limit: { times: 1, period: "week" },
  },
  {
    name: "Fast food",
    icon: "Utensils",
    color: "coral",
    schedule: { type: "daily" },
    kind: "avoid",
    limit: { times: 1, period: "week" },
  },
];

/** Old English seed habits -> their Polish equivalents (applied once on upgrade). */
const LEGACY_SEEDS: Record<string, Partial<Habit>> = {
  "Drink water": {
    name: "Picie wody",
    goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
  },
  "Move 30 min": { name: "Ruch 30 min", goal: { type: "minutes", target: 30, step: 10 } },
  Read: {
    name: "Czytanie książki",
    goal: { type: "minutes", target: 20, step: 10 },
    timeOfDay: "evening",
  },
  Meditate: { name: "Medytacja" },
  // "No junk food" done-days map 1:1 onto confirmed clean days of an avoid habit.
  "No junk food": { name: "Fast food", kind: "avoid", limit: { times: 1, period: "week" } },
  Gym: { name: "Siłownia" },
};

/** How many steps back a swipe can undo per habit and day. */
export const UNDO_DEPTH = 10;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Replace (or drop) the entry for habitId/date. */
function upsert(
  list: Completion[],
  habitId: string,
  date: string,
  next: Completion | null,
): Completion[] {
  const rest = list.filter((c) => !(c.habitId === habitId && c.date === date));
  return next ? [...rest, next] : rest;
}

/** Append to the day's log, keeping at most one point per hour (so <= 24, e.g. for step syncs). */
function withLog(prev: Completion | undefined, minute: number, value: number): [number, number][] {
  const log = (prev?.log ?? []).filter(([m]) => Math.floor(m / 60) !== Math.floor(minute / 60));
  return [...log, [minute, value] as [number, number]].sort((a, b) => a[0] - b[0]);
}

export const useHabits = create<HabitsState>()(
  persist(
    (set, get) => ({
      habits: [],
      completions: [],
      seeded: false,
      userName: null,
      setUserName: (name) => set({ userName: name.trim() || null }),
      focus: null,
      setFocus: (habitId) =>
        set((s) => {
          if (!habitId) return { focus: null };
          const week = weekKey();
          // Re-picking the same habit keeps its start; a new pick is judged from today.
          const same = s.focus?.week === week && s.focus.habitId === habitId;
          return { focus: { week, habitId, since: same ? s.focus!.since : todayKey() } };
        }),
      stepsSource: "auto",
      setStepsSource: (source) => set({ stepsSource: source || "auto" }),
      calendars: [],
      setCalendars: (ids) => set({ calendars: normalizeCalendarIds(ids) }),
      linkKropi: (habitId, days) =>
        set((s) => {
          const h = s.habits.find((x) => x.id === habitId);
          if (!h || kindOf(h) === "avoid") return {};
          const p = linkKropiPatch(h, s.completions, days);
          return {
            habits: s.habits.map((x) =>
              x.id === habitId ? { ...x, source: "kropi" as const, goal: p.goal } : x,
            ),
            completions: p.completions,
          };
        }),
      unlinkKropi: (habitId) =>
        set((s) => ({
          habits: s.habits.map((x) =>
            x.id === habitId && x.source === "kropi" ? { ...x, source: undefined } : x,
          ),
        })),
      linkApps: (habitId, apps) =>
        set((s) => {
          const h = s.habits.find((x) => x.id === habitId);
          if (!h || kindOf(h) === "avoid") return {};
          const list = [...new Set(apps.filter(Boolean))];
          return {
            habits: s.habits.map((x) =>
              x.id !== habitId
                ? x
                : list.length
                  ? {
                      ...x,
                      source: "apps" as const,
                      apps: list,
                      goal:
                        goalOf(x).type === "minutes"
                          ? x.goal
                          : { type: "minutes", target: 15, step: 5 },
                    }
                  : { ...x, source: x.source === "apps" ? undefined : x.source, apps: undefined },
            ),
          };
        }),
      setAppMinutes: (habitId, dateKey, minutes, split, minute = minuteOfDay()) => {
        const cur = get().completions.find((c) => c.habitId === habitId && c.date === dateKey);
        const m = Math.max(0, Math.round(minutes));
        const sp = split ? cleanSplit(split) : (cur?.appSplit ?? {});
        if (!cur && m === 0) return;
        if (cur && cur.appMin === m && sameSplit(cur.appSplit, sp)) return;
        const { amount, prev } = appShift(cur, m);
        const moved = !cur || amount !== (cur.amount ?? 1);
        const next: Completion = {
          ...(cur ?? { habitId, date: dateKey }),
          amount,
          appMin: m,
        };
        if (Object.keys(sp).length) next.appSplit = sp;
        else delete next.appSplit;
        if (prev) next.prev = prev;
        if (moved) next.log = withLog(cur, minute, amount);
        set((s) => ({ completions: upsert(s.completions, habitId, dateKey, next) }));
      },
      linkSteps: (habitId) =>
        set((s) => {
          const h = s.habits.find((x) => x.id === habitId);
          if (!h || kindOf(h) === "avoid") return {};
          const p = linkStepsPatch(h, s.completions);
          return {
            habits: s.habits.map((x) =>
              x.id === habitId ? { ...x, source: "steps" as const, goal: p.goal } : x,
            ),
            completions: p.completions,
          };
        }),
      theme: "system",
      setTheme: (t) => set({ theme: t }),
      iconFollowsTheme: true,
      setIconFollowsTheme: (on) => set({ iconFollowsTheme: on }),
      language: detectLang(),
      setLanguage: (lang) =>
        set((s) => ({
          language: lang,
          habits: s.habits.map((h) => ({
            ...translateHabit(h, lang),
            id: h.id,
            createdAt: h.createdAt,
          })),
        })),
      notifications: defaultNotifications,
      setNotifications: (n) => set({ notifications: n }),
      autoBackup: true,
      setAutoBackup: (on) => set({ autoBackup: on }),
      nightHits: {},
      mergeNightHits: (hits) =>
        set((s) => {
          const next = { ...s.nightHits };
          let changed = false;
          for (const [k, v] of Object.entries(hits)) {
            if (typeof v === "number" && v > (next[k] ?? 0)) {
              next[k] = v;
              changed = true;
            }
          }
          return changed ? { nightHits: next } : {};
        }),
      nightReports: {},
      mergeNightReports: (r) =>
        set((s) => {
          const next = { ...s.nightReports, ...r };
          // A fresh read without sleep (band not synced / permission gone) keeps the sleep seen earlier.
          for (const [k, v] of Object.entries(r)) {
            const old = s.nightReports[k]?.sleep;
            if (!v.sleep && old) next[k] = { ...v, sleep: old };
          }
          // keep ~120 nights
          const keys = Object.keys(next).sort();
          for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete next[k];
          return { nightReports: next };
        }),
      daySocial: {},
      mergeDaySocial: (m) =>
        set((s) => {
          const next = { ...s.daySocial };
          let changed = false;
          for (const [k, v] of Object.entries(m)) {
            if (typeof v === "number" && v !== next[k]) {
              next[k] = v;
              changed = true;
            }
          }
          if (!changed) return {};
          const keys = Object.keys(next).sort();
          for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete next[k];
          return { daySocial: next };
        }),
      dayLimits: {},
      mergeDayLimits: (m) =>
        set((s) => {
          const next = { ...s.dayLimits };
          let changed = false;
          for (const [k, v] of Object.entries(m)) {
            if (typeof v === "number" && v !== next[k]) {
              next[k] = v;
              changed = true;
            }
          }
          if (!changed) return {};
          const keys = Object.keys(next).sort();
          for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete next[k];
          return { dayLimits: next };
        }),
      szpila: defaultLook,
      setSzpila: (look) => set((s) => ({ szpila: { ...s.szpila, ...look } })),
      jabLearn: emptyJabLearn(),
      mergeJabs: (entries, now = Date.now()) =>
        set((s) => {
          const next = mergeJabLog(s.jabLearn, entries, s.completions, s.habits, now);
          return next === s.jabLearn ? {} : { jabLearn: next };
        }),
      resetJabs: (now = Date.now()) => set({ jabLearn: emptyJabLearn(now) }),
      wishlist: [],
      addWish: (w, now = new Date()) => {
        const id = uid();
        const name = w.name.trim().slice(0, 80);
        if (!name) return "";
        const item: WishItem = {
          id,
          name,
          addedAt: now.toISOString(),
          status: "waiting",
          ...(w.price != null && w.price > 0 ? { price: w.price } : {}),
          ...(w.app ? { app: w.app } : {}),
        };
        // keep the newest 200
        set((s) => ({ wishlist: [...s.wishlist, item].slice(-200) }));
        return id;
      },
      decideWish: (id, status, now = new Date()) =>
        set((s) => ({
          wishlist: s.wishlist.map((w) =>
            w.id !== id || w.status !== "waiting" || (status === "bought" && !wishReady(w, now))
              ? w
              : { ...w, status, decidedAt: now.toISOString() },
          ),
        })),
      removeWish: (id) => set((s) => ({ wishlist: s.wishlist.filter((w) => w.id !== id) })),
      addHabit: (h) => {
        const id = uid();
        const habit: Habit = { ...h, id, createdAt: new Date().toISOString() };
        set((s) => ({ habits: [...s.habits, habit] }));
        return id;
      },
      updateHabit: (id, patch) =>
        set((s) => ({
          habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)),
        })),
      removeHabit: (id) =>
        set((s) => ({
          habits: s.habits.filter((h) => h.id !== id),
          completions: s.completions.filter((c) => c.habitId !== id),
        })),
      logStep: (habitId, date = new Date()) => {
        const h = get().habits.find((x) => x.id === habitId);
        if (!h) return;
        const key = todayKey(date);
        if (kindOf(h) === "avoid") {
          get().setAvoid(habitId, key, "clean");
          return;
        }
        const g = goalOf(h);
        const cur = get().completions.find((c) => c.habitId === habitId && c.date === key);
        const amount = Math.min(g.target, (cur?.amount ?? (cur ? 1 : 0)) + g.step);
        get().setAmount(habitId, key, amount);
      },
      setAmount: (habitId, dateKey, amount, minute = minuteOfDay()) => {
        const cur = get().completions.find((c) => c.habitId === habitId && c.date === dateKey);
        const a = Math.max(0, Math.round(amount));
        const before = cur ? (cur.amount ?? 1) : 0;
        if (a === before && cur) return;
        // Remember where we came from, so a swipe can go back step by step.
        const prev = [...(cur?.prev ?? []), before].slice(-UNDO_DEPTH);
        set((s) => ({
          completions: upsert(
            s.completions,
            habitId,
            dateKey,
            // An explicit 0 stays (with its undo stack) so a clear can be undone too.
            a > 0 || before > 0
              ? {
                  habitId,
                  date: dateKey,
                  amount: a,
                  log: withLog(cur, minute, a),
                  prev,
                  // Minutes from apps: the amount set by hand only moves the manual part.
                  ...(cur?.appMin != null ? { appMin: cur.appMin } : {}),
                  ...(cur?.appSplit ? { appSplit: cur.appSplit } : {}),
                }
              : null,
          ),
        }));
      },
      undoLast: (habitId, dateKey) => {
        const h = get().habits.find((x) => x.id === habitId);
        const cur = get().completions.find((c) => c.habitId === habitId && c.date === dateKey);
        if (!h || !cur) return null;
        if (kindOf(h) === "avoid") {
          get().setAvoid(habitId, dateKey, null);
          return "cleared";
        }
        const stack = cur.prev ?? [];
        if (stack.length === 0) {
          // Only app minutes (nothing typed by hand): nothing to undo - they'd sync right back.
          if ((cur.amount ?? 1) === 0 || cur.appMin != null) return null;
          set((s) => ({ completions: upsert(s.completions, habitId, dateKey, null) }));
          return 0;
        }
        const back = stack[stack.length - 1];
        const rest = stack.slice(0, -1);
        set((s) => ({
          completions: upsert(
            s.completions,
            habitId,
            dateKey,
            back > 0 || rest.length > 0
              ? { ...cur, amount: back, prev: rest, log: withLog(cur, minuteOfDay(), back) }
              : null,
          ),
        }));
        return back;
      },
      setAvoid: (habitId, dateKey, status, minute = minuteOfDay(), auto = false) => {
        const cur = get().completions.find((c) => c.habitId === habitId && c.date === dateKey);
        set((s) => ({
          completions: upsert(
            s.completions,
            habitId,
            dateKey,
            status
              ? {
                  habitId,
                  date: dateKey,
                  ...(status === "slip" ? { slipped: true } : {}),
                  ...(auto ? { auto: true } : {}),
                  log: withLog(cur, minute, status === "slip" ? -1 : 1),
                }
              : null,
          ),
        }));
      },
      toggleCompletion: (habitId, date = new Date()) => {
        get().setCompletion(habitId, todayKey(date), !get().isCompleted(habitId, date));
      },
      setCompletion: (habitId, dateKey, done) => {
        const h = get().habits.find((x) => x.id === habitId);
        if (!h) return;
        if (kindOf(h) === "avoid") get().setAvoid(habitId, dateKey, done ? "clean" : null);
        else get().setAmount(habitId, dateKey, done ? goalOf(h).target : 0);
      },
      isCompleted: (habitId, date = new Date()) => {
        const h = get().habits.find((x) => x.id === habitId);
        const key = todayKey(date);
        const e = get().completions.find((c) => c.habitId === habitId && c.date === key);
        if (!h || !e) return false;
        if (kindOf(h) === "avoid") return !e.slipped;
        return (e.amount ?? 1) >= goalOf(h).target;
      },
      exportData: () => {
        const s = get();
        return JSON.stringify({
          app: "loop",
          version: 2,
          exportedAt: new Date().toISOString(),
          userName: s.userName,
          notifications: s.notifications,
          autoBackup: s.autoBackup,
          nightHits: s.nightHits,
          nightReports: s.nightReports,
          daySocial: s.daySocial,
          dayLimits: s.dayLimits,
          stepsSource: s.stepsSource,
          calendars: s.calendars,
          wishlist: s.wishlist,
          focus: s.focus,
          szpila: s.szpila,
          jabLearn: s.jabLearn,
          language: s.language,
          theme: s.theme,
          iconFollowsTheme: s.iconFollowsTheme,
          habits: s.habits,
          completions: s.completions,
        });
      },
      importData: (json) => {
        const data = JSON.parse(json) as Partial<{
          habits: Habit[];
          completions: Completion[];
          userName: string | null;
          notifications: Partial<NotificationSettings>;
          autoBackup: boolean;
          nightHits: Record<string, number>;
          nightReports: Record<string, NightReport>;
          daySocial: Record<string, number>;
          dayLimits: Record<string, number>;
          stepsSource: string;
          calendars: unknown;
          wishlist: unknown;
          focus: WeeklyFocus | null;
          szpila: Partial<SzpilaLook>;
          jabLearn: unknown;
          iconFollowsTheme: boolean;
        }>;
        const valid =
          Array.isArray(data.habits) &&
          data.habits.every(
            (h) => h && typeof h.id === "string" && typeof h.name === "string" && h.schedule,
          ) &&
          (data.completions == null || Array.isArray(data.completions));
        if (!valid)
          throw new Error(L("To nie jest kopia zapasowa Szpili.", "This is not a Szpila backup."));
        set((s) => ({
          habits: data.habits!,
          completions: (data.completions ?? []).filter(
            (c) => c && typeof c.habitId === "string" && typeof c.date === "string",
          ),
          seeded: true,
          userName: data.userName ?? s.userName,
          notifications: data.notifications
            ? { ...defaultNotifications, ...data.notifications }
            : s.notifications,
          autoBackup: data.autoBackup ?? s.autoBackup,
          nightHits:
            data.nightHits && typeof data.nightHits === "object" ? data.nightHits : s.nightHits,
          szpila: data.szpila ? { ...defaultLook, ...data.szpila } : s.szpila,
          jabLearn: data.jabLearn ? normalizeJabLearn(data.jabLearn) : s.jabLearn,
          iconFollowsTheme:
            typeof data.iconFollowsTheme === "boolean" ? data.iconFollowsTheme : s.iconFollowsTheme,
          nightReports:
            data.nightReports && typeof data.nightReports === "object"
              ? data.nightReports
              : s.nightReports,
          daySocial:
            data.daySocial && typeof data.daySocial === "object" ? data.daySocial : s.daySocial,
          dayLimits:
            data.dayLimits && typeof data.dayLimits === "object" ? data.dayLimits : s.dayLimits,
          stepsSource: typeof data.stepsSource === "string" ? data.stepsSource : s.stepsSource,
          calendars: Array.isArray(data.calendars)
            ? normalizeCalendarIds(data.calendars)
            : s.calendars,
          wishlist: Array.isArray(data.wishlist) ? normalizeWishlist(data.wishlist) : s.wishlist,
          focus:
            data.focus &&
            typeof data.focus.habitId === "string" &&
            typeof data.focus.week === "string"
              ? data.focus
              : s.focus,
        }));
        return data.habits!.length;
      },
      reset: () => set({ habits: [], completions: [], seeded: false }),
      ensureSeeded: () => {
        if (get().seeded) return;
        const created: Habit[] = seedHabits.map((h) => ({
          ...translateHabit(h, getLang()),
          id: uid(),
          createdAt: new Date().toISOString(),
        }));
        set({ habits: created, seeded: true });
      },
    }),
    {
      name: "loop-habits-v1",
      version: 3,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<HabitsState>;
        if (version < 2 && Array.isArray(p.habits)) {
          p.habits = p.habits.map((h) =>
            LEGACY_SEEDS[h.name] ? { ...h, ...LEGACY_SEEDS[h.name] } : h,
          );
          // Legacy "done" entries of a check habit become full amounts of the new goal.
          const byId = new Map(p.habits.map((h) => [h.id, h]));
          p.completions = (p.completions ?? []).map((c) => {
            const h = byId.get(c.habitId);
            if (!h || kindOf(h) === "avoid" || c.amount != null) return c;
            return { ...c, amount: goalOf(h).target };
          });
        }
        if (version < 3 && Array.isArray(p.habits)) {
          // "Telefon do późna" is really about scrolling in bed.
          p.habits = p.habits.map((h) =>
            h.name === "Telefon do późna"
              ? {
                  ...h,
                  name: "Scrollowanie w łóżku",
                  icon: h.icon === "Phone" ? "Smartphone" : h.icon,
                }
              : h,
          );
          // Coding + a foreign language join the default set (unless already tracked).
          const has = (re: RegExp) => p.habits!.some((h) => re.test(h.name.toLowerCase()));
          const now = new Date().toISOString();
          for (const seed of seedHabits.filter(
            (s) => s.name === "Programuj" || s.name === "Ucz się języka obcego",
          )) {
            const re = seed.name === "Programuj" ? /program|kod|code/ : /j[ęe]zyk|angiel|duolingo/;
            if (!has(re)) p.habits.push({ ...seed, id: uid(), createdAt: now });
          }
        }
        return p as HabitsState;
      },
      // Backfill any notification fields added after a user first persisted
      // (e.g. weeklyReport / reportTime) so older saves don't break.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<HabitsState>;
        return {
          ...current,
          ...p,
          notifications: { ...defaultNotifications, ...(p.notifications ?? {}) },
          szpila: { ...defaultLook, ...(p.szpila ?? {}) },
          jabLearn: normalizeJabLearn(p.jabLearn),
          nightHits: p.nightHits ?? {},
          nightReports: p.nightReports ?? {},
          daySocial: p.daySocial ?? {},
          dayLimits: p.dayLimits ?? {},
          // A palette this version does not know (e.g. from a newer backup) = like the phone.
          theme: isThemePref(p.theme) ? p.theme : "system",
          iconFollowsTheme: typeof p.iconFollowsTheme === "boolean" ? p.iconFollowsTheme : true,
          stepsSource: p.stepsSource || "auto",
          calendars: normalizeCalendarIds(p.calendars),
          wishlist: normalizeWishlist(p.wishlist),
          focus: p.focus ?? null,
        };
      },
    },
  ),
);

// Keep Szpila's voice in sync with the chosen humor (also after rehydration).
setHumor(useHabits.getState().szpila.humor);
setLang(useHabits.getState().language);
if (getLang() === "en") void loadEnglishLines();
useHabits.subscribe((s) => {
  setHumor(s.szpila.humor);
  if (s.language !== getLang()) {
    setLang(s.language);
    if (s.language === "en") void loadEnglishLines();
  }
});

export type { Habit, Completion, HabitColor, HabitSchedule };
