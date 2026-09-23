import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { HabitIcon } from "./HabitIcon";
import { useHoldToComplete } from "@/hooks/useHoldToComplete";
import { useHabits } from "@/lib/habits/store";
import type { Habit } from "@/lib/habits/types";
import { HABIT_COLOR_VAR, AVOID_COLOR } from "@/lib/habits/colors";
import {
  amountOn,
  amountText,
  avoidStatus,
  currentStreak,
  daysLabel,
  goalOf,
  kindOf,
  todayKey,
} from "@/lib/habits/utils";
import { praiseFor } from "@/lib/habits/szpila";

interface Props {
  habit: Habit;
  compact?: boolean;
}

const CELEBRATE_EMOJI = ["🎉", "✨", "💪", "🔥", "🌟", "🙌"];

/** Shows Szpila's back-handed compliment with an undo action. */
export function praiseToast(habit: Habit, undo: () => void) {
  const { notifications, userName } = useHabits.getState();
  toast(`😈 ${praiseFor(habit, notifications.tauntLevel, userName)}`, {
    action: { label: "Cofnij", onClick: undo },
    duration: 4000,
  });
}

export function HabitTile({ habit, compact = false }: Props) {
  const navigate = useNavigate();
  const completions = useHabits((s) => s.completions);
  const logStep = useHabits((s) => s.logStep);
  const setAmount = useHabits((s) => s.setAmount);
  const setAvoid = useHabits((s) => s.setAvoid);
  const streak = currentStreak(habit, completions);
  const avoid = kindOf(habit) === "avoid";
  const color = avoid ? AVOID_COLOR : HABIT_COLOR_VAR[habit.color];
  const [celebrate, setCelebrate] = useState(false);

  const today = new Date();
  const key = todayKey(today);
  const g = goalOf(habit);
  const amount = avoid ? 0 : amountOn(habit, completions, today);
  const status = avoid ? avoidStatus(habit, completions, today, today) : null;
  const done = avoid ? status === "clean" : amount >= g.target;
  const fraction = avoid ? (status === "pending" ? 0 : 1) : Math.min(1, amount / g.target);

  const { handlers, progress, isHolding } = useHoldToComplete({
    duration: 600,
    onComplete: () => {
      if (avoid) {
        const prev = status;
        if (prev === "clean") {
          setAvoid(habit.id, key, null);
          toast(`↩️ Cofnięto: ${habit.name}`, { duration: 2500 });
          return;
        }
        setAvoid(habit.id, key, "clean");
        pop();
        praiseToast(habit, () => setAvoid(habit.id, key, prev === "slip" ? "slip" : null));
        return;
      }
      const before = amount;
      if (done) {
        setAmount(habit.id, key, 0);
        toast(`↩️ Cofnięto: ${habit.name}`, {
          action: { label: "Przywróć", onClick: () => setAmount(habit.id, key, before) },
          duration: 3000,
        });
        return;
      }
      logStep(habit.id);
      const after = Math.min(g.target, before + g.step);
      if (after >= g.target) {
        pop();
        praiseToast(habit, () => setAmount(habit.id, key, before));
      } else {
        toast(`+${g.step} · ${habit.name}: ${amountText(habit, after)}`, {
          action: { label: "Cofnij", onClick: () => setAmount(habit.id, key, before) },
          duration: 2500,
        });
      }
    },
    onTap: () => {
      if (!compact) navigate({ to: "/habits/$id", params: { id: habit.id } });
    },
  });

  function pop() {
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 1100);
  }

  // Ring math
  const size = compact ? 68 : 116;
  const stroke = compact ? 5 : 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // While holding, preview the next step on top of what's already logged.
  const stepFrac = avoid || done ? 1 - fraction : Math.min(1 - fraction, g.step / g.target);
  const ringProgress = done && !isHolding ? 1 : fraction + stepFrac * progress;

  const sub = avoid
    ? status === "clean"
      ? "Dziś czysto ✓"
      : status === "slip"
      ? "Wpadka ✗"
      : habit.source === "screen"
      ? "📱 automatycznie"
      : "Przytrzymaj = dziś czysto"
    : g.type !== "check"
    ? amountText(habit, amount)
    : streak > 0
    ? `🔥 ${daysLabel(streak)}`
    : "Przytrzymaj, by zaliczyć";

  return (
    <div
      className="relative flex flex-col items-center gap-2 select-none touch-none"
      style={{ WebkitTouchCallout: "none" }}
    >
      <motion.div
        {...handlers}
        animate={{ scale: isHolding ? 0.96 : celebrate ? [1, 1.12, 1] : 1 }}
        transition={
          celebrate
            ? { duration: 0.5, ease: "easeOut" }
            : { type: "spring", stiffness: 400, damping: 28 }
        }
        className="relative grid place-items-center rounded-full cursor-pointer"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={avoid ? `color-mix(in oklab, ${AVOID_COLOR} 30%, transparent)` : "var(--border)"}
            strokeWidth={stroke}
            strokeDasharray={avoid && status === "pending" ? "4 6" : undefined}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={status === "slip" ? "var(--muted-foreground)" : color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - ringProgress)}
            style={{ transition: isHolding ? "none" : "stroke-dashoffset 250ms ease-out" }}
          />
        </svg>

        <motion.div
          animate={{
            backgroundColor: done
              ? `color-mix(in oklab, ${color} 22%, transparent)`
              : avoid
              ? `color-mix(in oklab, ${AVOID_COLOR} 8%, var(--card))`
              : "var(--card)",
          }}
          className="grid place-items-center rounded-full"
          style={{ width: size - stroke * 2 - 6, height: size - stroke * 2 - 6 }}
        >
          <HabitIcon
            name={habit.icon}
            size={compact ? 22 : 34}
            strokeWidth={1.8}
            className={avoid ? "" : "text-foreground"}
            style={avoid ? { color: AVOID_COLOR } : undefined}
          />
        </motion.div>

        {avoid && !done && (
          <span
            className="absolute -top-0.5 -left-0.5 grid h-7 w-7 place-items-center rounded-full"
            style={{ backgroundColor: AVOID_COLOR, color: "var(--background)" }}
          >
            <Ban size={15} strokeWidth={2.6} />
          </span>
        )}

        {(done || status === "slip") && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
            style={{
              backgroundColor: status === "slip" ? "var(--muted-foreground)" : color,
              color: "var(--background)",
            }}
          >
            {status === "slip" ? "✗" : "✓"}
          </motion.span>
        )}

        {celebrate && <Celebration />}
      </motion.div>

      <div className="text-center">
        <div className={`font-medium leading-tight ${compact ? "text-xs" : "text-sm"}`}>{habit.name}</div>
        {!compact && (
          <div
            className="mt-0.5 text-xs"
            style={{ color: avoid && status === "pending" ? AVOID_COLOR : "var(--muted-foreground)" }}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

/** A short burst of emoji flying outward when a habit is completed. */
function Celebration() {
  const dist = 46;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <motion.span
        className="absolute text-3xl"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.5, 1.1], opacity: [0, 1, 0] }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        🎉
      </motion.span>
      {CELEBRATE_EMOJI.map((e, i) => {
        const ang = (i / CELEBRATE_EMOJI.length) * 2 * Math.PI - Math.PI / 2;
        return (
          <motion.span
            key={i}
            className="absolute text-lg"
            initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={{
              x: Math.cos(ang) * dist,
              y: Math.sin(ang) * dist,
              scale: [0, 1.15, 0.9],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 0.9, ease: "easeOut", delay: i * 0.02 }}
          >
            {e}
          </motion.span>
        );
      })}
    </div>
  );
}
