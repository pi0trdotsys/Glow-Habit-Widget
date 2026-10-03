import { useState } from "react";
import { m } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { HabitIcon } from "./HabitIcon";
import { HOLD_TO_COMPLETE_MS, useHoldToComplete } from "@/hooks/useHoldToComplete";
import { QuickAmountSheet } from "./QuickAmountSheet";
import { hasQuickAmounts } from "@/lib/habits/quick";
import { haptic } from "@/lib/haptics";
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
import { SZPILA_EMOJI, praiseFor } from "@/lib/habits/szpila";
import { minimumLabel, minimumOf, rescueOn } from "@/lib/habits/rescue";
import { focusHabit } from "@/lib/habits/focus";
import { focusPraise, minimumPraise } from "@/lib/habits/chain";
import { ringMarks, ringPoint } from "@/lib/habits/ring";
import { isKropi, kropiAdd } from "@/lib/kropi";
import { appsFloor, isAppsHabit } from "@/lib/apps";
import { syncKropiNow } from "@/lib/sensors";
import { L } from "@/lib/i18n";
import { Capacitor } from "@capacitor/core";
import { bankToastLine } from "@/lib/bank";

interface Props {
  habit: Habit;
  compact?: boolean;
}

const CELEBRATE_EMOJI = ["🎉", "✨", "💪", "🔥", "🌟", "🙌"];

/** Shows Szpila's back-handed compliment with an undo action (the weekly focus gets its own). */
export function praiseToast(habit: Habit, undo: () => void) {
  const { notifications, userName, habits, focus, completions, nightReports, daySocial } =
    useHabits.getState();
  const text =
    focusHabit(habits, focus)?.id === habit.id
      ? `🎯 ${focusPraise(habit, notifications.tauntLevel)}`
      : `${SZPILA_EMOJI.impressed} ${praiseFor(habit, notifications.tauntLevel, userName)}`;
  // "Bank minut": a finished habit to do earns social media minutes (the guard runs on Android only).
  const bank = Capacitor.isNativePlatform()
    ? bankToastLine(
        notifications,
        habit,
        habits,
        completions,
        nightReports,
        daySocial[todayKey()] ?? 0,
      )
    : null;
  toast(text, {
    description: bank ?? undefined,
    action: { label: L("Cofnij", "Undo"), onClick: undo },
  });
}

export function HabitTile({ habit, compact = false }: Props) {
  const navigate = useNavigate();
  const completions = useHabits((s) => s.completions);
  const habits = useHabits((s) => s.habits);
  const focus = useHabits((s) => s.focus);
  const level = useHabits((s) => s.notifications.tauntLevel);
  const logStep = useHabits((s) => s.logStep);
  const setAmount = useHabits((s) => s.setAmount);
  const setAvoid = useHabits((s) => s.setAvoid);
  const undoLast = useHabits((s) => s.undoLast);
  const streak = currentStreak(habit, completions);
  const [sheet, setSheet] = useState(false);
  // Water from Kropi is logged in Kropi (one place to log): no amount sheet here.
  const fromKropi = isKropi(habit);
  const quick = hasQuickAmounts(habit) && habit.source !== "steps" && !fromKropi;
  const toastId = `tile-${habit.id}`;
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
  // "Nigdy dwa razy": yesterday was missed -> today the minimum saves the chain.
  const min = minimumOf(habit);
  const rescue = rescueOn(habit, completions, today);
  const isFocus = focusHabit(habits, focus, today)?.id === habit.id;
  /** A rescue day's minimum reached (below the goal): its own praise instead of "+1". */
  const savedByMinimum = (before: number, after: number) =>
    rescue && min > 0 && before < min && after >= min && after < g.target;

  const { handlers, progress, phase2, isHolding, dx } = useHoldToComplete({
    duration: HOLD_TO_COMPLETE_MS,
    // Keep holding: the step just logged is taken back and the quick amount sheet opens.
    onLongHold: quick
      ? () => {
          toast.dismiss(toastId);
          undoLast(habit.id, key);
          haptic("tick");
          setSheet(true);
        }
      : undefined,
    // Swipe sideways: undo the last entry.
    onSwipe: () => {
      if (fromKropi) {
        toast(L("Wodę cofniesz w Kropi.", "Undo the water in Kropi."), {
          id: toastId,
          duration: 2200,
        });
        return;
      }
      const back = undoLast(habit.id, key);
      if (back == null) {
        toast(L("Nie ma czego cofnąć", "Nothing to undo"), { id: toastId, duration: 1800 });
        return;
      }
      haptic("tick");
      toast(
        `↩️ ${L("Cofnięto", "Undone")}: ${habit.name}${
          back === "cleared" || avoid ? "" : ` → ${amountText(habit, back)}`
        }`,
        { id: toastId, duration: 2500 },
      );
    },
    onComplete: () => {
      if (avoid) {
        const prev = status;
        if (prev === "clean") {
          setAvoid(habit.id, key, null);
          toast(`↩️ ${L("Cofnięto", "Undone")}: ${habit.name}`, { duration: 2500 });
          return;
        }
        setAvoid(habit.id, key, "clean");
        pop();
        haptic("success");
        praiseToast(habit, () => setAvoid(habit.id, key, prev === "slip" ? "slip" : null));
        return;
      }
      if (fromKropi) {
        void kropiAdd().then((ok) => {
          if (!ok) {
            toast(L("Nie widzę Kropi na telefonie.", "Kropi isn't installed."), { id: toastId });
            return;
          }
          haptic("tick");
          // Kropi adds a glass and tells us back; pull it in shortly after.
          setTimeout(() => void syncKropiNow(), 1500);
        });
        return;
      }
      const before = amount;
      if (done) {
        // Minutes from apps: only the part added by hand goes; the apps' minutes stay.
        const floor = appsFloor(
          habit,
          completions.find((c) => c.habitId === habit.id && c.date === key),
        );
        if (isAppsHabit(habit) && floor >= before) {
          toast(
            L(
              "Te minuty policzyły aplikacje. Poprawisz je na stronie zadania.",
              "The apps counted these minutes. Correct them on the habit's page.",
            ),
            { id: toastId, duration: 2500 },
          );
          return;
        }
        setAmount(habit.id, key, floor);
        toast(`↩️ ${L("Cofnięto", "Undone")}: ${habit.name}`, {
          action: {
            label: L("Przywróć", "Restore"),
            onClick: () => setAmount(habit.id, key, before),
          },
          duration: 3000,
        });
        return;
      }
      logStep(habit.id);
      const after = Math.min(g.target, before + g.step);
      if (after >= g.target) {
        pop();
        haptic("success");
        praiseToast(habit, () => setAmount(habit.id, key, before));
      } else if (savedByMinimum(before, after)) {
        haptic("success");
        toast(`🛟 ${minimumPraise(habit, level)}`, {
          id: toastId,
          action: { label: L("Cofnij", "Undo"), onClick: () => setAmount(habit.id, key, before) },
          duration: 3500,
        });
      } else {
        haptic("tick");
        toast(`+${g.step} · ${habit.name}: ${amountText(habit, after)}`, {
          id: toastId,
          description: quick
            ? L("Trzymaj dłużej, by wpisać ilość", "Hold longer to enter an amount")
            : undefined,
          action: { label: L("Cofnij", "Undo"), onClick: () => setAmount(habit.id, key, before) },
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
  const size = compact ? 68 : 96;
  const stroke = compact ? 5 : 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // While holding, preview the next step on top of what's already logged.
  const stepFrac = avoid || done ? 1 - fraction : Math.min(1 - fraction, g.step / g.target);
  const ringProgress = done && !isHolding ? 1 : fraction + stepFrac * progress;
  const marks = ringMarks({ progress: ringProgress, amount, target: g.target, min, done, avoid });

  const sub = avoid
    ? status === "clean"
      ? L("Dziś czysto ✓", "Clean today ✓")
      : status === "slip"
        ? L("Wpadka ✗", "Slip ✗")
        : habit.source === "screen"
          ? L("📱 czeka na noc", "📱 waiting for the night")
          : L("Przytrzymaj = dziś czysto", "Hold = clean today")
    : rescue && min > 0 && amount < min
      ? `🛟 ${L("ratunek: min.", "rescue: min.")} ${minimumLabel(habit)}`
      : g.type !== "check"
        ? `${fromKropi ? "💧 " : ""}${amountText(habit, amount)}`
        : streak > 0
          ? `🔥 ${daysLabel(streak)}`
          : L("Przytrzymaj, by zaliczyć", "Hold to complete");

  return (
    <div
      className="relative flex flex-col items-center gap-2 select-none touch-none"
      style={{ WebkitTouchCallout: "none" }}
    >
      <m.div
        {...handlers}
        data-tile={habit.id}
        animate={{
          scale: isHolding ? 0.96 + phase2 * 0.08 : celebrate ? [1, 1.12, 1] : 1,
          x: dx * 0.35,
        }}
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
            stroke={
              avoid ? `color-mix(in oklab, ${AVOID_COLOR} 30%, transparent)` : "var(--border)"
            }
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
          {/* the minimum version: a thin tick until it's reached */}
          {marks.minTick != null && !compact && (
            <line
              data-min-notch
              x1={ringPoint(size, r - stroke / 2 - 1, marks.minTick).x}
              y1={ringPoint(size, r - stroke / 2 - 1, marks.minTick).y}
              x2={ringPoint(size, r + stroke / 2 + 1, marks.minTick).x}
              y2={ringPoint(size, r + stroke / 2 + 1, marks.minTick).y}
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}
          {/* the progress head rides the end of the arc (moves with auto steps / water too) */}
          {marks.head != null && (
            <circle
              data-progress-head
              cx={ringPoint(size, r, marks.head).x}
              cy={ringPoint(size, r, marks.head).y}
              r={stroke / 2 + 1.5}
              fill={color}
              stroke="var(--background)"
              strokeWidth={1.5}
              style={{ transition: isHolding ? "none" : "cx 250ms ease-out, cy 250ms ease-out" }}
            />
          )}
        </svg>

        <m.div
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
            size={compact ? 22 : 30}
            strokeWidth={1.8}
            className={avoid ? "" : "text-foreground"}
            style={avoid ? { color: AVOID_COLOR } : undefined}
          />
        </m.div>

        {avoid && !done && (
          <span
            className="absolute -top-0.5 -left-0.5 grid h-7 w-7 place-items-center rounded-full"
            style={{ backgroundColor: AVOID_COLOR, color: "var(--background)" }}
          >
            <Ban size={15} strokeWidth={2.6} />
          </span>
        )}

        {(isFocus || rescue) && !done && (
          <span
            data-chain={isFocus ? "focus" : "rescue"}
            title={
              isFocus
                ? L("Cel tygodnia", "This week's focus")
                : L("Ratunek: nie dwa razy z rzędu", "Rescue: not twice in a row")
            }
            className="absolute -top-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full text-sm"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
          >
            {isFocus ? "🎯" : "🛟"}
          </span>
        )}

        {(done || status === "slip") && (
          <m.span
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
          </m.span>
        )}

        {celebrate && <Celebration />}
        {/* second phase of the hold: a halo growing towards the quick amount sheet */}
        {phase2 > 0 && (
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              boxShadow: `0 0 0 ${2 + phase2 * 8}px color-mix(in oklab, ${color} ${20 + phase2 * 40}%, transparent)`,
            }}
          />
        )}
      </m.div>
      {quick && (
        <QuickAmountSheet
          habit={habit}
          open={sheet}
          onClose={() => setSheet(false)}
          onSaved={(b, a) => {
            if (a >= g.target && b < g.target) {
              pop();
              praiseToast(habit, () => setAmount(habit.id, key, b));
            } else if (savedByMinimum(b, a)) {
              haptic("success");
              toast(`🛟 ${minimumPraise(habit, level)}`, {
                id: toastId,
                action: { label: L("Cofnij", "Undo"), onClick: () => setAmount(habit.id, key, b) },
                duration: 3500,
              });
            } else {
              toast(`${habit.name}: ${amountText(habit, a)}`, {
                id: toastId,
                action: { label: L("Cofnij", "Undo"), onClick: () => setAmount(habit.id, key, b) },
                duration: 2500,
              });
            }
          }}
        />
      )}

      <div className="text-center">
        <div className={`font-medium leading-tight ${compact ? "text-xs" : "text-sm"}`}>
          {habit.name}
        </div>
        {!compact && (
          <div
            className="mt-0.5 text-xs"
            style={{
              color:
                (avoid && status === "pending") || (rescue && !done)
                  ? AVOID_COLOR
                  : "var(--muted-foreground)",
            }}
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
      <m.span
        className="absolute text-3xl"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.5, 1.1], opacity: [0, 1, 0] }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        🎉
      </m.span>
      {CELEBRATE_EMOJI.map((e, i) => {
        const ang = (i / CELEBRATE_EMOJI.length) * 2 * Math.PI - Math.PI / 2;
        return (
          <m.span
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
          </m.span>
        );
      })}
    </div>
  );
}
