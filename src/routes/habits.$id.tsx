import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, Trash2, Pencil, Bell, Minus, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { HabitIcon } from "@/components/HabitIcon";
import { HabitForm } from "@/components/HabitForm";
import { AvoidCard } from "@/components/AvoidCard";
import { useHabits } from "@/lib/habits/store";
import { AVOID_COLOR, HABIT_COLOR_VAR } from "@/lib/habits/colors";
import type { Habit } from "@/lib/habits/types";
import { usualMinute } from "@/lib/habits/insights";
import {
  amountOn,
  completionRate,
  currentStreak,
  formatMinute,
  goalLabel,
  goalOf,
  heatmapData,
  kindOf,
  longestStreak,
  scheduleLabel,
  thisWeekCount,
  todayKey,
  unitLabel,
} from "@/lib/habits/utils";

export const Route = createFileRoute("/habits/$id")({
  head: () => ({ meta: [{ title: "Zadanie - Loop" }] }),
  component: HabitDetail,
});

function HabitDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const habit = useHabits((s) => s.habits.find((h) => h.id === id));
  const completions = useHabits((s) => s.completions);
  const removeHabit = useHabits((s) => s.removeHabit);
  const setAmount = useHabits((s) => s.setAmount);
  const setAvoid = useHabits((s) => s.setAvoid);
  const updateHabit = useHabits((s) => s.updateHabit);
  const [editing, setEditing] = useState(false);

  if (!habit) {
    return (
      <AppShell>
        <div className="p-8 text-center text-muted-foreground">Nie znaleziono zadania.</div>
      </AppShell>
    );
  }

  if (editing) {
    return (
      <AppShell>
        <HabitForm
          initial={habit}
          onCancel={() => setEditing(false)}
          onSave={(draft) => {
            updateHabit(habit.id, draft);
            setEditing(false);
          }}
        />
      </AppShell>
    );
  }

  const avoid = kindOf(habit) === "avoid";
  const color = avoid ? AVOID_COLOR : HABIT_COLOR_VAR[habit.color];
  const heat = heatmapData(habit, completions, 84);
  const streak = currentStreak(habit, completions);
  const longest = longestStreak(habit, completions);
  const week = thisWeekCount(habit, completions);
  const rate = completionRate(habit, completions, 30);
  const todayK = todayKey();
  const g = goalOf(habit);
  const usual = kindOf(habit) === "build" && habit.source !== "steps" ? usualMinute(habit, completions) : null;

  const tapCell = (d: (typeof heat)[number]) => {
    if (avoid) setAvoid(habit.id, d.date, d.status === "clean" ? "slip" : "clean");
    else setAmount(habit.id, d.date, d.done ? 0 : g.target);
  };

  return (
    <AppShell>
      <header className="flex items-center justify-between px-5 pt-8">
        <button
          onClick={() => navigate({ to: "/habits" })}
          className="grid h-10 w-10 place-items-center rounded-full bg-card"
          aria-label="Wstecz"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="grid h-10 w-10 place-items-center rounded-full bg-card"
            aria-label="Edytuj"
          >
            <Pencil size={17} />
          </button>
          <button
            onClick={() => {
              if (confirm(`Usunąć „${habit.name}”? Historia też zniknie.`)) {
                removeHabit(habit.id);
                navigate({ to: "/habits" });
              }
            }}
            className="grid h-10 w-10 place-items-center rounded-full bg-card text-destructive"
            aria-label="Usuń"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <div className="flex flex-col items-center gap-2 px-5 pb-6 pt-4">
        <div
          className="grid h-24 w-24 place-items-center rounded-full"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)`,
            boxShadow: `0 0 0 2px ${color}`,
          }}
        >
          <HabitIcon name={habit.icon} size={44} strokeWidth={1.8} style={avoid ? { color } : undefined} />
        </div>
        <h1 className="text-center font-display text-3xl font-bold">{habit.name}</h1>
        <p className="text-xs text-muted-foreground">
          {avoid && <span style={{ color }}>Zakazane · </span>}
          {goalLabel(habit)} · {scheduleLabel(habit)}
          {habit.reminder && (
            <>
              {" · "}
              <Bell size={11} className="inline" /> {habit.reminder}
            </>
          )}
        </p>
        {usual != null && (
          <p className="text-xs text-muted-foreground">
            🕒 Zwykle robisz to ok. {formatMinute(usual)}
          </p>
        )}
        {usual == null && habit.source === "steps" && (
          <p className="text-xs text-muted-foreground">👣 Kroki pobierane z Health Connect</p>
        )}
      </div>

      <div className="px-5">
        {avoid ? (
          <AvoidCard habit={habit} />
        ) : g.type !== "check" ? (
          <AmountEditor habit={habit} amount={amountOn(habit, completions, new Date())} color={color} />
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 px-5">
        <Stat label={avoid ? "Seria czystych dni" : "Obecna seria"} value={`${streak} d`} accent={color} />
        <Stat label="Najdłuższa seria" value={`${longest} d`} accent={color} />
        <Stat label={avoid ? "Czyste dni w tyg." : "Zaliczone w tyg."} value={`${week}`} accent={color} />
        <Stat label="Skuteczność 30 dni" value={`${rate}%`} accent={color} />
      </div>

      <section className="mt-8 px-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Ostatnie 12 tygodni · dotknij, by zmienić
        </h2>
        <div className="grid grid-flow-col gap-1 rounded-2xl bg-card p-3" style={{ gridTemplateRows: "repeat(7, 1fr)" }}>
          {heat.map((d) => {
            const bg = avoid
              ? d.status === "clean"
                ? color
                : d.status === "slip"
                ? d.level >= 1
                  ? `color-mix(in oklab, ${color} 35%, transparent)` // slip within allowance
                  : "color-mix(in oklab, var(--foreground) 30%, transparent)"
                : "color-mix(in oklab, var(--foreground) 6%, transparent)"
              : d.level > 0
              ? `color-mix(in oklab, ${color} ${Math.round(25 + d.level * 75)}%, transparent)`
              : "color-mix(in oklab, var(--foreground) 6%, transparent)";
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => tapCell(d)}
                disabled={d.date > todayK}
                className="aspect-square rounded-[4px] transition-transform active:scale-90 disabled:opacity-30"
                style={{
                  backgroundColor: bg,
                  outline: d.date === todayK ? `1.5px solid ${color}` : undefined,
                  outlineOffset: d.date === todayK ? "1px" : undefined,
                }}
                title={d.date}
                aria-label={`${d.date} ${d.done ? "zaliczone" : "niezaliczone"}`}
              />
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {avoid
            ? "Czerwone = czysty dzień, szare = wpadka (niepotwierdzony dzień też). Dotknij, by przełączyć."
            : "Im mocniejszy kolor, tym bliżej celu. Dotknij dnia, by zaliczyć go w całości lub wyczyścić."}
        </p>
      </section>
    </AppShell>
  );
}

/** Adjust today's amount for count/minute goals. */
function AmountEditor({ habit, amount, color }: { habit: Habit; amount: number; color: string }) {
  const setAmount = useHabits((s) => s.setAmount);
  const g = goalOf(habit);
  const key = todayKey();
  const [draft, setDraft] = useState<string | null>(null);
  const pct = Math.min(100, Math.round((amount / g.target) * 100));
  const set = (n: number) => setAmount(habit.id, key, Math.max(0, n));

  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Dziś</span>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          onClick={() => set(amount - g.step)}
          className="grid h-11 w-11 place-items-center rounded-full bg-background"
          aria-label="Odejmij"
        >
          <Minus size={18} />
        </button>
        <div className="flex items-baseline gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            value={draft ?? String(amount)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft != null) set(Math.round(Number(draft) || 0));
              setDraft(null);
            }}
            className="w-24 bg-transparent text-center text-3xl font-bold tabular-nums outline-none"
          />
          <span className="text-sm text-muted-foreground">
            / {g.target} {unitLabel(habit, g.target)}
          </span>
        </div>
        <button
          onClick={() => set(amount + g.step)}
          className="grid h-11 w-11 place-items-center rounded-full"
          style={{ backgroundColor: color, color: "var(--background)" }}
          aria-label="Dodaj"
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}
