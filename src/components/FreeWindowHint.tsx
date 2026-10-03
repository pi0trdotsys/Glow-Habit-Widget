import { CalendarClock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { minuteOfDay } from "@/lib/habits/utils";
import { windowText, type WindowMatch } from "@/lib/calendar";
import { HABIT_COLOR_VAR } from "@/lib/habits/colors";

/** „Masz 18:10–18:50 wolne — idealne na 30 min: Programuj”. */
export function FreeWindowHint({ match, now }: { match: WindowMatch; now: Date }) {
  return (
    <Link
      to="/habits/$id"
      params={{ id: match.habit.id }}
      className="flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2.5 text-sm"
      data-free-window
    >
      <CalendarClock
        size={18}
        className="shrink-0"
        style={{ color: HABIT_COLOR_VAR[match.habit.color] }}
      />
      <span className="min-w-0 flex-1">{windowText(match, minuteOfDay(now))}</span>
    </Link>
  );
}
