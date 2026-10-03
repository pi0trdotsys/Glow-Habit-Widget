import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { HabitIcon } from "./HabitIcon";
import { useHabits } from "@/lib/habits/store";
import type { Habit } from "@/lib/habits/types";
import { HABIT_COLOR_VAR } from "@/lib/habits/colors";
import { amountOn, amountText, goalOf, todayKey, unitLabel } from "@/lib/habits/utils";
import { quickSteps, sliderMax, snapToStep } from "@/lib/habits/quick";
import { useBackHandler } from "@/lib/back";
import { haptic } from "@/lib/haptics";
import { L } from "@/lib/i18n";
import { appsFloor, breakdown, isAppsHabit } from "@/lib/apps";

/**
 * Hold a tile longer: set today's amount in one go - +1 / +2 / +5 steps, a
 * slider for the exact value, "Ustaw" to save. Back / the backdrop closes it.
 */
export function QuickAmountSheet({
  habit,
  open,
  onClose,
  onSaved,
}: {
  habit: Habit;
  open: boolean;
  onClose: () => void;
  onSaved?: (before: number, after: number) => void;
}) {
  const completions = useHabits((s) => s.completions);
  const setAmount = useHabits((s) => s.setAmount);
  const g = goalOf(habit);
  const current = amountOn(habit, completions, new Date());
  // Minutes from apps: what's set here only changes the part added by hand.
  const entry = completions.find((c) => c.habitId === habit.id && c.date === todayKey());
  const fromApps = isAppsHabit(habit);
  const floor = appsFloor(habit, entry);
  const split = fromApps ? breakdown(entry) : "";
  const [value, setValue] = useState(current);
  useEffect(() => {
    if (open) setValue(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useBackHandler(open, onClose);

  const color = HABIT_COLOR_VAR[habit.color];
  const max = sliderMax(habit, Math.max(current, value));
  const unit = g.type === "minutes" ? "min" : unitLabel(habit, value);
  const save = (v: number) => {
    const next = Math.max(0, v);
    setAmount(habit.id, todayKey(), next);
    haptic(next >= g.target && current < g.target ? "success" : "tick");
    onSaved?.(current, next);
    onClose();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50"
          />
          <m.div
            key="sheet"
            role="dialog"
            aria-label={L(`Ile: ${habit.name}`, `How much: ${habit.name}`)}
            data-quick-sheet
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%" }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md px-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
          >
            <div className="rounded-3xl border border-border bg-card p-4 shadow-2xl">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
              <div className="flex items-center gap-3">
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                  style={{ backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` }}
                >
                  <HabitIcon name={habit.icon} size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{habit.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {L("Teraz", "Now")}: {amountText(habit, current)}
                  </div>
                  {split && (
                    <div className="truncate text-xs text-muted-foreground" data-quick-split>
                      {split}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 text-center">
                <div className="font-display text-4xl font-bold tabular-nums" data-quick-value>
                  {value}
                  <span className="ml-1.5 text-base font-medium text-muted-foreground">{unit}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {L("cel", "goal")}: {g.target}{" "}
                  {g.type === "minutes" ? "min" : unitLabel(habit, g.target)}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  aria-label={L("Mniej", "Less")}
                  onClick={() => setValue((v) => snapToStep(habit, v - (g.step ?? 1)))}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-background"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={max}
                  step={Math.max(1, g.step ?? 1)}
                  value={value}
                  onChange={(e) => setValue(snapToStep(habit, Number(e.target.value)))}
                  className="h-2 w-full cursor-pointer"
                  style={{ accentColor: color }}
                  aria-label={L("Ilość", "Amount")}
                />
                <button
                  aria-label={L("Więcej", "More")}
                  onClick={() => setValue((v) => v + (g.step ?? 1))}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-background"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {quickSteps(habit).map((s) => (
                  <button
                    key={s}
                    data-quick-add={s}
                    onClick={() => save(current + s)}
                    className="rounded-2xl py-3 text-sm font-semibold active:scale-95"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${color} 18%, var(--background))`,
                    }}
                  >
                    +{s}
                    {g.type === "minutes" ? " min" : ""}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
                <button
                  onClick={() => save(fromApps ? floor : 0)}
                  className="flex items-center gap-1.5 rounded-2xl bg-background px-4 py-3 text-sm font-semibold text-muted-foreground"
                >
                  <RotateCcw size={15} />{" "}
                  {fromApps && floor > 0
                    ? L("Tylko aplikacje", "Apps only")
                    : L("Wyzeruj", "Reset")}
                </button>
                <button
                  data-quick-save
                  onClick={() => save(value)}
                  className="rounded-2xl py-3 text-sm font-semibold"
                  style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  {L("Ustaw", "Set")} {value} {unit}
                </button>
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
