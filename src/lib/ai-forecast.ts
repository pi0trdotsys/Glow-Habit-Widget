// "Prognoza na dziś" written by the coach (your own AI server). Usually the morning notification
// asks for it (HabitNotifier.maybeMorningForecast / the night bill) and keeps it natively; if the
// app is opened first (05:00-12:00), the app asks once and hands it over, so it's written once a
// day and the notification and the app say the same. Without a server the app's own forecast stays.
import { useEffect, useState } from "react";
import { coachComment, coachSupported, getCoach, keepForecast, storedForecast } from "@/lib/coach";
import { forecastFacts } from "@/lib/habits/coach-facts";
import { dayForecast, showForecastAt } from "@/lib/habits/forecast";
import { useHabits } from "@/lib/habits/store";
import { todayKey } from "@/lib/habits/utils";

const listeners = new Set<(text: string) => void>();
let tried = "";
let inflight: Promise<{ text?: string | null; error?: string; ms?: number }> | null = null;

/** Asks the coach for today's forecast (once at a time). Resolves with the text (🤖 ...) or why not. */
export async function requestForecast(
  now = new Date(),
): Promise<{ text?: string | null; error?: string; ms?: number }> {
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
    void keepForecast(r.text);
    announceForecast(r.text);
  }
  return r;
}

/** A new forecast for today (the app's request or the Settings test): the slide updates. */
export function announceForecast(text: string) {
  listeners.forEach((f) => f(text));
}

/** Today's AI forecast for the "Prognoza na dziś" slide: the stored one, or asked once a morning. */
export function useAiForecast(now: Date): string | null {
  const day = todayKey(now);
  const show = coachSupported() && showForecastAt(now);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!show) {
      setText(null);
      return;
    }
    let live = true;
    const on = (t: string) => live && setText(t);
    listeners.add(on);
    const load = () =>
      void storedForecast().then((hit) => {
        if (!live) return;
        if (hit) setText(hit);
        else if (tried !== day) {
          tried = day;
          void getCoach().then((c) => {
            if (c.url && c.hasToken) void requestForecast(new Date());
          });
        }
      });
    load();
    // the morning job may write it while the app sits in the background
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      live = false;
      listeners.delete(on);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [show, day]);
  return text;
}
