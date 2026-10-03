// Automatic tracking inside the app (Android only; no-ops on web):
//  - steps: build habits with source "steps" take today's count from Health Connect
//  - screen: avoid habits with source "screen" are judged from late-night
//    screen time (usage access): > lateLimit minutes after lateAfter = slip,
//    otherwise the night is confirmed clean once it's over (05:00).
// The native alarm tick does the same in the background (HabitNotifier.java);
// this runs whenever the app is opened so the UI is current immediately.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { addDays } from "date-fns";
import { useHabits } from "@/lib/habits/store";
import { amountOn, goalOf, isDueOn, kindOf, todayKey } from "@/lib/habits/utils";
import type { Habit } from "@/lib/habits/types";
import type { StepsSource } from "@/lib/steps";
import { isKropi, kropiDays, kropiUpdates } from "@/lib/kropi";
import { APP_SYNC_DAYS, appMinutes, appUpdates, isAppsHabit } from "@/lib/apps";

export interface StepsStatus {
  available: boolean;
  granted: boolean;
  background: boolean;
  /** Sleep (Health Connect, for the night bill); absent on older native builds. */
  sleep?: boolean;
}

interface SensorsPlugin {
  stepsStatus(): Promise<StepsStatus>;
  requestSteps(): Promise<StepsStatus>;
  readSteps(opts?: { source?: string }): Promise<{ steps: number }>;
  stepsSources(): Promise<{ sources: StepsSource[]; wearable?: { pkg: string; label: string } }>;
  openApp(opts: { pkg: string }): Promise<void>;
  screenStatus(): Promise<{ granted: boolean }>;
  openUsageSettings(): Promise<void>;
  lateScreen(opts: { afterMin: number; days: number }): Promise<{
    nights: LateNight[];
  }>;
  nightReport(opts: { daysAgo: number }): Promise<NightReport>;
}
const Native = registerPlugin<SensorsPlugin>("HabitWidget");

/** One night from the native side: screen minutes and social media minutes after lateAfter. */
export interface LateNight {
  daysAgo: number;
  minutes: number;
  /** Social media minutes (absent on older native builds). */
  social?: number;
  closed: boolean;
}

/** "Rachunek za noc" for one night (NightStats.report). */
export interface NightReport {
  date: string;
  granted: boolean;
  apps?: { pkg: string; label: string; visits: number; minutes: number }[];
  visits?: number;
  /** Social media minutes after midnight. */
  social?: number;
  /** Screen-on minutes after midnight. */
  screen?: number;
  /** Minute of day the phone went down for the night, -1 = unknown. */
  asleep?: number;
  closed?: boolean;
  /** Curfew: blocks shown, urgent passes taken, unplugs after the deadline. */
  curfewBlocks?: number;
  curfewPasses?: number;
  unplugs?: number;
  /** Minute of day the phone went on the charger that night, -1 = not seen. */
  charged?: number;
  /** Sleep from the band (Health Connect), when granted and synced. */
  sleep?: NightSleep;
}

/** The night's main sleep (HealthSleep / SleepCalc on the native side). */
export interface NightSleep {
  /** Minutes of day the sleep started / ended. */
  start: number;
  end: number;
  /** Minutes asleep (awake stages left out). */
  minutes: number;
  /** Stage minutes, only when the source wrote stages. */
  deep?: number;
  rem?: number;
  light?: number;
  awake?: number;
  /** Package that wrote it (e.g. com.xiaomi.wearable = Mi Fitness). */
  source: string;
}

const isNative = () => Capacitor.isNativePlatform();

const OFF: StepsStatus = { available: false, granted: false, background: false };

export async function stepsStatus(): Promise<StepsStatus> {
  if (!isNative()) return OFF;
  try {
    return await Native.stepsStatus();
  } catch {
    return OFF;
  }
}

export async function requestSteps(): Promise<StepsStatus> {
  if (!isNative()) return OFF;
  try {
    return await Native.requestSteps();
  } catch {
    return OFF;
  }
}

export async function screenGranted(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await Native.screenStatus()).granted;
  } catch {
    return false;
  }
}

export async function openUsageSettings(): Promise<void> {
  if (isNative()) await Native.openUsageSettings();
}

/** "Late" starts after midnight by default - an hour before 05:00 means that night, after 24:00. */
export const DEFAULT_LATE_AFTER = "00:00";
export const DEFAULT_LATE_LIMIT = 15;

export function lateBasisOf(h: Habit): "social" | "screen" {
  return h.lateBasis ?? "social";
}

/** Apps writing steps to Health Connect today (with counts) + the band app to open for a sync. */
export async function stepsSources(): Promise<{
  sources: StepsSource[];
  wearable: { pkg: string; label: string } | null;
}> {
  if (!isNative()) return { sources: [], wearable: null };
  try {
    const r = await Native.stepsSources();
    return { sources: r.sources ?? [], wearable: r.wearable ?? null };
  } catch {
    return { sources: [], wearable: null };
  }
}

/** Open another app (Mi Fitness: the band syncs its steps to Health Connect). */
export async function openApp(pkg: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await Native.openApp({ pkg });
    return true;
  } catch {
    return false;
  }
}

/** Kropi's water into the "kropi" habits (amounts for the last days + Kropi's goal). */
async function syncKropi(): Promise<void> {
  const { habits, completions, setAmount, updateHabit } = useHabits.getState();
  const linked = habits.filter(isKropi);
  if (linked.length === 0) return;
  const days = await kropiDays();
  if (days.length === 0) return;
  const today = todayKey(new Date());
  for (const h of linked) {
    const u = kropiUpdates(h, completions, days, today);
    for (const a of u.amounts) setAmount(h.id, a.date, a.ml);
    if (u.target != null) updateHabit(h.id, { goal: { ...goalOf(h), target: u.target } });
  }
}

/** Pull Kropi's water right now (after linking, on return from Kropi). */
export async function syncKropiNow(): Promise<void> {
  if (isNative()) await syncKropi().catch(() => {});
}

/**
 * App minutes into the "apps" habits (today + the last days): the manual
 * adjustment of each day stays on top (store.setAppMinutes).
 */
async function syncApps(): Promise<void> {
  const { habits } = useHabits.getState();
  const linked = habits.filter(isAppsHabit);
  if (linked.length === 0) return;
  const pkgs = [...new Set(linked.flatMap((h) => h.apps ?? []))];
  const days = await appMinutes(pkgs, APP_SYNC_DAYS);
  if (!days) return;
  for (const h of linked) {
    const { completions, setAppMinutes } = useHabits.getState();
    const due = (date: string) => isDueOn(h, new Date(`${date}T12:00:00`));
    for (const u of appUpdates(h, completions, days, due))
      setAppMinutes(h.id, u.date, u.minutes, u.split);
  }
}

/** Pull app minutes right now (after linking apps, on return to the app). */
export async function syncAppsNow(): Promise<void> {
  if (isNative()) await syncApps().catch(() => {});
}

/** Pull today's steps right now (e.g. after a source change or a band sync). */
export async function syncStepsNow(): Promise<void> {
  if (isNative()) await syncSteps().catch(() => {});
}

/** The minutes that judge a night: social media only (default) or any screen time. */
export function nightMinutes(n: LateNight, basis: "social" | "screen"): number {
  if (basis === "social" && n.social != null) return n.social;
  return n.minutes;
}

export function lateAfterMin(h: Habit): number {
  const [hh, mm] = (h.lateAfter || DEFAULT_LATE_AFTER).split(":").map(Number);
  return hh * 60 + (mm || 0);
}

async function syncSteps(): Promise<void> {
  const { habits, completions, setAmount, stepsSource } = useHabits.getState();
  const stepHabits = habits.filter((h) => kindOf(h) === "build" && h.source === "steps");
  if (stepHabits.length === 0) return;
  const { steps } = await Native.readSteps({ source: stepsSource || "auto" });
  if (steps < 0) return;
  const today = new Date();
  for (const h of stepHabits) {
    if (!isDueOn(h, today)) continue;
    if (amountOn(h, completions, today) !== steps) setAmount(h.id, todayKey(today), steps);
  }
}

/**
 * Verdict for one screen-judged night: over the limit = slip (even mid-night),
 * the night is over within the limit = clean, otherwise still undecided (null).
 * Mirrors HabitNotifier.checkLateScreen.
 */
export function screenVerdict(
  minutes: number,
  limit: number,
  closed: boolean,
): "clean" | "slip" | null {
  if (minutes > limit) return "slip";
  return closed ? "clean" : null;
}

async function syncScreen(): Promise<void> {
  const { habits, completions, setAvoid } = useHabits.getState();
  const screenHabits = habits.filter((h) => kindOf(h) === "avoid" && h.source === "screen");
  if (screenHabits.length === 0 || !(await screenGranted())) return;
  const now = new Date();
  for (const h of screenHabits) {
    const limit = h.lateLimit ?? DEFAULT_LATE_LIMIT;
    const { nights } = await Native.lateScreen({ afterMin: lateAfterMin(h), days: 7 });
    for (const n of nights) {
      const minutes = nightMinutes(n, lateBasisOf(h));
      if (minutes < 0) continue;
      const day = addDays(now, -n.daysAgo);
      if (!isDueOn(h, day)) continue;
      const key = todayKey(day);
      const existing = completions.find((c) => c.habitId === h.id && c.date === key);
      if (existing && !existing.auto) continue; // a manual answer always wins
      const current = existing ? (existing.slipped ? "slip" : "clean") : null;
      const status = screenVerdict(minutes, limit, n.closed);
      // Also clears automatic verdicts that no longer hold (e.g. from an older, wrong window).
      if (current !== status) setAvoid(h.id, key, status, undefined, true);
    }
  }
}

/** Last nights' bills (social media per app, screen minutes, asleep) into the store. */
async function syncNights(): Promise<void> {
  if (!(await screenGranted())) return;
  const out: Record<string, NightReport> = {};
  for (const daysAgo of [1, 2, 3]) {
    const r = await Native.nightReport({ daysAgo });
    if (r?.granted && r.date) out[r.date] = r;
  }
  useHabits.getState().mergeNightReports(out);
}

/** Last night's bill fresh from the phone (null on web / without usage access). */
export async function nightReport(daysAgo = 1): Promise<NightReport | null> {
  if (!isNative()) return null;
  try {
    const r = await Native.nightReport({ daysAgo });
    return r.granted ? r : null;
  } catch {
    return null;
  }
}

let running = false;

/** Pull steps + judge late nights. Safe to call often (serialised, errors swallowed). */
export async function syncSensors(): Promise<void> {
  if (!isNative() || running) return;
  running = true;
  try {
    await syncSteps().catch(() => {});
    await syncKropi().catch(() => {});
    await syncApps().catch(() => {});
    await syncScreen().catch(() => {});
    await syncNights().catch(() => {});
  } finally {
    running = false;
  }
}
