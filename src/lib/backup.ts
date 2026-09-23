// Backups that work inside the native app too. A WebView can't "download" a
// blob, so on Android the JSON goes through the HabitWidget plugin into
// Download/Loop (and optionally the system share sheet). The latest backup is
// also mirrored to SharedPreferences so the native side can write a daily
// automatic copy (BackupStore.java) even when the app isn't opened.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useHabits } from "@/lib/habits/store";

interface BackupPlugin {
  saveBackup(opts: { name: string; json: string; share?: boolean }): Promise<{ location: string }>;
  backupInfo(): Promise<{ lastAuto: string }>;
}
const Native = registerPlugin<BackupPlugin>("HabitWidget");

/** SharedPreferences key read by BackupStore.java. */
export const BACKUP_PREF_KEY = "loop_backup";

export function backupFileName(d: Date = new Date()): string {
  return `loop-kopia-${d.toISOString().slice(0, 10)}.json`;
}

/** Save a backup. Returns a human-readable location for the confirmation message. */
export async function saveBackup(share = false): Promise<string> {
  const json = useHabits.getState().exportData();
  const name = backupFileName();
  if (Capacitor.isNativePlatform()) {
    const { location } = await Native.saveBackup({ name, json, share });
    return location;
  }
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return `Pobrane/${name}`;
}

/** Restore from a picked file. Returns the number of habits restored; throws a readable error. */
export async function restoreBackup(file: File): Promise<number> {
  const text = await file.text();
  try {
    return useHabits.getState().importData(text);
  } catch (e) {
    throw new Error(e instanceof SyntaxError ? "Plik nie jest poprawnym JSON-em." : (e as Error).message);
  }
}

/** Date (YYYY-MM-DD) of the last automatic copy, or "" (web / never). */
export async function lastAutoBackup(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return "";
  try {
    return (await Native.backupInfo()).lastAuto;
  } catch {
    return "";
  }
}
