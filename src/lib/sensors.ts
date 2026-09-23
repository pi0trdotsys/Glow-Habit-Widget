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
    nights: { daysAgo: number; minutes: number; closed: boolean }[];
  }>;
}
const Native = registerPlugin<SensorsPlugin>("HabitWidget");

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

export const DEFAULT_LATE_AFTER = "23:30";
export const DEFAULT_LATE_LIMIT = 15;

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

async function syncScreen(): Promise<void> {
  const { habits, completions, setAvoid } = useHabits.getState();
  const screenHabits = habits.filter((h) => kindOf(h) === "avoid" && h.source === "screen");
  if (screenHabits.length === 0 || !(await screenGranted())) return;
  const now = new Date();
  for (const h of screenHabits) {
    const limit = h.lateLimit ?? DEFAULT_LATE_LIMIT;
    const { nights } = await Native.lateScreen({ afterMin: lateAfterMin(h), days: 7 });
    for (const n of nights) {
      if (n.minutes < 0) continue;
      const day = addDays(now, -n.daysAgo);
      if (!isDueOn(h, day)) continue;
      const key = todayKey(day);
      const existing = completions.find((c) => c.habitId === h.id && c.date === key);
      if (existing && !existing.auto) continue; // a manual answer always wins
      const status = n.minutes > limit ? "slip" : n.closed ? "clean" : null;
      if (!status) continue;
      const current = existing ? (existing.slipped ? "slip" : "clean") : null;
      if (current !== status) setAvoid(h.id, key, status, undefined, true);
    }
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
  } finally {
    running = false;
  }
}
