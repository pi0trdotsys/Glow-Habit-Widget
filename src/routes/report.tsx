import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HabitIcon } from "@/components/HabitIcon";
import { DeltaPill, WeekBars, WeekDayChart, deltaColor, verdict } from "@/components/WeekCompare";
import { useHabits } from "@/lib/habits/store";
import { weeklyReport, kindOf, formatMinute } from "@/lib/habits/utils";
import { habitInsights, trackedDays, usualMinute } from "@/lib/habits/insights";
import { MonthCalendar } from "@/components/MonthCalendar";
import { AVOID_COLOR, HABIT_COLOR_VAR } from "@/lib/habits/colors";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Raport tygodnia - Loop" },
      { name: "description", content: "Ten tydzień vs zeszły - porównanie do tego samego momentu tygodnia." },
    ],
  }),
  component: ReportPage,
});

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

function ReportPage() {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const r = weeklyReport(habits, completions);
  const insights = habitInsights(habits, completions);
  const tracked = trackedDays(completions);
  const usual = new Map(habits.map((h) => [h.id, usualMinute(h, completions)]));
  const diffScore = Math.round((r.thisWeek.score - r.lastWeek.score) * 10) / 10;

  return (
    <AppShell>
      <header className="px-5 pt-10 pb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{r.windowLabel}</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Tydzień do tygodnia</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Porównanie tylko do tego samego momentu tygodnia - dzisiejszy dzień liczy się tak samo jak ten sam dzień
          tydzień temu, do tej samej godziny.
        </p>
      </header>

      <section className="mx-5 rounded-3xl bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold leading-tight" style={{ color: deltaColor(r.delta) }}>
              {verdict(r.delta)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {fmt(r.thisWeek.score)} z {fmt(r.thisWeek.due)} wykonań · tydzień temu {fmt(r.lastWeek.score)} z{" "}
              {fmt(r.lastWeek.due)}
            </div>
          </div>
          <DeltaPill delta={r.delta} big />
        </div>
        <div className="mt-5">
          <WeekBars r={r} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {diffScore > 0
            ? `Masz o ${fmt(diffScore)} wykonań więcej niż o tej porze tydzień temu.`
            : diffScore < 0
            ? `Brakuje ci ${fmt(-diffScore)} wykonań do wyniku sprzed tygodnia o tej porze.`
            : "Dokładnie tyle samo wykonań co o tej porze tydzień temu."}
        </p>
      </section>

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Dzień po dniu</h2>
        <WeekDayChart r={r} />
      </section>

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Powiązania między nawykami
        </h2>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tracked < 14
              ? `Zbieram dane (${tracked} z ok. 14 dni). Potem pokażę, co wpływa na co, np. czy telefon do późna psuje kroki następnego dnia.`
              : "Na razie nie widać wyraźnych zależności między twoimi nawykami."}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {insights.map((i) => (
              <li key={i.causeId + i.effectId} className="flex gap-2.5 text-sm leading-snug">
                <span className="mt-0.5 shrink-0">{i.negative ? "📉" : "📈"}</span>
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Miesiąc</h2>
        <MonthCalendar />
      </section>

      <section className="mt-8 px-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Zadania · ten tydzień vs tydzień temu
        </h2>
        {habits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Link to="/habits/new" className="underline">
              Dodaj zadanie
            </Link>
            , żeby zacząć śledzić.
          </p>
        ) : (
          <ul className="space-y-2">
            {r.perHabit.map((p) => {
              const avoid = kindOf(p.habit) === "avoid";
              const color = avoid ? AVOID_COLOR : HABIT_COLOR_VAR[p.habit.color];
              const diff = Math.round((p.this - p.last) * 10) / 10;
              const max = Math.max(p.dueThis, p.dueLast, 0.1);
              return (
                <li key={p.habit.id}>
                  <Link to="/habits/$id" params={{ id: p.habit.id }} className="flex items-center gap-3 rounded-2xl bg-card p-3">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                      style={{ backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` }}
                    >
                      <HabitIcon name={p.habit.icon} size={18} style={avoid ? { color } : undefined} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.habit.name}</div>
                      <div className="mt-1.5 space-y-1">
                        <MiniBar value={p.this} max={max} color={color} />
                        <MiniBar value={p.last} max={max} color="color-mix(in oklab, var(--foreground) 25%, transparent)" />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {fmt(p.this)}/{fmt(p.dueThis)} teraz · {fmt(p.last)}/{fmt(p.dueLast)} tydzień temu
                        {usual.get(p.habit.id) != null && ` · zwykle ok. ${formatMinute(usual.get(p.habit.id)!)}`}
                      </div>
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-bold" style={{ color: deltaColor(diff) }}>
                      {diff > 0 ? "+" : ""}
                      {fmt(diff)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }} />
    </div>
  );
}
