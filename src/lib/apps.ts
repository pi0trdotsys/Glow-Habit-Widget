// "Minuty z aplikacji": a build minutes habit (e.g. "Ucz się języka obcego")
// filled from the foreground time of chosen apps (Duolingo, Busuu...), read
// from usage events (usage access). The day's amount = app minutes + a manual
// adjustment: Completion.appMin keeps the app minutes the amount is based on,
// so a sync moves the amount with the apps and never wipes what was added or
// taken away by hand (adjustment = amount - appMin, total never below 0).
// Stats and streaks keep reading `amount`. Native side: AppMinutes.java
// (sessions + the same adjustment math), WidgetShared.syncApps (tick, taps).
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Completion, Habit } from "@/lib/habits/types";
import { goalOf, kindOf } from "@/lib/habits/utils";
import { categoryOf } from "@/lib/habits/szpila";
import { L } from "@/lib/i18n";

/** One local day of app minutes from the phone. */
export interface AppDay {
  daysAgo: number;
  /** "yyyy-MM-dd" */
  date: string;
  /** Sum of `apps`. */
  total: number;
  /** Minutes per package (only apps with any). */
  apps: Record<string, number>;
}

interface AppsPlugin {
  appMinutes(opts: { packages?: string[]; days: number }): Promise<{
    granted: boolean;
    days: AppDay[];
  }>;
}
const Native = registerPlugin<AppsPlugin>("HabitWidget");
const isNative = () => Capacitor.isNativePlatform();

/** Days of history kept in sync (the phone keeps usage events about a week). */
export const APP_SYNC_DAYS = 7;

/** App minutes per day for `packages` (empty = every app); null on web / without usage access. */
export async function appMinutes(packages: string[], days: number): Promise<AppDay[] | null> {
  if (!isNative()) return null;
  try {
    const r = await Native.appMinutes({ packages, days });
    return r.granted ? (r.days ?? []) : null;
  } catch {
    return null;
  }
}

export type AppKind = "language" | "reading";

/** Well-known apps per kind (package -> name). Checked on Google Play. */
export const KNOWN_APPS: Record<AppKind, [string, string][]> = {
  language: [
    ["com.duolingo", "Duolingo"],
    ["com.busuu.android.enc", "Busuu"],
    // older Busuu builds
    ["com.busuu.android", "Busuu"],
    ["com.babbel.mobile.android.en", "Babbel"],
    ["com.memrise.android.memrisecompanion", "Memrise"],
    ["com.ichi2.anki", "AnkiDroid"],
    ["com.languagedrops.drops.international", "Drops"],
    ["com.atistudios.mondly.languages", "Mondly"],
    ["air.com.rosettastone.mobile.CoursePlayer", "Rosetta Stone"],
    ["net.tandem", "Tandem"],
    ["com.hellotalk", "HelloTalk"],
  ],
  reading: [
    ["com.amazon.kindle", "Kindle"],
    ["legimi.android.main", "Legimi"],
    ["com.empik.empikgo", "Empik Go"],
    ["com.google.android.apps.books", "Google Play Books"],
    ["com.kobobooks.android", "Kobo"],
    ["com.obreey.reader", "PocketBook"],
    ["org.readera", "ReadEra"],
    ["com.flyersoft.moonreader", "Moon+ Reader"],
    ["grit.storytel.app", "Storytel"],
    ["com.audible.application", "Audible"],
    ["com.audioteka", "Audioteka"],
  ],
};

/** Always suggested for a language habit (the ones the user really uses), installed or not. */
const ALWAYS: Record<AppKind, string[]> = {
  language: ["com.duolingo", "com.busuu.android.enc"],
  reading: [],
};

const KNOWN_LABELS = new Map(Object.values(KNOWN_APPS).flat());
/** Labels seen on this phone (filled by the app picker). */
const seenLabels = new Map<string, string>();

export function rememberLabels(apps: { pkg: string; label: string }[]): void {
  for (const a of apps) if (a.label && a.label !== a.pkg) seenLabels.set(a.pkg, a.label);
}

const GENERIC = /^(android|app|apps|mobile|main|reader|en|international|application|languages)$/i;

/** A readable name for a package: known apps, then what the phone said, then a guess. */
export function appLabel(pkg: string): string {
  const known = KNOWN_LABELS.get(pkg) ?? seenLabels.get(pkg);
  if (known) return known;
  const parts = pkg.split(".").filter((p) => !GENERIC.test(p) && !/^(com|org|net|pl|air)$/.test(p));
  const w = parts[parts.length - 1] ?? pkg;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

const LANGUAGE =
  /j[ęe]zyk|angiel|niemieck|hiszpa|francu|w[łl]osk|rosyjsk|japo[ńn]|chi[ńn]sk|s[łl][óo]wk|fiszk|duolingo|busuu|babbel|language|english|spanish|german|french|italian|japanese|vocab|flashcard|anki/u;

/** What a habit is about, for app suggestions: learning a language, reading, or neither. */
export function appKindOf(h: Pick<Habit, "name" | "icon" | "kind">): AppKind | null {
  const n = `${h.name} ${h.icon}`.toLowerCase();
  if (LANGUAGE.test(n) || h.icon === "Languages") return "language";
  if (categoryOf(h as Habit) === "reading") return "reading";
  return null;
}

/**
 * Suggested apps for a habit: language = Duolingo + Busuu, plus other known
 * language apps installed on the phone; reading = known readers installed.
 * `installed` null = unknown (web / not read yet).
 */
export function suggestedApps(
  h: Pick<Habit, "name" | "icon" | "kind">,
  installed: string[] | null,
): string[] {
  const kind = appKindOf(h);
  if (!kind) return [];
  const have = new Set(installed ?? []);
  const out = new Set(ALWAYS[kind]);
  // Busuu ships as com.busuu.android.enc; older installs are com.busuu.android. Not known
  // what's on the phone: both (an app that isn't there just counts 0).
  if (kind === "language" && (installed == null || have.has("com.busuu.android"))) {
    out.add("com.busuu.android");
    if (installed != null && !have.has("com.busuu.android.enc"))
      out.delete("com.busuu.android.enc");
  }
  for (const [pkg] of KNOWN_APPS[kind]) if (have.has(pkg)) out.add(pkg);
  return [...out];
}

/** Build minutes habit counted from apps. */
export const isAppsHabit = (h: Habit): boolean =>
  h.source === "apps" && kindOf(h) === "build" && (h.apps?.length ?? 0) > 0;

/** Minutes habits typed in by hand that apps could fill (language learning, reading). */
export function unlinkedAppHabits(habits: Habit[]): Habit[] {
  return habits.filter(
    (h) => kindOf(h) === "build" && !h.source && goalOf(h).type === "minutes" && !!appKindOf(h),
  );
}

/** "Duolingo i Busuu" / "Duolingo, Busuu i Babbel". */
export function appsList(pkgs: string[]): string {
  const names = [...new Set(pkgs.map(appLabel))];
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${L("i", "and")} ${names[names.length - 1]}`;
}

/**
 * The amount (and undo stack) when the day's app minutes become `minutes`.
 * The manual adjustment (amount - appMin) stays on top, never below 0. An
 * entry typed in by hand before linking (no appMin) is the same activity: the
 * larger of the two counts.
 */
export function appShift(
  cur: Completion | undefined,
  minutes: number,
): { amount: number; prev?: number[] } {
  const m = Math.max(0, Math.round(minutes));
  if (!cur) return { amount: m };
  const amount = cur.amount ?? 1;
  if (cur.appMin == null) return { amount: Math.max(amount, m), prev: cur.prev };
  const d = m - cur.appMin;
  return {
    amount: Math.max(0, amount + d),
    // Undo steps go back to earlier manual parts, on top of today's app minutes.
    prev: cur.prev?.map((v) => Math.max(0, v + d)),
  };
}

/** Manual part of a day: amount - app minutes (0 when not from apps). */
export function adjustmentOf(c: Completion | undefined): number {
  if (!c || c.appMin == null) return 0;
  return (c.amount ?? 1) - c.appMin;
}

/** Where a "clear" goes for an apps habit: back to the app minutes (only the manual part goes). */
export function appsFloor(h: Habit, c: Completion | undefined): number {
  if (!isAppsHabit(h) || !c?.appMin) return 0;
  return Math.min(c.amount ?? 1, c.appMin);
}

/** Only apps with minutes, rounded. */
export function cleanSplit(split: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(split ?? {})) {
    const m = Math.round(Number(v));
    if (m > 0) out[k] = m;
  }
  return out;
}

export function sameSplit(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): boolean {
  const x = cleanSplit(a);
  const y = cleanSplit(b);
  const kx = Object.keys(x);
  return kx.length === Object.keys(y).length && kx.every((k) => x[k] === y[k]);
}

/** One habit's changes from the phone's days: the habit's apps only, due days only. */
export function appUpdates(
  h: Habit,
  completions: Completion[],
  days: AppDay[],
  isDue: (date: string) => boolean,
): { date: string; minutes: number; split: Record<string, number> }[] {
  const apps = new Set(h.apps ?? []);
  const out: { date: string; minutes: number; split: Record<string, number> }[] = [];
  for (const d of days.slice(0, APP_SYNC_DAYS + 1)) {
    if (!isDue(d.date)) continue;
    const split = cleanSplit(
      Object.fromEntries(Object.entries(d.apps ?? {}).filter(([k]) => apps.has(k))),
    );
    const minutes = Object.values(split).reduce((s, v) => s + v, 0);
    const cur = completions.find((c) => c.habitId === h.id && c.date === d.date);
    if (!cur && minutes === 0) continue;
    if (cur && cur.appMin === minutes && sameSplit(cur.appSplit, split)) continue;
    out.push({ date: d.date, minutes, split });
  }
  return out;
}

/** "Duolingo 9 min + Busuu 4 min + ręcznie 2 min" (empty when there's nothing from apps). */
export function breakdown(c: Completion | undefined): string {
  if (!c || c.appMin == null) return "";
  const parts = Object.entries(cleanSplit(c.appSplit))
    .sort((a, b) => b[1] - a[1])
    .map(([pkg, m]) => `${appLabel(pkg)} ${m} min`);
  // Older entries without a split: just the total.
  if (parts.length === 0 && c.appMin > 0) parts.push(`${L("aplikacje", "apps")} ${c.appMin} min`);
  const adj = adjustmentOf(c);
  const manual = `${L("ręcznie", "by hand")} ${Math.abs(adj)} min`;
  if (parts.length === 0) return adj ? `${adj < 0 ? "−" : ""}${manual}` : "";
  return adj === 0 ? parts.join(" + ") : `${parts.join(" + ")} ${adj > 0 ? "+" : "−"} ${manual}`;
}
