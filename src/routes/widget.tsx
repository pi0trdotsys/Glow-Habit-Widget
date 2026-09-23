import { createFileRoute } from "@tanstack/react-router";
import { HabitTile } from "@/components/HabitTile";
import { useHabits } from "@/lib/habits/store";
import { isDueOn, todayProgress } from "@/lib/habits/utils";
import { useEffect } from "react";

export const Route = createFileRoute("/widget")({
  head: () => ({
    meta: [
      { title: "Widżet - Loop" },
      { name: "description", content: "Szybki widok: przytrzymaj kafelek, by zaliczyć." },
    ],
  }),
  component: WidgetPage,
});

function WidgetPage() {
  const ensureSeeded = useHabits((s) => s.ensureSeeded);
  useEffect(() => ensureSeeded(), [ensureSeeded]);
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const today = new Date();
  const due = habits.filter((h) => isDueOn(h, today)).slice(0, 8);
  const progressPercent = todayProgress(habits, completions, today).fraction * 100;

  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground"
      style={{
        backgroundImage:
          "radial-gradient(circle at 20% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 50%)",
      }}
    >
      <div className="mx-auto max-w-md p-5">
        <div className="rounded-[28px] border border-border bg-card/80 p-5 shadow-2xl backdrop-blur-xl">
          {due.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  Postęp dnia
                </span>
                <span className="text-[10px] font-bold text-primary">
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {due.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Brak zadań na dziś.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-y-6 gap-x-2 justify-items-center">
              {due.map((h) => (
                <HabitTile key={h.id} habit={h} compact />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}