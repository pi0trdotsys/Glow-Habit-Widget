import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { HabitIcon } from "./HabitIcon";
import { praiseToast } from "./HabitTile";
import { useHabits } from "@/lib/habits/store";
import type { Habit } from "@/lib/habits/types";
import { AVOID_COLOR } from "@/lib/habits/colors";
import {
  avoidStatus,
  limitLabel,
  limitOf,
  slipsInPeriod,
  todayKey,
  type AvoidStatus,
} from "@/lib/habits/utils";
import { SZPILA_EMOJI, slipFor } from "@/lib/habits/szpila";
import { useBackHandler } from "@/lib/back";

const MARK: Record<AvoidStatus, string> = { pending: "?", clean: "✓", slip: "✗" };

/**
 * Forbidden habits as compact red chips. Tap a chip to confirm "czysto" or
 * own up to a slip for `day` (today by default, yesterday in the morning review).
 */
export function AvoidChips({ habits, day = new Date() }: { habits: Habit[]; day?: Date }) {
  const completions = useHabits((s) => s.completions);
  const setAvoid = useHabits((s) => s.setAvoid);
  const [open, setOpen] = useState<string | null>(null);
  useBackHandler(open !== null, () => setOpen(null));
  const now = new Date();
  const key = todayKey(day);
  const selected = habits.find((h) => h.id === open);

  const answer = (h: Habit, status: "clean" | "slip") => {
    const prev = avoidStatus(h, completions, day, now);
    const undoTo = prev === "pending" ? null : prev;
    setAvoid(h.id, key, status);
    setOpen(null);
    if (status === "clean") {
      praiseToast(h, () => setAvoid(h.id, key, undoTo));
    } else {
      const { notifications, userName } = useHabits.getState();
      toast(`${SZPILA_EMOJI.angry} ${slipFor(h, notifications.tauntLevel, userName)}`, {
        action: { label: "Cofnij", onClick: () => setAvoid(h.id, key, undoTo) },
      });
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {habits.map((h) => {
          const st = avoidStatus(h, completions, day, now);
          const auto = h.source === "screen" && st === "pending";
          const active = open === h.id;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => setOpen(active ? null : h.id)}
              className="flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 text-xs font-medium transition-transform active:scale-95"
              style={{
                backgroundColor:
                  st === "clean"
                    ? `color-mix(in oklab, ${AVOID_COLOR} 22%, var(--card))`
                    : st === "slip"
                      ? "var(--card)"
                      : `color-mix(in oklab, ${AVOID_COLOR} 12%, var(--card))`,
                border: `1px solid color-mix(in oklab, ${AVOID_COLOR} ${active ? 70 : st === "pending" ? 40 : 18}%, transparent)`,
                color: st === "slip" ? "var(--muted-foreground)" : "var(--foreground)",
              }}
            >
              <HabitIcon
                name={h.icon}
                size={15}
                style={{ color: st === "slip" ? "var(--muted-foreground)" : AVOID_COLOR }}
              />
              <span className="max-w-[9rem] truncate">{h.name}</span>
              <span
                className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold"
                style={{
                  backgroundColor:
                    st === "clean" ? AVOID_COLOR : st === "slip" ? "var(--muted)" : "transparent",
                  color:
                    st === "clean"
                      ? "var(--background)"
                      : st === "slip"
                        ? "var(--foreground)"
                        : AVOID_COLOR,
                }}
              >
                {auto ? "📱" : MARK[st]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom sheet above the tab bar - always visible, even when the chips sit at the very bottom. */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(null)}
              className="fixed inset-0 z-50 bg-black/50"
            />
            <motion.div
              key={selected.id}
              initial={{ y: "110%" }}
              animate={{ y: 0 }}
              exit={{ y: "110%" }}
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md px-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            >
              <div
                className="rounded-3xl border p-4 shadow-2xl"
                style={{
                  background: `color-mix(in oklab, ${AVOID_COLOR} 10%, var(--card))`,
                  borderColor: `color-mix(in oklab, ${AVOID_COLOR} 30%, transparent)`,
                }}
              >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${AVOID_COLOR} 20%, transparent)`,
                    }}
                  >
                    <HabitIcon name={selected.icon} size={20} style={{ color: AVOID_COLOR }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{selected.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {todayKey(day) === todayKey(now) ? "Dziś" : "Wczoraj"} ·{" "}
                      {limitLabel(limitOf(selected))}
                      {limitOf(selected).times > 0 &&
                        ` · wykorzystane ${slipsInPeriod(selected, completions, day, now)}/${limitOf(selected).times}`}
                    </div>
                  </div>
                  <Link
                    to="/habits/$id"
                    params={{ id: selected.id }}
                    className="grid h-9 w-9 place-items-center rounded-full bg-background text-muted-foreground"
                    aria-label="Szczegóły"
                  >
                    <ChevronRight size={16} />
                  </Link>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => answer(selected, "clean")}
                    className="flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-semibold active:scale-95"
                    style={{ backgroundColor: AVOID_COLOR, color: "var(--background)" }}
                  >
                    <Check size={17} strokeWidth={2.6} /> Czysto
                  </button>
                  <button
                    type="button"
                    onClick={() => answer(selected, "slip")}
                    className="flex items-center justify-center gap-1.5 rounded-2xl bg-background py-3 text-sm font-semibold text-muted-foreground active:scale-95"
                  >
                    <X size={17} strokeWidth={2.6} /> Wpadka
                  </button>
                </div>
                {avoidStatus(selected, completions, day, now) !== "pending" && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvoid(selected.id, key, null);
                      setOpen(null);
                    }}
                    className="mt-2 w-full py-1.5 text-xs text-muted-foreground"
                  >
                    Wyczyść odpowiedź
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
