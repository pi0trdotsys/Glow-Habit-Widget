// Bridges habit data between the web app and the native Android side (three
// home-screen widgets + the progress/Szpila notifications). Web data lives in
// zustand (localStorage); native code can only read Android SharedPreferences.
// @capacitor/preferences writes to the "CapacitorStorage" SharedPreferences
// file (keys stored raw), which the native code reads directly. No-op on
// web/PWA - only runs inside the native Capacitor app.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { addDays } from "date-fns";
import { useHabits } from "@/lib/habits/store";
import {
  amountOn,
  avoidStatus,
  goalOf,
  habitWindow,
  indexEntries,
  isDueOn,
  kindOf,
  slipsLeft,
  todayKey,
  todayProgress,
  unitForms,
  unitLabel,
  unitsOf,
} from "@/lib/habits/utils";
import {
  allDoneLines,
  caughtLines,
  eveningLines,
  memoryLines,
  nagLines,
  praiseFor,
  rageLines,
  weeklyRoast,
} from "@/lib/habits/szpila";
import { lateAfterMin, syncSensors, DEFAULT_LATE_LIMIT } from "@/lib/sensors";
import type { HabitColor } from "@/lib/habits/types";
import { BACKUP_PREF_KEY } from "@/lib/backup";
import { liveState, liveStatus } from "@/lib/live";
import { billLines } from "@/lib/night";
import { catCondition } from "@/lib/habits/gamification";
import { lateBasisOf } from "@/lib/sensors";
import { getLang } from "@/lib/i18n";
import { useLinesReady } from "@/lib/habits/szpila";

const STATE_KEY = "widget_state";
const PENDING_KEY = "widget_pending";

// Hex equivalents of the --habit-* oklch tokens (dark theme), so the native
// widget can render habit colors without any web/CSS logic.
export const COLOR_HEX: Record<HabitColor, string> = {
  mint: "#59e0ad",
  coral: "#ff756f",
  amber: "#fdba2f",
  violet: "#b180fc",
  sky: "#55c4fe",
  rose: "#ff7d9c",
  lime: "#a9e85e",
  sand: "#d2b285",
};

/** Forbidden-habit red, shared with the native widgets. */
export const AVOID_HEX = "#ff4d5e";

interface HabitWidgetPlugin {
  refresh(): Promise<void>;
  pinWidget(opts: { kind: WidgetKind }): Promise<{ supported: boolean }>;
}

export type WidgetKind = "szpila" | "next" | "icons" | "list";

/** Ask the launcher to put a widget on the home screen. False when the launcher can't do it. */
export async function pinWidget(kind: WidgetKind): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await HabitWidget.pinWidget({ kind })).supported;
  } catch {
    return false;
  }
}
// Native plugin (android/.../HabitWidgetPlugin.java). Absent on web → calls no-op.
const HabitWidget = registerPlugin<HabitWidgetPlugin>("HabitWidget");

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * A widget tap queued while the app was closed. Ops carry the absolute desired
 * state, so replaying them is idempotent. `done` is the legacy (v1) shape.
 */
export interface PendingOp {
  habitId: string;
  date: string;
  done?: boolean;
  amount?: number;
  status?: "clean" | "slip" | null;
  minute?: number;
  /** Judged automatically (screen time) - never overrides a manual answer. */
  auto?: boolean;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** The snapshot every native surface reads (widgets, notifications). Exported for tests. */
export function buildState() {
  const { habits, completions, userName, notifications, autoBackup, szpila } = useHabits.getState();
  const level = notifications.tauntLevel;
  const today = new Date();
  const key = todayKey(today);
  const idx = indexEntries(completions);
  const due = habits.filter((h) => isDueOn(h, today));
  const rows = due.map((h) => {
    const avoid = kindOf(h) === "avoid";
    const g = goalOf(h);
    const amount = avoid ? 0 : amountOn(h, idx, today);
    const status = avoid ? avoidStatus(h, idx, today, today) : undefined;
    const w = habitWindow(h, completions);
    return {
      id: h.id,
      name: h.name,
      icon: h.icon,
      colorHex: avoid ? AVOID_HEX : (COLOR_HEX[h.color] ?? COLOR_HEX.mint),
      kind: avoid ? "avoid" : "build",
      goal: avoid ? "check" : g.type,
      amount,
      target: avoid ? 1 : g.target,
      step: avoid ? 1 : g.step,
      unit: avoid ? "" : unitLabel(h, 5),
      // [1, 2-4, 5+] forms so native texts decline ("1 szklanka", "3 szklanki").
      unitForms: avoid ? [] : g.type === "minutes" ? ["min", "min", "min"] : unitForms(g.unit),
      units: avoid ? 1 : unitsOf(h),
      status: status ?? "",
      slipsLeft: avoid ? slipsLeft(h, idx, today) : 0,
      done: avoid ? status === "clean" : amount >= g.target,
      // Planner window (minutes of day) - see nextUnitMinute() / WidgetShared.nextMinute().
      start: w.start,
      end: w.end,
      nag: nagLines(h, level, userName),
      rage: rageLines(h, level, userName),
      memory: memoryLines(h, completions, level, userName),
      praise: praiseFor(h, level, userName),
      source: h.source ?? "",
      ...(h.source === "screen"
        ? {
            lateAfter: lateAfterMin(h),
            lateLimit: h.lateLimit ?? DEFAULT_LATE_LIMIT,
            lateBasis: lateBasisOf(h),
            caught: caughtLines(level, lateBasisOf(h)),
          }
        : {}),
    };
  });
  const p = todayProgress(habits, completions, today);
  return {
    v: 2,
    date: key,
    userName: userName ?? "",
    doneCount: rows.filter((r) => r.done).length,
    total: rows.length,
    fraction: p.fraction,
    settings: {
      progress: notifications.progress,
      taunts: notifications.taunts,
      tauntsPerDay: notifications.tauntsPerDay,
      autoBackup,
      quietFrom: toMin(notifications.quietFrom),
      quietTo: toMin(notifications.quietTo),
      review: notifications.review,
      reviewAt: toMin(notifications.reviewAt),
    },
    roast: weeklyRoast(habits, completions, level, userName),
    // Forbidden habits from yesterday still waiting for an answer (open until noon) - morning review.
    yesterday: {
      date: todayKey(addDays(today, -1)),
      items: habits
        .filter(
          (h) => kindOf(h) === "avoid" && h.source !== "screen" && isDueOn(h, addDays(today, -1)),
        )
        .filter((h) => avoidStatus(h, idx, addDays(today, -1), today) === "pending")
        .map((h) => ({ id: h.id, name: h.name })),
    },
    // Night guard (LiveGuardService): window, ignored apps and per-app lines.
    live: liveState(notifications, level, userName, szpila.humor),
    // Unlocked look of the cat (widget drawables ic_szpila_<face>_<mood>).
    face: szpila.face,
    // App language for native texts (WidgetShared.tr).
    lang: getLang(),
    // "Kot w domu": groomed / normal / neglected (widget overlay + mood).
    cat: catCondition(habits, completions, today),
    // Morning "rachunek za noc" comments (HabitNotifier.billText).
    bill: billLines(level, userName),
    allDone: allDoneLines(level),
    evening: eveningLines(level),
    habits: rows,
  };
}

async function mirror(): Promise<void> {
  await Preferences.set({ key: STATE_KEY, value: JSON.stringify(buildState()) });
  // Latest full backup for the native daily copy (BackupStore.java).
  await Preferences.set({ key: BACKUP_PREF_KEY, value: useHabits.getState().exportData() });
  try {
    await HabitWidget.refresh();
  } catch {
    // plugin missing or no widget placed - fine
  }
}

// Drain widget taps queued while the app was closed.
async function reconcile(): Promise<void> {
  const { value } = await Preferences.get({ key: PENDING_KEY });
  if (!value) return;
  let ops: PendingOp[] = [];
  try {
    ops = JSON.parse(value) as PendingOp[];
  } catch {
    ops = [];
  }
  applyPendingOps(ops);
  await Preferences.remove({ key: PENDING_KEY });
}

/**
 * Apply widget/notification ops to the store. Ops carry absolute state, so
 * replaying is idempotent; automatic (screen-time) verdicts never override a
 * manual answer.
 */
export function applyPendingOps(ops: PendingOp[]): void {
  const s = useHabits.getState();
  for (const op of ops) {
    const h = s.habits.find((x) => x.id === op.habitId);
    if (!h) continue;
    if (op.amount != null && kindOf(h) === "build") {
      s.setAmount(op.habitId, op.date, op.amount, op.minute);
    } else if (op.status !== undefined && kindOf(h) === "avoid") {
      const existing = useHabits
        .getState()
        .completions.find((c) => c.habitId === op.habitId && c.date === op.date);
      if (op.auto && existing && !existing.auto) continue; // manual answers win
      s.setAvoid(op.habitId, op.date, op.status, op.minute, !!op.auto);
    } else if (op.done != null) {
      s.setCompletion(op.habitId, op.date, op.done);
    }
  }
}

/** Pull the night guard's visit counts into the store (stats, weekly challenges, backups). */
async function syncNightHits(): Promise<void> {
  const st = await liveStatus();
  if (st?.hits) useHabits.getState().mergeNightHits(st.hits);
}

let started = false;

export function startWidgetBridge(): void {
  if (started || !isNative()) return;
  started = true;

  // Apply any taps made on the widget, pull steps/screen time, then publish.
  const catchUp = () => void reconcile().then(syncSensors).then(syncNightHits).then(mirror);
  catchUp();
  // Steps keep changing while the app is open.
  setInterval(() => {
    if (document.visibilityState === "visible") void syncSensors();
  }, 5 * 60_000);

  // Native texts need the English lines too once they've loaded.
  useLinesReady.subscribe(() => void mirror());

  // Keep the widget in sync with every store change (debounced).
  let t: ReturnType<typeof setTimeout> | undefined;
  useHabits.subscribe(() => {
    if (t) clearTimeout(t);
    t = setTimeout(() => void mirror(), 200);
  });

  // When the app returns to the foreground, pull in widget taps.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") catchUp();
  });
}

/** Re-publish the snapshot now (e.g. right after notification permission is granted). */
export function refreshNative(): void {
  if (started) void mirror();
}
