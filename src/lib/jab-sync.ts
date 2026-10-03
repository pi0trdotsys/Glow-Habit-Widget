// Pulls the native jab log (HabitNotifier -> JabLearn.java) into the store, where
// "Co na ciebie działa" aggregates it (src/lib/habits/jabs.ts). No-op off Android.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useHabits } from "@/lib/habits/store";

interface JabPlugin {
  /** The newest native jab entries with their native outcome (see JabEntry). */
  jabStats(): Promise<{ entries?: unknown[] }>;
}
const Native = registerPlugin<JabPlugin>("HabitWidget");

export async function jabStats(): Promise<unknown[] | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await Native.jabStats();
    return Array.isArray(r.entries) ? r.entries : null;
  } catch {
    return null;
  }
}

/** Fold the native log into store.jabLearn (idempotent - safe on every app open). */
export async function syncJabs(): Promise<void> {
  const entries = await jabStats();
  if (entries?.length) useHabits.getState().mergeJabs(entries);
}
