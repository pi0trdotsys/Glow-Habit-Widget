import { useMemo } from "react";
import { useHabits } from "@/lib/habits/store";
import { limitScore, limitSeries } from "@/lib/day-guard";
import { L, intlLocale } from "@/lib/i18n";
import { isBank } from "@/lib/bank";

/** Report: social media minutes by day (last 14 days) against the daily limit. */
export function DayLimitChart() {
  const daySocial = useHabits((s) => s.daySocial);
  const on = useHabits((s) => s.notifications.dailyLimit);
  const limit = useHabits((s) => s.notifications.dailyLimitMin);
  // "Bank minut": each day against what the bank held that day (the native guard's record).
  const bank = useHabits((s) => isBank(s.notifications));
  const dayLimits = useHabits((s) => s.dayLimits);
  const series = useMemo(
    () => limitSeries(daySocial, limit, 14, new Date(), bank ? dayLimits : undefined),
    [daySocial, limit, bank, dayLimits],
  );
  const score = limitScore(series);
  if (score.tracked === 0) return null;

  const max = Math.max(
    (bank ? Math.max(...series.map((d) => d.limit ?? 0), 30) : limit) * 1.5,
    ...series.map((d) => d.minutes ?? 0),
  );
  const H = 110;
  const y = (m: number) => H - (m / max) * H;

  return (
    <section className="mx-5 mt-4 rounded-3xl bg-card p-5" data-day-limit-chart>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {L("Social media w dzień", "Social media by day")}
        </h2>
        {on && (
          <span className="text-xs text-muted-foreground" data-within>
            {bank
              ? L(
                  `w banku ${score.within}/${score.tracked} dni`,
                  `within the bank ${score.within}/${score.tracked} days`,
                )
              : L(
                  `w limicie ${score.within}/${score.tracked} dni`,
                  `within the limit ${score.within}/${score.tracked} days`,
                )}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 280 ${H + 16}`}
        className="w-full"
        role="img"
        aria-label={L("Social media w dzień", "Social media by day")}
      >
        {on && !bank && (
          <>
            <line
              x1="0"
              x2="280"
              y1={y(limit)}
              y2={y(limit)}
              stroke="var(--avoid)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text x="278" y={y(limit) - 3} fontSize="11" textAnchor="end" fill="var(--avoid)">
              {limit} min
            </text>
          </>
        )}
        {series.map((d, i) => {
          const w = 280 / series.length;
          if (d.minutes == null) return null;
          return (
            <g key={d.key}>
              <rect
                x={i * w + 2}
                width={w - 4}
                y={y(d.minutes)}
                height={Math.max(1, H - y(d.minutes))}
                rx="2"
                fill={
                  on && d.over
                    ? "var(--avoid)"
                    : "color-mix(in oklab, var(--primary) 70%, transparent)"
                }
              >
                <title>
                  {new Date(`${d.key}T12:00:00`).toLocaleDateString(intlLocale(), {
                    day: "numeric",
                    month: "short",
                  })}
                  : {d.minutes} min
                  {bank && d.limit != null ? ` / bank ${d.limit} min` : ""}
                </title>
              </rect>
              {on && bank && d.limit != null && (
                <line
                  data-bank-mark
                  x1={i * w + 1}
                  x2={(i + 1) * w - 1}
                  y1={y(d.limit)}
                  y2={y(d.limit)}
                  stroke="var(--avoid)"
                  strokeWidth="1.5"
                />
              )}
            </g>
          );
        })}
        <text x="0" y={H + 13} fontSize="11" fill="var(--muted-foreground)">
          {L("-13 d", "-13 d")}
        </text>
        <text x="280" y={H + 13} fontSize="11" textAnchor="end" fill="var(--muted-foreground)">
          {L("dziś", "today")}
        </text>
      </svg>
      <p className="mt-2 text-xs text-muted-foreground">
        {L(
          "Od 5:00 do trybu przed snem. Noc liczy się osobno w rachunku za noc.",
          "From 5:00 until bedtime mode. Nights are counted separately in the night bill.",
        )}
        {on &&
          bank &&
          L(
            " Kreski: ile było w banku minut danego dnia.",
            " Marks: what the minute bank held that day.",
          )}
      </p>
    </section>
  );
}
