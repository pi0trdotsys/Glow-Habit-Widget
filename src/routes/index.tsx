import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, Clock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { HabitTile, praiseToast } from "@/components/HabitTile";
import { HabitIcon } from "@/components/HabitIcon";
import { AvoidCard } from "@/components/AvoidCard";
import { SzpilaCard } from "@/components/Szpila";
import { DeltaPill, WeekBars } from "@/components/WeekCompare";
import { useHabits } from "@/lib/habits/store";
import { AVOID_COLOR, HABIT_COLOR_VAR } from "@/lib/habits/colors";
import {
  amountText,
  currentStreak,
  daysLabel,
  formatMinute,
  goalOf,
  greetingFor,
  isDueOn,
  kindOf,
  minuteOfDay,
  planDay,
  todayKey,
  todayProgress,
  unitLabel,
  weeklyReport,
  type PlanItem,
} from "@/lib/habits/utils";
import { pendingLabel, szpilaNow } from "@/lib/habits/szpila";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dziś - Loop" },
      { name: "description", content: "Dzisiejsze zadania. Przytrzymaj kafelek, by zaliczyć." },
    ],
  }),
  component: TodayPage,
});

/** Re-render every minute so the plan and "o tej porze" comparison stay current. */
function useMinuteTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
}

function TodayPage() {
  useMinuteTick();
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const userName = useHabits((s) => s.userName);
  const level = useHabits((s) => s.notifications.tauntLevel);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000));

  const today = new Date();
  const due = habits.filter((h) => isDueOn(h, today));
  const build = due.filter((h) => kindOf(h) === "build");
  const avoid = due.filter((h) => kindOf(h) === "avoid");
  const progress = todayProgress(habits, completions, today);
  const plan = planDay(habits, completions, today);
  const report = weeklyReport(habits, completions, today);
  const topStreak = habits.reduce((acc, h) => Math.max(acc, currentStreak(h, completions)), 0);
  const say = useMemo(
    () => szpilaNow(habits, completions, plan, level, userName, seed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, completions, habits, level, userName],
  );

  return (
    <AppShell>
      <header className="px-5 pt-10 pb-5">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {format(today, "EEEE, d MMMM", { locale: pl })}
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
          {greetingFor(today)}
          {userName ? `, ${userName}` : ""}
        </h1>
        <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="rounded-full bg-card px-3 py-1">
            {progress.done}/{progress.total} zrobione
          </span>
          {topStreak > 0 && <span className="rounded-full bg-card px-3 py-1">🔥 seria {daysLabel(topStreak)}</span>}
        </div>
      </header>

      <SzpilaCard say={say} onReroll={() => setSeed((s) => s + 1)} />

      {due.length > 0 && <DayPlan plan={plan} progress={progress} />}

      {habits.length > 0 && (
        <Link to="/report" className="mx-5 mb-7 block rounded-2xl bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Tydzień do tygodnia</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{report.windowLabel} vs to samo tydzień temu</div>
            </div>
            <DeltaPill delta={report.delta} />
          </div>
          <WeekBars r={report} />
        </Link>
      )}

      {due.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {build.length > 0 && (
            <>
              <SectionTitle>Do zrobienia</SectionTitle>
              <div className="grid grid-cols-3 gap-y-7 gap-x-2 px-5">
                {build.map((h) => (
                  <HabitTile key={h.id} habit={h} />
                ))}
              </div>
            </>
          )}
          {avoid.length > 0 && (
            <>
              <SectionTitle color={AVOID_COLOR}>Zakazane · potwierdź, że dziś nie</SectionTitle>
              <div className="space-y-2 px-5">
                {avoid.map((h) => (
                  <AvoidCard key={h.id} habit={h} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Anchored within the centered app column so it never clips off-screen. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md justify-end px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 5.5rem)" }}
      >
        <Link
          to="/habits/new"
          className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full shadow-2xl transition-transform active:scale-95"
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--primary-foreground)",
            boxShadow: "0 10px 30px -10px color-mix(in oklab, var(--primary) 60%, transparent)",
          }}
          aria-label="Dodaj zadanie"
        >
          <Plus size={26} strokeWidth={2.4} />
        </Link>
      </div>
    </AppShell>
  );
}

function SectionTitle({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <h2
      className="mb-4 mt-8 px-5 text-xs font-semibold uppercase tracking-[0.16em] first:mt-0"
      style={{ color: color ?? "var(--muted-foreground)" }}
    >
      {children}
    </h2>
  );
}

function whenLabel(item: PlanItem, nowMin: number): string {
  const d = item.at - nowMin;
  if (d <= 0 && d > -30) return "teraz";
  if (d <= -30) return `zaległe od ${formatMinute(item.at)}`;
  if (d < 60) return `za ${d} min`;
  return `o ${formatMinute(item.at)}`;
}

function actionLabel(item: PlanItem): string {
  if (item.avoid) return "Dziś czysto";
  const g = goalOf(item.habit);
  if (g.type === "check") return "Zrobione";
  const step = Math.min(g.step, item.left);
  return `+${step} ${unitLabel(item.habit, step)}`;
}

/** "Next up" + today's progress bar + the plan to finish the day. */
function DayPlan({ plan, progress }: { plan: PlanItem[]; progress: { done: number; total: number; fraction: number } }) {
  const logStep = useHabits((s) => s.logStep);
  const setAmount = useHabits((s) => s.setAmount);
  const setAvoid = useHabits((s) => s.setAvoid);
  const nowMin = minuteOfDay();
  const next = plan[0];
  const pct = Math.round(progress.fraction * 100);

  const doNext = () => {
    if (!next) return;
    const h = next.habit;
    const key = todayKey();
    logStep(h.id);
    const finishes = next.avoid || next.left <= goalOf(h).step;
    if (finishes) {
      praiseToast(h, () => (next.avoid ? setAvoid(h.id, key, null) : setAmount(h.id, key, next.amount)));
    }
  };

  return (
    <section className="mx-5 mb-6 rounded-3xl bg-card p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Postęp dnia</span>
        <span className="text-sm font-bold tabular-nums">
          {progress.done}/{progress.total} · {pct}%
        </span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: "var(--primary)" }}
        />
      </div>

      {next ? (
        <>
          <div className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">Teraz</div>
          <div className="mt-2 flex items-center gap-3">
            <Link
              to="/habits/$id"
              params={{ id: next.habit.id }}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
              style={{
                backgroundColor: `color-mix(in oklab, ${next.avoid ? AVOID_COLOR : HABIT_COLOR_VAR[next.habit.color]} 22%, transparent)`,
              }}
            >
              <HabitIcon name={next.habit.icon} size={22} style={next.avoid ? { color: AVOID_COLOR } : undefined} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{next.habit.name}</div>
              <div className="text-xs" style={{ color: next.overdue ? AVOID_COLOR : "var(--muted-foreground)" }}>
                {whenLabel(next, nowMin)}
                {!next.avoid && goalOf(next.habit).type !== "check" && ` · ${amountText(next.habit, next.amount)}`}
              </div>
            </div>
            <button
              type="button"
              onClick={doNext}
              className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-transform active:scale-95"
              style={{
                backgroundColor: next.avoid ? AVOID_COLOR : "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              {actionLabel(next)}
            </button>
          </div>

          {plan.length > 1 && (
            <>
              <div className="mt-5 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <Clock size={12} /> Plan na resztę dnia · {pendingLabel(plan.length)}
              </div>
              <ul className="mt-2 divide-y divide-border">
                {plan.slice(1, 7).map((p) => (
                  <li key={p.habit.id}>
                    <Link
                      to="/habits/$id"
                      params={{ id: p.habit.id }}
                      className="flex items-center gap-3 py-2 text-sm"
                    >
                      <span
                        className="w-12 shrink-0 tabular-nums text-xs"
                        style={{ color: p.overdue ? AVOID_COLOR : "var(--muted-foreground)" }}
                      >
                        {formatMinute(p.at)}
                      </span>
                      <HabitIcon
                        name={p.habit.icon}
                        size={16}
                        style={{ color: p.avoid ? AVOID_COLOR : HABIT_COLOR_VAR[p.habit.color] }}
                      />
                      <span className="min-w-0 flex-1 truncate">{p.avoid ? `Potwierdź: ${p.habit.name}` : p.habit.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {p.avoid ? "" : goalOf(p.habit).type === "check" ? "" : `zostało ${p.left} ${unitLabel(p.habit, p.left)}`}
                      </span>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Wszystko na dziś zrobione. 🎉</p>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mx-5 mt-4 rounded-3xl border border-border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground">Nie masz jeszcze zadań na dziś.</p>
      <Link
        to="/habits/new"
        className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
        style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
      >
        <Plus size={16} /> Dodaj pierwsze zadanie
      </Link>
    </div>
  );
}
