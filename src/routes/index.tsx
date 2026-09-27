import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import { pl } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, ChevronDown, ChevronRight, Sunrise } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { HabitTile, praiseToast } from "@/components/HabitTile";
import { HabitIcon } from "@/components/HabitIcon";
import { AvoidChips } from "@/components/AvoidChips";
import { SzpilaBubble } from "@/components/Szpila";
import { DeltaPill } from "@/components/WeekCompare";
import { useHabits } from "@/lib/habits/store";
import { AVOID_COLOR, HABIT_COLOR_VAR } from "@/lib/habits/colors";
import {
  avoidStatus,
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
  AVOID_GRACE_MIN,
  type PlanItem,
} from "@/lib/habits/utils";
import { szpilaNow } from "@/lib/habits/szpila";
import { NightBillCard } from "@/components/NightBill";
import { useBackHandler } from "@/lib/back";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dziś - Szpila" },
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

/**
 * "Fokus" home: greeting + progress ring, one-line Szpila, the one thing to do
 * now, then tiles and forbidden-habit chips. The day plan folds away and the
 * week-vs-week comparison is a pill linking to the report.
 */
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

  // Morning review: yesterday's unconfirmed forbidden habits can be settled until noon.
  const yesterday = addDays(today, -1);
  const settleYesterday =
    minuteOfDay(today) < AVOID_GRACE_MIN
      ? habits.filter(
          (h) =>
            kindOf(h) === "avoid" &&
            h.source !== "screen" &&
            isDueOn(h, yesterday) &&
            avoidStatus(h, completions, yesterday, today) === "pending",
        )
      : [];

  return (
    <AppShell>
      <header className="flex items-center justify-between gap-4 px-5 pt-10 pb-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {format(today, "EEEE, d MMMM", { locale: pl })}
          </p>
          <h1 className="mt-1.5 truncate font-display text-3xl font-bold tracking-tight">
            {greetingFor(today)}
            {userName ? `, ${userName}` : ""}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.done}/{progress.total} zrobione
            {topStreak > 0 && ` · 🔥 seria ${daysLabel(topStreak)}`}
          </p>
        </div>
        <ProgressRing fraction={progress.fraction} />
      </header>

      <div className="space-y-3 px-5">
        <SzpilaBubble say={say} onReroll={() => setSeed((s) => s + 1)} />
        <NightBillCard now={today} />
        {settleYesterday.length > 0 && (
          <section
            className="rounded-2xl p-3"
            style={{ background: `color-mix(in oklab, ${AVOID_COLOR} 8%, var(--card))` }}
          >
            <div
              className="mb-2 flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: AVOID_COLOR }}
            >
              <Sunrise size={14} /> Rozlicz wczoraj · do {formatMinute(AVOID_GRACE_MIN)}
            </div>
            <AvoidChips habits={settleYesterday} day={yesterday} />
          </section>
        )}
        {due.length > 0 && <NowCard plan={plan} />}
        {due.length > 0 && (
          <PlanFold plan={plan} delta={report.delta} hasHistory={!report.noBaseline} />
        )}
      </div>

      {due.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {build.length > 0 && (
            <div className="mt-7 grid grid-cols-3 gap-y-7 gap-x-2 px-5">
              {build.map((h) => (
                <HabitTile key={h.id} habit={h} />
              ))}
            </div>
          )}
          {avoid.length > 0 && (
            <section className="mt-8 px-5">
              <h2
                className="mb-3 text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: AVOID_COLOR }}
              >
                Zakazane · dotknij, by potwierdzić
              </h2>
              <AvoidChips habits={avoid} />
            </section>
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

function ProgressRing({ fraction }: { fraction: number }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(fraction * 100);
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      aria-label={`Postęp dnia ${pct}%`}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--border)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--primary)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 500ms ease-out" }}
        />
      </svg>
      <span className="text-sm font-bold tabular-nums">{pct}%</span>
    </div>
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

/** The single thing to do right now. */
function NowCard({ plan }: { plan: PlanItem[] }) {
  const logStep = useHabits((s) => s.logStep);
  const setAmount = useHabits((s) => s.setAmount);
  const setAvoid = useHabits((s) => s.setAvoid);
  const next = plan[0];
  if (!next) {
    return (
      <div className="rounded-2xl bg-card p-4 text-center text-sm text-muted-foreground">
        Wszystko na dziś zrobione. 🎉
      </div>
    );
  }
  const color = next.avoid ? AVOID_COLOR : HABIT_COLOR_VAR[next.habit.color];
  const doNext = () => {
    const h = next.habit;
    const key = todayKey();
    logStep(h.id);
    if (next.avoid || next.left <= goalOf(h).step) {
      praiseToast(h, () =>
        next.avoid ? setAvoid(h.id, key, null) : setAmount(h.id, key, next.amount),
      );
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5">
      <Link
        to="/habits/$id"
        params={{ id: next.habit.id }}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` }}
      >
        <HabitIcon name={next.habit.icon} size={22} style={next.avoid ? { color } : undefined} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Teraz
        </div>
        <div className="truncate font-semibold">{next.habit.name}</div>
        <div
          className="truncate text-xs"
          style={{ color: next.overdue ? AVOID_COLOR : "var(--muted-foreground)" }}
        >
          {whenLabel(next, minuteOfDay())}
          {!next.avoid &&
            goalOf(next.habit).type !== "check" &&
            ` · ${next.amount}/${goalOf(next.habit).target}`}
        </div>
      </div>
      <button
        type="button"
        onClick={doNext}
        className="shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition-transform active:scale-95"
        style={{
          backgroundColor: next.avoid ? AVOID_COLOR : "var(--primary)",
          color: "var(--primary-foreground)",
        }}
      >
        {actionLabel(next)}
      </button>
    </div>
  );
}

/** "Plan dnia (N)" folded by default, plus the week-vs-week pill linking to the report. */
function PlanFold({
  plan,
  delta,
  hasHistory,
}: {
  plan: PlanItem[];
  delta: number;
  hasHistory: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rest = plan.slice(1);
  useBackHandler(open, () => setOpen(false));
  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={rest.length === 0}
          className="flex items-center gap-1 py-1 text-sm font-medium text-muted-foreground disabled:opacity-50"
        >
          Plan dnia ({rest.length})
          <motion.span animate={{ rotate: open ? 180 : 0 }}>
            <ChevronDown size={16} />
          </motion.span>
        </button>
        {hasHistory && (
          <Link to="/report" className="flex items-center gap-0.5" aria-label="Tydzień do tygodnia">
            <DeltaPill delta={delta} />
            <ChevronRight size={14} className="text-muted-foreground" />
          </Link>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && rest.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-1 divide-y divide-border overflow-hidden rounded-2xl bg-card px-3"
          >
            {rest.map((p) => (
              <li key={p.habit.id}>
                <Link
                  to="/habits/$id"
                  params={{ id: p.habit.id }}
                  className="flex items-center gap-3 py-2.5 text-sm"
                >
                  <span
                    className="w-11 shrink-0 text-xs tabular-nums"
                    style={{ color: p.overdue ? AVOID_COLOR : "var(--muted-foreground)" }}
                  >
                    {formatMinute(p.at)}
                  </span>
                  <HabitIcon
                    name={p.habit.icon}
                    size={16}
                    style={{ color: p.avoid ? AVOID_COLOR : HABIT_COLOR_VAR[p.habit.color] }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {p.avoid ? `Potwierdź: ${p.habit.name}` : p.habit.name}
                  </span>
                  {!p.avoid && goalOf(p.habit).type !== "check" && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.left} {unitLabel(p.habit, p.left)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-5 mt-6 rounded-3xl border border-border bg-card p-8 text-center">
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
