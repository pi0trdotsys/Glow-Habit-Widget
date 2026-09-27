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
import { amountOn, isDueOn, kindOf, todayKey } from "@/lib/habits/utils";
import type { Habit } from "@/lib/habits/types";

export interface StepsStatus {
  available: boolean;
  granted: boolean;
  background: boolean;
}

interface SensorsPlugin {
  stepsStatus(): Promise<StepsStatus>;
  requestSteps(): Promise<StepsStatus>;
  readSteps(): Promise<{ steps: number }>;
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
  const { habits, completions, setAmount } = useHabits.getState();
  const stepHabits = habits.filter((h) => kindOf(h) === "build" && h.source === "steps");
  if (stepHabits.length === 0) return;
  const { steps } = await Native.readSteps();
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
    await syncScreen().catch(() => {});
    await syncNights().catch(() => {});
  } finally {
    running = false;
  }
}
