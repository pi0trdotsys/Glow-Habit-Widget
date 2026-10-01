import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HabitIcon } from "@/components/HabitIcon";
import { DeltaPill, WeekBars, WeekDayChart, deltaColor, verdict } from "@/components/WeekCompare";
import { useHabits } from "@/lib/habits/store";
import { weeklyReport, kindOf, formatMinute } from "@/lib/habits/utils";
import { habitInsights, sleepInsights, trackedDays, usualMinute } from "@/lib/habits/insights";
import { MonthCalendar } from "@/components/MonthCalendar";
import { AVOID_COLOR, HABIT_COLOR_VAR } from "@/lib/habits/colors";
import { MonthsView, TrendView } from "@/components/LongStats";
import { useState } from "react";
import { L, isEn } from "@/lib/i18n";

type Tab = "week" | "trend" | "months";
const tabList = (): { id: Tab; label: string }[] => [
  { id: "week", label: L("Tydzień", "Week") },
  { id: "trend", label: L("90 dni", "90 days") },
  { id: "months", label: L("Miesiące", "Months") },
];

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: L("Raport - Szpila", "Report - Szpila") },
      {
        name: "description",
        content: L(
          "Ten tydzień vs zeszły - porównanie do tego samego momentu tygodnia.",
          "This week vs last - compared up to the same point in the week.",
        ),
      },
    ],
  }),
  component: ReportPage,
});

const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : isEn() ? n.toFixed(1) : n.toFixed(1).replace(".", ",");

function ReportPage() {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const r = weeklyReport(habits, completions);
  const nightReports = useHabits((s) => s.nightReports);
  const insights = [
    ...habitInsights(habits, completions),
    ...sleepInsights(habits, completions, nightReports),
  ]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);
  const tracked = trackedDays(completions);
  const usual = new Map(habits.map((h) => [h.id, usualMinute(h, completions)]));
  const diffScore = Math.round((r.thisWeek.score - r.lastWeek.score) * 10) / 10;
  const [tab, setTab] = useState<Tab>("week");

  const tabs = (
    <div className="mx-5 mb-5 grid grid-cols-3 rounded-2xl bg-card p-1" role="tablist">
      {tabList().map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => setTab(t.id)}
          className="rounded-xl py-2 text-xs font-semibold transition"
          style={{
            backgroundColor: tab === t.id ? "var(--background)" : "transparent",
            color: tab === t.id ? "var(--foreground)" : "var(--muted-foreground)",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  if (tab !== "week") {
    return (
      <AppShell>
        <header className="px-5 pt-10 pb-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {tab === "trend"
              ? L("ostatnie 90 dni", "last 90 days")
              : L("ostatnie 6 miesięcy", "last 6 months")}
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
            {tab === "trend"
              ? L("Trend z 90 dni", "90-day trend")
              : L("Miesiąc do miesiąca", "Month over month")}
          </h1>
        </header>
        {tabs}
        {tab === "trend" ? <TrendView /> : <MonthsView />}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="px-5 pt-10 pb-5">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{r.windowLabel}</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
          {L("Tydzień do tygodnia", "Week over week")}
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {L(
            "Porównanie tylko do tego samego momentu tygodnia - dzisiejszy dzień liczy się tak samo jak ten sam dzień tydzień temu, do tej samej godziny.",
            "Compared only up to the same point in the week - today counts just like the same day last week, up to the same hour.",
          )}
        </p>
      </header>
      {tabs}

      <section className="mx-5 rounded-3xl bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold leading-tight" style={{ color: deltaColor(r.delta) }}>
              {r.noBaseline ? L("Pierwszy tydzień", "First week") : verdict(r.delta)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {L(
                `${fmt(r.thisWeek.score)} z ${fmt(r.thisWeek.due)} wykonań · tydzień temu ${fmt(r.lastWeek.score)} z ${fmt(r.lastWeek.due)}`,
                `${fmt(r.thisWeek.score)} of ${fmt(r.thisWeek.due)} done · last week ${fmt(r.lastWeek.score)} of ${fmt(r.lastWeek.due)}`,
              )}
            </div>
          </div>
          {!r.noBaseline && <DeltaPill delta={r.delta} big />}
        </div>
        <div className="mt-5">
          <WeekBars r={r} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {r.noBaseline
            ? L(
                "Tydzień temu nie było jeszcze czego porównać. Pełne porównanie pojawi się za tydzień.",
                "Nothing to compare with last week yet. The full comparison shows up in a week.",
              )
            : diffScore > 0
              ? L(
                  `Masz o ${fmt(diffScore)} wykonań więcej niż o tej porze tydzień temu.`,
                  `You're ${fmt(diffScore)} ahead of this time last week.`,
                )
              : diffScore < 0
                ? L(
                    `Brakuje ci ${fmt(-diffScore)} wykonań do wyniku sprzed tygodnia o tej porze.`,
                    `You're ${fmt(-diffScore)} behind where you were this time last week.`,
                  )
                : L(
                    "Dokładnie tyle samo wykonań co o tej porze tydzień temu.",
                    "Exactly as much done as this time last week.",
                  )}
        </p>
      </section>

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {L("Dzień po dniu", "Day by day")}
        </h2>
        <WeekDayChart r={r} />
      </section>

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {L("Powiązania między nawykami", "Habit connections")}
        </h2>
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tracked < 14
              ? L(
                  `Zbieram dane (${tracked} z ok. 14 dni). Potem pokażę, co wpływa na co, np. czy telefon do późna psuje kroki następnego dnia.`,
                  `Collecting data (${tracked} of ~14 days). Then I'll show what affects what, e.g. whether late-night phone time wrecks the next day's steps.`,
                )
              : L(
                  "Na razie nie widać wyraźnych zależności między twoimi nawykami.",
                  "No clear links between your habits so far.",
                )}
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
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {L("Miesiąc", "Month")}
        </h2>
        <MonthCalendar />
      </section>

      <section className="mt-8 px-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {L("Zadania · ten tydzień vs tydzień temu", "Habits · this week vs last week")}
        </h2>
        {habits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Link to="/habits/new" className="underline">
              {L("Dodaj zadanie", "Add a habit")}
            </Link>
            {L(", żeby zacząć śledzić.", " to start tracking.")}
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
                  <Link
                    to="/habits/$id"
                    params={{ id: p.habit.id }}
                    className="flex items-center gap-3 rounded-2xl bg-card p-3"
                  >
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                      style={{ backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` }}
                    >
                      <HabitIcon
                        name={p.habit.icon}
                        size={18}
                        style={avoid ? { color } : undefined}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.habit.name}</div>
                      <div className="mt-1.5 space-y-1">
                        <MiniBar value={p.this} max={max} color={color} />
                        <MiniBar
                          value={p.last}
                          max={max}
                          color="color-mix(in oklab, var(--foreground) 25%, transparent)"
                        />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {L(
                          `${fmt(p.this)}/${fmt(p.dueThis)} teraz · ${fmt(p.last)}/${fmt(p.dueLast)} tydzień temu`,
                          `${fmt(p.this)}/${fmt(p.dueThis)} now · ${fmt(p.last)}/${fmt(p.dueLast)} last week`,
                        )}
                        {usual.get(p.habit.id) != null &&
                          ` · ${L("zwykle ok. ", "usually ~")}${formatMinute(usual.get(p.habit.id)!)}`}
                      </div>
                    </div>
                    <span
                      className="w-10 shrink-0 text-right text-sm font-bold"
                      style={{ color: deltaColor(diff) }}
                    >
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
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}
