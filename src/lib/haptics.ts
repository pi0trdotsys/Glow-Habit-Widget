// Haptic feedback: a light tick for each step, a firm "done" when a habit is
// completed, a little drum roll when the whole day is complete. Native haptics
// on Android (HabitWidgetPlugin.haptic - respects the system setting), the
// Vibration API elsewhere. Never throws.
import { Capacitor, registerPlugin } from "@capacitor/core";

export type HapticKind = "tick" | "success" | "celebrate";

/** Vibration API patterns (ms) for the web fallback. */
export const VIBRATION: Record<HapticKind, number | number[]> = {
  tick: 12,
  success: [0, 28, 40, 28],
  celebrate: [0, 30, 60, 30, 60, 60],
};

interface HapticsPlugin {
  haptic(opts: { kind: HapticKind }): Promise<void>;
}
const Native = registerPlugin<HapticsPlugin>("HabitWidget");

export function haptic(kind: HapticKind): void {
  try {
    if (Capacitor.isNativePlatform()) {
      void Native.haptic({ kind }).catch(() => {});
      return;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator)
      navigator.vibrate?.(VIBRATION[kind]);
  } catch {
    /* no haptics - fine */
  }
}
