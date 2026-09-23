import { Link } from "@tanstack/react-router";
import { Ban, Check, X } from "lucide-react";
import { toast } from "sonner";
import { HabitIcon } from "./HabitIcon";
import { praiseToast } from "./HabitTile";
import { useHabits } from "@/lib/habits/store";
import type { Habit } from "@/lib/habits/types";
import { AVOID_COLOR } from "@/lib/habits/colors";
import { avoidStatus, limitOf, limitLabel, slipsInPeriod, todayKey } from "@/lib/habits/utils";
import { slipFor } from "@/lib/habits/szpila";
import { DEFAULT_LATE_AFTER, DEFAULT_LATE_LIMIT } from "@/lib/sensors";

const PERIOD_LABEL = { day: "dziś", week: "w tym tygodniu", month: "w tym miesiącu" } as const;

/** Red card for a forbidden habit: confirm a clean day, or own up to a slip. */
export function AvoidCard({ habit }: { habit: Habit }) {
  const completions = useHabits((s) => s.completions);
  const setAvoid = useHabits((s) => s.setAvoid);
  const now = new Date();
  const key = todayKey(now);
  const status = avoidStatus(habit, completions, now, now);
  const limit = limitOf(habit);
  const used = slipsInPeriod(habit, completions, now, now);
  const over = used > limit.times;

  const clean = () => {
    const prev = status;
    setAvoid(habit.id, key, "clean");
    praiseToast(habit, () => setAvoid(habit.id, key, prev === "pending" ? null : "slip"));
  };
  const slip = () => {
    const prev = status;
    setAvoid(habit.id, key, "slip");
    const { notifications, userName } = useHabits.getState();
    toast(`😈 ${slipFor(habit, notifications.tauntLevel, userName)}`, {
      action: { label: "Cofnij", onClick: () => setAvoid(habit.id, key, prev === "clean" ? "clean" : null) },
      duration: 4500,
    });
  };

  return (
    <div
      className="rounded-2xl p-3"
      style={{
        background: `color-mix(in oklab, ${AVOID_COLOR} ${status === "pending" ? 14 : 7}%, var(--card))`,
        border: `1px solid color-mix(in oklab, ${AVOID_COLOR} ${status === "pending" ? 45 : 20}%, transparent)`,
      }}
    >
      <div className="flex items-center gap-3">
        <Link
          to="/habits/$id"
          params={{ id: habit.id }}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: `color-mix(in oklab, ${AVOID_COLOR} 20%, transparent)` }}
        >
          <HabitIcon name={habit.icon} size={20} style={{ color: AVOID_COLOR }} />
          <Ban size={14} className="absolute -right-0.5 -top-0.5" style={{ color: AVOID_COLOR }} strokeWidth={2.8} />
        </Link>
        <Link to="/habits/$id" params={{ id: habit.id }} className="min-w-0 flex-1">
          <div className="truncate font-medium">{habit.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {limitLabel(limit)}
            {limit.times > 0 && (
              <>
                {" · "}
                <span style={{ color: over ? AVOID_COLOR : undefined, fontWeight: over ? 600 : undefined }}>
                  wykorzystane {used}/{limit.times} {PERIOD_LABEL[limit.period]}
                </span>
              </>
            )}
          </div>
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={status === "clean" ? () => setAvoid(habit.id, key, null) : clean}
          className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-transform active:scale-95"
          style={
            status === "clean"
              ? { backgroundColor: AVOID_COLOR, color: "var(--background)" }
              : { backgroundColor: "var(--background)", color: "var(--foreground)" }
          }
        >
          <Check size={16} strokeWidth={2.6} /> {status === "clean" ? "Czysto ✓" : "Dziś czysto"}
        </button>
        <button
          type="button"
          onClick={status === "slip" ? () => setAvoid(habit.id, key, null) : slip}
          className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-transform active:scale-95"
          style={
            status === "slip"
              ? { backgroundColor: "var(--muted-foreground)", color: "var(--background)" }
              : { backgroundColor: "var(--background)", color: "var(--muted-foreground)" }
          }
        >
          <X size={16} strokeWidth={2.6} /> {status === "slip" ? "Wpadka" : "Była wpadka"}
        </button>
      </div>
      {status === "pending" && habit.source === "screen" ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          📱 Ocena automatyczna: po {habit.lateAfter ?? DEFAULT_LATE_AFTER} liczę czas ekranu (tolerancja{" "}
          {habit.lateLimit ?? DEFAULT_LATE_LIMIT} min). Przyciski nadpisują ocenę.
        </p>
      ) : status === "pending" ? (
        <p className="mt-2 text-[11px]" style={{ color: AVOID_COLOR }}>
          Bez potwierdzenia do północy dzień liczy się jako wpadka.
        </p>
      ) : null}
    </div>
  );
}
