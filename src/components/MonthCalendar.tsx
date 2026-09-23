import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { addMonths, format } from "date-fns";
import { pl } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HabitIcon } from "./HabitIcon";
import { useHabits } from "@/lib/habits/store";
import { monthGrid } from "@/lib/habits/insights";
import { AVOID_COLOR, HABIT_COLOR_VAR } from "@/lib/habits/colors";
import { amountOn, amountText, avoidStatus, dayScore, goalOf, isDueOn, kindOf } from "@/lib/habits/utils";

const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];

/** Month heatmap for all habits at once; tap a day to see what happened. */
export function MonthCalendar() {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<Date | null>(null);
  const grid = monthGrid(habits, completions, month);
  const isCurrent = format(month, "yyyy-MM") === format(new Date(), "yyyy-MM");

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setMonth((m) => addMonths(m, -1))}
          className="grid h-8 w-8 place-items-center rounded-full bg-background"
          aria-label="Poprzedni miesiąc"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold capitalize">{format(month, "LLLL yyyy", { locale: pl })}</span>
        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          disabled={isCurrent}
          className="grid h-8 w-8 place-items-center rounded-full bg-background disabled:opacity-30"
          aria-label="Następny miesiąc"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
        {grid.map((d) => {
          const bg =
            d.rate == null
              ? "color-mix(in oklab, var(--foreground) 5%, transparent)"
              : `color-mix(in oklab, var(--primary) ${Math.round(12 + (d.rate / 100) * 88)}%, transparent)`;
          const isSel = selected && d.key === format(selected, "yyyy-MM-dd");
          return (
            <button
              key={d.key}
              disabled={d.future}
              onClick={() => setSelected(d.date)}
              className="grid aspect-square place-items-center rounded-lg text-[11px] font-medium transition-transform active:scale-90 disabled:opacity-25"
              style={{
                backgroundColor: bg,
                opacity: d.inMonth ? 1 : 0.35,
                color: d.rate != null && d.rate >= 60 ? "var(--primary-foreground)" : "var(--foreground)",
                outline: isSel ? "2px solid var(--foreground)" : undefined,
              }}
              title={d.rate == null ? d.key : `${d.key}: ${d.rate}%`}
            >
              {d.date.getDate()}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 rounded-2xl bg-background p-3">
          <div className="mb-2 text-xs font-semibold capitalize text-muted-foreground">
            {format(selected, "EEEE, d MMMM", { locale: pl })}
          </div>
          <ul className="space-y-1.5">
            {habits
              .filter((h) => isDueOn(h, selected))
              .map((h) => {
                const avoid = kindOf(h) === "avoid";
                const s = dayScore(h, completions, selected);
                const st = avoid ? avoidStatus(h, completions, selected) : null;
                const label = avoid
                  ? st === "clean"
                    ? "czysto"
                    : st === "slip"
                    ? s >= 1
                      ? "wpadka (w limicie)"
                      : "wpadka"
                    : "brak potwierdzenia"
                  : goalOf(h).type === "check"
                  ? s >= 1
                    ? "zrobione"
                    : "nie"
                  : amountText(h, amountOn(h, completions, selected));
                return (
                  <li key={h.id}>
                    <Link to="/habits/$id" params={{ id: h.id }} className="flex items-center gap-2 text-sm">
                      <HabitIcon
                        name={h.icon}
                        size={15}
                        style={{ color: avoid ? AVOID_COLOR : HABIT_COLOR_VAR[h.color] }}
                      />
                      <span className="min-w-0 flex-1 truncate">{h.name}</span>
                      <span className="text-xs" style={{ color: s >= 1 ? "var(--primary)" : "var(--muted-foreground)" }}>
                        {s >= 1 ? "✓ " : ""}
                        {label}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}
