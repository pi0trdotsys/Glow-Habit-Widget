import { useMemo, useState } from "react";
import { FileSpreadsheet, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useHabits } from "@/lib/habits/store";
import {
  dailySeries,
  monthCompare,
  monthStats,
  trendSummary,
  type DayPoint,
} from "@/lib/habits/stats";
import { exportCsv } from "@/lib/backup";
import { DeltaPill, deltaColor } from "@/components/WeekCompare";
import { SZPILA_EMOJI } from "@/lib/habits/szpila";
import { NightList } from "@/components/NightBill";
import { L, intlLocale } from "@/lib/i18n";

/** English "day"/"days" (the Polish copy here always says "dni"). */
const enDays = (n: number) => (n === 1 ? "day" : "days");

const H = 140;
const W = 320;

/** 90 days: daily % as thin bars + a 7-day moving average line. */
export function TrendView() {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const nightHits = useHabits((s) => s.nightHits);
  const series = useMemo(() => dailySeries(habits, completions, 90), [habits, completions]);
  const sum = trendSummary(series);
  const [sel, setSel] = useState<DayPoint | null>(null);
  const nightReports = useHabits((s) => s.nightReports);
  const nights = series.filter(
    (p) => (nightHits[p.key] ?? 0) > 0 || (nightReports[p.key]?.social ?? 0) > 0,
  ).length;

  const step = W / series.length;
  const y = (pct: number) => H - (pct / 100) * H;
  const line = series
    .map((p, i) => (p.avg == null ? null : `${i * step + step / 2},${y(p.avg)}`))
    .filter(Boolean)
    .join(" ");
  const shown = sel ?? [...series].reverse().find((p) => p.pct != null) ?? null;

  return (
    <>
      <section className="mx-5 rounded-3xl bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-3xl font-bold tabular-nums">
              {sum.avg == null ? "-" : `${sum.avg}%`}
            </div>
            <div className="text-xs text-muted-foreground">
              {L(
                `średnio z ${sum.tracked} dni`,
                `average over ${sum.tracked} ${enDays(sum.tracked)}`,
              )}
            </div>
          </div>
          {sum.change != null && (
            <div className="text-right">
              <DeltaPill delta={sum.change} />
              <div className="mt-1 text-[11px] text-muted-foreground">
                {L("30 dni vs 30 wcześniej", "30 days vs previous 30")}
              </div>
            </div>
          )}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H + 18}`}
          className="mt-4 w-full touch-none select-none"
          role="img"
          aria-label={L("Trend z 90 dni", "90-day trend")}
          onPointerMove={(e) => pickAt(e)}
          onPointerDown={(e) => pickAt(e)}
        >
          {[25, 50, 75, 100].map((g) => (
            <line
              key={g}
              x1="0"
              x2={W}
              y1={y(g)}
              y2={y(g)}
              stroke="var(--border)"
              strokeWidth="0.5"
              strokeDasharray={g === 100 ? undefined : "2 3"}
            />
          ))}
          {series.map((p, i) =>
            p.pct == null ? null : (
              <rect
                key={p.key}
                x={i * step + 0.4}
                width={Math.max(1, step - 0.8)}
                y={y(p.pct)}
                height={H - y(p.pct)}
                rx="0.8"
                fill={
                  p.pct >= 80
                    ? "var(--primary)"
                    : "color-mix(in oklab, var(--foreground) 22%, transparent)"
                }
                opacity={shown?.key === p.key ? 1 : 0.75}
              />
            ),
          )}
          {line && (
            <polyline
              points={line}
              fill="none"
              stroke="var(--avoid)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {[89, 59, 29, 0].map((i) => (
            <text
              key={i}
              x={Math.min(W - 16, Math.max(0, i * step - 8))}
              y={H + 14}
              fontSize="9"
              fill="var(--muted-foreground)"
            >
              {i === 89 ? L("dziś", "today") : `-${90 - (i + 1)} d`}
            </text>
          ))}
        </svg>
        <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: "var(--primary)" }}
            />{" "}
            {L("dzień w formie (≥80%)", "day in form (≥80%)")}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-3 rounded"
              style={{ backgroundColor: "var(--avoid)" }}
            />{" "}
            {L("średnia 7 dni", "7-day average")}
          </span>
        </div>
        {shown && (
          <p className="mt-3 text-xs">
            <span className="font-semibold">
              {shown.date.toLocaleDateString(intlLocale(), {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
            {": "}
            {shown.pct == null ? L("brak danych", "no data") : `${shown.pct}%`}
            {shown.avg != null && ` · ${L("średnia 7 dni", "7-day average")} ${shown.avg}%`}
            {(nightHits[shown.key] ?? 0) > 0 &&
              ` · ${SZPILA_EMOJI.angry} ${nightHits[shown.key]}× ${L("social media w nocy", "social media at night")}`}
          </p>
        )}
      </section>

      <section className="mx-5 mt-4 grid grid-cols-2 gap-3">
        <Stat
          label={L("Najlepszy dzień", "Best day")}
          value={sum.best ? `${sum.best.pct}%` : "-"}
          hint={sum.best?.date.toLocaleDateString(intlLocale(), { day: "numeric", month: "short" })}
        />
        <Stat
          label={L("Dni w formie", "Days in form")}
          value={String(series.filter((p) => (p.pct ?? 0) >= 80).length)}
          hint={L(`z ${sum.tracked} śledzonych`, `of ${sum.tracked} tracked`)}
        />
        <Stat
          label={L("Noce z social mediami", "Social media nights")}
          value={String(nights)}
          hint={L("po północy, z ostatnich 90", "after midnight, last 90")}
        />
        <Stat
          label={L("Kompletne dni", "Perfect days")}
          value={String(series.filter((p) => p.pct === 100).length)}
          hint={L("100% zadań", "100% of habits")}
        />
      </section>
      <NightList />
      <CsvActions />
    </>
  );

  function pickAt(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * series.length);
    setSel(series[Math.max(0, Math.min(series.length - 1, i))]);
  }
}

/** Month by month + this month vs last month up to the same day. */
export function MonthsView() {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const months = useMemo(() => monthStats(habits, completions, 6), [habits, completions]);
  const cmp = useMemo(() => monthCompare(habits, completions), [habits, completions]);

  return (
    <>
      <section className="mx-5 rounded-3xl bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className="text-lg font-bold leading-tight"
              style={{ color: deltaColor(cmp.delta ?? 0) }}
            >
              {cap(
                cmp.delta == null
                  ? L(
                      `${cmp.thisMonth.label}: pierwszy miesiąc`,
                      `${cmp.thisMonth.label}: first month`,
                    )
                  : cmp.delta > 0
                    ? L(
                        `${cmp.thisMonth.label} lepszy niż ${cmp.lastMonth.label}`,
                        `${cmp.thisMonth.label} beats ${cmp.lastMonth.label}`,
                      )
                    : cmp.delta < 0
                      ? L(
                          `${cmp.thisMonth.label} gorszy niż ${cmp.lastMonth.label}`,
                          `${cmp.thisMonth.label} is behind ${cmp.lastMonth.label}`,
                        )
                      : L(
                          `${cmp.thisMonth.label} jak ${cmp.lastMonth.label}`,
                          `${cmp.thisMonth.label} same as ${cmp.lastMonth.label}`,
                        ),
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {L(
                `Dni 1-${cmp.upTo}: ${cmp.thisMonth.pct ?? "-"}% teraz · ${cmp.lastMonth.pct ?? "-"}% w zeszłym miesiącu`,
                `Days 1-${cmp.upTo}: ${cmp.thisMonth.pct ?? "-"}% now · ${cmp.lastMonth.pct ?? "-"}% last month`,
              )}
            </div>
          </div>
          {cmp.delta != null && <DeltaPill delta={cmp.delta} big />}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {L(
            "Porównanie tylko do tego samego dnia miesiąca - połowa września vs połowa sierpnia, a nie cały sierpień.",
            "Compared only up to the same day of the month - mid-September vs mid-August, not all of August.",
          )}
        </p>
      </section>

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {L("Ostatnie 6 miesięcy", "Last 6 months")}
        </h2>
        <div className="flex h-40 items-end gap-2">
          {months.map((m) => (
            <div
              key={m.key}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              data-month={m.key}
            >
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {m.pct == null ? "" : `${m.pct}%`}
              </span>
              <div
                className="w-full rounded-t-lg"
                style={{
                  height: `${Math.max(m.pct ?? 0, m.pct == null ? 0 : 3)}%`,
                  backgroundColor: m.current
                    ? "var(--avoid)"
                    : "color-mix(in oklab, var(--primary) 70%, transparent)",
                  opacity: m.pct == null ? 0.2 : 1,
                }}
              />
              <span
                className="text-[11px]"
                style={{ color: m.current ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                {m.label}
              </span>
            </div>
          ))}
        </div>
        <ul className="mt-5 divide-y divide-border text-sm">
          {[...months]
            .reverse()
            .filter((m) => m.days > 0)
            .map((m) => (
              <li key={m.key} className="flex items-center justify-between py-2">
                <span>
                  {cap(m.long)}
                  {m.current && (
                    <span className="text-[11px] text-muted-foreground">
                      {L(" (w toku)", " (in progress)")}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {L(
                    `${m.pct}% · ${m.forma} dni w formie · ${m.days} dni danych`,
                    `${m.pct}% · ${m.forma} ${enDays(m.forma)} in form · ${m.days} ${enDays(m.days)} of data`,
                  )}
                </span>
              </li>
            ))}
        </ul>
      </section>
      <CsvActions />
    </>
  );
}

/** Capitalize only the first letter (CSS `capitalize` would do every word). */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function CsvActions() {
  const run = async (share: boolean) => {
    try {
      const where = await exportCsv(share);
      if (!share) toast(`${L("Zapisano", "Saved")}: ${where}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <div className="mx-5 mt-4 flex gap-2">
      <button
        onClick={() => void run(false)}
        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-card p-3 text-sm font-medium"
      >
        <FileSpreadsheet size={16} /> {L("Eksport CSV", "Export CSV")}
      </button>
      <button
        onClick={() => void run(true)}
        className="flex items-center justify-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-medium"
        aria-label={L("Udostępnij CSV", "Share CSV")}
      >
        <Share2 size={16} />
      </button>
    </div>
  );
}
