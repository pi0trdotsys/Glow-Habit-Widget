import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { WeeklyReport } from "@/lib/habits/utils";

export function deltaColor(delta: number): string {
  return delta > 0 ? "var(--primary)" : delta < 0 ? "var(--destructive)" : "var(--muted-foreground)";
}

export function verdict(delta: number): string {
  if (delta >= 10) return "Dużo lepiej niż tydzień temu";
  if (delta > 0) return "Trochę lepiej niż tydzień temu";
  if (delta === 0) return "Tak samo jak tydzień temu";
  if (delta > -10) return "Trochę gorzej niż tydzień temu";
  return "Dużo gorzej niż tydzień temu";
}

export function DeltaPill({ delta, big = false }: { delta: number; big?: boolean }) {
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-background font-semibold ${
        big ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
      }`}
      style={{ color: deltaColor(delta) }}
    >
      <Icon size={big ? 16 : 13} />
      {delta > 0 ? "+" : ""}
      {delta} pkt
    </span>
  );
}

/** Two stacked horizontal bars: this week vs last week, same window. */
export function WeekBars({ r }: { r: WeeklyReport }) {
  const rows = [
    { label: "Ten tydzień", rate: r.thisWeek.rate, color: deltaColor(r.delta) === "var(--muted-foreground)" ? "var(--primary)" : deltaColor(r.delta) },
    { label: "Tydzień temu", rate: r.lastWeek.rate, color: "color-mix(in oklab, var(--foreground) 35%, transparent)" },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-bold tabular-nums">{row.rate}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max(2, row.rate)}%`, backgroundColor: row.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mon..Sun paired columns. Future days of this week are ghosted. */
export function WeekDayChart({ r }: { r: WeeklyReport }) {
  const H = 84;
  return (
    <div>
      <div className="flex items-end justify-between gap-1.5" style={{ height: H }}>
        {r.days.map((d) => (
          <div key={d.label} className="flex h-full flex-1 items-end justify-center gap-[3px]">
            <div
              className="w-1/2 max-w-[12px] rounded-t-[4px]"
              style={{
                height: `${Math.max(3, ((d.prev ?? 0) / 100) * H)}px`,
                backgroundColor: "color-mix(in oklab, var(--foreground) 22%, transparent)",
              }}
              title={`Tydzień temu: ${d.prev ?? 0}%`}
            />
            <div
              className="w-1/2 max-w-[12px] rounded-t-[4px]"
              style={{
                height: d.now == null ? 3 : `${Math.max(3, (d.now / 100) * H)}px`,
                backgroundColor: d.now == null ? "var(--border)" : "var(--primary)",
                opacity: d.now == null ? 0.6 : 1,
              }}
              title={d.now == null ? "Jeszcze przed nami" : `Ten tydzień: ${d.now}%`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between gap-1.5">
        {r.days.map((d) => (
          <div
            key={d.label}
            className="flex-1 text-center text-[10px]"
            style={{ color: d.isToday ? "var(--primary)" : "var(--muted-foreground)", fontWeight: d.isToday ? 700 : 400 }}
          >
            {d.label}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--primary)" }} /> ten tydzień
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "color-mix(in oklab, var(--foreground) 22%, transparent)" }} />
          tydzień temu
        </span>
      </div>
    </div>
  );
}
