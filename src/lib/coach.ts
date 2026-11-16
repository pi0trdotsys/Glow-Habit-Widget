// The optional coach server for "Podsumowanie dnia": your own box with a small local model
// (szpila-coach) writes the evening comment. Address and token are kept natively only
// (CoachClient.java) - never in the web state, the widget snapshot or backups.
import { Capacitor, registerPlugin } from "@capacitor/core";

interface CoachPlugin {
  getCoach(): Promise<{ url: string; hasToken: boolean }>;
  setCoach(opts: { url: string; token?: string }): Promise<{ ok: boolean }>;
  testCoach(): Promise<{ ok: boolean; model?: string; error?: string }>;
  testSummary(): Promise<SummaryTestResult>;
  lastRecap(): Promise<Partial<Recap>>;
  recaps(): Promise<{ items?: Recap[] }>;
  testWeek(): Promise<SummaryTestResult>;
  coachComment(opts: {
    facts: object;
  }): Promise<{ text?: string | null; error?: string; ms?: number }>;
  testForecast(): Promise<SummaryTestResult>;
  aiForecast(): Promise<{ day?: string; text?: string }>;
  saveAiForecast(opts: { text: string }): Promise<void>;
}

/** "coach" = sent, the AI comment follows; "plain" = sent without a server; else why not. */
export type SummaryTest = "coach" | "plain" | "nothing" | "blocked";

export interface SummaryTestResult {
  status: SummaryTest;
  /** "coach": the AI comment (with 🤖), already swapped into the notification. */
  comment?: string | null;
  /** "coach": "token", "rejected" (no good answer from the model) or a network error. */
  error?: string;
  ms?: number;
}
const Native = registerPlugin<CoachPlugin>("HabitWidget");

export const coachSupported = () => Capacitor.isNativePlatform();

/** "https://host[/path]" without a trailing slash, or "" (mirrors CoachClient.normalizeUrl). */
export function normalizeCoachUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+(:\d{1,5})?(\/[a-z0-9._~/-]*)?$/i.test(u) ? u : "";
}

export async function getCoach(): Promise<{ url: string; hasToken: boolean }> {
  if (!coachSupported()) return { url: "", hasToken: false };
  try {
    return await Native.getCoach();
  } catch {
    return { url: "", hasToken: false };
  }
}

/** Saves the server (empty url = off). A blank token keeps the saved one. */
export async function setCoach(url: string, token: string): Promise<boolean> {
  return (await Native.setCoach({ url, token })).ok;
}

export async function testCoach(): Promise<{ ok: boolean; model?: string; error?: string }> {
  return Native.testCoach();
}

/**
 * "Wyślij próbne podsumowanie": today's recap now (doesn't use up today's real one); with a coach
 * server it waits for the comment (up to ~2.5 min) and reports how it went.
 */
export async function testSummary(): Promise<SummaryTestResult> {
  return Native.testSummary();
}

export interface Recap {
  /** "yyyy-MM-dd" (missing on the one recap saved before the history existed). */
  day?: string;
  /** "day" (the evening recap, the default) or "week" (Sunday's). */
  kind?: "day" | "week";
  title: string;
  text: string;
  at: number;
  /** The first line was written by the coach model (🤖). */
  ai: boolean;
}

/** The last day recap exactly as it was shown (the notification may have cut it). */
export async function lastRecap(): Promise<Recap | null> {
  if (!coachSupported()) return null;
  try {
    const r = (await Native.lastRecap()) as Partial<Recap>;
    return r.text ? (r as Recap) : null;
  } catch {
    return null;
  }
}

/** Every recap, newest first, one per day (kept natively, the last 60). */
export async function recaps(): Promise<Recap[]> {
  if (!coachSupported()) return [];
  try {
    const items = ((await Native.recaps()).items ?? []).filter((r) => r && r.text);
    if (items.length > 0) return items;
  } catch {
    // an older native side: just the last one
  }
  const last = await lastRecap();
  return last ? [last] : [];
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The recap's day ("yyyy-MM-dd"), from `day` or else from when it was shown. */
export function recapDay(r: Recap): string {
  return r.day || dayKey(new Date(r.at));
}

/**
 * The recap for the "Dziś" card: today's, or last night's until noon (it comes late in the
 * evening, so the morning is when it gets read). Pure.
 */
export function homeRecap(items: Recap[], now: Date): Recap | null {
  const r = items[0];
  if (!r) return null;
  const day = recapDay(r);
  if (day === dayKey(now)) return r;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return day === dayKey(y) && now.getHours() < 12 ? r : null;
}

/** The recap's text in blocks: [the comment, the tip, the lists...] (split on blank lines). */
export function recapBlocks(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/** "Wyślij próbny tydzień": Sunday's recap now, then the coach's comment on it. */
export async function testWeek(): Promise<SummaryTestResult> {
  if (!coachSupported()) return { status: "nothing" };
  try {
    return await Native.testWeek();
  } catch (e) {
    return { status: "coach", error: String(e) };
  }
}

/** A comment from the coach for facts built here (the forecast): text with 🤖, or why not. */
export async function coachComment(
  facts: object,
): Promise<{ text?: string | null; error?: string; ms?: number }> {
  if (!coachSupported()) return { error: "off" };
  try {
    return await Native.coachComment({ facts });
  } catch (e) {
    return { error: String(e) };
  }
}

/** "Napisz próbną prognozę": the coach's forecast now, as the morning notification. */
export async function testForecast(): Promise<SummaryTestResult> {
  if (!coachSupported()) return { status: "nothing" };
  try {
    return await Native.testForecast();
  } catch (e) {
    return { status: "coach", error: String(e) };
  }
}

/** Today's forecast from the coach (the morning job's or the app's own), or null. */
export async function storedForecast(): Promise<string | null> {
  if (!coachSupported()) return null;
  try {
    return (await Native.aiForecast()).text || null;
  } catch {
    return null;
  }
}

/** Keeps a forecast the app asked for, so the morning notification uses it instead of asking. */
export async function keepForecast(text: string): Promise<void> {
  if (!coachSupported()) return;
  try {
    await Native.saveAiForecast({ text });
  } catch {
    // an older native side: the app shows it this time anyway
  }
}
