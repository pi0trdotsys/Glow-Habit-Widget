import { useMemo } from "react";
import { useHabits } from "@/lib/habits/store";
import {
  dayForecast,
  forecastHitRate,
  hitRateText,
  showForecastAt,
  type ForecastItem,
} from "@/lib/habits/forecast";
import { todayKey } from "@/lib/habits/utils";
import { L } from "@/lib/i18n";

/** Today's risk forecast (05:00-12:00): up to two habits likely to fall through today. */
export function useRiskForecast(now: Date): ForecastItem[] {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const reports = useHabits((s) => s.nightReports);
  const level = useHabits((s) => s.notifications.tauntLevel);
  const show = showForecastAt(now);
  // Recomputed per day/hour and on data changes, not every render.
  const slot = `${todayKey(now)}T${now.getHours()}`;
  return useMemo(
    () => (show ? dayForecast(habits, completions, reports, level, now) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show, slot, habits, completions, reports, level],
  );
}

/** Today's slide: "Prognoza na dziś" with Szpila's warning per risky habit. */
export function RiskCard({ items }: { items: ForecastItem[] }) {
  if (items.length === 0) return null;
  return (
    <section
      data-risk-slide
      className="h-full rounded-2xl p-3"
      style={{
        background: "color-mix(in oklab, var(--avoid) 9%, var(--card))",
        border: "1px solid color-mix(in oklab, var(--avoid) 24%, transparent)",
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        🔮 {L("Prognoza na dziś", "Today's forecast")}
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((i) => (
          <li key={i.habitId} className="text-sm leading-snug" data-risk-item={i.habitId}>
            {i.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Report: "Prognoza się sprawdza" - how many of the last 30 days' warnings came true. */
export function ForecastHitRate() {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const reports = useHabits((s) => s.nightReports);
  const text = useMemo(
    () => hitRateText(forecastHitRate(habits, completions, reports)),
    [habits, completions, reports],
  );
  if (!text) return null;
  return (
    <p className="mt-3 flex gap-2.5 text-xs text-muted-foreground" data-forecast-hits>
      <span className="shrink-0">🔮</span>
      <span>{text}</span>
    </p>
  );
}
