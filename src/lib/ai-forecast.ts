// "Prognoza na dziś" written by the coach (your own AI server): asked once a morning when the
// forecast shows (05:00-12:00), kept for the day on this device. Without a server, or while it
// thinks, the app's own forecast stays.
import { useEffect, useState } from "react";
import { coachComment, coachSupported, getCoach } from "@/lib/coach";
import { forecastFacts } from "@/lib/habits/coach-facts";
import { dayForecast, showForecastAt } from "@/lib/habits/forecast";
import { useHabits } from "@/lib/habits/store";
import { todayKey } from "@/lib/habits/utils";

const KEY = "szpila.aiForecast.v1";

interface Cached {
  day: string;
  text: string;
  at: number;
}

/** Today's AI forecast, or null. */
export function cachedForecast(day: string): string | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? "null") as Cached | null;
    return c && c.day === day && c.text ? c.text : null;
  } catch {
    return null;
  }
}

function save(day: string, text: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ day, text, at: Date.now() } satisfies Cached));
  } catch {
    // no storage: it's asked again next time
  }
}

const listeners = new Set<(day: string, text: string) => void>();
let tried = "";
let inflight: Promise<{ text?: string | null; error?: string; ms?: number }> | null = null;

/**
 * Asks the coach for today's forecast now (also the Settings test: `force` = whatever the hour,
 * even if there is one already). Resolves with the text (🤖 ...) or why not.
 */
export async function requestForecast(
  now = new Date(),
  force = false,
): Promise<{ text?: string | null; error?: string; ms?: number }> {
  const day = todayKey(now);
  if (!force) {
    const hit = cachedForecast(day);
    if (hit) return { text: hit };
  }
  if (inflight) return inflight;
  const s = useHabits.getState();
  const items = dayForecast(
    s.habits,
    s.completions,
    s.nightReports,
    s.notifications.tauntLevel,
    now,
  );
  const facts = forecastFacts(items, s.habits, now, s.notifications.tauntLevel, s.userName);
  if (facts.plan.length === 0 && facts.risks.length === 0) return { error: "nothing" };
  inflight = coachComment(facts).finally(() => {
    inflight = null;
  });
  const r = await inflight;
  if (r.text) {
    save(day, r.text);
    listeners.forEach((f) => f(day, r.text as string));
  }
  return r;
}

/** Today's AI forecast for the "Prognoza na dziś" slide: cached, or asked once a morning. */
export function useAiForecast(now: Date): string | null {
  const day = todayKey(now);
  const show = coachSupported() && showForecastAt(now);
  const [text, setText] = useState<string | null>(() => (show ? cachedForecast(day) : null));
  useEffect(() => {
    if (!show) {
      setText(null);
      return;
    }
    const on = (d: string, t: string) => d === day && setText(t);
    listeners.add(on);
    const hit = cachedForecast(day);
    if (hit) setText(hit);
    else if (tried !== day) {
      tried = day;
      void getCoach().then((c) => {
        if (c.url && c.hasToken) void requestForecast(now);
      });
    }
    return () => {
      listeners.delete(on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, day]);
  return text;
}
