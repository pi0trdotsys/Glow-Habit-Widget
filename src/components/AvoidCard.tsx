import { Link } from "@tanstack/react-router";
import { Ban, Check, X } from "lucide-react";
import { toast } from "sonner";
import { HabitIcon } from "./HabitIcon";
import { praiseToast } from "./HabitTile";
import { useHabits } from "@/lib/habits/store";
import type { Habit } from "@/lib/habits/types";
import { AVOID_COLOR } from "@/lib/habits/colors";
import { avoidStatus, limitOf, limitLabel, slipsInPeriod, todayKey } from "@/lib/habits/utils";
import { SZPILA_EMOJI, slipFor } from "@/lib/habits/szpila";
import { DEFAULT_LATE_AFTER, DEFAULT_LATE_LIMIT } from "@/lib/sensors";
import { L } from "@/lib/i18n";

const periodLabel = (p: "day" | "week" | "month") =>
  ({
    day: L("dziś", "today"),
    week: L("w tym tygodniu", "this week"),
    month: L("w tym miesiącu", "this month"),
  })[p];

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
    toast(`${SZPILA_EMOJI.angry} ${slipFor(habit, notifications.tauntLevel, userName)}`, {
      action: {
        label: L("Cofnij", "Undo"),
        onClick: () => setAvoid(habit.id, key, prev === "clean" ? "clean" : null),
      },
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
          <Ban
            size={14}
            className="absolute -right-0.5 -top-0.5"
            style={{ color: AVOID_COLOR }}
            strokeWidth={2.8}
          />
        </Link>
        <Link to="/habits/$id" params={{ id: habit.id }} className="min-w-0 flex-1">
          <div className="truncate font-medium">{habit.name}</div>
          <div className="text-xs text-muted-foreground">
            {limitLabel(limit)}
            {limit.times > 0 && (
              <>
                {" · "}
                <span
                  style={{
                    color: over ? AVOID_COLOR : undefined,
                    fontWeight: over ? 600 : undefined,
                  }}
                >
                  {L("wykorzystane", "used")} {used}/{limit.times} {periodLabel(limit.period)}
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
          <Check size={16} strokeWidth={2.6} />{" "}
          {status === "clean" ? L("Czysto ✓", "Clean ✓") : L("Dziś czysto", "Clean today")}
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
          <X size={16} strokeWidth={2.6} />{" "}
          {status === "slip" ? L("Wpadka", "Slip") : L("Była wpadka", "I slipped")}
        </button>
      </div>
      {status === "pending" && habit.source === "screen" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {L(
            `📱 Ocena automatyczna: po ${habit.lateAfter ?? DEFAULT_LATE_AFTER} liczę czas ekranu (tolerancja ${habit.lateLimit ?? DEFAULT_LATE_LIMIT} min). Przyciski nadpisują ocenę.`,
            `📱 Auto-check: after ${habit.lateAfter ?? DEFAULT_LATE_AFTER} I count screen time (${habit.lateLimit ?? DEFAULT_LATE_LIMIT} min allowed). The buttons override it.`,
          )}
        </p>
      ) : status === "pending" ? (
        <p className="mt-2 text-xs" style={{ color: AVOID_COLOR }}>
          {L(
            "Bez potwierdzenia do północy dzień liczy się jako wpadka.",
            "Not confirmed by midnight? The day counts as a slip.",
          )}
        </p>
      ) : null}
    </div>
  );
}
