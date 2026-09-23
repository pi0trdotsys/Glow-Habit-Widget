import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Completion, Habit, HabitColor, HabitSchedule } from "./types";
import { goalOf, kindOf, minuteOfDay, todayKey } from "./utils";

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
};

interface HabitsState {
  habits: Habit[];
  completions: Completion[];
  seeded: boolean;
  userName: string | null;
  setUserName: (name: string) => void;
  notifications: NotificationSettings;
  setNotifications: (n: NotificationSettings) => void;
  /** Daily automatic backup to Download/Loop (Android). */
  autoBackup: boolean;
  setAutoBackup: (on: boolean) => void;
  addHabit: (h: Omit<Habit, "id" | "createdAt">) => string;
  updateHabit: (id: string, patch: Partial<Omit<Habit, "id">>) => void;
  removeHabit: (id: string) => void;
  /** Build: add one step toward the goal. Avoid: confirm a clean day. */
  logStep: (habitId: string, date?: Date) => void;
  /** Build: set the absolute amount for a day (0 clears it). */
  setAmount: (habitId: string, dateKey: string, amount: number, minute?: number) => void;
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
    name: "Telefon do późna",
    icon: "Phone",
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
  "Drink water": { name: "Picie wody", goal: { type: "count", target: 8, step: 1, unit: "szklanek" } },
  "Move 30 min": { name: "Ruch 30 min", goal: { type: "minutes", target: 30, step: 10 } },
  Read: { name: "Czytanie książki", goal: { type: "minutes", target: 20, step: 10 }, timeOfDay: "evening" },
  Meditate: { name: "Medytacja" },
  // "No junk food" done-days map 1:1 onto confirmed clean days of an avoid habit.
  "No junk food": { name: "Fast food", kind: "avoid", limit: { times: 1, period: "week" } },
  Gym: { name: "Siłownia" },
};

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Replace (or drop) the entry for habitId/date. */
function upsert(list: Completion[], habitId: string, date: string, next: Completion | null): Completion[] {
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
      notifications: defaultNotifications,
      setNotifications: (n) => set({ notifications: n }),
      autoBackup: true,
      setAutoBackup: (on) => set({ autoBackup: on }),
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
        set((s) => ({
          completions: upsert(
            s.completions,
            habitId,
            dateKey,
            a > 0 ? { habitId, date: dateKey, amount: a, log: withLog(cur, minute, a) } : null,
          ),
        }));
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
        }>;
        const valid =
          Array.isArray(data.habits) &&
          data.habits.every((h) => h && typeof h.id === "string" && typeof h.name === "string" && h.schedule) &&
          (data.completions == null || Array.isArray(data.completions));
        if (!valid) throw new Error("To nie jest kopia zapasowa Loop.");
        set((s) => ({
          habits: data.habits!,
          completions: (data.completions ?? []).filter((c) => c && typeof c.habitId === "string" && typeof c.date === "string"),
          seeded: true,
          userName: data.userName ?? s.userName,
          notifications: data.notifications ? { ...defaultNotifications, ...data.notifications } : s.notifications,
          autoBackup: data.autoBackup ?? s.autoBackup,
        }));
        return data.habits!.length;
      },
      reset: () => set({ habits: [], completions: [], seeded: false }),
      ensureSeeded: () => {
        if (get().seeded) return;
        const created: Habit[] = seedHabits.map((h) => ({
          ...h,
          id: uid(),
          createdAt: new Date().toISOString(),
        }));
        set({ habits: created, seeded: true });
      },
    }),
    {
      name: "loop-habits-v1",
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<HabitsState>;
        if (version < 2 && Array.isArray(p.habits)) {
          p.habits = p.habits.map((h) => (LEGACY_SEEDS[h.name] ? { ...h, ...LEGACY_SEEDS[h.name] } : h));
          // Legacy "done" entries of a check habit become full amounts of the new goal.
          const byId = new Map(p.habits.map((h) => [h.id, h]));
          p.completions = (p.completions ?? []).map((c) => {
            const h = byId.get(c.habitId);
            if (!h || kindOf(h) === "avoid" || c.amount != null) return c;
            return { ...c, amount: goalOf(h).target };
          });
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
        };
      },
    },
  ),
);

export type { Habit, Completion, HabitColor, HabitSchedule };
