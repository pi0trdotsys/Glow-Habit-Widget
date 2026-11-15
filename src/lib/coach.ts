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
