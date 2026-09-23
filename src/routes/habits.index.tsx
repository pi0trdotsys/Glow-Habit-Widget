import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { HabitTile } from "@/components/HabitTile";
import { useHabits } from "@/lib/habits/store";
import { AVOID_COLOR } from "@/lib/habits/colors";
import { kindOf } from "@/lib/habits/utils";

export const Route = createFileRoute("/habits/")({
  head: () => ({
    meta: [
      { title: "Zadania - Loop" },
      { name: "description", content: "Wszystkie twoje zadania w jednym miejscu." },
    ],
  }),
  component: HabitsPage,
});

function HabitsPage() {
  const habits = useHabits((s) => s.habits);
  const build = habits.filter((h) => kindOf(h) === "build");
  const avoid = habits.filter((h) => kindOf(h) === "avoid");
  return (
    <AppShell>
      <header className="flex items-end justify-between px-5 pt-10 pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{habits.length}/24</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Zadania</h1>
        </div>
        <Link
          to="/habits/new"
          className="grid h-11 w-11 place-items-center rounded-full"
          style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
          aria-label="Dodaj zadanie"
        >
          <Plus size={20} strokeWidth={2.4} />
        </Link>
      </header>

      {habits.length === 0 ? (
        <p className="px-5 text-sm text-muted-foreground">Brak zadań.</p>
      ) : (
        <>
          {build.length > 0 && (
            <>
              <h2 className="mb-4 px-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Chcę robić
              </h2>
              <div className="grid grid-cols-3 gap-y-7 gap-x-2 px-5">
                {build.map((h) => (
                  <HabitTile key={h.id} habit={h} />
                ))}
              </div>
            </>
          )}
          {avoid.length > 0 && (
            <>
              <h2
                className="mb-4 mt-9 px-5 text-xs font-semibold uppercase tracking-[0.16em]"
                style={{ color: AVOID_COLOR }}
              >
                Nie chcę robić
              </h2>
              <div className="grid grid-cols-3 gap-y-7 gap-x-2 px-5">
                {avoid.map((h) => (
                  <HabitTile key={h.id} habit={h} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
