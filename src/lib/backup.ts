// Backups that work inside the native app too. A WebView can't "download" a
// blob, so on Android the JSON goes through the HabitWidget plugin into
// Download/Szpila (and optionally the system share sheet). The latest backup is
// also mirrored to SharedPreferences so the native side can write a daily
// automatic copy (BackupStore.java) even when the app isn't opened.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useHabits } from "@/lib/habits/store";
import { todayKey } from "@/lib/habits/utils";
import { csvFileName, toCsv } from "@/lib/habits/stats";
import { sleepByDate } from "@/lib/night";
import { L, pick } from "@/lib/i18n";

/** Where a browser download lands, for the confirmation message. */
const downloadsPath = (name: string) => `${L("Pobrane", "Downloads")}/${name}`;

interface BackupPlugin {
  saveBackup(opts: { name: string; json: string; share?: boolean }): Promise<{ location: string }>;
  backupInfo(): Promise<{ lastAuto: string }>;
  listBackups(): Promise<{ backups: BackupFile[] }>;
  readBackup(opts: { id: string }): Promise<{ json: string }>;
  deleteBackup(opts: { id: string }): Promise<{ deleted: boolean }>;
  saveFile(opts: {
    name: string;
    text: string;
    mime: string;
    share?: boolean;
  }): Promise<{ location: string }>;
}
const Native = registerPlugin<BackupPlugin>("HabitWidget");

/** SharedPreferences key read by BackupStore.java. */
export const BACKUP_PREF_KEY = "loop_backup";

/**
 * "szpila-kopia-2026-11-15-2136.json": local date and time (not UTC), so backups sort by
 * name and several a day don't overwrite each other. Native puts them in Download/Szpila/Kopie.
 */
export function backupFileName(d: Date = new Date()): string {
  const hhmm = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `${pick("szpila-kopia", "szpila-backup")}-${todayKey(d)}-${hhmm}.json`;
}

/** A backup file in Download/Szpila/Kopie (auto = the daily copy in Kopie/Automatyczne). */
export interface BackupFile {
  id: string;
  name: string;
  auto: boolean;
  size: number;
  /** Last modified, epoch ms. */
  modified: number;
}

/** Backups on the phone, newest first (Android; empty on the web). */
export async function listBackups(): Promise<BackupFile[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    return (await Native.listBackups()).backups;
  } catch {
    return [];
  }
}

/**
 * Restore a listed backup. Saves the current data first ("szpila-kopia-...-przed.json"),
 * so a wrong pick can be undone. Returns the number of habits restored.
 */
export async function restoreListed(b: BackupFile): Promise<number> {
  const { json } = await Native.readBackup({ id: b.id });
  JSON.parse(json); // fail before touching anything if the file is broken
  const safety = backupFileName().replace(/\.json$/, pick("-przed.json", "-before.json"));
  await Native.saveBackup({ name: safety, json: useHabits.getState().exportData() });
  try {
    return useHabits.getState().importData(json);
  } catch (e) {
    throw new Error(
      e instanceof SyntaxError
        ? L("Plik nie jest poprawnym JSON-em.", "The file is not valid JSON.")
        : (e as Error).message,
    );
  }
}

export async function deleteBackup(b: BackupFile): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  return (await Native.deleteBackup({ id: b.id })).deleted;
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
  return downloadsPath(name);
}

/** Full history as CSV (UTF-8 with BOM so Excel shows Polish letters). Returns the location. */
export async function exportCsv(share = false): Promise<string> {
  const { habits, completions, nightHits, daySocial, nightReports } = useHabits.getState();
  const text =
    "﻿" + toCsv(habits, completions, nightHits, new Date(), daySocial, sleepByDate(nightReports));
  const name = csvFileName();
  if (Capacitor.isNativePlatform()) {
    const { location } = await Native.saveFile({ name, text, mime: "text/csv", share });
    return location;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return downloadsPath(name);
}

/** Restore from a picked file. Returns the number of habits restored; throws a readable error. */
export async function restoreBackup(file: File): Promise<number> {
  const text = await file.text();
  try {
    return useHabits.getState().importData(text);
  } catch (e) {
    throw new Error(
      e instanceof SyntaxError
        ? L("Plik nie jest poprawnym JSON-em.", "The file is not valid JSON.")
        : (e as Error).message,
    );
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
