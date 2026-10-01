import { useState } from "react";
import { Target } from "lucide-react";
import { useHabits } from "@/lib/habits/store";
import { focusChallenge, focusHabit, focusProgress, focusSuggestions } from "@/lib/habits/focus";
import { HabitIcon } from "./HabitIcon";
import { haptic } from "@/lib/haptics";
import { L, plural } from "@/lib/i18n";

/**
 * Today's status slide for "Cel tygodnia": pick one habit for the week (the
 * weakest ones are suggested), then its progress - days done so far.
 */
export function FocusCard({ now }: { now: Date }) {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const focus = useHabits((s) => s.focus);
  const setFocus = useHabits((s) => s.setFocus);
  const [picking, setPicking] = useState(false);
  const h = focusHabit(habits, focus, now);

  if (!h || picking) {
    const options = focusSuggestions(habits, completions, now);
    return (
      <section
        data-focus-card="pick"
        className="flex h-full flex-col justify-center rounded-2xl bg-card px-3 py-2.5"
      >
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Target size={15} style={{ color: "var(--primary)" }} />
          {L("Cel tygodnia: jedno zadanie na serio", "This week's focus: one habit for real")}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              data-focus-pick={o.id}
              onClick={() => {
                setFocus(o.id);
                setPicking(false);
                haptic("success");
              }}
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium"
            >
              <HabitIcon name={o.icon} size={13} />
              {o.name}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground">
          {L(
            "Najsłabsze z ostatniego tygodnia. Szpila będzie pilnować go najmocniej.",
            "The weakest of last week. Szpila will watch it the hardest.",
          )}
        </div>
      </section>
    );
  }

  const p = focusProgress(h, completions, now, focus?.since);
  const goal = focusChallenge(h, completions, now, focus?.since).goal;
  return (
    <section
      data-focus-card="set"
      className="flex h-full flex-col justify-center rounded-2xl bg-card px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          🎯 <span className="truncate">{L("Cel tygodnia", "Weekly focus")}:</span>
          <span className="truncate font-semibold text-foreground">{h.name}</span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums" data-focus-progress>
          {p.done}/{goal}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, (p.done / goal) * 100)}%`,
            backgroundColor: "var(--primary)",
          }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {p.due > p.done
            ? L(
                `Opuszczone: ${p.due - p.done} ${plural(p.due - p.done, ["dzień", "dni", "dni"], ["day", "days"])}. Nie dwa razy z rzędu.`,
                `Missed: ${p.due - p.done} ${plural(p.due - p.done, ["dzień", "dni", "dni"], ["day", "days"])}. Not twice in a row.`,
              )
            : L("Na razie bez dziury. Tak trzymaj.", "No gaps so far. Keep it up.")}
        </span>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="shrink-0 font-semibold"
          style={{ color: "var(--primary)" }}
        >
          {L("Zmień", "Change")}
        </button>
      </div>
    </section>
  );
}
